import * as XLSX from 'xlsx';

// Parser for "Dati.xlsx" (Power Query export of Embyon SQL views).
// Output shape matches the import_supplier_snapshot RPC payload.

// ── Column mapping per sheet: { internalField: ['Excel header', ...aliases] } ──
// Headers are matched case-insensitively with collapsed whitespace, so
// "Località  DD" (double space) also matches "Località DD".
const SHEETS = {
  OV: {
    name: 'OV',
    defaultTipo: 'OV',
    columns: {
      tipo: ['Tipo'],
      esercizio: ['Esercizio'],
      numero: ['Numero'],
      pos: ['Posizione'],
      order_date: ['Data documento'],
      client_code: ['Codice Cliente'],
      client_name: ['Ragione Sociale'],
      client_ref: ['Rif. Doc. Cliente'],
      client_order_date: ['Data Riferimento'],
      porto: ['Porto'],
      dest: ['Destinazione Diversa'],
      dest_loc: ['Località  DD'],
      bloccato: ['Bloccato'],
      scadenza: ['Data Consegna'],
      cons_richiesta: ['Data Consegna Richiesta'],
      codice_prodotto: ['Codice Articolo'],
      descrizione: ['Descrizione Articolo'],
      giacenza: ['Giacenza'],
      impegnato: ['Altri Impegni'],
      in_ordine: ['Qta Residua OV'],
      peso: ['Peso Netto'],
      rif_pos_cliente: ['Posizione Cli'],
      articolo_cliente: ['Articolo Cliente'],
      f_doc: ['Documento OA/OP/OL'],
      f_code: ['Fornitore OA/OP/OL'],
      f_name: ['Ragione Sociale OA/OP/OL'],
      f_qty: ['Qta Residua OA/OP/OL'],
      f_delivery: ['Data Consegna OA/OP/OL'],
      rif_bpl: ['Riferimento BPL'],
      rif_ddl: ['Riferimento DDL'],
      rif_ddf: ['Riferimento DDF'],
    },
  },
  OAOP: {
    name: 'OA - OP',
    columns: {
      tipo: ['Tipo'],
      esercizio: ['Esercizio'],
      numero: ['Numero'],
      pos: ['Posizione'],
      order_date: ['Data Documento'],
      supplier_code: ['Codice Fornitore'],
      supplier_name: ['Ragione Sociale Fornitore'],
      supplier_phone: ['Telefono'],
      bloccato: ['Bloccato'],
      scadenza: ['DataConsegna'],
      codice_prodotto: ['Codice Articolo'],
      descrizione: ['Descrizione Articolo'],
      ordinato: ['Ordinato'],
      ricevuto: ['Ricevuto'],
      prenotato: ['Prenotato'],
      valore_residuo: ['Valore Ordine Residuo'],
      peso: ['PesoNettoResiduo'],
      link_ref: ['Riferimento Ordine Collegato'],
      link_qty: ['Residuo Ordine Collegato'],
      link_date: ['Data Consegna Collegato'],
    },
  },
  OL: {
    name: 'OL',
    defaultTipo: 'OL',
    columns: {
      tipo: ['Tipo'],
      esercizio: ['Esercizio'],
      numero: ['Numero'],
      pos: ['Posizione'],
      order_date: ['Data'],
      supplier_code: ['CodCliFor'],
      supplier_name: ['RagioneSociale'],
      supplier_phone: ['Telefono'],
      scadenza: ['DataConsegna'],
      codice_prodotto: ['Codart'],
      descrizione: ['DescrizioneArt'],
      trattamento: ['DescrizioneOperazione'],
      ordinato: ['Ordinato'],
      ricevuto: ['Ricevuto'],
      prenotato: ['Prenotato'],
      valore_residuo: ['Valore_Res'],
      peso: ['PesoNetto'],
      ddl_num: ['DDL_NumDoc'],
      ddl_date: ['DDL_DataDoc'],
      cassone: ['Cassone'],
      inv_desc: ['DescrizioneInviata'],
      inv_qty: ['QtaInviata'],
      succ_ref: ['RIFORDINESUCC'],
      succ_qty: ['QTASUCC'],
      succ_date: ['DATACONSEGNASUCC'],
    },
  },
};

