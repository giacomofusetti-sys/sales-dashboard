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

// ── Load materials for an order ──────────────────────────────
export async function loadOrderMaterials(orderIds) {
  if (!orderIds.length) return [];
  const { data, error } = await supabase
    .from('order_materials')
    .select('*')
    .in('order_id', orderIds)
    .order('pos');
  if (error) throw error;
  return data;
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

// Load deadline detail rows for a date range (limited to 500 per page)
export async function loadDeadlineRows(fromStr, toStr, { page = 0, pageSize = 500 } = {}) {
  const filter = deadlineRangeFilter(fromStr, toStr);
  let query = supabase
    .from('order_materials')
    .select('*, supplier_orders!inner(order_type, order_ref, client_name, supplier_name)')
    .not('scadenza', 'is', null);
  if (filter) query = query.or(filter);
  query = query.order('scadenza').range(page * pageSize, (page + 1) * pageSize - 1);
  const { data, error } = await query;
  if (error) throw error;
  return data;
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

// ── Find linked orders via refs (bidirectional) ─────────────
// Forward: refs FROM this order's materials that have ref_order set
// Reverse: refs in OTHER orders' materials where ref_order = this order's ref
//
// OV refs store ref_order = "OA/2026/..." (full downstream ref)
// OA/OP/OL refs store ref_type = "OV"/"OL" but NO ref_order
// So for an OA/OP/OL: forward refs won't have ref_order, but OV orders
// that reference it WILL have ref_order matching this order_ref.
// For an OV: forward refs have ref_order pointing to OA/OP/OL.

const ORDER_SELECT = 'id, order_type, order_ref, order_date, client_name, supplier_name, valore_residuo, peso_totale, tot_peso_res';

export async function findLinkedOrders(orderId, orderRef) {
  const linkedMap = new Map(); // id → order (deduped)

  // 1. Forward: refs from this order's materials with ref_order set
  const { data: myMats } = await supabase
    .from('order_materials')
    .select('id')
    .eq('order_id', orderId);
  const matIds = (myMats || []).map(m => m.id);

  if (matIds.length) {
    const { data: fwdRefs } = await supabase
      .from('material_refs')
      .select('ref_order')
      .in('material_id', matIds)
      .not('ref_order', 'is', null);

    const fwdOrderRefs = [...new Set((fwdRefs || []).map(r => r.ref_order))];
    if (fwdOrderRefs.length) {
      const { data: fwdOrders } = await supabase
        .from('supplier_orders')
        .select(ORDER_SELECT)
        .in('order_ref', fwdOrderRefs);
      for (const o of (fwdOrders || [])) {
        if (o.id !== orderId) linkedMap.set(o.id, o);
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

// ── Import parsed data (upsert orders + materials + refs) ────
export async function importParsedOrders(orderType, parsedOrders) {
  let totalOrders = 0;
  let totalMaterials = 0;
  let totalRefs = 0;

  for (const order of parsedOrders) {
    // 1. Upsert order
    const orderRow = {
      order_type: orderType,
      order_ref: order.orderRef,
      order_date: order.orderDate || null,
      client_code: order.clientCode || null,
      client_name: order.clientName || null,
      client_ref: order.clientRef || null,
      valore_residuo: order.valoreResiduo || null,
      peso_totale: order.pesoTotale || null,
      supplier_code: order.supplierCode || null,
      supplier_name: order.supplierName || null,
      supplier_phone: order.supplierPhone || null,
      tot_peso_res: order.totPesoRes || null,
      raw_header: order.rawHeader || null,
      upload_date: new Date().toISOString(),
    };

    const { data: upserted, error: orderErr } = await supabase
      .from('supplier_orders')
      .upsert(orderRow, { onConflict: 'order_type,order_ref' })
      .select('id')
      .single();
    if (orderErr) throw orderErr;

    const orderId = upserted.id;
    totalOrders++;

    // 2. Delete old refs for this order's materials (will be re-created)
    const { data: oldMats } = await supabase
      .from('order_materials')
      .select('id')
      .eq('order_id', orderId);
    if (oldMats?.length) {
      await supabase
        .from('material_refs')
        .delete()
        .in('material_id', oldMats.map(m => m.id));
    }

    // 3. Upsert materials
    for (const mat of order.materials || []) {
      const matRow = {
        order_id: orderId,
        pos: mat.pos || null,
        scadenza: mat.scadenza || null,
        codice_prodotto: mat.codiceProdotto || null,
        descrizione: mat.descrizione || null,
        giacenza: mat.giacenza ?? null,
        impegnato: mat.impegnato ?? null,
        in_ordine: mat.inOrdine ?? null,
        cons_richiesta: mat.consRichiesta || null,
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
      };

      const { data: upsertedMat, error: matErr } = await supabase
        .from('order_materials')
        .upsert(matRow, { onConflict: 'order_id,codice_prodotto,pos' })
        .select('id')
        .single();
      if (matErr) throw matErr;

      totalMaterials++;

      // 4. Insert refs
      if (mat.refs?.length) {
        const refRows = mat.refs.map(r => ({
          material_id: upsertedMat.id,
          ref_type: r.refType || null,
          ref_code: r.refCode || null,
          ref_name: r.refName || null,
          ref_order: r.refOrder || null,
          ref_date: r.refDate || null,
          ref_qty: r.refQty ?? null,
          delivery_date: r.deliveryDate || null,
        }));
        const { error: refErr } = await supabase.from('material_refs').insert(refRows);
        if (refErr) throw refErr;
        totalRefs += refRows.length;
      }
    }
  }

  return { totalOrders, totalMaterials, totalRefs };
}
