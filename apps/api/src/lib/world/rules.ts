/**
 * Which Research Organization Registry (ROR) records become UniPath directory
 * entries, and how. Used by scripts/prepareWorldDirectory.ts when the bundled
 * file is rebuilt. No database access, so it can be unit-tested on its own.
 *
 * Kept: active "education" organizations outside Africa (the owner's choice,
 * 2026-11-27), outside the United States and its territories (covered by NCES
 * IPEDS), and not already in the Canada pilot. Research units that students do
 * not apply to (academy institutes, observatories, departments) are left out.
 */

/** African countries and territories (UN M49 Africa), excluded by the owner's choice. */
export const AFRICAN_COUNTRY_CODES: ReadonlySet<string> = new Set([
  "DZ", "AO", "BJ", "BW", "BF", "BI", "CV", "CM", "CF", "TD", "KM", "CG", "CD", "CI", "DJ", "EG", "GQ", "ER",
  "SZ", "ET", "GA", "GM", "GH", "GN", "GW", "KE", "LS", "LR", "LY", "MG", "MW", "ML", "MR", "MU", "MA", "MZ",
  "NA", "NE", "NG", "RW", "ST", "SN", "SC", "SL", "SO", "ZA", "SS", "SD", "TZ", "TG", "TN", "UG", "ZM", "ZW",
  "EH", "RE", "YT", "SH", "IO", "TF",
]);

/** Covered by the NCES IPEDS directory already. */
export const US_AND_TERRITORIES: ReadonlySet<string> = new Set(["US", "PR", "GU", "VI", "AS", "MP", "FM", "MH", "PW", "UM"]);

export function isAfrican(countryCode: string, continentCode?: string | null): boolean {
  return continentCode === "AF" || AFRICAN_COUNTRY_CODES.has(countryCode.toUpperCase());
}

/** Lower-case ASCII words only, for comparing names across sources. Parenthesized parts are dropped. */
export function comparableName(name: string): string {
  return name.replace(/\([^)]*\)/g, " ").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}

const RESEARCH_UNIT = /\b(observatory|laboratory|research (centre|center)|research institute)\b|^(institute|department|faculty|centre|center|division) (of|for)\b/i;

/** Research units and academy institutes, not places students apply to. */
export function looksLikeResearchUnit(name: string, hasParent: boolean): boolean {
  if (/academy of sciences/i.test(name) && !/universit/i.test(name)) return true;
  return hasParent && RESEARCH_UNIT.test(name);
}

interface RorName { value: string; types: string[]; lang?: string | null }
export interface RorRecord {
  id: string;
  status: string;
  types: string[];
  names: RorName[];
  links?: Array<{ type: string; value: string }>;
  locations: Array<{ geonames_details: {
    country_code: string; country_name: string; continent_code?: string | null;
    name?: string | null; country_subdivision_name?: string | null;
  } }>;
  relationships?: Array<{ type: string }>;
}

/** The compact form stored in the bundled file. */
export interface WorldRecord {
  /** ROR id suffix, e.g. "052gg0110" for https://ror.org/052gg0110. */
  r: string;
  n: string;
  /** Other names (English labels, aliases, acronyms), for search. */
  a: string[];
  c: string;
  s: string;
  cc: string;
  w: string | null;
}

function website(links: RorRecord["links"]): string | null {
  const value = links?.find(l => l.type === "website")?.value?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch { return null; }
}

/**
 * The directory entry for a ROR record, or null when it is left out. `skipNames`
 * holds comparable names already in the directory for that country (Canada).
 */
export function worldRecord(record: RorRecord, skipNames: ReadonlyMap<string, ReadonlySet<string>> = new Map()): WorldRecord | null {
  if (record.status !== "active" || !record.types.includes("education")) return null;
  const place = record.locations?.[0]?.geonames_details;
  if (!place?.country_code) return null;
  const cc = place.country_code.toUpperCase();
  if (isAfrican(cc, place.continent_code) || US_AND_TERRITORIES.has(cc)) return null;
  const display = record.names.find(n => n.types.includes("ror_display"))?.value?.trim();
  const match = /^https:\/\/ror\.org\/([0-9a-z]{9})$/.exec(record.id);
  if (!display || !match) return null;
  if (looksLikeResearchUnit(display, !!record.relationships?.some(x => x.type === "parent"))) return null;
  const known = skipNames.get(cc);
  if (known && record.names.some(n => known.has(comparableName(n.value)))) return null;
  const others = [...new Set(record.names.map(n => n.value.trim()).filter(v => v && v !== display && v.length <= 200))].slice(0, 8);
  return { r: match[1], n: display, a: others, c: place.name?.trim() ?? "", s: place.country_subdivision_name?.trim() ?? "", cc, w: website(record.links) };
}
