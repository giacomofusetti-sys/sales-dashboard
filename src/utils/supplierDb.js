import { supabase } from './supabase.js';

// ── Load orders ──────────────────────────────────────────────
export async function loadSupplierOrders(orderType) {
  let query = supabase.from('supplier_orders').select('*');
  if (orderType) query = query.eq('order_type', orderType);
  query = query.order('order_ref');
  const { data, error } = await query;
  console.log(`[loadSupplierOrders] type=${orderType}, rows=${data?.length ?? 'null'}, error=${error?.message ?? 'none'}`);
  if (error) throw error;
  return data;
}

// ── Load materials for orders (paginated to avoid Supabase 1000-row default) ─
export async function loadOrderMaterials(orderIds) {
  if (!orderIds.length) return [];
  const PAGE = 1000;
  const CHUNK = 200; // max IDs per .in() filter
  const all = [];

  for (let c = 0; c < orderIds.length; c += CHUNK) {
    const idChunk = orderIds.slice(c, c + CHUNK);
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from('order_materials')
        .select('*')
        .in('order_id', idChunk)
        .order('pos')
        .range(from, from + PAGE - 1);
      if (error) throw error;
      all.push(...data);
      if (data.length < PAGE) break; // no more rows
      from += PAGE;
    }
  }

  console.log(`[loadOrderMaterials] ${orderIds.length} orders → ${all.length} materials`);
  return all;
}

// ── Deadline helpers ─────────────────────────────────────────
function dateStr(d) { return d.toISOString().split('T')[0]; }

// Build a deadline range filter for PostgREST .or()
// Uses COALESCE logic: scadenza_effettiva if set, else scadenza
function deadlineRangeFilter(fromStr, toStr) {
  const parts = [];
  if (fromStr && toStr) {
    parts.push(`and(scadenza_effettiva.not.is.null,scadenza_effettiva.gte.${fromStr},scadenza_effettiva.lte.${toStr})`);
    parts.push(`and(scadenza_effettiva.is.null,scadenza.gte.${fromStr},scadenza.lte.${toStr})`);
  } else if (toStr) {
    parts.push(`and(scadenza_effettiva.not.is.null,scadenza_effettiva.lte.${toStr})`);
    parts.push(`and(scadenza_effettiva.is.null,scadenza.lte.${toStr})`);
  } else if (fromStr) {
    parts.push(`and(scadenza_effettiva.not.is.null,scadenza_effettiva.gte.${fromStr})`);
    parts.push(`and(scadenza_effettiva.is.null,scadenza.gte.${fromStr})`);
  }
  return parts.join(',');
}

