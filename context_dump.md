# Sales Dashboard — Supplier Monitor Context Dump

Generated: 2026-04-02

---

## 1. DB Schema: `supplier_orders`

```sql
-- From supabase/migration.sql
CREATE TABLE supplier_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_type TEXT NOT NULL,       -- 'OV', 'OA', 'OP', 'OL', 'ACCIAIERIA'
  order_ref TEXT NOT NULL,        -- 'OV/2026/01557', 'OA/2026/0000632', etc.
  order_date DATE,

  -- OV fields
  client_code TEXT,
  client_name TEXT,
  client_ref TEXT,
  valore_residuo NUMERIC,
  peso_totale NUMERIC,

  -- OA/OP/OL/Acciaieria fields
  supplier_code TEXT,
  supplier_name TEXT,
  supplier_phone TEXT,
  tot_peso_res NUMERIC,

  raw_header TEXT,
  upload_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(order_type, order_ref)
);
```

Columns (information_schema equivalent):

| column_name     | data_type                    |
|-----------------|------------------------------|
| id              | uuid                         |
| order_type      | text                         |
| order_ref       | text                         |
| order_date      | date                         |
| client_code     | text                         |
| client_name     | text                         |
| client_ref      | text                         |
| valore_residuo  | numeric                      |
| peso_totale     | numeric                      |
| supplier_code   | text                         |
| supplier_name   | text                         |
| supplier_phone  | text                         |
| tot_peso_res    | numeric                      |
| raw_header      | text                         |
| upload_date     | timestamp with time zone     |

## 2. DB Schema: `order_materials`

```sql
CREATE TABLE order_materials (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES supplier_orders(id) ON DELETE CASCADE,
  pos TEXT,
  scadenza DATE,
  codice_prodotto TEXT,
  descrizione TEXT,

  -- OV fields
  giacenza NUMERIC,
  impegnato NUMERIC,
  in_ordine NUMERIC,
  cons_richiesta DATE,
  peso NUMERIC,

  -- OA/OP fields
  ordinato NUMERIC,
  ricevuto NUMERIC,
  valore_residuo NUMERIC,
  prenotato NUMERIC,

  -- OL fields
  qty_inviata NUMERIC,
  kg NUMERIC,
  trattamento TEXT,
  bolla TEXT,
  cassone TEXT,
  status TEXT,

  -- Editable deadline
  scadenza_effettiva DATE,

  UNIQUE(order_id, codice_prodotto, pos)
);
```

Columns:

| column_name        | data_type |
|--------------------|-----------|
| id                 | uuid      |
| order_id           | uuid      |
| pos                | text      |
| scadenza           | date      |
| codice_prodotto    | text      |
| descrizione        | text      |
| giacenza           | numeric   |
| impegnato          | numeric   |
| in_ordine          | numeric   |
| cons_richiesta     | date      |
| peso               | numeric   |
| ordinato           | numeric   |
| ricevuto           | numeric   |
| valore_residuo     | numeric   |
| prenotato          | numeric   |
| qty_inviata        | numeric   |
| kg                 | numeric   |
| trattamento        | text      |
| bolla              | text      |
| cassone            | text      |
| status             | text      |
| scadenza_effettiva | date      |

## 3. DB Schema: `material_refs`

```sql
CREATE TABLE material_refs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  material_id UUID REFERENCES order_materials(id) ON DELETE CASCADE,
  ref_type TEXT,       -- 'OV', 'OL', 'BPV', 'F'
  ref_code TEXT,
  ref_name TEXT,
  ref_order TEXT,
  ref_date DATE,
  ref_qty NUMERIC,
  delivery_date DATE
);
```

## 4. DB Schema: `order_notes`

```sql
CREATE TABLE order_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_ref TEXT NOT NULL,
  order_type TEXT NOT NULL,
  codice_prodotto TEXT,    -- NULL = note on whole order
  note_text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

## 5. PDF Parsers — `src/utils/supplierParsers.js`

```js
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

