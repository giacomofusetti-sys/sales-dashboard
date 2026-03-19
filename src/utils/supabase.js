import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_KEY;

export const supabase = createClient(url, key);

// ── Budget customers ──────────────────────────────────────────
export async function loadBudgetFromDB() {
  const { data, error } = await supabase
    .from('budget_customers')
    .select('*')
    .order('ragione');
  if (error) throw error;
  return data.map(dbToCustomer);
}

export async function saveBudgetToDB(customers) {
  const rows = customers.map(customerToDB);

  // Deduplicate by ragione_cap (keep last occurrence)
  const unique = new Map();
  rows.forEach(r => unique.set(r.ragione_cap, r));
  const deduped = [...unique.values()];

  // Upsert in batches of 200
  const BATCH = 200;
  for (let i = 0; i < deduped.length; i += BATCH) {
    const chunk = deduped.slice(i, i + BATCH);
    const { error } = await supabase
      .from('budget_customers')
      .upsert(chunk, { onConflict: 'ragione_cap' });
    if (error) throw error;
  }
}

export async function upsertCustomer(customer) {
  const { error } = await supabase
    .from('budget_customers')
    .upsert(customerToDB(customer), { onConflict: 'ragione_cap' });
  if (error) throw error;
}

// ── Monthly acquisito ─────────────────────────────────────────
export async function loadAcquisitoDB() {
  const { data, error } = await supabase
    .from('monthly_acquisito')
    .select('*');
  if (error) throw error;
  // Group by month_idx
  const grouped = {};
  data.forEach(r => {
    if (!grouped[r.month_idx]) grouped[r.month_idx] = [];
    grouped[r.month_idx].push({
      cliente: r.cliente,
      clienteCap: r.cliente_cap,
      valore: r.valore,
      valorePrv: r.valore_prv,
      qtaAct: r.qta_act,
    });
  });
  return grouped;
}

export async function saveAcquisito(monthIdx, rows) {
  // Delete existing for this month, then insert
  await supabase.from('monthly_acquisito').delete().eq('month_idx', monthIdx);
  const dbRows = rows.map(r => ({
    month_idx: monthIdx,
    cliente: r.cliente,
    cliente_cap: r.clienteCap,
    valore: r.valore,
    valore_prv: r.valorePrv,
    qta_act: r.qtaAct,
  }));
  const { error } = await supabase.from('monthly_acquisito').insert(dbRows);
  if (error) throw error;
}

// ── Monthly fatturato ─────────────────────────────────────────
export async function loadFatturatoDB() {
  const { data, error } = await supabase
    .from('monthly_fatturato')
    .select('*');
  if (error) throw error;
  const grouped = {};
  data.forEach(r => {
    if (!grouped[r.month_idx]) grouped[r.month_idx] = [];
    grouped[r.month_idx].push({
      cliente: r.cliente,
      clienteCap: r.cliente_cap,
      valore: r.valore,
      valorePrv: r.valore_prv,
      qtaAct: r.qta_act,
    });
  });
  return grouped;
}

export async function saveFatturato(monthIdx, rows) {
  await supabase.from('monthly_fatturato').delete().eq('month_idx', monthIdx);
  const dbRows = rows.map(r => ({
    month_idx: monthIdx,
    cliente: r.cliente,
    cliente_cap: r.clienteCap,
    valore: r.valore,
    valore_prv: r.valorePrv,
    qta_act: r.qtaAct,
  }));
  const { error } = await supabase.from('monthly_fatturato').insert(dbRows);
  if (error) throw error;
}

// ── Ordini aperti ─────────────────────────────────────────────
export async function loadOrdiniApertiDB() {
  const { data, error } = await supabase
    .from('ordini_aperti')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  if (!data.length) return null;
  const fileDate = data[0].file_date;
  const rows = data.map(r => ({
    cliente: r.cliente,
    clienteCap: r.cliente_cap,
    articolo: r.articolo,
    rifDoc: r.rif_doc,
    dataConsegna: r.data_consegna,
    ggRitardo: r.gg_ritardo,
    qtaAperti: r.qta_aperti,
    valoreAperti: r.valore_aperti,
  }));
  return { fileDate, rows };
}

export async function saveOrdiniAperti(fileDate, rows) {
  await supabase.from('ordini_aperti').delete().neq('id', 0);
  const dbRows = rows.map(r => ({
    file_date: fileDate,
    cliente: r.cliente,
    cliente_cap: r.clienteCap,
    articolo: r.articolo,
    rif_doc: r.rifDoc,
    data_consegna: r.dataConsegna,
    gg_ritardo: r.ggRitardo,
    qta_aperti: r.qtaAperti,
    valore_aperti: r.valoreAperti,
  }));
  const { error } = await supabase.from('ordini_aperti').insert(dbRows);
  if (error) throw error;
}

// ── Helpers ───────────────────────────────────────────────────
function customerToDB(c) {
  return {
    ragione: c.ragione,
    ragione_cap: c.ragioneCap,
    codice: c.codice,
    agente: c.agente,
    budget_venditori_mesi: c.budgetVenditoriMesi,
    budget_interno_mesi: c.budgetInternoMesi,
    budget_venditori_annuale: c.budgetVenditoriAnnuale,
    budget_interno_annuale: c.budgetInternoAnnuale,
    is_new: c.isNew,
    updated_at: new Date().toISOString(),
  };
}

function dbToCustomer(r) {
  return {
    ragione: r.ragione,
    ragioneCap: r.ragione_cap,
    codice: r.codice || '',
    agente: r.agente || '',
    budgetVenditoriMesi: r.budget_venditori_mesi || Array(12).fill(0),
    budgetInternoMesi: r.budget_interno_mesi || Array(12).fill(0),
    budgetVenditoriAnnuale: r.budget_venditori_annuale || 0,
    budgetInternoAnnuale: r.budget_interno_annuale || 0,
    isNew: r.is_new || false,
  };
}
