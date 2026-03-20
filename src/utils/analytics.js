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

// Compute ordini aperti per client with delivery date within 2026
function computeOrdiniByClient(store) {
  if (!store.ordiniAperti?.rows) return {};
  const map = {};
  store.ordiniAperti.rows.forEach(r => {
    if (isDateWithinYear(r.dataConsegna, 2026)) {
      map[r.clienteCap] = (map[r.clienteCap] || 0) + r.valoreAperti;
    }
  });
  return map;
}

function isDateWithinYear(dateStr, year) {
  if (!dateStr) return true;
  // Try dd/mm/yyyy
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const y = parseInt(parts[2]);
    return !isNaN(y) && y <= year;
  }
  const d = new Date(dateStr);
  if (!isNaN(d)) return d.getFullYear() <= year;
  return true;
}

function pct(value, budget) {
  return budget ? (value / budget) - 1 : null;
}

// Merge acquisito + fatturato for a single month into per-client rows
export function computeMonthRows(store, month) {
  const budgetMap = buildBudgetMap(store.customers);
  const ordiniMap = computeOrdiniByClient(store);
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
    const budgetVendAnnuale = budget?.budgetVenditoriAnnuale || 0;
    const ordiniAnno = ordiniMap[cap] || 0;
    const previsioneAnno = fatturato + ordiniAnno;

    rows.push({
      cliente: budget?.ragione || acq?.cliente || fat?.cliente || cap,
      clienteCap: cap,
      agente: budget?.agente || '',
      isNew: budget?.isNew || false,
      acquisito,
      fatturato,
      budgetVend,
      budgetInt,
      budgetVendAnnuale,
      scostAcqVsBudgetVend: acquisito - budgetVend,
      pctAcqVsBudgetVend: pct(acquisito, budgetVend),
      scostFatVsBudgetVend: fatturato - budgetVend,
      pctFatVsBudgetVend: pct(fatturato, budgetVend),
      scostAcqVsBudgetInt: acquisito - budgetInt,
      pctAcqVsBudgetInt: pct(acquisito, budgetInt),
      scostFatVsBudgetInt: fatturato - budgetInt,
      pctFatVsBudgetInt: pct(fatturato, budgetInt),
      ordiniAnno,
      previsioneAnno,
      pctPrevVsBudgetVendAnn: pct(previsioneAnno, budgetVendAnnuale),
    });
  });

  return rows.sort((a, b) => b.acquisito - a.acquisito);
}

// YTD: aggregate from month 0 to upToMonth (inclusive)
export function computeYTDRows(store, upToMonth) {
  const budgetMap = buildBudgetMap(store.customers);
  const ordiniMap = computeOrdiniByClient(store);
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
    const budgetVendAnnuale = budget?.budgetVenditoriAnnuale || 0;
    const ordiniAnno = ordiniMap[r.cap] || 0;
    const previsioneAnno = r.fatturato + ordiniAnno;

    return {
      cliente: budget?.ragione || r.label,
      clienteCap: r.cap,
      agente: budget?.agente || '',
      isNew: budget?.isNew || false,
      acquisito: r.acquisito,
      fatturato: r.fatturato,
      budgetVend,
      budgetInt,
      budgetVendAnnuale,
      scostAcqVsBudgetVend: r.acquisito - budgetVend,
      pctAcqVsBudgetVend: pct(r.acquisito, budgetVend),
      scostFatVsBudgetVend: r.fatturato - budgetVend,
      pctFatVsBudgetVend: pct(r.fatturato, budgetVend),
      scostAcqVsBudgetInt: r.acquisito - budgetInt,
      pctAcqVsBudgetInt: pct(r.acquisito, budgetInt),
      scostFatVsBudgetInt: r.fatturato - budgetInt,
      pctFatVsBudgetInt: pct(r.fatturato, budgetInt),
      ordiniAnno,
      previsioneAnno,
      pctPrevVsBudgetVendAnn: pct(previsioneAnno, budgetVendAnnuale),
    };
  }).sort((a, b) => b.acquisito - a.acquisito);
}