// ── Normalizers ──────────────────────────────────────────────
const normHeader = h => String(h ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

function str(v) {
  if (v == null) return null;
  if (v instanceof Date) return isoDate(v);
  const s = String(v).trim();
  return s === '' ? null : s;
}

function num(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (!s) return null;
  // "1.234,56" → 1234.56 ; "1234.56" → 1234.56
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  return Number.isFinite(n) ? n : null;
}

const pad2 = n => String(n).padStart(2, '0');

// SheetJS with cellDates returns Dates at local midnight (sometimes a few seconds
// off). Never use toISOString() (in Italy it shifts to the previous day): shift
// by 12h to absorb the drift, then read local components.
function isoDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) {
    if (isNaN(v)) return null;
    const d = new Date(v.getTime() + 12 * 3600 * 1000);
    if (d.getFullYear() < 1901) return null; // Embyon "empty" dates
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  return parseDateText(String(v));
}

// "30-06-2026", "16/09/26", "2026-06-30" → "YYYY-MM-DD"
function parseDateText(s) {
  s = s.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (!m) return null;
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return `${year}-${pad2(m[2])}-${pad2(m[1])}`;
}

// "YYYY-MM-DD" → "dd/mm/yy" (format expected by fmtBolla in OrderList)
function shortDate(iso) {
  if (!iso) return null;
  const [y, mo, d] = iso.split('-');
  return `${d}/${mo}/${y.slice(2)}`;
}

// "C  7160" → "7160", "F  3124" → "3124"
function partyCode(v) {
  const s = str(v);
  return s ? s.replace(/^[A-Za-z]\s+/, '') : null;
}

function posStr(v) {
  const n = num(v);
  return n == null ? str(v) : String(Math.trunc(n));
}

// OV → 5 digits, all other types → 7 digits
function canonicalRef(type, year, number) {
  const n = String(Math.trunc(Number(number)));
  return `${type}/${year}/${n.padStart(type === 'OV' ? 5 : 7, '0')}`;
}

// "OP/2025/0001865 22-12-2025", "OV.2026.2773  RING-O VALVE SRL", "BPV.2026.5458 ..."
const ORDER_TEXT_RE = /^(OA|OP|OL|OV|BPV)[./](\d{4})[./](\d+)\s*(.*)$/;
function parseOrderText(v) {
  const s = str(v);
  if (!s) return null;
  const m = s.match(ORDER_TEXT_RE);
  if (!m) return null;
  const rest = m[4].trim();
  const date = /^\d{1,2}-\d{1,2}-\d{4}$/.test(rest) ? parseDateText(rest) : null;
  return {
    type: m[1],
    ref_order: canonicalRef(m[1], m[2], m[3]),
    date,
    name: date ? null : (rest || null),
  };
}

// "DDL.1482.30-06-2026   1005 1006 (500.00)", "BPL.9472.30-06-2026   1005 1006 ", "DDF.143.16/09/26   (105.00)"
const BOLLA_TEXT_RE = /^(DDL|BPL|DDF)\.(\d+)\.(\S+)\s*(.*?)\s*(?:\(([\d.,]+)\))?\s*$/;
function parseBollaText(v) {
  const s = str(v);
  if (!s) return null;
  const m = s.match(BOLLA_TEXT_RE);
  if (!m) return null;
  const date = parseDateText(m[3]);
  const qty = m[5] != null ? Number(m[5].replace(/,/g, '')) : null;
  return {
    ref_type: m[1],
    ref_code: m[2],
    ref_name: m[4] || null,
    ref_order: `${m[1]}.${m[2]}.${shortDate(date) ?? m[3]}`,
    ref_date: date,
    ref_qty: Number.isFinite(qty) ? qty : null,
    delivery_date: null,
  };
}

function makeRef(fields) {
  return {
    ref_type: null, ref_code: null, ref_name: null, ref_order: null,
    ref_date: null, ref_qty: null, delivery_date: null,
    ...fields,
  };
}

