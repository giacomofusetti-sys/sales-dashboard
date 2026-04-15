import { createClient } from '@supabase/supabase-js';
import { resolveAlias } from './aliases.js';
import { normalizeClient } from './parsers';

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
  return data.map(dbToCustomer);1
}

export async function saveBudgetToDB(customers) {
  const rows = customers.map(customerToDB);

  // Deduplicate by ragione_cap — keep the one with highest budget
  const unique = new Map();
  rows.forEach(r => {
    const existing = unique.get(r.ragione_cap);
    if (existing) {
      const existingBdg = (existing.budget_venditori_mesi || []).reduce((s, v) => s + (v || 0), 0);
      const newBdg = (r.budget_venditori_mesi || []).reduce((s, v) => s + (v || 0), 0);
      console.warn(`[saveBudgetToDB] DUPLICATE "${r.ragione_cap}": existing bdg=${existingBdg.toFixed(2)}, new bdg=${newBdg.toFixed(2)}, keeping ${newBdg >= existingBdg ? 'new' : 'existing'}`);
      if (newBdg >= existingBdg) {
        unique.set(r.ragione_cap, r);
      }
    } else {
      unique.set(r.ragione_cap, r);
    }
  });
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

  // Ensure the seed agent overrides exist in the persistent table
  await saveAgentOverrides();
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
  const months = Object.keys(grouped).sort();
  console.log(`[loadAcquisitoDB] ${data.length} rows, months: [${months.join(', ')}]`);
  months.forEach(m => {
    const total = grouped[m].reduce((s, r) => s + r.valore, 0);
    console.log(`[loadAcquisitoDB] month ${m}: ${grouped[m].length} clients, total: ${total.toFixed(2)}`);
  });
  return grouped;
}

export async function saveAcquisito(monthIdx, rows) {
  const total = rows.reduce((s, r) => s + r.valore, 0);
  console.log(`[saveAcquisito] month ${monthIdx}: ${rows.length} rows, total: ${total.toFixed(2)}`);
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
  const fMonths = Object.keys(grouped).sort();
  console.log(`[loadFatturatoDB] ${data.length} rows, months: [${fMonths.join(', ')}]`);
  fMonths.forEach(m => {
    const total = grouped[m].reduce((s, r) => s + r.valore, 0);
    console.log(`[loadFatturatoDB] month ${m}: ${grouped[m].length} clients, total: ${total.toFixed(2)}`);
  });
  return grouped;
}

