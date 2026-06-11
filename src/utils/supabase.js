import { createClient } from '@supabase/supabase-js';
import { resolveAlias } from './aliases.js';
import { normalizeClient } from './parsers';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_KEY;

export const supabase = createClient(url, key);

/**
 * Fetch tutte le righe di una tabella, paginando per superare
 * il limite default Supabase di 1000 righe.
 *
 * @param {string} table - nome tabella
 * @param {object} options - { columns?: string, orderBy?: string, ascending?: boolean, filter?: (qb) => qb }
 * @returns {Promise<Array>} tutte le righe
 */
export async function fetchAllRows(table, options = {}) {
  const {
    columns = '*',
    orderBy = 'id',
    ascending = true,
    filter = null,
  } = options;
  const pageSize = 1000;
  const all = [];
  let from = 0;

  while (true) {
    let qb = supabase
      .from(table)
      .select(columns)
      .order(orderBy, { ascending })
      .range(from, from + pageSize - 1);
    if (filter) qb = filter(qb);

    const { data, error } = await qb;
    if (error) {
      console.error(`fetchAllRows(${table}) error:`, error);
      throw error;
    }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break; // ultima pagina
    from += pageSize;
  }

  return all;
}

// ── Budget customers ──────────────────────────────────────────
export async function loadBudgetFromDB() {
  const data = await fetchAllRows('budget_customers', { orderBy: 'ragione' });
  return data.map(dbToCustomer);
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
  const data = await fetchAllRows('monthly_acquisito');
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
  const data = await fetchAllRows('monthly_fatturato');
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
  const data = await fetchAllRows('ordini_aperti', {
    orderBy: 'created_at',
    ascending: false,
  });
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

// ── Seed list for the persistent agent_overrides table ───────
// On every saveBudgetToDB() this list is upserted into the agent_overrides
// table. Add new client→agente associations here to make them sticky.
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
  ['TURBINEN-UND KRAFTWERKSANLAGENBAU EFG ENERGIEFORSCHUNGS-UND ENT-', 'EXPORT SALES'],
  ['A.R.V.F. SRL A SOCIO UNICO', 'PIRAN MATTIA'],
  ['VALMET INC. COMPANY', 'EXPORT SALES'],
  ['VALMET INC. COMPANY 1641', 'EXPORT SALES'],
  ['INAUEN SCHAETTI AG', 'EXPORT SALES'],
  ['OFFICINE GHIDONI SA', 'EXPORT SALES'],
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
  ['NUOVI CLIENTI BANKA', 'BANKA AGNIESZKA'],
  ['NUOVI CLIENTI BRENNA', 'BRENNA ALESSANDRO'],
  ['NUOVI CLIENTI EXPORT', 'EXPORT SALES'],
  ['NUOVI CLIENTI OLTOLINI', 'OLTOLINI MASSIMILIANO'],
  ['NUOVI CLIENTI PIRAN', 'PIRAN MATTIA'],
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

// Upsert a batch of cliente→agente entries into agent_overrides.
// Each entry: { cliente, agente }
export async function saveNewClientsAgents(entries) {
  const unique = new Map();
  for (const { cliente, agente } of entries) {
    const resolved = resolveAlias(cliente);
    const cap = normalizeClient(resolved);
    if (!cap || !agente) continue;
    unique.set(cap, { ragione_cap: cap, ragione: resolved, agente: agente.toUpperCase() });
  }
  const rows = [...unique.values()];
  if (!rows.length) return [];

  const { error } = await supabase
    .from('agent_overrides')
    .upsert(rows, { onConflict: 'ragione_cap' });
  if (error) {
    console.error('[saveNewClientsAgents] error:', error.message);
    throw error;
  }
  console.log(`[saveNewClientsAgents] upserted ${rows.length} overrides`);
  return rows;
}

export async function loadAgentOverrides() {
  let data;
  try {
    data = await fetchAllRows('agent_overrides', {
      columns: 'ragione_cap, ragione, agente',
      orderBy: 'ragione_cap',
    });
  } catch (error) {
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
