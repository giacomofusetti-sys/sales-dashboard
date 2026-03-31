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

// ── OV Parser ─────────────────────────────────────────────────

const OV_HEADER_RE = /^(OV\/\d{4}\/\d{5})\s*-\s*(.*)/;
const OV_CLIENT_RE = /C\s+(\d+)\s+(.+?)(?:\s{2,}|\s+\d{2}\/\d{2}\/\d{2})/;
const OV_DATE_RE = /(\d{2}\/\d{2}\/\d{2})/;
const OV_MATERIAL_RE = /^(?:(\d+)\s+)?(\d{2}\/\d{2}\/\d{2})\s+([A-Z0-9]{1,5}#[A-Z0-9]+)\s+(.*)/;
const OV_SUPPLIER_RE = /^F\s+(\d+)\s+(.*?)\s+(OA|OP|OL)\/(\d{4}\/\d{7})\s+(\d{2}\/\d{2}\/\d{2})\s+([\d.,]+)\s+(\d{2}\/\d{2}\/\d{2})/;
const OV_FOOTER_RE = /^Valore Residuo Ordine\s+([\d.,]+)/;
const OV_PESO_RE = /Peso Totale Ordine\s+([\d.,]+)/;

export function parseOV(lines) {
  const orders = [];
  let current = null;
  let currentMat = null;

  for (const line of lines) {
    // Order header
    const hm = line.match(OV_HEADER_RE);
    if (hm) {
      if (current) orders.push(current);
      current = {
        orderRef: hm[1],
        rawHeader: line,
        materials: [],
      };
      currentMat = null;

      // Extract date
      const rest = hm[2];
      const dm = rest.match(OV_DATE_RE);
      if (dm) current.orderDate = parseDateDDMMYY(dm[1]);

      // Extract client
      const cm = line.match(OV_CLIENT_RE);
      if (cm) {
        current.clientCode = cm[1];
        current.clientName = cm[2].trim();
      }
      continue;
    }

    if (!current) continue;

    // Footer — valore residuo
    const fm = line.match(OV_FOOTER_RE);
    if (fm) {
      current.valoreResiduo = parseItalianNumber(fm[1]);
      const pm = line.match(OV_PESO_RE);
      if (pm) current.pesoTotale = parseItalianNumber(pm[1]);
      continue;
    }

    // Material line
    const mm = line.match(OV_MATERIAL_RE);
    if (mm) {
      currentMat = {
        pos: mm[1] || null,
        scadenza: parseDateDDMMYY(mm[2]),
        codiceProdotto: mm[3],
        descrizione: '',
        refs: [],
      };
      // Parse remaining fields from the description part
      const rest = mm[4];
      const parts = rest.split(/\s{2,}/);
      if (parts.length > 0) currentMat.descrizione = parts[0].trim();

      // Try to extract numeric fields from the end
      const nums = rest.match(/([\d.,]+)\s*$/);
      if (nums) currentMat.peso = parseItalianNumber(nums[1]);

      // Look for delivery date
      const delivDate = rest.match(/(\d{2}\/\d{2}\/\d{2})\s*$/);
      if (!delivDate) {
        const allDates = rest.match(/(\d{2}\/\d{2}\/\d{2})/g);
        if (allDates && allDates.length > 0) {
          currentMat.consRichiesta = parseDateDDMMYY(allDates[allDates.length - 1]);
        }
      } else {
        currentMat.consRichiesta = parseDateDDMMYY(delivDate[1]);
      }

      current.materials.push(currentMat);
      continue;
    }

    // Supplier ref line (within OV)
    const sm = line.match(OV_SUPPLIER_RE);
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
    }
  }

  if (current) orders.push(current);

  // Deduplicate materials within each order: if two materials share the same
  // codiceProdotto + scadenza, keep the one with more data (more refs, then
  // more non-null fields).
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

// ── OA/OP/Acciaieria Parser ──────────────────────────────────

const OAOP_HEADER_RE = /^\*?(OA|OP)\/(\d{4}\/\d{7})\s+(\d{2}\/\d{2}\/\d{2})\s*F\s+(\d+)\s+(.*)/;
const OAOP_MATERIAL_RE = /^(\d{2}\/\d{2}\/\d{2})\s+([A-Z0-9]{1,5}#[A-Z0-9]+)\s+(.*)/;
const OAOP_REF_RE = /^(OV|OL|BPV)[.\s]\d{4}[.\s]\d+\s+(.+?)\s+(\d{2}\/\d{2}\/\d{2})\s+([\d.,]+)/;
const OAOP_FOOTER_RE = /^Tot\.\s*peso\s*res\.\s*([\d.,]+)/i;

export function parseOAOP(lines, forceType) {
  const orders = [];
  let current = null;
  let currentMat = null;

  for (const line of lines) {
    // Order header
    const hm = line.match(OAOP_HEADER_RE);
    if (hm) {
      if (current) orders.push(current);
      const type = forceType || hm[1];
      current = {
        orderRef: `${type}/${hm[2]}`,
        orderDate: parseDateDDMMYY(hm[3]),
        supplierCode: hm[4],
        supplierName: '',
        supplierPhone: '',
        rawHeader: line,
        materials: [],
      };
      currentMat = null;

      // Split supplier name and phone — phone is usually at the end
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
    const fm = line.match(OAOP_FOOTER_RE);
    if (fm) {
      current.totPesoRes = parseItalianNumber(fm[1]);
      continue;
    }

    // Material line
    const mm = line.match(OAOP_MATERIAL_RE);
    if (mm) {
      currentMat = {
        scadenza: parseDateDDMMYY(mm[1]),
        codiceProdotto: mm[2],
        descrizione: '',
        refs: [],
      };

      // Parse: DESCRIZIONE  ORDINATO  RICEVUTO  VAL_RES  PRENOTATO
      const rest = mm[3];
      // Try to extract trailing numbers
      const numPattern = /([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s*$/;
      const nm = rest.match(numPattern);
      if (nm) {
        currentMat.descrizione = rest.slice(0, rest.length - nm[0].length).trim();
        currentMat.ordinato = parseItalianNumber(nm[1]);
        currentMat.ricevuto = parseItalianNumber(nm[2]);
        currentMat.valoreResiduo = parseItalianNumber(nm[3]);
        currentMat.prenotato = parseItalianNumber(nm[4]);
      } else {
        currentMat.descrizione = rest.trim();
      }

      current.materials.push(currentMat);
      continue;
    }

    // Reference/booking line
    const rm = line.match(OAOP_REF_RE);
    if (rm && currentMat) {
      currentMat.refs.push({
        refType: rm[1],
        refName: rm[2].trim(),
        refDate: parseDateDDMMYY(rm[3]),
        refQty: parseItalianNumber(rm[4]),
      });
    }
  }

  if (current) orders.push(current);
  return orders;
}

// ── OL Parser ─────────────────────────────────────────────────

// Single-line header (pdfplumber): "OL/2026/0000945 23/02/26 F 2411 ALFA OSSIDAZIONE..."
const OL_HEADER_SINGLE_RE = /^(OL\/\d{4}\/\d{7})\s+(\d{2}\/\d{2}\/\d{2})\s+F\s+(\d+)\s+(.*)/;
// Split header (pdfjs) — ref on its own line
const OL_REF_ONLY_RE = /^(OL\/\d{4}\/\d{7})\s*$/;
// Split header (pdfjs) — date+supplier on separate line
const OL_SUPPLIER_RE = /^(\d{2}\/\d{2}\/\d{2})\s+F\s+(\d+)\s+(.*)/;
const OL_POS_RE = /^Pos\.\s+(\d+)\s+(\d{2}\/\d{2}\/\d{2})\s+(\S+)\s+(.*)/;
const OL_MATERIAL_RE = /^([A-Z0-9]{1,5}#[A-Z0-9]+)\s+(.*)/;
const OL_REF_RE = /^(OV|OL|BPV)[.\s]\d{4}[.\s]\d+\s+(.+?)\s+(\d{2}\/\d{2}\/\d{2})\s+([\d.,]+)/;

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
  let pendingRef = null;       // OL ref waiting for its supplier line
  let pendingSupplier = null;  // supplier line waiting for its OL ref

  for (const line of lines) {
    // Single-line header (pdfplumber format)
    const hm = line.match(OL_HEADER_SINGLE_RE);
    if (hm) {
      pendingRef = null;
      pendingSupplier = null;
      if (current) orders.push(current);
      current = buildOlOrder(hm[1], hm[2], hm[3], hm[4]);
      currentMat = null;
      continue;
    }

    // Split header: ref-only line "OL/2026/0000945"
    const rm = line.match(OL_REF_ONLY_RE);
    if (rm) {
      if (pendingSupplier) {
        // Supplier line came first → combine
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

    // Split header: supplier line "23/02/26  F 2411  ALFA OSSIDAZIONE..."
    const sm = line.match(OL_SUPPLIER_RE);
    if (sm) {
      if (pendingRef) {
        // Ref line came first → combine
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

    // Any other line clears pending state
    pendingRef = null;
    pendingSupplier = null;

    if (!current) continue;

    // Position line (main material/position entry for OL)
    const pm = line.match(OL_POS_RE);
    if (pm) {
      currentMat = {
        pos: pm[1],
        scadenza: parseDateDDMMYY(pm[2]),
        codiceProdotto: pm[3],
        descrizione: '',
        refs: [],
      };

      // Parse remaining: DESCRIZIONE  QTY  KG  TRATTAMENTO  BOLLA  DATA  STATUS
      const rest = pm[4];

      // Try to find "Trasferimento" status at end
      const statusMatch = rest.match(/(Trasferimento\s+\w+)\s*$/i);
      let remaining = rest;
      if (statusMatch) {
        currentMat.status = statusMatch[1].trim();
        remaining = rest.slice(0, rest.length - statusMatch[0].length);
      }

      // Extract numbers and description from remaining
      const parts = remaining.split(/\s{2,}/);
      if (parts.length > 0) currentMat.descrizione = parts[0].trim();

      // Try to extract qty and kg
      const numsInRest = remaining.match(/([\d.,]+)\s+([\d.,]+)/);
      if (numsInRest) {
        currentMat.qtyInviata = parseItalianNumber(numsInRest[1]);
        currentMat.kg = parseItalianNumber(numsInRest[2]);
      }

      current.materials.push(currentMat);
      continue;
    }

    // Material line before positions (material to receive)
    const matLine = line.match(OL_MATERIAL_RE);
    if (matLine && !currentMat) {
      currentMat = {
        pos: null,
        codiceProdotto: matLine[1],
        descrizione: matLine[2].trim(),
        refs: [],
      };
      const qtyMatch = matLine[2].match(/([\d.,]+)\s*$/);
      if (qtyMatch) {
        currentMat.qtyInviata = parseItalianNumber(qtyMatch[1]);
        currentMat.descrizione = matLine[2].slice(0, matLine[2].length - qtyMatch[0].length).trim();
      }
      current.materials.push(currentMat);
      continue;
    }

    // Reference line
    const refm = line.match(OL_REF_RE);
    if (refm && currentMat) {
      currentMat.refs.push({
        refType: refm[1],
        refName: refm[2].trim(),
        refDate: parseDateDDMMYY(refm[3]),
        refQty: parseItalianNumber(refm[4]),
      });
    }
  }

  if (current) orders.push(current);
  return orders;
}

// ── Auto-detect PDF type from title line ─────────────────────

export function detectPdfType(lines, filename) {
  const fname = (filename || '').toLowerCase();

  // 1. Filename is the most reliable source — titles are ambiguous across types
  if (fname.includes('acciaieria')) return 'ACCIAIERIA';
  if (fname.includes('_ol') || fname.includes('ol_')) return 'OL';
  if (fname.includes('_op') || fname.includes('op_')) return 'OP';

  // 2. Content-based detection for OV vs OA (these have distinct titles)
  for (const line of lines.slice(0, 10)) {
    if (/Lista ordini OV in scadenza/i.test(line)) return 'OV';
    if (/Lista ordini OL in scadenza/i.test(line)) return 'OL';
  }

  // 3. For "Lista ordini OA in scadenza" — check if it's actually OP (headers start with *OP/)
  const first50 = lines.slice(0, 50);
  if (first50.some(l => /^\*?OP\/\d{4}\/\d{7}/.test(l))) return 'OP';

  // 4. Title says OA and no OP headers found → genuine OA
  for (const line of lines.slice(0, 10)) {
    if (/Lista ordini OA in scadenza/i.test(line)) return 'OA';
  }

  // 5. Fallback: check first order header
  for (const line of first50) {
    if (/^OV\//.test(line)) return 'OV';
    if (/^\*?OP\//.test(line)) return 'OP';
    if (/^OL\//.test(line)) return 'OL';
    if (/^OA\//.test(line)) return 'OA';
  }

  // 6. Last resort: filename patterns
  if (fname.includes('oa')) return 'OA';
  if (fname.includes('ov') || fname.includes('cliente')) return 'OV';

  return null;
}

/** Parse lines based on detected or forced type */
export function parseByType(lines, type) {
  switch (type) {
    case 'OV': return parseOV(lines);
    case 'OA': return parseOAOP(lines, 'OA');
    case 'OP': return parseOAOP(lines, 'OP');
    case 'ACCIAIERIA': return parseOAOP(lines, 'ACCIAIERIA');
    case 'OL': return parseOL(lines);
    default: throw new Error(`Tipo PDF sconosciuto: ${type}`);
  }
}