export async function saveFatturato(monthIdx, rows) {
  const total = rows.reduce((s, r) => s + r.valore, 0);
  console.log(`[saveFatturato] month ${monthIdx}: ${rows.length} rows, total: ${total.toFixed(2)}`);
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

// ── Update customer agent ────────────────────────────────────
export async function updateCustomerAgent(ragioneCap, agente) {
  const { error } = await supabase
    .from('budget_customers')
    .update({ agente, updated_at: new Date().toISOString() })
    .eq('ragione_cap', ragioneCap);
  if (error) throw error;
}

// ── Seed new clients with agents ─────────────────────────────
export const NEW_CLIENTS_AGENTS = [
  ['A. STAFFELBACH AG', 'EXPORT SALES'],
  ['AIM SERVICE ITALIA SRL', 'PIRAN MATTIA'],
  ['AKEA SRL', 'OLTOLINI MASSIMILIANO'],
  ['C.P.F. SRL', 'OLTOLINI MASSIMILIANO'],
  ['CAM SPA', 'OLTOLINI MASSIMILIANO'],
  ['CASTEL S.R.L.', 'OLTOLINI MASSIMILIANO'],
  ['CIMA ENGINEERING SRL', 'OLTOLINI MASSIMILIANO'],
  ['COLOMBO MAGNO SRL OFFICINA MECCANICA', 'DIRETTO'],
  ['FP 2000 SAS DI PREMOLI GIANBATTISTA & C.', 'BANKA AGNIESZKA'],
  ['FRAMBATI & CO. SRL A SOCIO UNICO', 'PIRAN MATTIA'],
  ['GIBERTI S.R.L. COSTR. CALDERARIE', 'PIRAN MATTIA'],
  ['KONECRANES PORT SERVICES GMBH', 'PIRAN MATTIA'],
  ['LA GIEFFE SRL UNIPERSONALE', 'SOCCAL FABIO'],
  ['PHONONIC VIBES SRL', 'OLTOLINI MASSIMILIANO'],
  ['PIOMBINO TECH SRL', 'SOCCAL FABIO'],
  ["ROMBOFER DI ROMBOLA' ROBERTO", 'PIRAN MATTIA'],
  ['TONOLI IMPIANTI SRL', 'OLTOLINI MASSIMILIANO'],
  ['DELLASSETTE SRL OFFICINA MECCANICA', 'DIRETTO'],
  ['DIRMAG SRL', 'BRENNA ALESSANDRO'],
  ['INDUSTRIOUS GLOBAL TECHNOLOGIES S.R.L.', 'OLTOLINI MASSIMILIANO'],
  ['LEITECH S.R.O', 'SOCCAL FABIO'],
  ['LI.BO SRL FORNITURE INDUSTRIALI', 'PIRAN MATTIA'],
  ['MODOMEC SRL', 'SOCCAL FABIO'],
  ['POGGIOLI SRL', 'PIRAN MATTIA'],
  ['TECNOFAST SRL UNIPERSONALE', 'OLTOLINI MASSIMILIANO'],
  ['ZELLINGER SRL', 'PIRAN MATTIA'],
  ['CANNON BONO S.P.A.', 'OLTOLINI MASSIMILIANO'],
  ['GIPO GISLER POWER AG', 'EXPORT SALES'],
  ['TERMOMECCANICA RAIMONDI DI ING. VITTORIO, MARCO & C. SRL', 'PIRAN MATTIA'],
  ['TURBINEN-UND KRAFTWERKSANLAGENBAU EFG ENERGIEFORSCHUNGS-UND ENT-WICKLUNGSGESELLSCHAFT  M.B.H. & CO KG.', 'EXPORT SALES'],
  ['A.R.V.F. SRL A SOCIO UNICO', 'PIRAN MATTIA'],
  ['VALMET INC. COMPANY', 'EXPORT SALES'],
  ['VALMET INC. COMPANY 1641', 'EXPORT SALES'],
  ['INAUEN SCHAETTI AG', 'EXPORT SALES'],
  ['OFFICINE GHIDONI SA', 'EXPORT SALES'],
  ['M.D.M. 2000 SRL', 'PIRAN MATTIA'],
  ['M.D.M 2000 SRL', 'PIRAN MATTIA'],
  ['TECNOMATIC FLOW ELEMENTS SRL', 'PIRAN MATTIA'],
  ['FVP S.R.L.', 'BANKA AGNIESZKA'],
  ['STIM SRL', 'BANKA AGNIESZKA'],
  ['TAPFLO ITALIA SRL', 'OLTOLINI MASSIMILIANO'],
  ['CARTIERE MODESTO CARDELLA SPA', 'SOCCAL FABIO'],
  ['QUADRIFER SRL', 'DIRETTO'],
  ['ENERGY LAB SRL', 'OLTOLINI MASSIMILIANO'],
  ['ENERGY LAB SRL.', 'OLTOLINI MASSIMILIANO'],
  ['ZOCCHI FRATELLI SNC DI ZOCCHI RENATO & C.', 'DIRETTO'],
  ['NUOVI CLIENTI BRENNA', 'BRENNA ALESSANDRO'],
  ['NUOVI CLIENTI SOCCAL', 'SOCCAL FABIO'],
];

// ── Agent overrides (persistent, survive budget reset) ──────
// These are client→agente mappings stored separately from budget_customers
// so they are never lost when the budget is wiped and re-uploaded.
export async function saveAgentOverrides() {
  // Dedupe by resolved ragione_cap
  const unique = new Map();
  for (const [ragione, agente] of NEW_CLIENTS_AGENTS) {
    const resolved = resolveAlias(ragione);
    const cap = normalizeClient(resolved);
    unique.set(cap, { ragione_cap: cap, ragione: resolved, agente });
  }
  const rows = [...unique.values()];

  const { error } = await supabase
    .from('agent_overrides')
    .upsert(rows, { onConflict: 'ragione_cap' });
  if (error) {
    console.error('[saveAgentOverrides] error (is the agent_overrides table created?):', error.message);
    return;
  }
  console.log(`[saveAgentOverrides] upserted ${rows.length} overrides`);
}

export async function loadAgentOverrides() {
  const { data, error } = await supabase
    .from('agent_overrides')
    .select('ragione_cap, ragione, agente');
  if (error) {
    console.error('[loadAgentOverrides] error (is the agent_overrides table created?):', error.message);
    return [];
  }
  return (data || []).map(r => ({
    ragioneCap: r.ragione_cap,
    ragione: r.ragione,
    agente: r.agente,
  }));
}

// ── Client aliases ───────────────────────────────────────────
export async function loadAliases() {
  const { data, error } = await supabase
    .from('client_aliases')
    .select('*');
  if (error) throw error;
  const map = {};
  data.forEach(r => { map[r.sales_name] = r.budget_name; });
  return map;
}

export async function saveAliases(aliasMap) {
  // Clear existing aliases, then insert all
  await supabase.from('client_aliases').delete().neq('id', 0);
  const rows = Object.entries(aliasMap).map(([salesName, budgetName]) => ({
    sales_name: salesName,
    budget_name: budgetName,
  }));
  if (rows.length) {
    const { error } = await supabase.from('client_aliases').insert(rows);
    if (error) throw error;
  }
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
