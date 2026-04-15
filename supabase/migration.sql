-- ============================================================
-- Supplier Monitoring — DB Migration
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Supplier orders (OV, OA, OP, OL, ACCIAIERIA)
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

-- 2. Order materials / positions
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

  UNIQUE NULLS NOT DISTINCT (order_id, codice_prodotto, pos)
);

CREATE INDEX idx_order_materials_order ON order_materials(order_id);
CREATE INDEX idx_order_materials_scadenza ON order_materials(scadenza);

-- 3. Persistent notes (keyed by order_ref, not UUID — survives re-uploads)
CREATE TABLE order_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_ref TEXT NOT NULL,
  order_type TEXT NOT NULL,
  codice_prodotto TEXT,           -- NULL = note on whole order
  note_text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_order_notes_ref ON order_notes(order_type, order_ref);

-- 4. Material references / bookings
CREATE TABLE material_refs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  material_id UUID REFERENCES order_materials(id) ON DELETE CASCADE,
  ref_type TEXT,                  -- 'OV', 'OL', 'BPV', 'F'
  ref_code TEXT,
  ref_name TEXT,
  ref_order TEXT,
  ref_date DATE,
  ref_qty NUMERIC,
  delivery_date DATE
);

CREATE INDEX idx_material_refs_material ON material_refs(material_id);

-- 5. Enable RLS but allow all operations (public anon key, same as existing tables)
ALTER TABLE supplier_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_refs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on supplier_orders" ON supplier_orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on order_materials" ON order_materials FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on order_notes" ON order_notes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on material_refs" ON material_refs FOR ALL USING (true) WITH CHECK (true);

-- 6. Persistent agent overrides (survive budget resets)
CREATE TABLE IF NOT EXISTS agent_overrides (
  ragione_cap text PRIMARY KEY,
  ragione text,
  agente text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE agent_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on agent_overrides" ON agent_overrides FOR ALL USING (true) WITH CHECK (true);