// ── Sheet reading ────────────────────────────────────────────
function readSheet(wb, spec) {
  const ws = wb.Sheets[spec.name];
  if (!ws) throw new Error(`Foglio "${spec.name}" non trovato nel file (fogli presenti: ${wb.SheetNames.join(', ')})`);

  const headerRow = XLSX.utils.sheet_to_json(ws, { header: 1, range: 0 })[0] || [];
  const byNorm = new Map(headerRow.filter(h => h != null).map(h => [normHeader(h), String(h)]));

  const colMap = {};
  const missing = [];
  for (const [field, names] of Object.entries(spec.columns)) {
    const found = names.map(n => byNorm.get(normHeader(n))).find(Boolean);
    if (found) colMap[field] = found;
    else if (!(field === 'tipo' && spec.defaultTipo)) missing.push(names[0]);
  }
  if (missing.length) {
    throw new Error(`Foglio "${spec.name}": colonne mancanti: ${missing.join(', ')}`);
  }

  const raw = XLSX.utils.sheet_to_json(ws, { defval: null });
  return raw.map(r => {
    const row = {};
    for (const [field, header] of Object.entries(colMap)) row[field] = r[header];
    if (!colMap.tipo) row.tipo = spec.defaultTipo;
    return row;
  });
}

// Group raw rows by order → position. Views repeat a position once per link,
// so position fields come from the first row and links are accumulated.
function groupRows(rows, warnings, sheetName) {
  const orders = new Map(); // "Tipo|Esercizio|Numero" → { rows, positions: Map(pos → rows[]) }
  for (const row of rows) {
    const tipo = str(row.tipo);
    const esercizio = str(row.esercizio);
    const numero = num(row.numero);
    const pos = posStr(row.pos);
    if (!tipo || !esercizio || numero == null || pos == null) {
      warnings.push(`${sheetName}: riga senza Tipo/Esercizio/Numero/Posizione ignorata`);
      continue;
    }
    const key = `${tipo}|${esercizio}|${numero}`;
    let o = orders.get(key);
    if (!o) {
      o = { tipo, esercizio, numero, first: row, positions: new Map() };
      orders.set(key, o);
    }
    if (!o.positions.has(pos)) o.positions.set(pos, []);
    o.positions.get(pos).push(row);
  }
  return [...orders.values()];
}

// Add a ref to a list, skipping exact duplicates
function pushRef(list, seen, ref) {
  const key = JSON.stringify(ref);
  if (seen.has(key)) return;
  seen.add(key);
  list.push(ref);
}

function emptyOrder(fields) {
  return {
    order_ref: null, order_date: null,
    client_code: null, client_name: null, client_ref: null, client_order_date: null,
    porto: null, destinazione: null,
    supplier_code: null, supplier_name: null, supplier_phone: null,
    bloccato: null, valore_residuo: null, peso_totale: null, tot_peso_res: null,
    materials: [],
    ...fields,
  };
}

function emptyMaterial(fields) {
  return {
    pos: null, scadenza: null, cons_richiesta: null, codice_prodotto: null, descrizione: null,
    giacenza: null, impegnato: null, in_ordine: null, peso: null,
    ordinato: null, ricevuto: null, prenotato: null, valore_residuo: null,
    qty_inviata: null, kg: null, trattamento: null, bolla: null, cassone: null,
    rif_pos_cliente: null, articolo_cliente: null, descrizione_inviata: null,
    refs: [],
    ...fields,
  };
}

const byPos = (a, b) => Number(a[0]) - Number(b[0]);

// Order totals from the deduplicated positions (never from raw rows)
function sumField(materials, field) {
  const vals = materials.map(m => m[field]).filter(v => v != null);
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) * 100) / 100 : null;
}

