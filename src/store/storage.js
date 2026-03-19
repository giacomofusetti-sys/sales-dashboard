const KEY = 'salesDashboard_v2';

export function loadStore() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : defaultStore();
  } catch { return defaultStore(); }
}

export function saveStore(store) {
  try { localStorage.setItem(KEY, JSON.stringify(store)); }
  catch (e) { console.error('Save failed:', e); }
}

export function clearStore() {
  localStorage.removeItem(KEY);
}

function defaultStore() {
  return {
    customers: [],       // [{ ragione, ragioneCap, codice, agente, budgetVenditoriMesi, budgetInternoMesi, isNew }]
    acquisito: {},       // { [monthIdx]: [{ cliente, clienteCap, valore, valorePrv, qtaAct }] }
    fatturato: {},       // { [monthIdx]: [...] }
    ordiniAperti: null,  // { fileDate, rows: [...] }
    budgetLoaded: false,
    lastUpdated: null,
  };
}
