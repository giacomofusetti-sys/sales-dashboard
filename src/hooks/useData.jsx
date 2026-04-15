import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { parseBudget, parseSalesFile, parseOrdiniAperti, normalizeClient } from '../utils/parsers';
import {
  supabase,
  loadBudgetFromDB, saveBudgetToDB,
  loadAcquisitoDB, saveAcquisito,
  loadFatturatoDB, saveFatturato,
  loadOrdiniApertiDB, saveOrdiniAperti,
  upsertCustomer,
  loadAgentOverrides,
} from '../utils/supabase';

const DataContext = createContext(null);

// Normalize for fuzzy matching: remove dots, collapse spaces, trim, uppercase
function normalizeForMatch(str) {
  return (str || '').replace(/\./g, '').replace(/\s+/g, ' ').trim().toUpperCase();
}

// Apply persistent agent_overrides onto a customers array.
// Exact ragione_cap match first, fuzzy fallback (punctuation/whitespace insensitive).
// Overrides have absolute precedence over whatever agente came from budget_customers.
function applyAgentOverrides(customers, overrides) {
  if (!overrides?.length) return customers;
  const capIndex = new Map();
  const fuzzyIndex = new Map();
  customers.forEach((c, idx) => {
    capIndex.set(c.ragioneCap, idx);
    fuzzyIndex.set(normalizeForMatch(c.ragioneCap), idx);
  });
  const result = [...customers];
  const unmatched = [];
  let applied = 0;
  for (const ov of overrides) {
    let idx = capIndex.get(ov.ragioneCap);
    if (idx === undefined) idx = fuzzyIndex.get(normalizeForMatch(ov.ragioneCap));
    if (idx !== undefined) {
      result[idx] = { ...result[idx], agente: ov.agente };
      applied++;
    } else {
      unmatched.push(ov.ragioneCap);
    }
  }
  console.log(`[applyAgentOverrides] ${applied} applied, ${unmatched.length} unmatched (${overrides.length} total)`);
  if (unmatched.length) console.log('[applyAgentOverrides] unmatched overrides:', unmatched);
  return result;
}

function logMissingAgents(customers, label, overrides) {
  const overrideCaps = new Set((overrides || []).map(o => normalizeForMatch(o.ragioneCap)));
  const missing = customers.filter(c => {
    if (c.agente) return false;
    return !overrideCaps.has(normalizeForMatch(c.ragioneCap));
  });
  if (missing.length) {
    console.warn(`[missing agents] ${label}: ${missing.length} clients without agent:`, missing.map(c => c.ragioneCap));
  } else {
    console.log(`[missing agents] ${label}: all clients have agents`);
  }
}

function emptyStore() {
  return { customers: [], acquisito: {}, fatturato: {}, ordiniAperti: null, budgetLoaded: false, lastUpdated: null };
}

