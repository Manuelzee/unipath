/**
 * Recognizes countries in free text such as a student's "Where might you
 * study?" answer ("USA", "Canada or the UK", "I'd like to study in Germany").
 * Country names come from the runtime's ISO 3166 region names, plus common
 * short forms. Returns ISO 3166-1 alpha-2 codes in upper case.
 */
const display = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });
// Groupings, private-use codes, and deprecated codes the runtime still names
// (DD would claim "Germany", UK "United Kingdom", SU "Soviet Union"...).
const NOT_COUNTRIES = new Set([
  "EU", "EZ", "UN", "QO", "XA", "XB", "ZZ",
  "AN", "BU", "CS", "CT", "DD", "DY", "FQ", "FX", "HV", "JT", "MI", "NH", "NQ", "NT", "PC", "PU", "PZ", "RH",
  "SU", "TP", "UK", "VD", "WK", "YD", "YU", "ZR",
]);

const normalize = (value: string) => value.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();

/** Short forms people type, matched as whole phrases. */
const ALIASES: Record<string, string> = {
  "usa": "US", "u s a": "US", "united states of america": "US", "america": "US", "the states": "US",
  "uk": "GB", "u k": "GB", "britain": "GB", "great britain": "GB", "england": "GB", "scotland": "GB", "wales": "GB", "northern ireland": "GB",
  "holland": "NL", "the netherlands": "NL", "uae": "AE", "emirates": "AE", "south korea": "KR", "korea": "KR",
  "czech republic": "CZ", "turkey": "TR", "russia": "RU", "hong kong": "HK", "macau": "MO", "macao": "MO",
  "ivory coast": "CI", "burma": "MM", "swaziland": "SZ", "cape verde": "CV", "vatican": "VA",
};
/** Two-letter forms accepted only when they are the whole answer (so "let us" is not the US). */
const WHOLE_ONLY: Record<string, string> = { "us": "US", "uk": "GB" };
/** Regions that contain a country name but are not countries. */
const NOT_A_COUNTRY = ["south america", "latin america", "central america", "north america"];

type Entry = { phrase: string; code: string };
let table: Entry[] | null = null;
function phrases(): Entry[] {
  if (table) return table;
  const entries = new Map<string, string>();
  for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
    const code = String.fromCharCode(a, b);
    if (NOT_COUNTRIES.has(code)) continue;
    const name = display.of(code);
    if (!name || name === code) continue;
    // "Myanmar (Burma)", "Hong Kong SAR China": index each part.
    for (const variant of [name, name.replace(/\s*\(.*\)\s*/g, " "), name.replace(/\s+SAR China$/, ""), ...(name.match(/\(([^)]+)\)/)?.slice(1) ?? [])]) {
      const phrase = normalize(variant);
      if (phrase.length > 2 && !entries.has(phrase)) entries.set(phrase, code);
    }
  }
  for (const [phrase, code] of Object.entries(ALIASES)) entries.set(normalize(phrase), code);
  // Longest first, so "south korea" wins over "korea" and "united states of america" over "america".
  table = [...entries].map(([phrase, code]) => ({ phrase, code })).sort((x, y) => y.phrase.length - x.phrase.length);
  return table;
}

export function countriesIn(text: string | null | undefined): string[] {
  let rest = ` ${normalize(text ?? "")} `;
  if (!rest.trim()) return [];
  const whole = WHOLE_ONLY[rest.trim()];
  if (whole) return [whole];
  for (const region of NOT_A_COUNTRY) rest = rest.replaceAll(` ${region} `, "   ");
  const found = new Map<string, number>();
  for (const { phrase, code } of phrases()) {
    const needle = ` ${phrase} `;
    const at = rest.indexOf(needle);
    if (at < 0) continue;
    // Blank the match (same length) so shorter names inside it cannot match again.
    rest = rest.replaceAll(needle, " ".repeat(needle.length));
    if (!found.has(code) || at < found.get(code)!) found.set(code, at);
  }
  // In the order the student wrote them.
  return [...found].sort((a, b) => a[1] - b[1]).map(([code]) => code);
}

/** Countries whose English name takes "the" ("study in the United States"). */
const WITH_THE = new Set(["US", "GB", "NL", "PH", "AE", "BS", "GM", "DO", "MV", "MH", "SB", "SC", "CF", "KM"]);

/** The country's English name, with "the" where English uses it. */
export function countryName(code: string): string {
  const upper = code.toUpperCase();
  const name = display.of(upper) ?? upper;
  return WITH_THE.has(upper) ? `the ${name}` : name;
}

export function isCountryCode(code: string): boolean {
  const upper = code.toUpperCase();
  return /^[A-Z]{2}$/.test(upper) && !NOT_COUNTRIES.has(upper) && !!display.of(upper) && display.of(upper) !== upper;
}

/** How a country room is labelled: "US students", "UK students", "Canada students". */
export function countryRoomName(code: string): string {
  const upper = code.toUpperCase();
  if (upper === "US") return "US students";
  if (upper === "GB") return "UK students";
  return `${display.of(upper) ?? upper} students`;
}
