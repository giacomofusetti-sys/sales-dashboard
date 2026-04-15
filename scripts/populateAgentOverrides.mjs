// One-shot populate script for the agent_overrides table.
// Run with: node scripts/populateAgentOverrides.mjs
// Requires the agent_overrides table to exist (see supabase/migration.sql section 6).
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('#'))
    .map(l => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_KEY);

const ENTRIES = [
  ['A. STAFFELBACH AG', 'EXPORT SALES'],
  ['AIM SERVICE ITALIA SRL', 'PIRAN MATTIA'],
  ['AKEA SRL', 'OLTOLINI MASSIMILIANO'],
  ['C.P.F. SRL', 'OLTOLINI MASSIMILIANO'],
  ['CAM SPA', 'OLTOLINI MASSIMILIANO'],
  ['CASTEL S.R.L.', 'OLTOLINI MASSIMILIANO'],
  ['CIMA ENGINEERING SRL', 'OLTOLINI MASSIMILIANO'],
  ['COLOMBO MAGNO SRL OFFICINA MECCANICA', 'DIRETTO'],
  ['FP 2000 SAS DI PREMOLI GIANBATTISTA & C.', 'BANKA AGNIESZKA'],
  ['FRAMBATI & CO. SRL A SOCIO UNICO', 'PIRAN MATTIA'],
  ['GIBERTI S.R.L. COSTR. CALDERARIE', 'PIRAN MATTIA'],
  ['KONECRANES PORT SERVICES GMBH', 'PIRAN MATTIA'],
  ['LA GIEFFE SRL UNIPERSONALE', 'SOCCAL FABIO'],
  ['PHONONIC VIBES SRL', 'OLTOLINI MASSIMILIANO'],
  ['PIOMBINO TECH SRL', 'SOCCAL FABIO'],
  ["ROMBOFER DI ROMBOLA' ROBERTO", 'PIRAN MATTIA'],
  ['TONOLI IMPIANTI SRL', 'OLTOLINI MASSIMILIANO'],
  ['DELLASSETTE SRL OFFICINA MECCANICA', 'DIRETTO'],
  ['DIRMAG SRL', 'BRENNA ALESSANDRO'],
  ['INDUSTRIOUS GLOBAL TECHNOLOGIES S.R.L.', 'OLTOLINI MASSIMILIANO'],
  ['LEITECH S.R.O', 'SOCCAL FABIO'],
  ['LI.BO SRL FORNITURE INDUSTRIALI', 'PIRAN MATTIA'],
  ['MODOMEC SRL', 'SOCCAL FABIO'],
  ['POGGIOLI SRL', 'PIRAN MATTIA'],
  ['TECNOFAST SRL UNIPERSONALE', 'OLTOLINI MASSIMILIANO'],
  ['ZELLINGER SRL', 'PIRAN MATTIA'],
  ['CANNON BONO S.P.A.', 'OLTOLINI MASSIMILIANO'],
  ['GIPO GISLER POWER AG', 'EXPORT SALES'],
  ['TERMOMECCANICA RAIMONDI DI ING. VITTORIO, MARCO & C. SRL', 'PIRAN MATTIA'],
  ['TURBINEN-UND KRAFTWERKSANLAGENBAU EFG ENERGIEFORSCHUNGS-UND ENT-', 'EXPORT SALES'],
  ['A.R.V.F. SRL A SOCIO UNICO', 'PIRAN MATTIA'],
  ['VALMET INC. COMPANY', 'EXPORT SALES'],
  ['VALMET INC. COMPANY 1641', 'EXPORT SALES'],
  ['INAUEN SCHAETTI AG', 'EXPORT SALES'],
  ['OFFICINE GHIDONI SA', 'EXPORT SALES'],
  ['M.D.M 2000 SRL', 'PIRAN MATTIA'],
  ['TECNOMATIC FLOW ELEMENTS SRL', 'PIRAN MATTIA'],
  ['FVP S.R.L.', 'BANKA AGNIESZKA'],
  ['STIM SRL', 'BANKA AGNIESZKA'],
  ['TAPFLO ITALIA SRL', 'OLTOLINI MASSIMILIANO'],
  ['CARTIERE MODESTO CARDELLA SPA', 'SOCCAL FABIO'],
  ['QUADRIFER SRL', 'DIRETTO'],
  ['ENERGY LAB SRL', 'OLTOLINI MASSIMILIANO'],
  ['ENERGY LAB SRL.', 'OLTOLINI MASSIMILIANO'],
  ['ZOCCHI FRATELLI SNC DI ZOCCHI RENATO & C.', 'DIRETTO'],
  ['NUOVI CLIENTI BANKA', 'BANKA AGNIESZKA'],
  ['NUOVI CLIENTI BRENNA', 'BRENNA ALESSANDRO'],
  ['NUOVI CLIENTI EXPORT', 'EXPORT SALES'],
  ['NUOVI CLIENTI OLTOLINI', 'OLTOLINI MASSIMILIANO'],
  ['NUOVI CLIENTI PIRAN', 'PIRAN MATTIA'],
  ['NUOVI CLIENTI SOCCAL', 'SOCCAL FABIO'],
];

const rows = ENTRIES.map(([ragione, agente]) => ({
  ragione_cap: ragione.trim().toUpperCase(),
  ragione: ragione.trim(),
  agente,
}));

const { error, data } = await supabase
  .from('agent_overrides')
  .upsert(rows, { onConflict: 'ragione_cap' })
  .select();

if (error) {
  console.error('[populateAgentOverrides] error:', error);
  process.exit(1);
}

console.log(`[populateAgentOverrides] upserted ${data?.length ?? rows.length} rows`);
