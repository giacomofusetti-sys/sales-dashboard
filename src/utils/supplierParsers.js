// ── Helpers ───────────────────────────────────────────────────

/** Parse Italian number: "1.234,56" → 1234.56 */
export function parseItalianNumber(s) {
  if (!s) return null;
  const cleaned = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

/** Parse DD/MM/YY → YYYY-MM-DD */
export function parseDateDDMMYY(s) {
  if (!s) return null;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  if (!m) return null;
  const year = parseInt(m[3]) + 2000;
  return `${year}-${m[2]}-${m[1]}`;
}

/** Parse DD/MM/YYYY → YYYY-MM-DD */
export function parseDateDDMMYYYY(s) {
  if (!s) return null;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

// Product code pattern: prefix + # + suffix
const PRODUCT_CODE_RE = /^[A-Z0-9]{1,5}#[A-Z0-9]+$/;

/** Build a normalized ref_order from type + year + number.
 *  OV uses 5-digit padding, OA/OP/OL use 7-digit padding. */
function buildRefOrder(type, year, num) {
  const padLen = type === 'OV' ? 5 : 7;
  return `${type}/${year}/${num.padStart(padLen, '0')}`;
}

/** Test if a token is a pure Italian number */
const PURE_NUM_RE = /^[\d.,]+$/;
const DATE_SHORT_RE = /^\d{2}\/\d{2}\/\d{2}$/;

/** Filter out page headers/footers that pdfjs extracts as text lines */
const PAGE_NOISE_RE = /^(?:Utente|ESTER\s+Pagina|\d{2}:\d{2}$|\d{4}$|Lista ordini|COMVITEA\s+SRL|Rif\.\s+(?:OV|OA|OL|OP|Pos)|Scad\.\s+Materiale|Cons\.Rich|Fornitore\s+Rif|Materiale\s+(?:Inviato|da\s+Ricevere)|Scadenza\s+Materiale\s+Ordinato|Totale\s+valore|Cliente\s+Telefono|Kg\s+Trattamento)/;
function isPageNoise(line) {
  return PAGE_NOISE_RE.test(line.trim());
}

/** Find the best block of N consecutive pure-number tokens.
 *  Prefers rightmost run of >= targetLen. Falls back to shorter runs
 *  only if they have at least minLen tokens (max(2, targetLen/2)). */
function findNumBlock(tokens, targetLen) {
  const isNum = tokens.map(t => PURE_NUM_RE.test(t));
  const runs = [];
  let runStart = -1;
  for (let i = 0; i <= tokens.length; i++) {
    if (i < tokens.length && isNum[i]) {
      if (runStart === -1) runStart = i;
    } else {
      if (runStart !== -1) {
        runs.push({ start: runStart, end: i, len: i - runStart });
        runStart = -1;
      }
    }
  }
  if (!runs.length) return null;

  const minLen = Math.max(2, Math.ceil(targetLen / 2));
  let best = null;
  for (const run of runs) {
    if (run.len >= targetLen) {
      const s = run.end - targetLen;
      if (!best || best.priority < 2 || s > best.startIdx) {
        best = { startIdx: s, endIdx: run.end, priority: 2 };
      }
    } else if (run.len >= minLen) {
      if (!best || best.priority < 1 || (best.priority === 1 && run.start > best.startIdx)) {
        best = { startIdx: run.start, endIdx: run.end, priority: 1 };
      }
    }
  }
  if (!best) return null;
  return {
    startIdx: best.startIdx,
    endIdx: best.endIdx,
    nums: tokens.slice(best.startIdx, best.endIdx).map(t => parseItalianNumber(t)),
  };
}

// ── OV Parser ─────────────────────────────────────────────────

const OV_HEADER_RE = /^(OV\/\d{4}\/\d{5})\s*-\s*(.*)/;
const OV_CLIENT_RE = /C\s+(\d+)\s+(.+?)(?:\s{2,}|\s+\d{2}\/\d{2}\/\d{2})/;
const OV_CLIENT_REF_RE = /(?:Vs\.?\s*Rif\.?|Rif\.?\s*Cliente|N\.?\s*Ord\.?\s*Cl\.?|Rif\.?)\s*:?\s*(\S+.*?)$/i;
const OV_DATE_RE = /(\d{2}\/\d{2}\/\d{2})/;
const OV_MATERIAL_RE = /^(?:(\d+)\s+)?(\d{2}\/\d{2}\/\d{2})\s+([A-Z0-9]{1,5}#[A-Z0-9]+)\s+(.*)/;
const OV_SUPPLIER_RE = /^F\s+(\d+)\s+(.*?)\s+(OA|OP|OL)\/(\d{4}\/\d{7})\s+(\d{2}\/\d{2}\/\d{2})\s+([\d.,]+)\s+(\d{2}\/\d{2}\/\d{2})/;
const OV_FOOTER_RE = /^Valore Residuo Ordine\s+([\d.,]+)/;
const OV_PESO_RE = /Peso Totale Ordine\s+([\d.,]+)/;

// In pdfjs output, the OV rest string contains 3 numbers: impegnato, in_ordine, peso.
// Giacenza comes on a separate line (next Y position). Search for block of 3.
function parseOvMaterialFields(rest) {
  const result = { descrizione: '', consRichiesta: null, impegnato: null, inOrdine: null, peso: null };
  const tokens = rest.split(/\s+/).filter(Boolean);
  if (!tokens.length) return result;

  const block = findNumBlock(tokens, 3);
  if (!block) {
    result.descrizione = tokens.join(' ');
    return result;
  }

  // Check for date adjacent to block (cons_richiesta)
  if (block.startIdx > 0 && DATE_SHORT_RE.test(tokens[block.startIdx - 1])) {
    result.consRichiesta = parseDateDDMMYY(tokens[block.startIdx - 1]);
    result.descrizione = [
      ...tokens.slice(0, block.startIdx - 1),
      ...tokens.slice(block.endIdx),
    ].join(' ');
  } else if (block.endIdx < tokens.length && DATE_SHORT_RE.test(tokens[block.endIdx])) {
    result.consRichiesta = parseDateDDMMYY(tokens[block.endIdx]);
    result.descrizione = [
      ...tokens.slice(0, block.startIdx),
      ...tokens.slice(block.endIdx + 1),
    ].join(' ');
  } else {
    result.descrizione = [
      ...tokens.slice(0, block.startIdx),
      ...tokens.slice(block.endIdx),
    ].join(' ');
  }

  // Assign: impegnato, in_ordine, peso (left to right)
  const n = block.nums;
  if (n.length >= 3) {
    result.impegnato = n[0];
    result.inOrdine = n[1];
    result.peso = n[2];
  } else if (n.length === 2) {
    result.impegnato = n[0];
    result.inOrdine = n[1];
  }

  return result;
}

export function parseOV(lines) {
  const orders = [];
  let current = null;
  let currentMat = null;
  let pendingConsRichiesta = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Skip page noise
    if (isPageNoise(trimmed)) continue;

    // Order header
    const hm = trimmed.match(OV_HEADER_RE);
    if (hm) {
      if (current) orders.push(current);
      current = {
        orderRef: hm[1],
        rawHeader: trimmed,
        materials: [],
      };
      currentMat = null;
      pendingConsRichiesta = null;

      const rest = hm[2];
      const dm = rest.match(OV_DATE_RE);
      if (dm) current.orderDate = parseDateDDMMYY(dm[1]);

      const cm = line.match(OV_CLIENT_RE);
      if (cm) {
        current.clientCode = cm[1];
        current.clientName = cm[2].trim();
      }

      const crm = rest.match(OV_CLIENT_REF_RE);
      if (crm) current.clientRef = crm[1].trim();
      continue;
    }

    if (!current) continue;

    // Footer — valore residuo
    const fm = trimmed.match(OV_FOOTER_RE);
    if (fm) {
      current.valoreResiduo = parseItalianNumber(fm[1]);
      const pm = trimmed.match(OV_PESO_RE);
      if (pm) current.pesoTotale = parseItalianNumber(pm[1]);
      currentMat = null;
      pendingConsRichiesta = null;
      continue;
    }

    // Standalone date line before material → cons_richiesta
    if (DATE_SHORT_RE.test(trimmed)) {
      pendingConsRichiesta = parseDateDDMMYY(trimmed);
      continue;
    }

    // Material line
    const mm = trimmed.match(OV_MATERIAL_RE);
    if (mm) {
      const fields = parseOvMaterialFields(mm[4]);
      currentMat = {
        pos: mm[1] || null,
        scadenza: parseDateDDMMYY(mm[2]),
        codiceProdotto: mm[3],
        descrizione: fields.descrizione,
        consRichiesta: fields.consRichiesta || pendingConsRichiesta,
        giacenza: null, // giacenza comes on next line in pdfjs
        impegnato: fields.impegnato,
        inOrdine: fields.inOrdine,
        peso: fields.peso,
        refs: [],
      };
      pendingConsRichiesta = null;
      current.materials.push(currentMat);
      continue;
    }

    // Supplier ref line (within OV)
    const sm = trimmed.match(OV_SUPPLIER_RE);
    if (sm && currentMat) {
      currentMat.refs.push({
        refType: 'F',
        refCode: sm[1],
        refName: sm[2].trim(),
        refOrder: `${sm[3]}/${sm[4]}`,
        refDate: parseDateDDMMYY(sm[5]),
        refQty: parseItalianNumber(sm[6]),
        deliveryDate: parseDateDDMMYY(sm[7]),
      });
      continue;
    }

    // Single pure number after material → giacenza (separate Y line in pdfjs)
    if (currentMat && currentMat.giacenza == null && PURE_NUM_RE.test(trimmed)) {
      currentMat.giacenza = parseItalianNumber(trimmed);
      continue;
    }

    // Continuation line — append to description (skip DDL/F refs and parenthesized noise)
    if (currentMat && trimmed) {
      if (/^(?:DDL|BPL|DDT|F\s+\d)/.test(trimmed) || /^\(.*\)$/.test(trimmed)) continue;
      currentMat.descrizione = (currentMat.descrizione + ' ' + trimmed).trim();
    }
  }

  if (current) orders.push(current);

  // Deduplicate materials: by codiceProdotto + pos (use scadenza as tiebreaker when pos is null)
  for (const order of orders) {
    const seen = new Map();
    for (const mat of order.materials) {
      const key = `${mat.codiceProdotto}|${mat.pos || mat.scadenza || ''}`;
      if (seen.has(key)) {
        const existing = seen.get(key);
        const scoreOf = (m) => {
          const nonNull = Object.values(m).filter(v => v != null && v !== '').length;
          return (m.refs ? m.refs.length : 0) * 1000 + nonNull;
        };
        if (scoreOf(mat) > scoreOf(existing)) {
          seen.set(key, mat);
        }
      } else {
        seen.set(key, mat);
      }
    }
    order.materials = [...seen.values()];
  }

  return orders;
}

// ── OA/OP/Acciaieria Parser ──────────────────────────────────

const OAOP_HEADER_RE = /^\*?(OA|OP)\/(\d{4}\/\d{7})\s+(\d{2}\/\d{2}\/\d{2})\s*F\s+(\d+)\s+(.*)/;
const OAOP_MATERIAL_RE = /^(\d{2}\/\d{2}\/\d{2})\s+([A-Z0-9]{1,5}#[A-Z0-9]+)\s+(.*)/;
const OAOP_REF_RE = /^(OV|OL|BPV)[.\s](\d{4})[.\s](\d+)\s+(.+?)\s+(\d{2}\/\d{2}\/\d{2})\s+([\d.,]+)/;
const OAOP_FOOTER_RE = /^Tot\.\s*peso\s*res\.\s*([\d.,]+)/i;

export function parseOAOP(lines, forceType) {
  const orders = [];
  let current = null;
  let currentMat = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (isPageNoise(trimmed)) continue;

    // Order header
    const hm = trimmed.match(OAOP_HEADER_RE);
    if (hm) {
      if (current) orders.push(current);
      const type = forceType || hm[1];
      current = {
        orderRef: `${type}/${hm[2]}`,
        orderDate: parseDateDDMMYY(hm[3]),
        supplierCode: hm[4],
        supplierName: '',
        supplierPhone: '',
        rawHeader: trimmed,
        materials: [],
      };
      currentMat = null;

      const rest = hm[5].trim();
      const phoneMatch = rest.match(/\s+([\d\s/+()-]{6,})$/);
      if (phoneMatch) {
        current.supplierName = rest.slice(0, rest.length - phoneMatch[0].length).trim();
        current.supplierPhone = phoneMatch[1].trim();
      } else {
        current.supplierName = rest;
      }
      continue;
    }

    if (!current) continue;

    // Footer
    const fm = trimmed.match(OAOP_FOOTER_RE);
    if (fm) {
      current.totPesoRes = parseItalianNumber(fm[1]);
      continue;
    }

    // Material line
    const mm = trimmed.match(OAOP_MATERIAL_RE);
    if (mm) {
      currentMat = {
        scadenza: parseDateDDMMYY(mm[1]),
        codiceProdotto: mm[2],
        descrizione: '',
        refs: [],
      };

      // Find block of 4 consecutive pure numbers; rest is description
      const restTokens = mm[3].split(/\s+/).filter(Boolean);
      const oaBlock = findNumBlock(restTokens, 4);
      if (oaBlock && oaBlock.nums.length >= 4) {
        currentMat.descrizione = [
          ...restTokens.slice(0, oaBlock.startIdx),
          ...restTokens.slice(oaBlock.endIdx),
        ].join(' ');
        currentMat.ordinato = oaBlock.nums[0];
        currentMat.ricevuto = oaBlock.nums[1];
        currentMat.valoreResiduo = oaBlock.nums[2];
        currentMat.prenotato = oaBlock.nums[3];
      } else if (oaBlock) {
        currentMat.descrizione = [
          ...restTokens.slice(0, oaBlock.startIdx),
          ...restTokens.slice(oaBlock.endIdx),
        ].join(' ');
        const n = oaBlock.nums;
        if (n.length >= 1) currentMat.prenotato = n[n.length - 1];
        if (n.length >= 2) currentMat.valoreResiduo = n[n.length - 2];
        if (n.length >= 3) currentMat.ricevuto = n[n.length - 3];
        if (n.length >= 4) currentMat.ordinato = n[n.length - 4];
      } else {
        currentMat.descrizione = restTokens.join(' ');
      }

      current.materials.push(currentMat);
      continue;
    }

    // Reference/booking line
    const rm = trimmed.match(OAOP_REF_RE);
    if (rm && currentMat) {
      currentMat.refs.push({
        refType: rm[1],
        refOrder: buildRefOrder(rm[1], rm[2], rm[3]),
        refName: rm[4].trim(),
        refDate: parseDateDDMMYY(rm[5]),
        refQty: parseItalianNumber(rm[6]),
      });
    }
  }

  if (current) orders.push(current);

  // Deduplicate materials
  for (const order of orders) {
    const seen = new Map();
    for (const mat of order.materials) {
      const key = `${mat.codiceProdotto}|${mat.scadenza || ''}`;
      if (seen.has(key)) {
        const existing = seen.get(key);
        const scoreOf = (m) => {
          const nonNull = Object.values(m).filter(v => v != null && v !== '').length;
          return (m.refs ? m.refs.length : 0) * 1000 + nonNull;
        };
        if (scoreOf(mat) > scoreOf(existing)) {
          seen.set(key, mat);
        }
      } else {
        seen.set(key, mat);
      }
    }
    order.materials = [...seen.values()];
  }

  return orders;
}

// ── OL Parser ─────────────────────────────────────────────────

const OL_HEADER_SINGLE_RE = /^(OL\/\d{4}\/\d{7})\s+(\d{2}\/\d{2}\/\d{2})\s+F\s+(\d+)\s+(.*)/;
const OL_REF_ONLY_RE = /^(OL\/\d{4}\/\d{7})\s*$/;
const OL_SUPPLIER_RE = /^(\d{2}\/\d{2}\/\d{2})\s+F\s+(\d+)\s+(.*)/;
const OL_POS_RE = /^Pos\.\s+(\d+)\s+(\d{2}\/\d{2}\/\d{2})\s+(\S+)\s+(.*)/;
const OL_MATERIAL_RE = /^([A-Z0-9]{1,5}#[A-Z0-9]+)\s+(.*)/;
const OL_REF_RE = /^(OV|OL|BPV)[.\s](\d{4})[.\s](\d+)\s+(.+?)\s+(\d{2}\/\d{2}\/\d{2})\s+([\d.,]+)/;

// Known treatment patterns for OL parsing (right-to-left extraction)
const OL_TRATTAMENTO_PATTERNS = [
  /ZINCATURA\s+A\s+CALDO\s+ASTM\s+A153/i,
  /ZINC\.?\s*BIANCO\s+DEIDROGENATO\s+[\d-]+\s*[μu]/i,
  /ZINCATO\s+BIANCO\s+[\d-]+\s*[μu]/i,
  /FOSFATAZIONE\s+(?:AL\s+MN\s+OLIATA|Zn\s+OLIATA\s+NERA|Zn)/i,
  /GEOMET\s+\d+[A-Z]?(?:\+PLUS\s+[A-Z]+)?/i,
  /XYLAN\s+[\d\s]+(?:BLU|ROSSO|VERDE)?(?:\s+RAL\s+\d+)?/i,
  /Zinconichel\s+(?:DH\s+senza\s+sigillante|triv\.\s*trasp)/i,
  /ZnNi\s+DH\s+(?:\+XYLAN\s+\d+\s+\w+|senza\s+sigillante)/i,
  /ZINCAT\+XYLAN\s+BLU\s+\d+/i,
  /Zinc\.?\s*(?:a\s+)?caldo\s*\+?\s*(?:Xylan\s+\d+\s+\w+)?/i,
  /ZINCATURA\s+BIANCA\s+STATICA/i,
  /BRUNITO/i,
  /TAGLIO\s+E\s+SMUSSO/i,
  /TAGLIO\+SPIANATURA[^$]*/i,
  /TAGLIARE\s+E\s+FILETTARE/i,
  /LAVORAZIONE\s+MECCANICA/i,
  /SPIANATURA(?:\+MARCATURA)?\s+TESTA/i,
  /MINORAZIONE\s+FILETTO(?:\s+x\s+ZCALDO)?/i,
  /MINORATO\s+[\d.,]+/i,
  /MAGGIORAZIONE\s+FILETTO/i,
  /RIPASSATURA\s+FILETTO/i,
  /RESILIENZA/i,
  /Collaudo\s+AD-W7/i,
  /RICAVARE\s+PARTIC\.\s+A\s+DISEGNO/i,
  /PIEGATURA/i,
  /TEMPRA\s+A\s+INDUZIONE/i,
  /DECAPAGGIO/i,
  /3\.2\s+c\/INAIL/i,
  /Xylan\s+01-411\+Xylan\s+1424\s+Blu/i,
];

/** Parse the rest of an OL Pos. line from right to left.
 *  Format: DESC QTY KG TRATTAMENTO [BOLLA_NUM BOLLA_DATE] [CASSONE_NUM SCAD2] [STATUS]
 *
 *  Extraction order:
 *  1. Status (Trasferimento...) from end
 *  2. Tail (date, number) pairs from end — up to 2
 *     - 2 pairs: first=bolla, second=cassone
 *     - 1 pair with status: cassone; without status: bolla
 *     - number without date: cassone
 *  3. Trattamento (known patterns)
 *  4. KG, QTY (rightmost consecutive pure nums)
 *  5. Rest = description */
function parseOlPosFields(rest) {
  const result = {
    descrizione: '', qtyInviata: null, kg: null,
    trattamento: null, bolla: null, cassone: null, status: null,
  };

  let remaining = rest;

  // 1. Status at end
  const statusMatch = remaining.match(/(Trasferimento\s+(?:Completo|Parziale))\s*$/i);
  if (statusMatch) {
    result.status = statusMatch[1].trim();
    remaining = remaining.slice(0, -statusMatch[0].length).trim();
  }

  // 2. Extract tail (date, number) pairs from right — up to 2
  const tailPairs = []; // { num, date } — date may be null
  for (let attempt = 0; attempt < 2; attempt++) {
    let date = null;
    const dateM = remaining.match(/\s+(\d{2}\/\d{2}\/\d{2})\s*$/);
    if (dateM) {
      date = dateM[1];
      remaining = remaining.slice(0, -dateM[0].length).trim();
    }
    const numM = remaining.match(/\s+([\d.,]+)\s*$/);
    if (numM && PURE_NUM_RE.test(numM[1])) {
      tailPairs.unshift({ num: numM[1].replace(/\./g, ''), date });
      remaining = remaining.slice(0, -numM[0].length).trim();
    } else {
      if (date) remaining = remaining + ' ' + date; // put date back
      break;
    }
  }

  if (tailPairs.length === 2) {
    // 2 pairs: first = bolla (num+date), second = cassone
    const bolla = tailPairs[0];
    const cass = tailPairs[1];
    if (bolla.date) result.bolla = `DDL.${bolla.num}.${bolla.date}`;
    result.cassone = cass.num;
  } else if (tailPairs.length === 1) {
    const pair = tailPairs[0];
    const numVal = parseInt(pair.num, 10);
    if (result.status) {
      // With status → always cassone
      result.cassone = pair.num;
    } else if (pair.date && numVal >= 1000) {
      // No status, large number (>=1000) with date → bolla (DDL document number)
      result.bolla = `DDL.${pair.num}.${pair.date}`;
    } else {
      // No status, small number or no date → cassone
      result.cassone = pair.num;
    }
  }

  // Fallback: explicit bolla pattern anywhere
  if (!result.bolla) {
    const bollaExplicit = remaining.match(/((?:DDL|BPL|DDT)[.\s]\d+[.\s]\d{2}\/\d{2}\/\d{2})/i);
    if (bollaExplicit) {
      result.bolla = bollaExplicit[1].trim();
      remaining = remaining.replace(bollaExplicit[0], ' ').trim();
    }
  }
  // Fallback: explicit cassone
  if (!result.cassone) {
    const cassExplicit = remaining.match(/(?:Cass(?:one)?\.?\s*)(\d+)/i);
    if (cassExplicit) {
      result.cassone = cassExplicit[1];
      remaining = remaining.replace(cassExplicit[0], ' ').trim();
    }
  }

  // 3. Extract trattamento
  for (const pat of OL_TRATTAMENTO_PATTERNS) {
    const tm = remaining.match(pat);
    if (tm) {
      result.trattamento = tm[0].trim();
      remaining = remaining.replace(pat, ' ').replace(/\s{2,}/g, ' ').trim();
      break;
    }
  }

  // 4. QTY and KG: exactly the last 2 (or 1) pure-number tokens
  // Don't walk further — numbers deeper in the string are part of description (e.g. "DIN 938")
  const tokens = remaining.split(/\s+/).filter(Boolean);
  const len = tokens.length;
  if (len >= 2 && PURE_NUM_RE.test(tokens[len - 1]) && PURE_NUM_RE.test(tokens[len - 2])) {
    result.qtyInviata = parseItalianNumber(tokens[len - 2]);
    result.kg = parseItalianNumber(tokens[len - 1]);
    tokens.length = len - 2;
  } else if (len >= 1 && PURE_NUM_RE.test(tokens[len - 1])) {
    result.qtyInviata = parseItalianNumber(tokens[len - 1]);
    tokens.length = len - 1;
  }

  result.descrizione = tokens.join(' ').trim();
  return result;
}

function buildOlOrder(orderRef, dateStr, supplierCode, rest) {
  const order = {
    orderRef,
    orderDate: parseDateDDMMYY(dateStr),
    supplierCode,
    supplierName: '',
    supplierPhone: '',
    rawHeader: `${orderRef} ${dateStr} F ${supplierCode} ${rest}`,
    materials: [],
  };
  const phoneMatch = rest.match(/\s+([\d\s/+()-]{6,})$/);
  if (phoneMatch) {
    order.supplierName = rest.slice(0, rest.length - phoneMatch[0].length).trim();
    order.supplierPhone = phoneMatch[1].trim();
  } else {
    order.supplierName = rest.trim();
  }
  return order;
}

export function parseOL(lines) {
  const orders = [];
  let current = null;
  let currentMat = null;
  let pendingRef = null;
  let pendingSupplier = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (isPageNoise(trimmed)) continue;

    // Single-line header
    const hm = trimmed.match(OL_HEADER_SINGLE_RE);
    if (hm) {
      pendingRef = null;
      pendingSupplier = null;
      if (current) orders.push(current);
      current = buildOlOrder(hm[1], hm[2], hm[3], hm[4]);
      currentMat = null;
      continue;
    }

    // Split header: ref-only line
    const rm = trimmed.match(OL_REF_ONLY_RE);
    if (rm) {
      if (pendingSupplier) {
        if (current) orders.push(current);
        current = buildOlOrder(rm[1], pendingSupplier.date, pendingSupplier.code, pendingSupplier.rest);
        currentMat = null;
        pendingSupplier = null;
        pendingRef = null;
      } else {
        pendingRef = rm[1];
      }
      continue;
    }

    // Split header: supplier line
    const sm = trimmed.match(OL_SUPPLIER_RE);
    if (sm) {
      if (pendingRef) {
        if (current) orders.push(current);
        current = buildOlOrder(pendingRef, sm[1], sm[2], sm[3]);
        currentMat = null;
        pendingRef = null;
        pendingSupplier = null;
      } else {
        pendingSupplier = { date: sm[1], code: sm[2], rest: sm[3] };
      }
      continue;
    }

    pendingRef = null;
    pendingSupplier = null;

    if (!current) continue;

    // Position line
    const pm = trimmed.match(OL_POS_RE);
    if (pm) {
      const fields = parseOlPosFields(pm[4]);
      currentMat = {
        pos: pm[1],
        scadenza: parseDateDDMMYY(pm[2]),
        codiceProdotto: pm[3],
        descrizione: fields.descrizione,
        qtyInviata: fields.qtyInviata,
        kg: fields.kg,
        trattamento: fields.trattamento,
        bolla: fields.bolla,
        cassone: fields.cassone,
        status: fields.status,
        refs: [],
      };
      current.materials.push(currentMat);
      continue;
    }

    // Material line before positions — skip
    const matLine = trimmed.match(OL_MATERIAL_RE);
    if (matLine && !currentMat) {
      currentMat = { _skip: true, refs: [] };
      continue;
    }

    // Reference line
    const refm = trimmed.match(OL_REF_RE);
    if (refm && currentMat) {
      currentMat.refs.push({
        refType: refm[1],
        refOrder: buildRefOrder(refm[1], refm[2], refm[3]),
        refName: refm[4].trim(),
        refDate: parseDateDDMMYY(refm[5]),
        refQty: parseItalianNumber(refm[6]),
      });
      continue;
    }

    // Continuation line — append to description
    if (currentMat && !currentMat._skip && trimmed) {
      currentMat.descrizione = (currentMat.descrizione + ' ' + trimmed).trim();
    }
  }

  if (current) orders.push(current);
  return orders;
}

// ── Auto-detect PDF type from title line ─────────────────────

export function detectPdfType(lines, filename) {
  const fname = (filename || '').toLowerCase();

  if (/g22/i.test(fname)) return 'OV';
  if (/g04/i.test(fname)) return 'OL';
  if (/g00/i.test(fname)) return 'MIXED';

  if (fname.includes('acciaieria')) return 'ACCIAIERIA';
  if (fname.includes('_ol') || fname.includes('ol_')) return 'OL';
  if (fname.includes('_op') || fname.includes('op_')) return 'OP';

  for (const line of lines.slice(0, 10)) {
    if (/Lista ordini OV in scadenza/i.test(line)) return 'OV';
    if (/Lista ordini OL in scadenza/i.test(line)) return 'OL';
  }

  const first50 = lines.slice(0, 50);
  if (first50.some(l => /^\*?OP\/\d{4}\/\d{7}/.test(l))) return 'OP';

  for (const line of lines.slice(0, 10)) {
    if (/Lista ordini OA in scadenza/i.test(line)) return 'OA';
  }

  for (const line of first50) {
    if (/^OV\//.test(line)) return 'OV';
    if (/^\*?OP\//.test(line)) return 'OP';
    if (/^OL\//.test(line)) return 'OL';
    if (/^OA\//.test(line)) return 'OA';
  }

  if (fname.includes('oa')) return 'OA';
  if (fname.includes('ov') || fname.includes('cliente')) return 'OV';

  return null;
}

/** Classify orders from a mixed g00 file into OA/OP/ACCIAIERIA. */
export function classifyMixedOrders(orders) {
  const grouped = { OA: [], OP: [], ACCIAIERIA: [] };

  for (const order of orders) {
    if (order.orderRef.startsWith('OP/') || order.orderRef.startsWith('*OP/')) {
      order.orderRef = order.orderRef.replace(/^\*/, '');
      grouped.OP.push(order);
    } else if (
      order.materials.length > 0 &&
      order.materials.every(m => m.codiceProdotto && /^M#T/i.test(m.codiceProdotto))
    ) {
      order.orderRef = order.orderRef.replace(/^OA\//, 'ACCIAIERIA/');
      grouped.ACCIAIERIA.push(order);
    } else {
      grouped.OA.push(order);
    }
  }

  return grouped;
}

/** Parse lines based on detected or forced type */
export function parseByType(lines, type) {
  switch (type) {
    case 'OV': return parseOV(lines);
    case 'OA': return parseOAOP(lines, 'OA');
    case 'OP': return parseOAOP(lines, 'OP');
    case 'ACCIAIERIA': return parseOAOP(lines, 'ACCIAIERIA');
    case 'OL': return parseOL(lines);
    case 'MIXED': return parseOAOP(lines);
    default: throw new Error(`Tipo PDF sconosciuto: ${type}`);
  }
}
