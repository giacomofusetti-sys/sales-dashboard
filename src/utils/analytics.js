export function fmt(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}

export function fmtDelta(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  const abs = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Math.abs(n));
  return (n >= 0 ? '+' : '−') + abs;
}

export function fmtPct(n) {
  if (n === null || n === undefined || isNaN(n) || !isFinite(n)) return '—';
  return (n >= 0 ? '+' : '') + (n * 100).toFixed(1) + '%';
}

// Build a lookup: clienteCap → { agente, budgetVenditoriMesi, budgetInternoMesi, isNew, ragione }
function buildBudgetMap(customers) {
  return Object.fromEntries(customers.map(c => [c.ragioneCap, c]));
}

// Merge acquisito + fatturato for a single month into per-client rows
export function computeMonthRows(store, month) {
  const budgetMap = buildBudgetMap(store.customers);
  const acqRows = store.acquisito[month] || [];
  const fatRows = store.fatturato[month] || [];

  // Index fatturato by client
  const fatByClient = {};
  fatRows.forEach(r => { fatByClient[r.clienteCap] = r; });

  // Union of all clients appearing in either file
  const allClientCaps = new Set([...acqRows.map(r => r.clienteCap), ...fatRows.map(r => r.clienteCap)]);

  // Index acquisito
  const acqByClient = {};
  acqRows.forEach(r => { acqByClient[r.clienteCap] = r; });

  const rows = [];
  allClientCaps.forEach(cap => {
    const budget = budgetMap[cap];
    const acq = acqByClient[cap];
    const fat = fatByClient[cap];
    const acquisito = acq?.valore || 0;
    const fatturato = fat?.valore || 0;
    const budgetVend = budget?.budgetVenditoriMesi[month] || 0;
    const budgetInt = budget?.budgetInternoMesi[month] || 0;

    rows.push({
      cliente: budget?.ragione || acq?.cliente || fat?.cliente || cap,
      clienteCap: cap,
      agente: budget?.agente || '',
      isNew: budget?.isNew || false,
      acquisito,
      fatturato,
      budgetVend,
      budgetInt,
      scostAcqVsBudgetVend: acquisito - budgetVend,
      scostAcqVsBudgetInt: acquisito - budgetInt,
      scostFatVsBudgetVend: fatturato - budgetVend,
      scostFatVsBudgetInt: fatturato - budgetInt,
    });
  });

  return rows.sort((a, b) => b.acquisito - a.acquisito);
}

// YTD: aggregate from month 0 to upToMonth (inclusive)
export function computeYTDRows(store, upToMonth) {
  const budgetMap = buildBudgetMap(store.customers);
  const ytd = {};

  for (let m = 0; m <= upToMonth; m++) {
    const acqRows = store.acquisito[m] || [];
    const fatRows = store.fatturato[m] || [];

    acqRows.forEach(r => {
      if (!ytd[r.clienteCap]) ytd[r.clienteCap] = { cap: r.clienteCap, label: r.cliente, acquisito: 0, fatturato: 0 };
      ytd[r.clienteCap].acquisito += r.valore;
    });
    fatRows.forEach(r => {
      if (!ytd[r.clienteCap]) ytd[r.clienteCap] = { cap: r.clienteCap, label: r.cliente, acquisito: 0, fatturato: 0 };
      ytd[r.clienteCap].fatturato += r.valore;
    });
  }

  return Object.values(ytd).map(r => {
    const budget = budgetMap[r.cap];
    let budgetVend = 0, budgetInt = 0;
    for (let m = 0; m <= upToMonth; m++) {
      budgetVend += budget?.budgetVenditoriMesi[m] || 0;
      budgetInt += budget?.budgetInternoMesi[m] || 0;
    }
    return {
      cliente: budget?.ragione || r.label,
      clienteCap: r.cap,
      agente: budget?.agente || '',
      isNew: budget?.isNew || false,
      acquisito: r.acquisito,
      fatturato: r.fatturato,
      budgetVend,
      budgetInt,
      scostAcqVsBudgetVend: r.acquisito - budgetVend,
      scostAcqVsBudgetInt: r.acquisito - budgetInt,
      scostFatVsBudgetVend: r.fatturato - budgetVend,
      scostFatVsBudgetInt: r.fatturato - budgetInt,
    };
  }).sort((a, b) => b.acquisito - a.acquisito);
}

export function groupByAgent(rows) {
  const map = {};
  rows.forEach(r => {
    const ag = r.agente || '(senza agente)';
    if (!map[ag]) map[ag] = { agente: ag, acquisito: 0, fatturato: 0, budgetVend: 0, budgetInt: 0, clienti: [] };
    map[ag].acquisito += r.acquisito;
    map[ag].fatturato += r.fatturato;
    map[ag].budgetVend += r.budgetVend;
    map[ag].budgetInt += r.budgetInt;
    map[ag].clienti.push(r);
  });
  return Object.values(map).map(a => ({
    ...a,
    scostAcqVsBudgetVend: a.acquisito - a.budgetVend,
    scostAcqVsBudgetInt: a.acquisito - a.budgetInt,
    scostFatVsBudgetVend: a.fatturato - a.budgetVend,
    scostFatVsBudgetInt: a.fatturato - a.budgetInt,
  })).sort((a, b) => b.acquisito - a.acquisito);
}

// Month-by-month trend
export function computeTrend(store, upToMonth) {
  const months = [];
  for (let m = 0; m <= upToMonth; m++) {
    const acq = (store.acquisito[m] || []).reduce((s, r) => s + r.valore, 0);
    const fat = (store.fatturato[m] || []).reduce((s, r) => s + r.valore, 0);
    let budgetVend = 0, budgetInt = 0;
    store.customers.forEach(c => {
      budgetVend += c.budgetVenditoriMesi[m] || 0;
      budgetInt += c.budgetInternoMesi[m] || 0;
    });
    months.push({ month: m, acquisito: acq, fatturato: fat, budgetVend, budgetInt });
  }
  return months;
}

// Ordini aperti grouped by client with budget info
export function enrichOrdiniAperti(ordiniRows, customers) {
  const budgetMap = buildBudgetMap(customers);
  // Group by client
  const map = {};
  ordiniRows.forEach(r => {
    if (!map[r.clienteCap]) {
      const budget = budgetMap[r.clienteCap];
      map[r.clienteCap] = {
        cliente: budget?.ragione || r.cliente,
        agente: budget?.agente || '',
        isNew: budget?.isNew || false,
        totaleAperti: 0,
        righe: [],
        hasRitardo: false,
        maxRitardo: 0,
      };
    }
    map[r.clienteCap].totaleAperti += r.valoreAperti;
    map[r.clienteCap].righe.push(r);
    const gg = parseInt(r.ggRitardo) || 0;
    if (gg > 0) {
      map[r.clienteCap].hasRitardo = true;
      map[r.clienteCap].maxRitardo = Math.max(map[r.clienteCap].maxRitardo, gg);
    }
  });
  return Object.values(map).sort((a, b) => b.totaleAperti - a.totaleAperti);
}
