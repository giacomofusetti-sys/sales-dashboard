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
      .select('*, supplier_orders!inner(order_type, order_ref, client_name, supplier_name, bloccato)')
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

// ── Find linked orders via refs (bidirectional) ────────────
// Every ref_order is stored in the canonical order_ref format
// (OV/2026/02773, OA/2026/0001909, ...), so links resolve directly.
// ACCIAIERIA orders keep their real 'OA/…' order_ref and are found the same way.
// Only order-type refs create links; DDL/BPL/DDF/BPV are documents, not nodes.

const ORDER_SELECT = 'id, order_type, order_ref, order_date, client_name, supplier_name, valore_residuo, peso_totale, tot_peso_res';
const LINK_REF_TYPES = ['F', 'OV', 'OA', 'OP', 'OL'];
const GHOST_PREFIXES = new Set(['OV', 'OA', 'OP', 'OL']);

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
      .select('ref_type, ref_order')
      .in('material_id', matIds)
      .in('ref_type', LINK_REF_TYPES);

    const refOrders = [...new Set(
      (fwdRefs || []).map(r => r.ref_order).filter(r => r && r !== orderRef)
    )];
    if (refOrders.length) {
      const { data: fwdOrders } = await supabase
        .from('supplier_orders')
        .select(ORDER_SELECT)
        .in('order_ref', refOrders);
      const foundRefs = new Set((fwdOrders || []).map(o => o.order_ref));
      for (const o of (fwdOrders || [])) {
        if (o.id !== orderId) linkedMap.set(o.id, o);
      }
      // Ghost nodes for order refs not present in the archive
      for (const ref of refOrders) {
        if (!foundRefs.has(ref) && GHOST_PREFIXES.has(ref.split('/')[0])) {
          const ghost = makeGhostOrder(ref);
          linkedMap.set(ghost.id, ghost);
        }
      }
    }
  }

  // 2. Reverse: other orders' refs that point to this order
  const { data: revData } = await supabase
    .from('material_refs')
    .select('material_id, order_materials!inner(order_id, supplier_orders!inner(' + ORDER_SELECT + '))')
    .eq('ref_order', orderRef)
    .in('ref_type', LINK_REF_TYPES);

  for (const r of (revData || [])) {
    const so = r.order_materials?.supplier_orders;
    if (so && so.id !== orderId && !linkedMap.has(so.id)) {
      linkedMap.set(so.id, so);
    }
  }

  return [...linkedMap.values()];
}

// ── Last import timestamp ────────────────────────────────────
export async function loadLastUpdate() {
  const { data, error } = await supabase
    .from('supplier_orders')
    .select('upload_date')
    .order('upload_date', { ascending: false, nullsFirst: false })
    .limit(1);
  if (error) throw error;
  return data?.[0]?.upload_date ?? null;
}

// ── Import one order type snapshot (atomic, server-side) ─────
export async function importSupplierSnapshot(type, orders, force = false) {
  const { data, error } = await supabase.rpc('import_supplier_snapshot', {
    p_type: type,
    p_orders: orders,
    p_force: force,
  });
  if (error) throw error;
  return data;
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
