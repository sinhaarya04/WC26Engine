/**
 * fifa_code → flag emoji for the 48 WC 2026 teams.
 *
 * FIFA / IOC 3-letter codes don't always match ISO 3166-1 alpha-2; the
 * mapping below is hand-built from data/teams.json. England has its own
 * subdivision flag (regional indicator codepoint sequence for "gbeng").
 * Falls back to the fifa_code text when unknown.
 */

// ISO 3166-1 alpha-2 → flag emoji (regional indicator codepoints).
function isoToFlag(iso2: string): string {
  return iso2
    .toUpperCase()
    .split("")
    .map((c) => String.fromCodePoint(0x1f1e6 + (c.charCodeAt(0) - 65)))
    .join("");
}

const FIFA_TO_ISO2: Record<string, string> = {
  MEX: "MX", RSA: "ZA", KOR: "KR", CZE: "CZ", CAN: "CA",
  BIH: "BA", QAT: "QA", SUI: "CH", BRA: "BR", MAR: "MA",
  HAI: "HT", SCO: "GB-SCT" /* special, fallback below */, USA: "US", PAR: "PY",
  AUS: "AU", TUR: "TR", GER: "DE", CUW: "CW", CIV: "CI",
  ECU: "EC", NED: "NL", JPN: "JP", SWE: "SE", TUN: "TN",
  BEL: "BE", EGY: "EG", IRN: "IR", NZL: "NZ", ESP: "ES",
  CPV: "CV", KSA: "SA", URU: "UY", FRA: "FR", SEN: "SN",
  IRQ: "IQ", NOR: "NO", ARG: "AR", ALG: "DZ", AUT: "AT",
  JOR: "JO", POR: "PT", COD: "CD", UZB: "UZ", COL: "CO",
  ENG: "GB-ENG" /* special */, CRO: "HR", GHA: "GH", PAN: "PA",
};

// Subdivision flags (Scotland, England) — six-codepoint sequences.
const ENGLAND_FLAG  = "\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}";
const SCOTLAND_FLAG = "\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}";

/** Returns a flag glyph for a 3-letter FIFA code. Falls back to the code. */
export function flagFor(fifaCode: string | null | undefined): string {
  if (!fifaCode) return "";
  const code = fifaCode.toUpperCase();
  if (code === "ENG") return ENGLAND_FLAG;
  if (code === "SCO") return SCOTLAND_FLAG;
  const iso = FIFA_TO_ISO2[code];
  if (!iso || iso.includes("-")) return code; // unmapped or subdivision-only
  return isoToFlag(iso);
}
