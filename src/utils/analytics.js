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

  // Union of all clients appearing in sales OR budget
  const allClientCaps = new Set([
    ...acqRows.map(r => r.clienteCap),
    ...fatRows.map(r => r.clienteCap),
    ...store.customers.map(c => c.ragioneCap),
  ]);

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
  // Seed ytd with all budget customers so those with zero sales are included
  const ytd = {};
  store.customers.forEach(c => {
    ytd[c.ragioneCap] = { cap: c.ragioneCap, label: c.ragione, acquisito: 0, fatturato: 0 };
  });

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

  // Debug: verify budget totals
  let debugBdgVendTotal = 0;
  store.customers.forEach(c => {
    for (let m = 0; m <= upToMonth; m++) debugBdgVendTotal += c.budgetVenditoriMesi[m] || 0;
  });
  const customersWithBdg = store.customers.filter(c => c.budgetVenditoriMesi.some(v => v > 0));
  const zeroedSeeded = store.customers.filter(c => c.isNew && c.budgetVenditoriMesi.every(v => v === 0));
  console.log(`[computeYTDRows] ${store.customers.length} customers, ${customersWithBdg.length} with budget, ${zeroedSeeded.length} seeded (zero budget), YTD bdg vend (m0..${upToMonth}): ${debugBdgVendTotal.toFixed(2)}`);

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

// XLSX export utilities
import XLSX from 'xlsx-js-style';

const EURO_FMT = '_-* #,##0_-;-* #,##0_-;_-* "-"??_-;_-@_-';
const PCT_FMT = '0.0%';
const YELLOW_PCT = 'FFFF00';
const YELLOW_NEW = 'FFE699';

function xlNum(v) { return Math.round((v || 0) * 100) / 100; }

function fill(rgb) { return { patternType: 'solid', fgColor: { rgb }, bgColor: { rgb } }; }

function downloadXlsx(ws, filename) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Dati');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellStyles: true });
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportXLSX(rows, filename) {
  const sorted = [...rows].sort((a, b) => (b.budgetVend || 0) - (a.budgetVend || 0));
  const headers = ['Cliente', 'Agente', 'Acquisito', 'Fatturato', 'Bdg Vend.', 'Δ Acq/BV', '% Acq/BV', 'Δ Fat/BV', '% Fat/BV', 'Note'];
  const n = sorted.length;
  const firstDataRow = 4;
  const lastDataRow = firstDataRow + n - 1;
  const ws = {};

  // Row 2: TOTALI with formulas
  const totalBase = { font: { bold: true } };
  ws['A2'] = { t: 's', v: 'TOTALI', s: totalBase };
  if (n > 0) {
    ws['C2'] = { t: 'n', f: `SUM(C${firstDataRow}:C${lastDataRow})`, s: { ...totalBase, numFmt: EURO_FMT } };
    ws['D2'] = { t: 'n', f: `SUM(D${firstDataRow}:D${lastDataRow})`, s: { ...totalBase, numFmt: EURO_FMT } };
    ws['E2'] = { t: 'n', f: `SUM(E${firstDataRow}:E${lastDataRow})`, s: { ...totalBase, numFmt: EURO_FMT } };
    ws['F2'] = { t: 'n', f: 'C2-E2', s: { ...totalBase, numFmt: EURO_FMT } };
    ws['G2'] = { t: 'n', f: 'C2/E2-1', s: { ...totalBase, numFmt: PCT_FMT, fill: fill(YELLOW_PCT) } };
    ws['H2'] = { t: 'n', f: 'D2-E2', s: { ...totalBase, numFmt: EURO_FMT } };
    ws['I2'] = { t: 'n', f: 'D2/E2-1', s: { ...totalBase, numFmt: PCT_FMT, fill: fill(YELLOW_PCT) } };
  }

  // Row 3: headers
  const headerStyle = { font: { bold: true }, alignment: { horizontal: 'center' } };
  headers.forEach((h, i) => {
    ws[XLSX.utils.encode_cell({ r: 2, c: i })] = { t: 's', v: h, s: headerStyle };
  });

  // Data rows
  sorted.forEach((r, idx) => {
    const rn = firstDataRow + idx;
    const rowFill = r.isNew ? { fill: fill(YELLOW_NEW) } : {};
    const numStyle = { numFmt: EURO_FMT, ...rowFill };
    const pctStyle = { numFmt: PCT_FMT, fill: fill(YELLOW_PCT) };

    ws[`A${rn}`] = { t: 's', v: r.cliente || '', s: { ...rowFill } };
    ws[`B${rn}`] = { t: 's', v: r.agente || '', s: { ...rowFill } };
    ws[`C${rn}`] = { t: 'n', v: xlNum(r.acquisito), s: numStyle };
    ws[`D${rn}`] = { t: 'n', v: xlNum(r.fatturato), s: numStyle };
    ws[`E${rn}`] = { t: 'n', v: xlNum(r.budgetVend), s: numStyle };
    ws[`F${rn}`] = { t: 'n', f: `C${rn}-E${rn}`, s: numStyle };
    ws[`G${rn}`] = { t: 'n', f: `IFERROR(C${rn}/E${rn}-1,"")`, s: pctStyle };
    ws[`H${rn}`] = { t: 'n', f: `D${rn}-E${rn}`, s: numStyle };
    ws[`I${rn}`] = { t: 'n', f: `IFERROR(D${rn}/E${rn}-1,"")`, s: pctStyle };
    ws[`J${rn}`] = { t: 's', v: '', s: { ...rowFill } };
  });

  ws['!ref'] = `A1:J${Math.max(lastDataRow, 3)}`;
  ws['!cols'] = [
    { wch: 57 }, { wch: 13 }, { wch: 11 }, { wch: 11 }, { wch: 13 },
    { wch: 12 }, { wch: 12 }, { wch: 11 }, { wch: 11 }, { wch: 27 },
  ];

  downloadXlsx(ws, filename);
}