// ── OV ───────────────────────────────────────────────────────
function parseOV(rows, warnings) {
  return groupRows(rows, warnings, 'OV').map(o => {
    const h = o.first;
    const destinazione = [str(h.dest), str(h.dest_loc)].filter(Boolean).join(' – ') || null;
    const order = emptyOrder({
      order_ref: canonicalRef('OV', o.esercizio, o.numero),
      order_date: isoDate(h.order_date),
      client_code: partyCode(h.client_code),
      client_name: str(h.client_name),
      client_ref: str(h.client_ref),
      client_order_date: isoDate(h.client_order_date),
      porto: str(h.porto),
      destinazione,
      bloccato: str(h.bloccato),
    });

    for (const [pos, posRows] of [...o.positions].sort(byPos)) {
      const p = posRows[0];
      const refs = [];
      const seen = new Set();
      for (const r of posRows) {
        const f = parseOrderText(r.f_doc);
        if (f) {
          pushRef(refs, seen, makeRef({
            ref_type: 'F',
            ref_code: partyCode(r.f_code),
            ref_name: str(r.f_name),
            ref_order: f.ref_order,
            ref_date: f.date,
            ref_qty: num(r.f_qty),
            delivery_date: isoDate(r.f_delivery),
          }));
        } else if (str(r.f_doc)) {
          warnings.push(`${order.order_ref} pos ${pos}: Documento OA/OP/OL non riconosciuto "${str(r.f_doc)}"`);
        }
        for (const col of ['rif_bpl', 'rif_ddl', 'rif_ddf']) {
          const b = parseBollaText(r[col]);
          if (b) pushRef(refs, seen, b);
          else if (str(r[col])) warnings.push(`${order.order_ref} pos ${pos}: riferimento bolla non riconosciuto "${str(r[col])}"`);
        }
      }
      order.materials.push(emptyMaterial({
        pos,
        scadenza: isoDate(p.scadenza),
        cons_richiesta: isoDate(p.cons_richiesta),
        codice_prodotto: str(p.codice_prodotto),
        descrizione: str(p.descrizione),
        giacenza: num(p.giacenza),
        impegnato: num(p.impegnato),
        in_ordine: num(p.in_ordine),
        peso: num(p.peso),
        rif_pos_cliente: str(p.rif_pos_cliente),
        articolo_cliente: str(p.articolo_cliente),
        refs,
      }));
    }
    order.peso_totale = sumField(order.materials, 'peso');
    // valore_residuo stays null: the file has no values for OV
    return order;
  });
}

// ── OA / OP / ACCIAIERIA ─────────────────────────────────────
function parseOAOP(rows, warnings) {
  return groupRows(rows, warnings, 'OA - OP').map(o => {
    const h = o.first;
    const tipo = o.tipo.toUpperCase();
    const isAcciaieria = tipo === 'OA'
      && [...o.positions.values()].some(pr => (str(pr[0].codice_prodotto) || '').startsWith('M#'));
    const order = emptyOrder({
      order_type: isAcciaieria ? 'ACCIAIERIA' : tipo,
      order_ref: canonicalRef(tipo, o.esercizio, o.numero),
      order_date: isoDate(h.order_date),
      supplier_code: partyCode(h.supplier_code),
      supplier_name: str(h.supplier_name),
      supplier_phone: str(h.supplier_phone),
      bloccato: str(h.bloccato),
    });

    for (const [pos, posRows] of [...o.positions].sort(byPos)) {
      const p = posRows[0];
      const refs = [];
      const seen = new Set();
      for (const r of posRows) {
        const l = parseOrderText(r.link_ref);
        if (l) {
          pushRef(refs, seen, makeRef({
            ref_type: l.type,
            ref_order: l.ref_order,
            ref_name: l.name,
            ref_qty: num(r.link_qty),
            ref_date: isoDate(r.link_date),
          }));
        } else if (str(r.link_ref)) {
          warnings.push(`${order.order_ref} pos ${pos}: ordine collegato non riconosciuto "${str(r.link_ref)}"`);
        }
      }
      order.materials.push(emptyMaterial({
        pos,
        scadenza: isoDate(p.scadenza),
        codice_prodotto: str(p.codice_prodotto),
        descrizione: str(p.descrizione),
        ordinato: num(p.ordinato),
        ricevuto: num(p.ricevuto),
        prenotato: num(p.prenotato),
        valore_residuo: num(p.valore_residuo),
        peso: num(p.peso),
        refs,
      }));
    }
    order.valore_residuo = sumField(order.materials, 'valore_residuo');
    order.peso_totale = sumField(order.materials, 'peso'); // PesoNettoResiduo
    return order;
  });
}