// ── OV Parser ─────────────────────────────────────────────────

const OV_HEADER_RE = /^(OV\/\d{4}\/\d{5})\s*-\s*(.*)/;
const OV_CLIENT_RE = /C\s+(\d+)\s+(.+?)(?:\s{2,}|\s+\d{2}\/\d{2}\/\d{2})/;
const OV_CLIENT_REF_RE = /(?:Vs\.?\s*Rif\.?|Rif\.?\s*Cliente|N\.?\s*Ord\.?\s*Cl\.?|Rif\.?)\s*:?\s*(\S+.*?)$/i;
const OV_DATE_RE = /(\d{2}\/\d{2}\/\d{2})/;
const OV_MATERIAL_RE = /^(?:(\d+)\s+)?(\d{2}\/\d{2}\/\d{2})\s+([A-Z0-9]{1,5}#[A-Z0-9]+)\s+(.*)/;
const OV_SUPPLIER_RE = /^F\s+(\d+)\s+(.*?)\s+(OA|OP|OL)\/(\d{4}\/\d{7})\s+(\d{2}\/\d{2}\/\d{2})\s+([\d.,]+)\s+(\d{2}\/\d{2}\/\d{2})/;
const OV_FOOTER_RE = /^Valore Residuo Ordine\s+([\d.,]+)/;
const OV_PESO_RE = /Peso Totale Ordine\s+([\d.,]+)/;

// Extract trailing numeric fields from OV material rest string.
// Format: DESCRIZIONE  [CONS_RICH]  [GIACENZA  IMPEGNATO  IN_ORDINE]  [PESO]
// Fields are separated by 2+ spaces. We extract from right to left.
function parseOvMaterialFields(rest) {
  const result = { descrizione: '', consRichiesta: null, giacenza: null, impegnato: null, inOrdine: null, peso: null };

  // Split into segments by 2+ spaces
  const segments = rest.split(/\s{2,}/).map(s => s.trim()).filter(Boolean);
  if (!segments.length) return result;

  // Walk from the end — numeric segments are the data columns
  const nums = [];
  let dateIdx = -1;
  for (let i = segments.length - 1; i >= 0; i--) {
    const s = segments[i];
    if (/^[\d.,]+$/.test(s)) {
      nums.unshift({ idx: i, val: parseItalianNumber(s) });
    } else if (/^\d{2}\/\d{2}\/\d{2}$/.test(s) && dateIdx === -1) {
      dateIdx = i;
    } else {
      break; // hit non-numeric, non-date segment → rest is description
    }
  }

  // Assign numbers right-to-left: peso, in_ordine, impegnato, giacenza
  if (nums.length >= 1) result.peso = nums[nums.length - 1].val;
  if (nums.length >= 2) result.inOrdine = nums[nums.length - 2].val;
  if (nums.length >= 3) result.impegnato = nums[nums.length - 3].val;
  if (nums.length >= 4) result.giacenza = nums[nums.length - 4].val;

  // Date = cons_richiesta
  if (dateIdx >= 0) result.consRichiesta = parseDateDDMMYY(segments[dateIdx]);

  // Description = everything before the first extracted field
  const firstDataIdx = dateIdx >= 0
    ? Math.min(dateIdx, nums.length ? nums[0].idx : Infinity)
    : (nums.length ? nums[0].idx : segments.length);
  result.descrizione = segments.slice(0, firstDataIdx).join(' ');

  return result;
}

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

      // Extract client reference (Vs. Rif., Rif. Cliente, etc.)
      const crm = rest.match(OV_CLIENT_REF_RE);
      if (crm) current.clientRef = crm[1].trim();
      continue;
    }

    if (!current) continue;

    // Footer — valore residuo
    const fm = line.match(OV_FOOTER_RE);
    if (fm) {
      current.valoreResiduo = parseItalianNumber(fm[1]);
      const pm = line.match(OV_PESO_RE);
      if (pm) current.pesoTotale = parseItalianNumber(pm[1]);
      currentMat = null; // footer ends material context
      continue;
    }

    // Material line
    const mm = line.match(OV_MATERIAL_RE);
    if (mm) {
      const fields = parseOvMaterialFields(mm[4]);
      currentMat = {
        pos: mm[1] || null,
        scadenza: parseDateDDMMYY(mm[2]),
        codiceProdotto: mm[3],
        descrizione: fields.descrizione,
        consRichiesta: fields.consRichiesta,
        giacenza: fields.giacenza,
        impegnato: fields.impegnato,
        inOrdine: fields.inOrdine,
        peso: fields.peso,
        refs: [],
      };
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
      continue;
    }

    // Continuation line — append to current material's description
    // Must not match any other pattern and must follow a material line
    if (currentMat && line.trim()) {
      currentMat.descrizione = (currentMat.descrizione + ' ' + line.trim()).trim();
    }
  }

  if (current) orders.push(current);

  // Deduplicate materials: by codiceProdotto + pos (more robust than scadenza)
  for (const order of orders) {
    const seen = new Map();
    for (const mat of order.materials) {
      const key = `${mat.codiceProdotto}|${mat.pos || ''}`;
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
// Material line must start with date + product code (with #) — require at least
// some content after, but NOT match continuation/description lines that happen
// to start with a date (those won't have a # code immediately after)
const OAOP_MATERIAL_RE = /^(\d{2}\/\d{2}\/\d{2})\s+([A-Z0-9]{1,5}#[A-Z0-9]+)\s+(.*)/;
const OAOP_REF_RE = /^(OV|OL|BPV)[.\s](\d{4})[.\s](\d+)\s+(.+?)\s+(\d{2}\/\d{2}\/\d{2})\s+([\d.,]+)/;
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
        refOrder: buildRefOrder(rm[1], rm[2], rm[3]),
        refName: rm[4].trim(),
        refDate: parseDateDDMMYY(rm[5]),
        refQty: parseItalianNumber(rm[6]),
      });
    }
  }

  if (current) orders.push(current);

  // Deduplicate materials within each order: same logic as parseOV —
  // if two materials share codiceProdotto + scadenza, keep the one with more data.
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