// Count deadlines in a date range — head:true + count:'exact' avoids row limits
export async function countDeadlines(fromStr, toStr) {
  const filter = deadlineRangeFilter(fromStr, toStr);
  let query = supabase
    .from('order_materials')
    .select('id, supplier_orders!inner(id)', { count: 'exact', head: true })
    .not('scadenza', 'is', null);
  if (filter) query = query.or(filter);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

// Load ALL deadline detail rows for a date range (paginated to avoid row limits)
export async function loadDeadlineRows(fromStr, toStr) {
  const filter = deadlineRangeFilter(fromStr, toStr);
  const PAGE = 1000;
  const all = [];
  let from = 0;

  while (true) {
    let query = supabase
      .from('order_materials')
      .select('*, supplier_orders!inner(order_type, order_ref, client_name, supplier_name)')
      .not('scadenza', 'is', null);
    if (filter) query = query.or(filter);
    query = query.order('scadenza').range(from, from + PAGE - 1);
    const { data, error } = await query;
    if (error) throw error;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  console.log(`[loadDeadlineRows] range ${fromStr}..${toStr}: ${all.length} rows`);
  return all;
}

// ── Load refs for a single order's materials ────────────────
export async function loadRefsForOrder(orderId) {
  // Step 1: get material IDs for this order
  const { data: mats, error: matErr } = await supabase
    .from('order_materials')
    .select('id')
    .eq('order_id', orderId);
  if (matErr) throw matErr;
  if (!mats?.length) return {};

  // Step 2: load refs for those materials (small set per single order)
  const matIds = mats.map(m => m.id);
  const { data, error } = await supabase
    .from('material_refs')
    .select('*')
    .in('material_id', matIds);
  if (error) throw error;

  // Group by material_id
  const grouped = {};
  for (const ref of data) {
    if (!grouped[ref.material_id]) grouped[ref.material_id] = [];
    grouped[ref.material_id].push(ref);
  }
  return grouped;
}

// ── Search orders (for order map) ────────────────────────────
export async function searchOrders(query) {
  const q = `%${query}%`;
  const { data, error } = await supabase
    .from('supplier_orders')
    .select('id, order_type, order_ref, order_date, client_name, supplier_name, valore_residuo, peso_totale, tot_peso_res')
    .or(`order_ref.ilike.${q},client_name.ilike.${q},supplier_name.ilike.${q}`)
    .order('order_ref')
    .limit(50);
  if (error) throw error;
  return data;
}

// ── Find linked orders via refs (bidirectional, hybrid) ─────
// Forward strategy depends on ref_type:
//   - ref_type "F" (inside OV) → ref_order is reliable (points to OA/OP/OL)
//   - ref_type "OV"/"OL"/"BPV" (inside OA/OP) → ref_order is an internal
//     number that does NOT match actual order_ref values in the DB.
//     Instead, match by ref_name → supplier_orders.client_name.
// Reverse: other orders' refs that point to this order via ref_order
//   (OV orders reference OA/OP/OL with correct ref_order values)

const ORDER_SELECT = 'id, order_type, order_ref, order_date, client_name, supplier_name, valore_residuo, peso_totale, tot_peso_res';
const NAME_MATCH_REF_TYPES = new Set(['OV', 'OL', 'BPV']);

let ghostCounter = 0;
function makeGhostOrder(orderRef) {
  const type = orderRef.split('/')[0] || 'UNKNOWN';
  return {
    id: `_ghost_${++ghostCounter}`,
    order_type: type,
    order_ref: orderRef,
    order_date: null,
    client_name: null,
    supplier_name: null,
    valore_residuo: null,
    peso_totale: null,
    tot_peso_res: null,
    _ghost: true,
  };
}

export async function findLinkedOrders(orderId, orderRef) {
  const linkedMap = new Map(); // id → order (deduped)

  // 1. Forward: refs from this order's materials
  const { data: myMats } = await supabase
    .from('order_materials')
    .select('id')
    .eq('order_id', orderId);
  const matIds = (myMats || []).map(m => m.id);

  if (matIds.length) {
    const { data: fwdRefs } = await supabase
      .from('material_refs')
      .select('ref_type, ref_order, ref_name')
      .in('material_id', matIds);

    // 1a. Reliable ref_order refs (type "F" or any non-name-match type with ref_order)
    const reliableOrderRefs = [...new Set(
      (fwdRefs || [])
        .filter(r => r.ref_order && !NAME_MATCH_REF_TYPES.has(r.ref_type))
        .map(r => r.ref_order)
    )];
    if (reliableOrderRefs.length) {
      const { data: fwdOrders } = await supabase
        .from('supplier_orders')
        .select(ORDER_SELECT)
        .in('order_ref', reliableOrderRefs);
      const foundRefs = new Set((fwdOrders || []).map(o => o.order_ref));
      for (const o of (fwdOrders || [])) {
        if (o.id !== orderId) linkedMap.set(o.id, o);
      }
      // Create ghost nodes for refs that didn't resolve
      for (const ref of reliableOrderRefs) {
        if (!foundRefs.has(ref)) {
          const ghost = makeGhostOrder(ref);
          linkedMap.set(ghost.id, ghost);
        }
      }
    }

    // 1b. Name-based matching for OV/OL/BPV refs (ref_order unreliable)
    //     Use ref_name to find orders of the target type by client_name
    //     If no match found and ref has ref_order or ref_name, create ghost node
    const nameRefs = (fwdRefs || []).filter(r => NAME_MATCH_REF_TYPES.has(r.ref_type) && (r.ref_name || r.ref_order));
    // Group by unique ref identity (ref_order or ref_name) to avoid duplicate ghosts
    const nameRefEntries = []; // { ref, keyword, refType }
    const seenNameRefs = new Set();
    for (const r of nameRefs) {
      const key = r.ref_order || r.ref_name;
      if (seenNameRefs.has(key)) continue;
      seenNameRefs.add(key);
      const keyword = r.ref_name
        ? r.ref_name.trim().split(/\s+/).sort((a, b) => b.length - a.length)[0]?.toUpperCase()
        : null;
      nameRefEntries.push({ ref: r, keyword: keyword && keyword.length >= 3 ? keyword : null });
    }

    for (const entry of nameRefEntries) {
      let found = false;
      if (entry.keyword) {
        const { data: nameOrders } = await supabase
          .from('supplier_orders')
          .select(ORDER_SELECT)
          .eq('order_type', entry.ref.ref_type)
          .ilike('client_name', `%${entry.keyword}%`)
          .limit(20);
        for (const o of (nameOrders || [])) {
          if (o.id !== orderId) { linkedMap.set(o.id, o); found = true; }
        }
      }
      // Ghost node if nothing found and we have a ref_order to display
      if (!found && entry.ref.ref_order) {
        const ghost = makeGhostOrder(entry.ref.ref_order);
        linkedMap.set(ghost.id, ghost);
      }
    }
  }

  // 2. Reverse: other orders' refs that point to this order via ref_order
  //    Also search with ACCIAIERIA prefix variant (ACCIAIERIA orders have
  //    order_ref like "ACCIAIERIA/2026/..." but might be referenced as "OA/2026/...")
  const refVariants = [orderRef];
  if (orderRef.startsWith('ACCIAIERIA/')) {
    refVariants.push('OA/' + orderRef.slice('ACCIAIERIA/'.length));
  } else if (orderRef.startsWith('OA/')) {
    refVariants.push('ACCIAIERIA/' + orderRef.slice('OA/'.length));
  }

  for (const ref of refVariants) {
    const { data: revData } = await supabase
      .from('material_refs')
      .select('material_id, order_materials!inner(order_id, supplier_orders!inner(' + ORDER_SELECT + '))')
      .eq('ref_order', ref);

    for (const r of (revData || [])) {
      const so = r.order_materials?.supplier_orders;
      if (so && so.id !== orderId && !linkedMap.has(so.id)) {
        linkedMap.set(so.id, so);
      }
    }
  }

  return [...linkedMap.values()];
}

// ── Load notes ───────────────────────────────────────────────
export async function loadOrderNotes(orderType, orderRef) {
  let query = supabase.from('order_notes').select('*');
  if (orderType) query = query.eq('order_type', orderType);
  if (orderRef) query = query.eq('order_ref', orderRef);
  query = query.order('created_at');
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

// ── Save / update a note ─────────────────────────────────────
export async function saveOrderNote({ id, orderRef, orderType, codiceProdotto, noteText }) {
  if (id) {
    const { error } = await supabase
      .from('order_notes')
      .update({ note_text: noteText, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('order_notes')
      .insert({
        order_ref: orderRef,
        order_type: orderType,
        codice_prodotto: codiceProdotto || null,
        note_text: noteText,
      });
    if (error) throw error;
  }
}

export async function deleteOrderNote(id) {
  const { error } = await supabase.from('order_notes').delete().eq('id', id);
  if (error) throw error;
}

// ── Update scadenza effettiva ────────────────────────────────
export async function updateScadenzaEffettiva(materialId, date) {
  const { error } = await supabase
    .from('order_materials')
    .update({ scadenza_effettiva: date })
    .eq('id', materialId);
  if (error) throw error;
}

// ── Import parsed data (batch upsert orders + materials + refs) ──

const BATCH_ORDERS = 50;
const BATCH_MATERIALS = 200;
const BATCH_REFS = 500;

function toOrderRow(orderType, order) {
  return {
    order_type: orderType,
    order_ref: order.orderRef,
    order_date: order.orderDate || null,
    client_code: order.clientCode || null,
    client_name: order.clientName || null,
    client_ref: order.clientRef || null,
    porto: order.porto || null,
    destinazione: order.destinazione || null,
    valore_residuo: order.valoreResiduo || null,
    peso_totale: order.pesoTotale || null,
    supplier_code: order.supplierCode || null,
    supplier_name: order.supplierName || null,
    supplier_phone: order.supplierPhone || null,
    tot_peso_res: order.totPesoRes || null,
    raw_header: order.rawHeader || null,
    upload_date: new Date().toISOString(),
  };
}

function toMatRow(orderId, mat) {
  return {
    order_id: orderId,
    pos: mat.pos || null,
    scadenza: mat.scadenza || null,
    codice_prodotto: mat.codiceProdotto || null,
    descrizione: mat.descrizione || null,
    giacenza: mat.giacenza ?? null,
    impegnato: mat.impegnato ?? null,
    in_ordine: mat.inOrdine ?? null,
    cons_richiesta: mat.consRichiesta || null,
    rif_pos_cliente: mat.rifPosCliente || null,
    peso: mat.peso ?? null,
    ordinato: mat.ordinato ?? null,
    ricevuto: mat.ricevuto ?? null,
    valore_residuo: mat.valoreResiduo ?? null,
    prenotato: mat.prenotato ?? null,
    qty_inviata: mat.qtyInviata ?? null,
    kg: mat.kg ?? null,
    trattamento: mat.trattamento || null,
    bolla: mat.bolla || null,
    status: mat.status || null,
    cassone: mat.cassone || null,
  };
}

export async function importParsedOrders(orderType, parsedOrders, onProgress) {
  const total = parsedOrders.length;
  let totalOrders = 0;
  let totalMaterials = 0;
  let totalRefs = 0;

  // Step 1: Batch upsert orders → get IDs mapped by order_ref
  const refToId = new Map();
  for (let i = 0; i < total; i += BATCH_ORDERS) {
    const chunk = parsedOrders.slice(i, i + BATCH_ORDERS);
    const rows = chunk.map(o => toOrderRow(orderType, o));
    const { data, error } = await supabase
      .from('supplier_orders')
      .upsert(rows, { onConflict: 'order_type,order_ref' })
      .select('id, order_ref');
    if (error) throw error;
    for (const row of data) refToId.set(row.order_ref, row.id);
    totalOrders += data.length;
    if (onProgress) onProgress({ current: Math.min(i + BATCH_ORDERS, total), total });
  }

  // Step 2: Collect all order IDs → batch delete old refs
  const allOrderIds = [...refToId.values()];
  // Get old material IDs for these orders (paginated, Supabase max 1000)
  const oldMatIds = [];
  for (let i = 0; i < allOrderIds.length; i += 200) {
    const chunk = allOrderIds.slice(i, i + 200);
    const { data } = await supabase
      .from('order_materials')
      .select('id')
      .in('order_id', chunk);
    if (data) oldMatIds.push(...data.map(m => m.id));
  }
  // Batch delete refs for old materials
  for (let i = 0; i < oldMatIds.length; i += 500) {
    const chunk = oldMatIds.slice(i, i + 500);
    await supabase.from('material_refs').delete().in('material_id', chunk);
  }

  // Preserve user-set scadenza_effettiva across re-imports. Keyed by
  // (order_id, codice_prodotto, scadenza) — stable even when pos changes
  // (OA/OP now assign a synthetic pos so previously null-pos rows would
  // otherwise orphan their effective deadlines).
  const preserveSE = new Map();
  for (let i = 0; i < allOrderIds.length; i += 200) {
    const chunk = allOrderIds.slice(i, i + 200);
    const { data } = await supabase
      .from('order_materials')
      .select('order_id, codice_prodotto, scadenza, scadenza_effettiva')
      .in('order_id', chunk)
      .not('scadenza_effettiva', 'is', null);
    for (const m of (data || [])) {
      preserveSE.set(
        `${m.order_id}|${m.codice_prodotto}|${m.scadenza || ''}`,
        m.scadenza_effettiva,
      );
    }
  }

  // Clean up legacy null-pos materials. Parsers now always populate pos
  // (synthetic for OA/OP), so any remaining null-pos rows would orphan
  // on the next upsert (which matches on pos).
  for (let i = 0; i < allOrderIds.length; i += 200) {
    const chunk = allOrderIds.slice(i, i + 200);
    await supabase
      .from('order_materials')
      .delete()
      .in('order_id', chunk)
      .is('pos', null);
  }

  // Step 3: Batch upsert materials → get IDs for ref linking
  // Build flat list of { matRow, refs[] } with order_id resolved
  const matEntries = [];
  for (const order of parsedOrders) {
    const orderId = refToId.get(order.orderRef);
    for (const mat of order.materials || []) {
      const row = toMatRow(orderId, mat);
      const preserved = preserveSE.get(
        `${row.order_id}|${row.codice_prodotto}|${row.scadenza || ''}`,
      );
      if (preserved) row.scadenza_effettiva = preserved;
      matEntries.push({ row, refs: mat.refs || [] });
    }
  }

  // Dedup by DB conflict key (order_id, codice_prodotto, pos) — with NULLS NOT DISTINCT,
  // two rows with same code + null pos collide. Keep the entry with more data.
  const scoreEntry = (e) => {
    const nonNull = Object.values(e.row).filter(v => v != null && v !== '').length;
    return (e.refs?.length || 0) * 1000 + nonNull;
  };
  const dedupedMap = new Map();
  for (const entry of matEntries) {
    const key = `${entry.row.order_id}|${entry.row.codice_prodotto}|${entry.row.pos || ''}`;
    const existing = dedupedMap.get(key);
    if (!existing || scoreEntry(entry) > scoreEntry(existing)) {
      dedupedMap.set(key, entry);
    }
  }
  const dedupedEntries = [...dedupedMap.values()];

  const matKeyToRefs = new Map(); // "orderId|codice|pos" → refs[]
  for (let i = 0; i < dedupedEntries.length; i += BATCH_MATERIALS) {
    const chunk = dedupedEntries.slice(i, i + BATCH_MATERIALS);
    const rows = chunk.map(e => e.row);
    const { data, error } = await supabase
      .from('order_materials')
      .upsert(rows, { onConflict: 'order_id,codice_prodotto,pos' })
      .select('id, order_id, codice_prodotto, pos');
    if (error) throw error;
    totalMaterials += data.length;

    // Map returned IDs back to refs via composite key
    // First, build lookup from chunk
    const chunkLookup = new Map();
    for (const entry of chunk) {
      const key = `${entry.row.order_id}|${entry.row.codice_prodotto}|${entry.row.pos}`;
      chunkLookup.set(key, entry.refs);
    }
    for (const row of data) {
      const key = `${row.order_id}|${row.codice_prodotto}|${row.pos}`;
      const refs = chunkLookup.get(key);
      if (refs?.length) matKeyToRefs.set(row.id, refs);
    }
  }

  // Step 4: Batch insert all refs
  const allRefRows = [];
  for (const [materialId, refs] of matKeyToRefs) {
    for (const r of refs) {
      allRefRows.push({
        material_id: materialId,
        ref_type: r.refType || null,
        ref_code: r.refCode || null,
        ref_name: r.refName || null,
        ref_order: r.refOrder || null,
        ref_date: r.refDate || null,
        ref_qty: r.refQty ?? null,
        delivery_date: r.deliveryDate || null,
      });
    }
  }
  for (let i = 0; i < allRefRows.length; i += BATCH_REFS) {
    const chunk = allRefRows.slice(i, i + BATCH_REFS);
    const { error } = await supabase.from('material_refs').insert(chunk);
    if (error) throw error;
  }
  totalRefs = allRefRows.length;

  return { totalOrders, totalMaterials, totalRefs };
}