export function groupByAgent(rows) {
  const map = {};
  rows.forEach(r => {
    const ag = r.agente || '(senza agente)';
    if (!map[ag]) map[ag] = { agente: ag, acquisito: 0, fatturato: 0, budgetVend: 0, budgetInt: 0, budgetVendAnnuale: 0, ordiniAnno: 0, previsioneAnno: 0, clienti: [] };
    map[ag].acquisito += r.acquisito;
    map[ag].fatturato += r.fatturato;
    map[ag].budgetVend += r.budgetVend;
    map[ag].budgetInt += r.budgetInt;
    map[ag].budgetVendAnnuale += r.budgetVendAnnuale || 0;
    map[ag].ordiniAnno += r.ordiniAnno || 0;
    map[ag].previsioneAnno += r.previsioneAnno || 0;
    map[ag].clienti.push(r);
  });
  return Object.values(map).map(a => ({
    ...a,
    scostAcqVsBudgetVend: a.acquisito - a.budgetVend,
    pctAcqVsBudgetVend: pct(a.acquisito, a.budgetVend),
    scostAcqVsBudgetInt: a.acquisito - a.budgetInt,
    pctAcqVsBudgetInt: pct(a.acquisito, a.budgetInt),
    scostFatVsBudgetVend: a.fatturato - a.budgetVend,
    pctFatVsBudgetVend: pct(a.fatturato, a.budgetVend),
    scostFatVsBudgetInt: a.fatturato - a.budgetInt,
    pctFatVsBudgetInt: pct(a.fatturato, a.budgetInt),
    pctPrevVsBudgetVendAnn: pct(a.previsioneAnno, a.budgetVendAnnuale),
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

// CSV export utility
export function exportCSV(rows, filename) {
  const headers = ['Cliente', 'Agente', 'Acquisito', 'Fatturato', 'Bdg Vend.', 'Bdg Int.', 'Δ Acq/BV', '% Acq/BV', 'Δ Fat/BV', '% Fat/BV', 'Δ Acq/BI', '% Acq/BI', 'Prev. Anno', '% Prev/BV Ann.'];
  const csvRows = [headers.join(';')];
  rows.forEach(r => {
    csvRows.push([
      `"${(r.cliente || '').replace(/"/g, '""')}"`,
      `"${(r.agente || '').replace(/"/g, '""')}"`,
      r.acquisito || 0,
      r.fatturato || 0,
      r.budgetVend || 0,
      r.budgetInt || 0,
      r.scostAcqVsBudgetVend || 0,
      r.pctAcqVsBudgetVend != null ? (r.pctAcqVsBudgetVend * 100).toFixed(1) + '%' : '',
      r.scostFatVsBudgetVend || 0,
      r.pctFatVsBudgetVend != null ? (r.pctFatVsBudgetVend * 100).toFixed(1) + '%' : '',
      r.scostAcqVsBudgetInt || 0,
      r.pctAcqVsBudgetInt != null ? (r.pctAcqVsBudgetInt * 100).toFixed(1) + '%' : '',
      r.previsioneAnno || 0,
      r.pctPrevVsBudgetVendAnn != null ? (r.pctPrevVsBudgetVendAnn * 100).toFixed(1) + '%' : '',
    ].join(';'));
  });
  const bom = '\uFEFF';
  const blob = new Blob([bom + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportAgentsSummaryCSV(agentRows, filename) {
  const headers = ['Agente', 'Acquisito', 'Fatturato', 'Bdg Vend.', 'Bdg Int.', 'Δ Acq/BV', '% Acq/BV', 'Δ Fat/BV', '% Fat/BV', 'Δ Acq/BI', '% Acq/BI', 'Prev. Anno', '% Prev/BV Ann.', 'N. Clienti'];
  const csvRows = [headers.join(';')];
  agentRows.forEach(a => {
    csvRows.push([
      `"${(a.agente || '').replace(/"/g, '""')}"`,
      a.acquisito || 0,
      a.fatturato || 0,
      a.budgetVend || 0,
      a.budgetInt || 0,
      a.scostAcqVsBudgetVend || 0,
      a.pctAcqVsBudgetVend != null ? (a.pctAcqVsBudgetVend * 100).toFixed(1) + '%' : '',
      a.scostFatVsBudgetVend || 0,
      a.pctFatVsBudgetVend != null ? (a.pctFatVsBudgetVend * 100).toFixed(1) + '%' : '',
      a.scostAcqVsBudgetInt || 0,
      a.pctAcqVsBudgetInt != null ? (a.pctAcqVsBudgetInt * 100).toFixed(1) + '%' : '',
      a.previsioneAnno || 0,
      a.pctPrevVsBudgetVendAnn != null ? (a.pctPrevVsBudgetVendAnn * 100).toFixed(1) + '%' : '',
      a.clienti?.length || 0,
    ].join(';'));
  });
  const bom = '\uFEFF';
  const blob = new Blob([bom + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const el = document.createElement('a');
  el.href = url;
  el.download = filename;
  el.click();
  URL.revokeObjectURL(url);
}