// Single-line header (pdfplumber): "OL/2026/0000945 23/02/26 F 2411 ALFA OSSIDAZIONE..."
const OL_HEADER_SINGLE_RE = /^(OL\/\d{4}\/\d{7})\s+(\d{2}\/\d{2}\/\d{2})\s+F\s+(\d+)\s+(.*)/;
// Split header (pdfjs) — ref on its own line
const OL_REF_ONLY_RE = /^(OL\/\d{4}\/\d{7})\s*$/;
// Split header (pdfjs) — date+supplier on separate line
const OL_SUPPLIER_RE = /^(\d{2}\/\d{2}\/\d{2})\s+F\s+(\d+)\s+(.*)/;
const OL_POS_RE = /^Pos\.\s+(\d+)\s+(\d{2}\/\d{2}\/\d{2})\s+(\S+)\s+(.*)/;
const OL_MATERIAL_RE = /^([A-Z0-9]{1,5}#[A-Z0-9]+)\s+(.*)/;
const OL_REF_RE = /^(OV|OL|BPV)[.\s](\d{4})[.\s](\d+)\s+(.+?)\s+(\d{2}\/\d{2}\/\d{2})\s+([\d.,]+)/;

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

      // Parse remaining: DESCRIZIONE  QTY  KG  TRATTAMENTO  BOLLA  CASSONE  STATUS
      const rest = pm[4];
      let remaining = rest;

      // Try to find "Trasferimento" status at end
      const statusMatch = remaining.match(/(Trasferimento\s+\w+)\s*$/i);
      if (statusMatch) {
        currentMat.status = statusMatch[1].trim();
        remaining = remaining.slice(0, remaining.length - statusMatch[0].length);
      }

      // Extract bolla (DDL.nnn.dd/mm/yy or BPL.nnn.dd/mm/yy)
      const bollaMatch = remaining.match(/((?:DDL|BPL|DDT)[.\s]\d+[.\s]\d{2}\/\d{2}\/\d{2})/i);
      if (bollaMatch) {
        currentMat.bolla = bollaMatch[1].trim();
        remaining = remaining.replace(bollaMatch[0], '  ');
      }

      // Extract cassone number
      const cassMatch = remaining.match(/(?:Cass(?:one)?\.?\s*)(\d+)/i);
      if (cassMatch) {
        currentMat.cassone = cassMatch[1];
        remaining = remaining.replace(cassMatch[0], '  ');
      }

      // Split remaining segments
      const parts = remaining.split(/\s{2,}/).map(s => s.trim()).filter(Boolean);
      if (parts.length > 0) currentMat.descrizione = parts[0].trim();

      // Try to extract qty and kg from remaining numeric segments
      const nums = parts.slice(1).filter(s => /^[\d.,]+$/.test(s)).map(s => parseItalianNumber(s));
      if (nums.length >= 1) currentMat.qtyInviata = nums[0];
      if (nums.length >= 2) currentMat.kg = nums[1];

      current.materials.push(currentMat);
      continue;
    }

    // Material line before positions — skip (Ester only wants Pos. rows)
    const matLine = line.match(OL_MATERIAL_RE);
    if (matLine && !currentMat) {
      currentMat = { _skip: true, refs: [] };
      continue;
    }

    // Reference line
    const refm = line.match(OL_REF_RE);
    if (refm && currentMat) {
      currentMat.refs.push({
        refType: refm[1],
        refOrder: buildRefOrder(refm[1], refm[2], refm[3]),
        refName: refm[4].trim(),
        refDate: parseDateDDMMYY(refm[5]),
        refQty: parseItalianNumber(refm[6]),
      });
    }
  }

  if (current) orders.push(current);
  return orders;
}