export function exportAgentsSummaryXLSX(agentRows, filename) {
  const sorted = [...agentRows].sort((a, b) => (b.budgetVend || 0) - (a.budgetVend || 0));
  const headers = ['Agente', 'Acquisito', 'Fatturato', 'Bdg Vend.', 'Δ Acq/BV', '% Acq/BV', 'Δ Fat/BV', '% Fat/BV', 'N. Clienti'];
  const n = sorted.length;
  const firstDataRow = 4;
  const lastDataRow = firstDataRow + n - 1;
  const ws = {};

  const totalBase = { font: { bold: true } };
  ws['A2'] = { t: 's', v: 'TOTALI', s: totalBase };
  if (n > 0) {
    ws['B2'] = { t: 'n', f: `SUM(B${firstDataRow}:B${lastDataRow})`, s: { ...totalBase, numFmt: EURO_FMT } };
    ws['C2'] = { t: 'n', f: `SUM(C${firstDataRow}:C${lastDataRow})`, s: { ...totalBase, numFmt: EURO_FMT } };
    ws['D2'] = { t: 'n', f: `SUM(D${firstDataRow}:D${lastDataRow})`, s: { ...totalBase, numFmt: EURO_FMT } };
    ws['E2'] = { t: 'n', f: 'B2-D2', s: { ...totalBase, numFmt: EURO_FMT } };
    ws['F2'] = { t: 'n', f: 'B2/D2-1', s: { ...totalBase, numFmt: PCT_FMT, fill: fill(YELLOW_PCT) } };
    ws['G2'] = { t: 'n', f: 'C2-D2', s: { ...totalBase, numFmt: EURO_FMT } };
    ws['H2'] = { t: 'n', f: 'C2/D2-1', s: { ...totalBase, numFmt: PCT_FMT, fill: fill(YELLOW_PCT) } };
    ws['I2'] = { t: 'n', f: `SUM(I${firstDataRow}:I${lastDataRow})`, s: { ...totalBase } };
  }

  const headerStyle = { font: { bold: true }, alignment: { horizontal: 'center' } };
  headers.forEach((h, i) => {
    ws[XLSX.utils.encode_cell({ r: 2, c: i })] = { t: 's', v: h, s: headerStyle };
  });

  sorted.forEach((a, idx) => {
    const rn = firstDataRow + idx;
    const numStyle = { numFmt: EURO_FMT };
    const pctStyle = { numFmt: PCT_FMT, fill: fill(YELLOW_PCT) };

    ws[`A${rn}`] = { t: 's', v: a.agente || '' };
    ws[`B${rn}`] = { t: 'n', v: xlNum(a.acquisito), s: numStyle };
    ws[`C${rn}`] = { t: 'n', v: xlNum(a.fatturato), s: numStyle };
    ws[`D${rn}`] = { t: 'n', v: xlNum(a.budgetVend), s: numStyle };
    ws[`E${rn}`] = { t: 'n', f: `B${rn}-D${rn}`, s: numStyle };
    ws[`F${rn}`] = { t: 'n', f: `IFERROR(B${rn}/D${rn}-1,"")`, s: pctStyle };
    ws[`G${rn}`] = { t: 'n', f: `C${rn}-D${rn}`, s: numStyle };
    ws[`H${rn}`] = { t: 'n', f: `IFERROR(C${rn}/D${rn}-1,"")`, s: pctStyle };
    ws[`I${rn}`] = { t: 'n', v: a.clienti?.length || 0 };
  });

  ws['!ref'] = `A1:I${Math.max(lastDataRow, 3)}`;
  ws['!cols'] = [
    { wch: 25 }, { wch: 13 }, { wch: 13 }, { wch: 13 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
  ];

  downloadXlsx(ws, filename);
}
