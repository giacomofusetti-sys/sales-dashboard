// Client name aliases: sales file name → budget name
const DEFAULT_ALIASES = {
  "CASTAGNOLI C. F. VITERIE SNCDI CASTAGNOLI SAURO E JACOPO": "CASTAGNOLI C. & F. VITERIE SNC",
  "CASTAGNOLI C. & F. VITERIE SNCDI CASTAGNOLI SAURO E JACOPO": "CASTAGNOLI C. & F. VITERIE SNC",
  "FLOVEX SRL A SOCIO UNICO": "FLOVEX SRL",
  "GIPO GISLER POWER AG": "EMIL GISLER AG",
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
  return aliases[upper] || name;
}

export { DEFAULT_ALIASES };
