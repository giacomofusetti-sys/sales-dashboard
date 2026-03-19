import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { parseBudget, parseSalesFile, parseOrdiniAperti, normalizeClient } from '../utils/parsers';
import {
  supabase,
  loadBudgetFromDB, saveBudgetToDB,
  loadAcquisitoDB, saveAcquisito,
  loadFatturatoDB, saveFatturato,
  loadOrdiniApertiDB, saveOrdiniAperti,
  upsertCustomer,
} from '../utils/supabase';

const DataContext = createContext(null);

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
        const [customers, acquisito, fatturato, ordiniAperti] = await Promise.all([
          loadBudgetFromDB(),
          loadAcquisitoDB(),
          loadFatturatoDB(),
          loadOrdiniApertiDB(),
        ]);
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
      await saveBudgetToDB(merged);
      // Reload from DB to include seeded clients from seedNewClientsAgents()
      const allCustomers = await loadBudgetFromDB();
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
    const { data } = await supabase
      .from('budget_customers')
      .select('ragione_cap, agente')
      .in('ragione_cap', newCaps);
    if (data) {
      data.forEach(r => { dbExisting[r.ragione_cap] = r.agente || ''; });
    }
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
