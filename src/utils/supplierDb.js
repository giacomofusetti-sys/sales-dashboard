import { supabase } from './supabase.js';

// ── Load orders ──────────────────────────────────────────────
export async function loadSupplierOrders(orderType) {
  let query = supabase.from('supplier_orders').select('*');
  if (orderType) query = query.eq('order_type', orderType);
  query = query.order('order_ref');
  const { data, error } = await query;
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

// ── Load all materials with upcoming deadlines ───────────────
export async function loadUpcomingDeadlines(withinDays = 30) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + withinDays);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('order_materials')
    .select('*, supplier_orders!inner(order_type, order_ref, client_name, supplier_name)')
    .or(`scadenza_effettiva.lte.${cutoffStr},and(scadenza_effettiva.is.null,scadenza.lte.${cutoffStr})`)
    .order('scadenza');
  if (error) throw error;
  return data;
}

// ── Load refs for materials ──────────────────────────────────
export async function loadMaterialRefs(materialIds) {
  if (!materialIds.length) return [];
  const { data, error } = await supabase
    .from('material_refs')
    .select('*')
    .in('material_id', materialIds);
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
