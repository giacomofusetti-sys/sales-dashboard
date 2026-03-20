import * as XLSX from 'xlsx';
import { resolveAlias } from './aliases.js';

export const MONTHS = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];
export const MONTH_LABELS = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];

const MONTH_MAP = {
  gennaio:0, febbraio:1, marzo:2, aprile:3, maggio:4, giugno:5,
  luglio:6, agosto:7, settembre:8, ottobre:9, novembre:10, dicembre:11,
};

// Detect month index (0-based) from filename
export function detectMonthFromFilename(filename) {
  const lower = filename.toLowerCase();
  for (const [name, idx] of Object.entries(MONTH_MAP)) {
    if (lower.includes(name)) return idx;
  }
  return null;
}

export function normalizeClient(name) {
  return name?.toString().trim().toUpperCase() || '';
}

// Parse budget: returns array of customer objects
export function parseBudget(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  // Debug: dump first 6 rows to understand structure
  console.log(`[parseBudget] total raw rows: ${raw.length}`);
  for (let r = 0; r < Math.min(6, raw.length); r++) {
    const row = raw[r];
    console.log(`[parseBudget] row ${r} (${row?.length || 0} cols):`, row?.slice(0, 30));
  }

  // Row 3 (0-based) = headers, data starts row 4
  const customers = [];
  let skippedRows = 0;
  for (let i = 4; i < raw.length; i++) {
    const row = raw[i];
    if (!row || !row[0]) { skippedRows++; continue; }
    const ragione = row[0].toString().trim();
    if (!ragione) { skippedRows++; continue; }

    const budgetVenditoriMesi = [];
    const budgetInternoMesi = [];
    for (let m = 0; m < 12; m++) {
      budgetVenditoriMesi.push(parseFloat(row[4 + m]) || 0);
      budgetInternoMesi.push(parseFloat(row[17 + m]) || 0);
    }

    const budgetVendAnn = parseFloat(row[3]) || 0;

    // Debug: log first 5 customers and any with budget = 0
    if (customers.length < 5) {
      console.log(`[parseBudget] #${customers.length} "${ragione}" agente="${row[2]}" bdgVendAnn=${budgetVendAnn} gen=${budgetVenditoriMesi[0]} feb=${budgetVenditoriMesi[1]} | raw cols[1..5]:`, row.slice(1, 6));
    }
    if (budgetVendAnn === 0 && budgetVenditoriMesi.some(v => v > 0)) {
      console.warn(`[parseBudget] "${ragione}" has bdgVendAnn=0 but non-zero months — column mismatch?`);
    }

    customers.push({
      ragione,
      ragioneCap: normalizeClient(ragione),
      codice: row[1]?.toString().trim() || '',
      agente: row[2]?.toString().trim().toUpperCase() || '',
      budgetVenditoriMesi,
      budgetInternoMesi,
      budgetVenditoriAnnuale: budgetVendAnn,
      budgetInternoAnnuale: parseFloat(row[16]) || 0,
      isNew: false,
    });
  }

  const totalBdgVendAnn = customers.reduce((s, c) => s + c.budgetVenditoriAnnuale, 0);
  const totalGen = customers.reduce((s, c) => s + c.budgetVenditoriMesi[0], 0);
  const totalFeb = customers.reduce((s, c) => s + c.budgetVenditoriMesi[1], 0);
  console.log(`[parseBudget] parsed ${customers.length} customers, skipped ${skippedRows} rows`);
  console.log(`[parseBudget] bdg vend annuale: ${totalBdgVendAnn.toFixed(2)}, gen: ${totalGen.toFixed(2)}, feb: ${totalFeb.toFixed(2)}, gen+feb: ${(totalGen + totalFeb).toFixed(2)}`);

  // Log skipped rows that have data (potential lost budget)
  for (let i = 4; i < raw.length; i++) {
    const row = raw[i];
    if ((!row || !row[0]) && row && row.some(cell => cell !== null && cell !== '')) {
      console.warn(`[parseBudget] SKIPPED row ${i} has data but empty col 0:`, row.slice(0, 8));
    }
  }

  return customers;
}

// Parse Acquisito or Fatturato monthly file
// Returns: { month, rows: [{cliente, clienteCap, valore, valorePrv}] }
export function parseSalesFile(arrayBuffer, filename) {
  const month = detectMonthFromFilename(filename);
  const wb = XLSX.read(arrayBuffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 0, defval: null });

  const DEBUG_NAMES = ['GIBERTI', 'LEITECH', 'TERMOMECCANICA', 'TURBINEN'];
  const rows = raw
    .filter(r => r['Cliente'] && r['Cliente'] !== 'Totali')
    .map(r => {
      const raw_name = r['Cliente'].toString().trim();
      const resolved = resolveAlias(raw_name);
      const cap = normalizeClient(resolved);
      if (DEBUG_NAMES.some(d => raw_name.toUpperCase().includes(d))) {
        console.log(`[parseSalesFile] raw="${raw_name}" → resolved="${resolved}" → cap="${cap}"`);
      }
      return {
        cliente: resolved,
        clienteCap: cap,
        valore: parseFloat(r['Vendite ACT [€]']) || 0,
        valorePrv: parseFloat(r['Vendite PRV [€]']) || 0,
        qtaAct: parseFloat(r['Vendite ACT [Qtà]']) || 0,
      };
    });

  return { month, rows };
}

// Parse Ordini Aperti file
// Returns: { date, rows: [{cliente, articolo, rifDoc, dataConsegna, ggRitardo, qtaAperti, valoreAperti}] }
export function parseOrdiniAperti(arrayBuffer, filename) {
  // Try to detect date from filename (e.g. "19_marzo_2026")
  const lower = filename.toLowerCase();
  let fileDate = null;
  const monthMatch = lower.match(/(\d+)[_\s-](\w+)[_\s-](\d{4})/);
  if (monthMatch) {
    const m = MONTH_MAP[monthMatch[2]];
    if (m !== undefined) fileDate = `${monthMatch[1]} ${MONTH_LABELS[m]} ${monthMatch[3]}`;
  }

  const wb = XLSX.read(arrayBuffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 0, defval: null });

  const rows = raw
    .filter(r => r['Cliente'])
    .map(r => ({
      cliente: r['Cliente'].toString().trim(),
      clienteCap: normalizeClient(r['Cliente']),
      articolo: r['Articolo']?.toString().trim() || '',
      rifDoc: r['Rif. Documento']?.toString().trim() || '',
      dataConsegna: r['Data Consegna Prevista']?.toString().trim() || '',
      ggRitardo: r['GG Ritardo Ordini Aperti']?.toString().trim() || '-',
      qtaAperti: parseFloat(r['Ordini Aperti [Qtà]']) || 0,
      valoreAperti: parseFloat(r['Ordini Aperti [€]']) || 0,
    }));

  return { fileDate, rows };
}
