// Client name aliases: sales file name → budget name
const DEFAULT_ALIASES = {
  "CASTAGNOLI C. F. VITERIE SNCDI CASTAGNOLI SAURO E JACOPO": "CASTAGNOLI C. & F. VITERIE SNC",
  "CASTAGNOLI C. & F. VITERIE SNCDI CASTAGNOLI SAURO E JACOPO": "CASTAGNOLI C. & F. VITERIE SNC",
  "FLOVEX SRL A SOCIO UNICO": "FLOVEX SRL",
  "EMIL GISLER AG": "GIPO GISLER POWER AG",
  "SAEP INDUSTRY SRL": "SAEP SRL",
  "TERMOMECCANICA RAIMONDI DI ING. VITTORIO, MARCO & C. SRL": "TERMOMECCANICA RAIMONDI DI ING. VITTORIO, MARCO & C. SRL",
  "TURBINEN-UND KRAFTWERKSANLAGENBAU EFG ENERGIEFORSCHUNGS-UND ENT-WICKLUNGSGESELLSCHAFT  M.B.H. & CO KG.": "TURBINEN-UND KRAFTWERKSANLAGENBAU EFG ENERGIEFORSCHUNGS-UND ENT-",
  "M.D.M. 2000 SRL": "M.D.M 2000 SRL",
};

// Runtime alias map (starts with defaults, can be updated from DB)
let aliases = { ...DEFAULT_ALIASES };

export function getAliases() {
  return aliases;
}

export function setAliases(newAliases) {
  aliases = { ...newAliases };
}

export function resolveAlias(name) {
  const upper = name?.toString().trim().toUpperCase() || '';
  // Lookup is case-insensitive: try exact key first, then uppercase keys
  if (aliases[upper]) return aliases[upper];
  for (const [key, val] of Object.entries(aliases)) {
    if (key.toUpperCase() === upper) return val;
  }
  return name;
}

export { DEFAULT_ALIASES };
