import * as XLSX from 'xlsx';

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

  // Row 3 (0-based) = headers, data starts row 4
  const customers = [];
  for (let i = 4; i < raw.length; i++) {
    const row = raw[i];
    if (!row || !row[0]) continue;
    const ragione = row[0].toString().trim();
    if (!ragione) continue;

    const budgetVenditoriMesi = [];
    const budgetInternoMesi = [];
    for (let m = 0; m < 12; m++) {
      budgetVenditoriMesi.push(parseFloat(row[4 + m]) || 0);
      budgetInternoMesi.push(parseFloat(row[17 + m]) || 0);
    }

    customers.push({
      ragione,
      ragioneCap: normalizeClient(ragione),
      codice: row[1]?.toString().trim() || '',
      agente: row[2]?.toString().trim().toUpperCase() || '',
      budgetVenditoriMesi,
      budgetInternoMesi,
      budgetVenditoriAnnuale: parseFloat(row[3]) || 0,
      budgetInternoAnnuale: parseFloat(row[16]) || 0,
      isNew: false,
    });
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

  const rows = raw
    .filter(r => r['Cliente'] && r['Cliente'] !== 'Totali')
    .map(r => ({
      cliente: r['Cliente'].toString().trim(),
      clienteCap: normalizeClient(r['Cliente']),
      valore: parseFloat(r['Vendite ACT [€]']) || 0,
      valorePrv: parseFloat(r['Vendite PRV [€]']) || 0,
      qtaAct: parseFloat(r['Vendite ACT [Qtà]']) || 0,
    }));

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