// ── Auto-detect PDF type from title line ─────────────────────

export function detectPdfType(lines, filename) {
  const fname = (filename || '').toLowerCase();

  // 1. New SOG filename convention (most reliable)
  //    g22 → OV, g04 → OL, g00 → MIXED (OA+OP+Acciaieria)
  if (/g22/i.test(fname)) return 'OV';
  if (/g04/i.test(fname)) return 'OL';
  if (/g00/i.test(fname)) return 'MIXED';

  // 2. Legacy filename patterns (backward compat)
  if (fname.includes('acciaieria')) return 'ACCIAIERIA';
  if (fname.includes('_ol') || fname.includes('ol_')) return 'OL';
  if (fname.includes('_op') || fname.includes('op_')) return 'OP';

  // 3. Content-based detection for OV vs OA (these have distinct titles)
  for (const line of lines.slice(0, 10)) {
    if (/Lista ordini OV in scadenza/i.test(line)) return 'OV';
    if (/Lista ordini OL in scadenza/i.test(line)) return 'OL';
  }

  // 4. For "Lista ordini OA in scadenza" — check if it's actually OP
  const first50 = lines.slice(0, 50);
  if (first50.some(l => /^\*?OP\/\d{4}\/\d{7}/.test(l))) return 'OP';

  // 5. Title says OA and no OP headers found → genuine OA
  for (const line of lines.slice(0, 10)) {
    if (/Lista ordini OA in scadenza/i.test(line)) return 'OA';
  }

  // 6. Fallback: check first order header
  for (const line of first50) {
    if (/^OV\//.test(line)) return 'OV';
    if (/^\*?OP\//.test(line)) return 'OP';
    if (/^OL\//.test(line)) return 'OL';
    if (/^OA\//.test(line)) return 'OA';
  }

  // 7. Last resort: filename patterns
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
    case 'MIXED': return parseOAOP(lines); // no forceType — classify later
    default: throw new Error(`Tipo PDF sconosciuto: ${type}`);
  }
}
```

---

## 6. PDF Extraction — `src/utils/pdfExtract.js`

```js
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerSrc;

const PAGE_BATCH = 10;

function extractPageLines(content) {
  const lineMap = new Map();
  for (const item of content.items) {
    if (!item.str) continue;
    const y = Math.round(item.transform[5] * 10) / 10;
    if (!lineMap.has(y)) lineMap.set(y, []);
    lineMap.get(y).push({ x: item.transform[4], text: item.str });
  }
  const sortedYs = [...lineMap.keys()].sort((a, b) => b - a);
  const lines = [];
  for (const y of sortedYs) {
    const items = lineMap.get(y).sort((a, b) => a.x - b.x);
    const line = items.map(it => it.text).join(' ').trim();
    if (line) lines.push(line);
  }
  return lines;
}

export async function extractPdfLines(input, onProgress) {
  const data = input instanceof File ? await input.arrayBuffer() : input;
  const pdf = await getDocument({ data }).promise;
  const total = pdf.numPages;
  const pageLines = new Array(total);
  let done = 0;

  for (let start = 0; start < total; start += PAGE_BATCH) {
    const end = Math.min(start + PAGE_BATCH, total);
    const batch = [];
    for (let i = start; i < end; i++) {
      batch.push(
        pdf.getPage(i + 1)
          .then(page => page.getTextContent())
          .then(content => {
            pageLines[i] = extractPageLines(content);
            done++;
            if (onProgress) onProgress({ current: done, total });
          })
      );
    }
    await Promise.all(batch);
  }

  const allLines = [];
  for (const lines of pageLines) {
    if (lines) allLines.push(...lines);
  }
  return allLines;
}
```

---

## 7. DB Layer — `src/utils/supplierDb.js`

```js
import { supabase } from './supabase.js';

// ── Load orders ──────────────────────────────────────────────
export async function loadSupplierOrders(orderType) {
  let query = supabase.from('supplier_orders').select('*');
  if (orderType) query = query.eq('order_type', orderType);
  query = query.order('order_ref');
  const { data, error } = await query;
  console.log(`[loadSupplierOrders] type=${orderType}, rows=${data?.length ?? 'null'}, error=${error?.message ?? 'none'}`);
  if (error) throw error;
  return data;
}

// ── Load materials (paginated) ──────────────────────────────
export async function loadOrderMaterials(orderIds) {
  if (!orderIds.length) return [];
  const PAGE = 1000;
  const CHUNK = 200;
  const all = [];

  for (let c = 0; c < orderIds.length; c += CHUNK) {
    const idChunk = orderIds.slice(c, c + CHUNK);
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from('order_materials')
        .select('*')
        .in('order_id', idChunk)
        .order('pos')
        .range(from, from + PAGE - 1);
      if (error) throw error;
      all.push(...data);
      if (data.length < PAGE) break;
      from += PAGE;
    }
  }

  console.log(`[loadOrderMaterials] ${orderIds.length} orders → ${all.length} materials`);
  return all;
}

// ── Deadline helpers ─────────────────────────────────────────
// deadlineRangeFilter, countDeadlines, loadDeadlineRows
// (paginated, loads ALL rows for a date range)

// ── Refs ─────────────────────────────────────────────────────
// loadRefsForOrder(orderId) — on-demand per order

// ── Order map ────────────────────────────────────────────────
// searchOrders(query) — fuzzy search
// findLinkedOrders(orderId, orderRef) — bidirectional, hybrid:
//   - Forward "F" refs → ref_order (reliable)
//   - Forward "OV"/"OL"/"BPV" refs → name-based matching (ref_order unreliable)
//   - Ghost nodes for unresolved refs
//   - Reverse: other orders' refs pointing to this order

// ── Notes CRUD ───────────────────────────────────────────────
// loadOrderNotes, saveOrderNote, deleteOrderNote

// ── Import (batch) ───────────────────────────────────────────
// importParsedOrders(orderType, parsedOrders, onProgress)
//   - Batch upsert orders (50/batch)
//   - Batch delete old refs
//   - Batch upsert materials (200/batch)
//   - Batch insert refs (500/batch)
```

See full file at `src/utils/supplierDb.js` (469 lines).

---

## 8. React Components

### `src/components/SupplierMonitor.jsx` (main layout)

- Tabs: Scadenze, OV, OA, OP, OL, Acciaieria, Mappa + Upload button (right-aligned)
- Urgency badges per tab computed from materials
- Return-to-previous-tab navigation
- Wraps everything in `SupplierDataProvider`

### `src/components/supplier/OrderList.jsx` (order detail)

- Search across order_ref, client_name, supplier_name, materials
- Expandable order cards with:
  - Header: order_ref + client_ref (OV), date, name, material count, notes count
  - Expanded: supplier info, phone (tel: link), value/weight summaries
  - Materials table with type-specific columns:
    - **OV**: Giacenza, Impegnato, Disponibile (calculated, red if negative), In Ordine, Peso
    - **OA/OP/ACCIAIERIA**: Ordinato, Ricevuto, Val. Res., Scad. Cliente (earliest ref_date)
    - **OL**: Qty, Kg, Status, Bolla, Cassone
  - All types: Scadenza, Scad. Effettiva (editable), Codice, Descrizione, Rif., Note
- Deadline coloring: red (<0d), orange (<=3d), yellow (<=7d), green (<=14d)
- Inline note editing modal

### `src/components/supplier/DeadlineDashboard.jsx`

- 5 range cards: Scaduti, Oggi, 7g, 14g, 30g (with counts from DB)
- Filters: role (Fornitori/Clienti), search text, doc type toggles
- Grouped by supplier view with expandable sections
- Flat list view toggle
- Detail table with sortable deadlines

### `src/components/supplier/OrderMap.jsx`

- Debounced search → SVG flow diagram
- 2-level graph traversal (direct + one-hop)
- Ghost nodes (dashed border, grey) for referenced but non-existent orders
- Column layout by type: OV → OA → ACCIAIERIA → OP → OL

### `src/components/supplier/SupplierUpload.jsx`

- Drag-and-drop PDF upload with 3-phase progress:
  1. PDF extraction (page N/M)
  2. Parsing (found N orders)
  3. DB save (N/M orders)
- Mixed file support: classifies g00 into OA/OP/ACCIAIERIA with breakdown
- File type reference: SOG_OrdScadG22 (OV), SOG_OrdScadG04 (OL), sog_ordscadg00 (mixed)

### `src/hooks/useSupplierData.jsx` (state management)

- Initial load: all 5 order types + all materials (paginated)
- On-demand ref loading per order (fetchRefs)
- Import: batch upsert + reload affected type + clear ref cache
- Note CRUD with full reload
- Deadline update with optimistic state sync

---

## 9. Key Architecture Notes

- **PDF text extraction**: pdfjs-dist with coordinate-based line reconstruction, 10-page parallel batches
- **Ref linking**: OV→OA/OP/OL via reliable ref_order; OA/OP→OV via client_name ILIKE (ref_order contains non-matching internal numbers)
- **Deduplication**: OV by codiceProdotto+pos; OA/OP by codiceProdotto+scadenza
- **File detection**: SOG filenames (g22/g04/g00) > legacy filenames > content-based > header-based
- **Mixed file**: parsed as OAOP without forceType, then classified per-order by orderRef prefix + material code pattern (M#T* = ACCIAIERIA)
- **DB column `cassone`**: added to migration.sql but may need `ALTER TABLE order_materials ADD COLUMN cassone TEXT` on existing DBs