// ── OL ───────────────────────────────────────────────────────
function parseOL(rows, warnings) {
  return groupRows(rows, warnings, 'OL').map(o => {
    const h = o.first;
    const order = emptyOrder({
      order_ref: canonicalRef('OL', o.esercizio, o.numero),
      order_date: isoDate(h.order_date),
      supplier_code: partyCode(h.supplier_code),
      supplier_name: str(h.supplier_name),
      supplier_phone: str(h.supplier_phone),
    });

    for (const [pos, posRows] of [...o.positions].sort(byPos)) {
      const p = posRows[0];
      const refs = [];
      const seen = new Set();

      // Bolle: distinct (DDL_NumDoc, DDL_DataDoc, Cassone)
      const ddls = [];
      for (const r of posRows) {
        const n = num(r.ddl_num);
        if (n == null) continue;
        const date = isoDate(r.ddl_date);
        const ref = makeRef({
          ref_type: 'DDL',
          ref_code: String(Math.trunc(n)),
          ref_order: `DDL.${Math.trunc(n)}.${shortDate(date) ?? ''}`,
          ref_date: date,
          ref_name: str(r.cassone),
        });
        const before = refs.length;
        pushRef(refs, seen, ref);
        if (refs.length > before) ddls.push(ref);
      }
      const latest = ddls.reduce((best, d) => (!best || (d.ref_date || '') > (best.ref_date || '') ? d : best), null);

      // Material sent: distinct (DescrizioneInviata, QtaInviata)
      const sent = new Map();
      for (const r of posRows) {
        const desc = str(r.inv_desc);
        const qty = num(r.inv_qty);
        if (desc == null && qty == null) continue;
        sent.set(`${desc}|${qty}`, { desc, qty });
      }
      const sentList = [...sent.values()];
      const qtyInviata = sentList.some(s => s.qty != null)
        ? sentList.reduce((sum, s) => sum + (s.qty || 0), 0)
        : null;
      const descInviata = [...new Set(sentList.map(s => s.desc).filter(Boolean))].join(' | ') || null;

      // Next order in the chain
      for (const r of posRows) {
        const s = parseOrderText(r.succ_ref);
        if (s) {
          pushRef(refs, seen, makeRef({
            ref_type: s.type,
            ref_order: s.ref_order,
            ref_name: s.name,
            ref_qty: num(r.succ_qty),
            ref_date: isoDate(r.succ_date),
          }));
        } else if (str(r.succ_ref)) {
          warnings.push(`${order.order_ref} pos ${pos}: ordine successivo non riconosciuto "${str(r.succ_ref)}"`);
        }
      }

      const pesoUnit = num(p.peso);
      const ordinato = num(p.ordinato);
      order.materials.push(emptyMaterial({
        pos,
        scadenza: isoDate(p.scadenza),
        codice_prodotto: str(p.codice_prodotto),
        descrizione: str(p.descrizione),
        trattamento: str(p.trattamento),
        ordinato,
        ricevuto: num(p.ricevuto),
        prenotato: num(p.prenotato),
        valore_residuo: num(p.valore_residuo),
        peso: pesoUnit,
        // da verificare con Ester
        kg: pesoUnit != null && ordinato != null ? Math.round(pesoUnit * ordinato * 100) / 100 : null,
        bolla: latest?.ref_order ?? null,
        cassone: latest?.ref_name?.trim() || null,
        qty_inviata: qtyInviata,
        descrizione_inviata: descInviata,
        refs,
      }));
    }
    order.valore_residuo = sumField(order.materials, 'valore_residuo');
    order.peso_totale = sumField(order.materials, 'kg'); // PesoNetto is per unit
    return order;
  });
}

// ── Entry point ──────────────────────────────────────────────
export function parseSupplierWorkbook(arrayBuffer) {
  const data = arrayBuffer instanceof ArrayBuffer ? new Uint8Array(arrayBuffer) : arrayBuffer;
  const wb = XLSX.read(data, { type: 'array', cellDates: true });

  // Validate all sheets up-front so a missing column blocks the whole import
  const ovRows = readSheet(wb, SHEETS.OV);
  const oaopRows = readSheet(wb, SHEETS.OAOP);
  const olRows = readSheet(wb, SHEETS.OL);

  const warnings = [];
  const result = { OV: [], OA: [], ACCIAIERIA: [], OP: [], OL: [], warnings };

  result.OV = parseOV(ovRows, warnings);
  for (const o of parseOAOP(oaopRows, warnings)) {
    const { order_type, ...order } = o;
    if (!result[order_type]) {
      warnings.push(`${order.order_ref}: tipo "${order_type}" non gestito, ignorato`);
      continue;
    }
    result[order_type].push(order);
  }
  result.OL = parseOL(olRows, warnings);

  return result;
}
