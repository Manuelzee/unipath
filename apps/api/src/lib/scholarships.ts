/**
 * Scholarship and sponsorship programmes for study outside Africa, from the
 * curated file data/scholarships.json (see its note). Each links to the
 * sponsor's official page; amounts, deadlines and eligibility change every
 * year and are deliberately not copied. No database access, so the list can
 * be validated in unit tests.
 */
import data from "../data/scholarships.json";
import { AFRICAN_COUNTRY_CODES } from "./world/rules";

export const SPONSOR_TYPES = ["government", "university", "foundation", "intergovernmental"] as const;
export const STUDY_LEVELS = ["bachelor", "master", "doctoral", "research", "non_degree"] as const;
export const FUNDING_TYPES = ["full", "partial", "varies"] as const;
export type SponsorType = typeof SPONSOR_TYPES[number];
export type StudyLevel = typeof STUDY_LEVELS[number];

export interface ScholarshipProgram {
  id: string;
  name: string;
  sponsor: string;
  sponsorType: SponsorType;
  studyCountries: string[];
  studyRegion: string | null;
  institutionIds: string[];
  levels: StudyLevel[];
  funding: typeof FUNDING_TYPES[number];
  summary: string;
  eligibility: string;
  officialUrl: string;
  linkCheckedAt: string | null;
}

/** Throws on any malformed entry, so a bad edit fails the tests and the start-up. */
export function validatePrograms(raw: unknown[]): ScholarshipProgram[] {
  const ids = new Set<string>();
  return raw.map((entry, index) => {
    const p = entry as Partial<ScholarshipProgram> & Record<string, unknown>;
    const where = `scholarship ${index} (${String(p.id)})`;
    const text = (v: unknown) => typeof v === "string" && v.trim().length > 0;
    if (!text(p.id) || !/^[a-z0-9-]+$/.test(p.id!) || ids.has(p.id!)) throw new Error(`${where}: missing or duplicate id`);
    ids.add(p.id!);
    for (const field of ["name", "sponsor", "summary", "eligibility"] as const) if (!text(p[field])) throw new Error(`${where}: missing ${field}`);
    if (!SPONSOR_TYPES.includes(p.sponsorType as SponsorType)) throw new Error(`${where}: unknown sponsor type`);
    if (!FUNDING_TYPES.includes(p.funding as ScholarshipProgram["funding"])) throw new Error(`${where}: unknown funding type`);
    const levels = p.levels ?? [];
    if (!levels.length || levels.some(l => !STUDY_LEVELS.includes(l))) throw new Error(`${where}: unknown study level`);
    const countries = p.studyCountries ?? [];
    if (countries.some(c => !/^[A-Z]{2}$/.test(c))) throw new Error(`${where}: study countries must be ISO codes`);
    if (countries.some(c => AFRICAN_COUNTRY_CODES.has(c))) throw new Error(`${where}: study in Africa is out of scope`);
    if (!countries.length && !text(p.studyRegion)) throw new Error(`${where}: give study countries or a study region`);
    let url: URL;
    try { url = new URL(p.officialUrl!); } catch { throw new Error(`${where}: invalid official URL`); }
    if (url.protocol !== "https:") throw new Error(`${where}: the official URL must use https`);
    if (p.linkCheckedAt !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(p.linkCheckedAt))) throw new Error(`${where}: linkCheckedAt must be a date or null`);
    return {
      id: p.id!, name: p.name!, sponsor: p.sponsor!, sponsorType: p.sponsorType as SponsorType,
      studyCountries: countries, studyRegion: (p.studyRegion as string | undefined) ?? null,
      institutionIds: (p.institutionIds as string[] | undefined) ?? [], levels: levels as StudyLevel[],
      funding: p.funding as ScholarshipProgram["funding"], summary: p.summary!, eligibility: p.eligibility!,
      officialUrl: p.officialUrl!, linkCheckedAt: p.linkCheckedAt ?? null,
    };
  });
}

export const SCHOLARSHIPS: readonly ScholarshipProgram[] = validatePrograms(data.programs);
export const SCHOLARSHIPS_REVIEWED_AT = data.reviewedAt;
/** Universities with a programme of their own (for the "has scholarships" filter). */
export const SCHOLARSHIP_INSTITUTION_IDS = [...new Set(SCHOLARSHIPS.flatMap(p => p.institutionIds))];

export interface ScholarshipFilters { country?: string; level?: string; sponsorType?: string; search?: string }

/** "multi" selects programmes that span several countries (no single study country). */
export function filterScholarships(filters: ScholarshipFilters, programs: readonly ScholarshipProgram[] = SCHOLARSHIPS) {
  const country = filters.country?.toUpperCase();
  const words = (filters.search ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  return programs.filter(p =>
    (!country || (country === "MULTI" ? !p.studyCountries.length || p.studyCountries.length > 1 : p.studyCountries.includes(country))) &&
    (!filters.level || p.levels.includes(filters.level as StudyLevel)) &&
    (!filters.sponsorType || p.sponsorType === filters.sponsorType) &&
    words.every(w => `${p.name} ${p.sponsor} ${p.summary}`.toLowerCase().includes(w)));
}

/** Programmes for one university: its own awards first, then awards for its country. */
export function scholarshipsFor(institutionId: string, countryCode: string, programs: readonly ScholarshipProgram[] = SCHOLARSHIPS) {
  const own = programs.filter(p => p.institutionIds.includes(institutionId));
  const national = programs.filter(p => !p.institutionIds.length && p.studyCountries.includes(countryCode.toUpperCase()));
  return [...own.map(p => ({ ...p, scope: "institution" as const })), ...national.map(p => ({ ...p, scope: "country" as const }))];
}
