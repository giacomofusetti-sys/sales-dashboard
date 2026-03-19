import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { loadStore, saveStore, clearStore } from '../store/storage';
import { parseBudget, parseSalesFile, parseOrdiniAperti, normalizeClient } from '../utils/parsers';

const DataContext = createContext(null);

export function DataProvider({ children }) {
  const [store, setStore] = useState(() => loadStore());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [newClientsLastUpload, setNewClientsLastUpload] = useState([]);

  useEffect(() => { saveStore(store); }, [store]);

  const uploadBudget = useCallback(async (file) => {
    setLoading(true); setError(null);
    try {
      const buf = await file.arrayBuffer();
      const customers = parseBudget(buf);
      // Preserve isNew flags for existing clients
      const existingMap = Object.fromEntries(store.customers.map(c => [c.ragioneCap, c]));
      const merged = customers.map(c => ({
        ...c,
        isNew: existingMap[c.ragioneCap]?.isNew || false,
      }));
      setStore(prev => ({ ...prev, customers: merged, budgetLoaded: true, lastUpdated: new Date().toISOString() }));
    } catch (e) { setError('Errore budget: ' + e.message); }
    finally { setLoading(false); }
  }, [store.customers]);

  const uploadAcquisito = useCallback(async (file) => {
    setLoading(true); setError(null);
    try {
      const buf = await file.arrayBuffer();
      const { month, rows } = parseSalesFile(buf, file.name);
      if (month === null) throw new Error('Mese non rilevato dal nome file. Includilo nel nome (es. acquisito_marzo_2026.xlsx)');

      const { updatedCustomers, newFound } = detectAndAddNewClients(rows, store.customers);
      setNewClientsLastUpload(newFound);
      setStore(prev => ({
        ...prev,
        customers: updatedCustomers,
        acquisito: { ...prev.acquisito, [month]: rows },
        lastUpdated: new Date().toISOString(),
      }));
    } catch (e) { setError('Errore acquisito: ' + e.message); }
    finally { setLoading(false); }
  }, [store.customers]);

  const uploadFatturato = useCallback(async (file) => {
    setLoading(true); setError(null);
    try {
      const buf = await file.arrayBuffer();
      const { month, rows } = parseSalesFile(buf, file.name);
      if (month === null) throw new Error('Mese non rilevato dal nome file.');

      const { updatedCustomers, newFound } = detectAndAddNewClients(rows, store.customers);
      setNewClientsLastUpload(prev => [...new Set([...prev, ...newFound])]);
      setStore(prev => ({
        ...prev,
        customers: updatedCustomers,
        fatturato: { ...prev.fatturato, [month]: rows },
        lastUpdated: new Date().toISOString(),
      }));
    } catch (e) { setError('Errore fatturato: ' + e.message); }
    finally { setLoading(false); }
  }, [store.customers]);

  const uploadOrdiniAperti = useCallback(async (file) => {
    setLoading(true); setError(null);
    try {
      const buf = await file.arrayBuffer();
      const data = parseOrdiniAperti(buf, file.name);
      setStore(prev => ({ ...prev, ordiniAperti: data, lastUpdated: new Date().toISOString() }));
    } catch (e) { setError('Errore ordini aperti: ' + e.message); }
    finally { setLoading(false); }
  }, []);

  const resetAll = useCallback(() => {
    if (window.confirm('Sicuro? Tutti i dati verranno eliminati.')) {
      clearStore();
      setStore({ customers: [], acquisito: {}, fatturato: {}, ordiniAperti: null, budgetLoaded: false, lastUpdated: null });
      setNewClientsLastUpload([]);
    }
  }, []);

  const availableMonths = [
    ...new Set([
      ...Object.keys(store.acquisito).map(Number),
      ...Object.keys(store.fatturato).map(Number),
    ])
  ].sort((a, b) => a - b);

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

// Detect new clients from a sales file rows vs current customer list
function detectAndAddNewClients(rows, currentCustomers) {
  const knownCaps = new Set(currentCustomers.map(c => c.ragioneCap));
  const updatedCustomers = [...currentCustomers];
  const newFound = [];

  rows.forEach(row => {
    if (!knownCaps.has(row.clienteCap)) {
      newFound.push(row.cliente);
      updatedCustomers.push({
        ragione: row.cliente,
        ragioneCap: row.clienteCap,
        codice: '',
        agente: '',
        budgetVenditoriMesi: Array(12).fill(0),
        budgetInternoMesi: Array(12).fill(0),
        budgetVenditoriAnnuale: 0,
        budgetInternoAnnuale: 0,
        isNew: true,
      });
      knownCaps.add(row.clienteCap);
    }
  });

  return { updatedCustomers, newFound };
}