export function DataProvider({ children }) {
  const [store, setStore] = useState(emptyStore);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newClientsLastUpload, setNewClientsLastUpload] = useState([]);

  // Load all data from Supabase on mount
  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        const [rawCustomers, acquisito, fatturato, ordiniAperti, overrides] = await Promise.all([
          loadBudgetFromDB(),
          loadAcquisitoDB(),
          loadFatturatoDB(),
          loadOrdiniApertiDB(),
          loadAgentOverrides(),
        ]);

        const customers = applyAgentOverrides(rawCustomers, overrides);
        logMissingAgents(customers, 'init', overrides);
        setStore({
          customers,
          acquisito,
          fatturato,
          ordiniAperti,
          budgetLoaded: customers.length > 0,
          lastUpdated: null,
        });
      } catch (e) {
        setError('Errore di connessione al database: ' + e.message);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  const uploadBudget = useCallback(async (file) => {
    setLoading(true); setError(null);
    try {
      const buf = await file.arrayBuffer();
      const customers = parseBudget(buf);
      const existingMap = Object.fromEntries(store.customers.map(c => [c.ragioneCap, c]));
      const merged = customers.map(c => ({ ...c, isNew: existingMap[c.ragioneCap]?.isNew || false }));
      // saveBudgetToDB also upserts the persistent agent_overrides (seed)
      await saveBudgetToDB(merged);

      // Reload customers + overrides, then apply overrides on top
      const [rawCustomers, overrides] = await Promise.all([
        loadBudgetFromDB(),
        loadAgentOverrides(),
      ]);
      const allCustomers = applyAgentOverrides(rawCustomers, overrides);
      logMissingAgents(allCustomers, 'uploadBudget', overrides);

      setStore(prev => ({ ...prev, customers: allCustomers, budgetLoaded: true, lastUpdated: new Date().toISOString() }));
    } catch (e) { setError('Errore budget: ' + e.message); }
    finally { setLoading(false); }
  }, [store.customers]);

  const uploadAcquisito = useCallback(async (file) => {
    setLoading(true); setError(null);
    try {
      const buf = await file.arrayBuffer();
      const { month, rows } = parseSalesFile(buf, file.name);
      if (month === null) throw new Error('Mese non rilevato. Includi il mese nel nome file (es. Acquisito_marzo_2026.xlsx)');
      const { updatedCustomers, newFound } = await detectAndAddNew(rows, store.customers);
      await saveAcquisito(month, rows);
      setNewClientsLastUpload(newFound);
      logMissingAgents(updatedCustomers, 'uploadAcquisito');
      setStore(prev => ({ ...prev, customers: updatedCustomers, acquisito: { ...prev.acquisito, [month]: rows }, lastUpdated: new Date().toISOString() }));
    } catch (e) { setError('Errore acquisito: ' + e.message); }
    finally { setLoading(false); }
  }, [store.customers]);

  const uploadFatturato = useCallback(async (file) => {
    setLoading(true); setError(null);
    try {
      const buf = await file.arrayBuffer();
      const { month, rows } = parseSalesFile(buf, file.name);
      if (month === null) throw new Error('Mese non rilevato. Includi il mese nel nome file (es. Fatturato_marzo_2026.xlsx)');
      const { updatedCustomers, newFound } = await detectAndAddNew(rows, store.customers);
      await saveFatturato(month, rows);
      setNewClientsLastUpload(prev => [...new Set([...prev, ...newFound])]);
      logMissingAgents(updatedCustomers, 'uploadFatturato');
      setStore(prev => ({ ...prev, customers: updatedCustomers, fatturato: { ...prev.fatturato, [month]: rows }, lastUpdated: new Date().toISOString() }));
    } catch (e) { setError('Errore fatturato: ' + e.message); }
    finally { setLoading(false); }
  }, [store.customers]);

  const uploadOrdiniAperti = useCallback(async (file) => {
    setLoading(true); setError(null);
    try {
      const buf = await file.arrayBuffer();
      const data = parseOrdiniAperti(buf, file.name);
      await saveOrdiniAperti(data.fileDate, data.rows);
      setStore(prev => ({ ...prev, ordiniAperti: data, lastUpdated: new Date().toISOString() }));
    } catch (e) { setError('Errore ordini aperti: ' + e.message); }
    finally { setLoading(false); }
  }, []);

  const resetAll = useCallback(async () => {
    if (!window.confirm('Sicuro? Tutti i dati verranno eliminati dal database.')) return;
    setLoading(true);
    try {
      
      await Promise.all([
        supabase.from('budget_customers').delete().neq('id', 0),
        supabase.from('monthly_acquisito').delete().neq('id', 0),
        supabase.from('monthly_fatturato').delete().neq('id', 0),
        supabase.from('ordini_aperti').delete().neq('id', 0),
      ]);
      setStore(emptyStore());
      setNewClientsLastUpload([]);
    } catch (e) { setError('Errore reset: ' + e.message); }
    finally { setLoading(false); }
  }, []);

  const availableMonths = [...new Set([
    ...Object.keys(store.acquisito).map(Number),
    ...Object.keys(store.fatturato).map(Number),
  ])].sort((a, b) => a - b);

  const lastMonth = availableMonths.length > 0 ? availableMonths[availableMonths.length - 1] : null;

  return (
    <DataContext.Provider value={{
      store, loading, error,
      uploadBudget, uploadAcquisito, uploadFatturato, uploadOrdiniAperti,
      resetAll, availableMonths, lastMonth,
      newClientsLastUpload, setNewClientsLastUpload,
    }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be inside DataProvider');
  return ctx;
}

async function detectAndAddNew(rows, currentCustomers) {
  const knownCaps = new Set(currentCustomers.map(c => c.ragioneCap));
  const updatedCustomers = [...currentCustomers];
  const newFound = [];
  const toInsert = [];

  // Collect new client caps first
  const newCaps = [];
  rows.forEach(row => {
    if (!knownCaps.has(row.clienteCap)) {
      newCaps.push(row.clienteCap);
      knownCaps.add(row.clienteCap);
    }
  });

  // Check if any of these already exist in DB (e.g. seeded by seedNewClientsAgents)
  let dbExisting = {};
  if (newCaps.length) {
    console.log('[detectAndAddNew] new caps not in local state:', newCaps);
    const { data } = await supabase
      .from('budget_customers')
      .select('ragione_cap, agente')
      .in('ragione_cap', newCaps);
    if (data) {
      data.forEach(r => { dbExisting[r.ragione_cap] = r.agente || ''; });
    }
    console.log('[detectAndAddNew] found in DB:', dbExisting);
  }

  // Reset knownCaps from currentCustomers (we added newCaps above just to deduplicate)
  const knownCaps2 = new Set(currentCustomers.map(c => c.ragioneCap));

  rows.forEach(row => {
    if (!knownCaps2.has(row.clienteCap)) {
      const newCustomer = {
        ragione: row.cliente,
        ragioneCap: row.clienteCap,
        codice: '',
        agente: dbExisting[row.clienteCap] || '',
        budgetVenditoriMesi: Array(12).fill(0),
        budgetInternoMesi: Array(12).fill(0),
        budgetVenditoriAnnuale: 0,
        budgetInternoAnnuale: 0,
        isNew: true,
      };
      newFound.push(row.cliente);
      updatedCustomers.push(newCustomer);
      toInsert.push(newCustomer);
      knownCaps2.add(row.clienteCap);
    }
  });

  for (const c of toInsert) await upsertCustomer(c);
  return { updatedCustomers, newFound };
}
