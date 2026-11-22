/**
 * Pure builders for the facts handed to the AI model. Keeping these free of
 * database access makes them easy to test and audit: what is listed here is
 * exactly what leaves the server.
 */
import type { StudentProfileRecord } from "@workspace/db/schema";

export interface GroundingFact {
  kind: "profile" | "university";
  label: string;
  value: string;
  sourceUrl: string | null;
  asOf: string | null;
}

/**
 * Profile fields shared with the AI provider when the student allows it.
 * Budgets, living-cost estimates, citizenship and region are never sent: the
 * product promises those stay private.
 */
export const SHARED_PROFILE_FIELDS = [
  "Country of residence",
  "Intended study country",
  "Preferred location",
  "Applicant status",
  "Application track",
  "Current qualification",
  "Degree level",
  "Intended major",
  "Grades (as you entered them)",
  "Graduation year",
  "Preferred start",
  "Preferred language of instruction",
  "English test, score and date",
] as const;

type ProfileForAi = Pick<StudentProfileRecord,
  "residenceCountry" | "studyCountry" | "preferredLocation" | "applicantStatus" | "admissionTrack" |
  "currentQualification" | "degreeLevel" | "major" | "grades" | "gradingScale" | "graduationYear" |
  "startTerm" | "startYear" | "preferredLanguage" | "englishTest" | "englishScore" | "englishTestDate">;

const clean = (value: string | null | undefined, max = 200) =>
  (value ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

export function profileFacts(profile: ProfileForAi): GroundingFact[] {
  const facts: GroundingFact[] = [];
  const add = (label: string, value: string | null | undefined) => {
    const v = clean(value);
    if (v) facts.push({ kind: "profile", label, value: v, sourceUrl: null, asOf: null });
  };
  add("Country of residence", profile.residenceCountry);
  add("Intended study country", profile.studyCountry);
  add("Preferred location", profile.preferredLocation);
  if (profile.applicantStatus && profile.applicantStatus !== "unsure") add("Applicant status", profile.applicantStatus);
  if (profile.admissionTrack && profile.admissionTrack !== "unsure") add("Application track", profile.admissionTrack.replace("_", "-"));
  add("Current qualification", profile.currentQualification);
  add("Degree level", profile.degreeLevel);
  add("Intended major", profile.major);
  add("Grades (as entered by the student)", [clean(profile.grades), clean(profile.gradingScale) && `scale: ${clean(profile.gradingScale)}`].filter(Boolean).join(", "));
  if (profile.graduationYear) add("Graduation year", String(profile.graduationYear));
  if (profile.startTerm && profile.startTerm !== "flexible") add("Preferred start", `${profile.startTerm}${profile.startYear ? ` ${profile.startYear}` : ""}`);
  add("Preferred language of instruction", profile.preferredLanguage);
  const test = [clean(profile.englishTest), clean(profile.englishScore) && `score ${clean(profile.englishScore)}`,
    profile.englishTestDate && `taken ${profile.englishTestDate}`].filter(Boolean).join(", ");
  add("English test", test);
  return facts;
}

/** The subset of the public University record used for grounding. */
export interface UniversityForAi {
  id: string;
  name: string;
  city: string;
  state: string;
  country: string;
  institutionType: string;
  ownership: string | null;
  dataSource: string;
  dataYear: string | null;
  sourceUrl: string;
  lastUpdatedAt: Date | string;
  lastVerifiedAt: Date | string | null;
  website: string | null;
  admissionsWebsite: string | null;
  applicationWebsite: string | null;
  financialAidWebsite: string | null;
  degreeLevels: string[];
  majors: string[];
  languages: string[];
  admissionRate: number | null;
  admissionRateYear: number | null;
  completionRate: number | null;
  completionRateYear: number | null;
  tuition?: { quotes: Array<{ category: string; amount: number; currency: string; academicYear: string; scope: string; sourceUrl: string; status: string }> } | null;
}

/** An imported admissions or funding record for an institution. */
export interface InstitutionFactForAi {
  kind: string;
  title: string;
  requirements: string[];
  eligibility: string | null;
  minimumGpa: number | null;
  minimumGpaScale: string | null;
  awardAmount: string | null;
  deadline: string | null;
  officialUrl: string | null;
  sourceUrl: string;
  sourceDate: string | null;
  lastVerifiedAt: Date | string | null;
}

const isoDay = (value: Date | string | null | undefined) => {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

export function universityFacts(u: UniversityForAi, records: InstitutionFactForAi[] = []): GroundingFact[] {
  const facts: GroundingFact[] = [];
  const recordDate = isoDay(u.lastVerifiedAt) ?? isoDay(u.lastUpdatedAt);
  const verification = u.lastVerifiedAt ? `independently verified ${isoDay(u.lastVerifiedAt)}` : "source-reported, not independently verified";
  const add = (label: string, value: string, sourceUrl: string | null = u.sourceUrl, asOf: string | null = recordDate) => {
    const v = clean(value, 600);
    if (v) facts.push({ kind: "university", label: `${u.name}: ${label}`, value: v, sourceUrl, asOf });
  };
  add("Location", [u.city, u.state, u.country].filter(Boolean).join(", "));
  add("Record status", `${u.dataSource}${u.dataYear ? ` (reporting period ${u.dataYear})` : ""}; ${verification}`);
  add("Institution type", [u.institutionType, u.ownership].filter(Boolean).join(", "));
  if (u.degreeLevels.length) add("Degree levels listed", u.degreeLevels.join(", "));
  if (u.majors.length) add("Fields of study listed (partial)", u.majors.slice(0, 25).join(", ") + (u.majors.length > 25 ? `, and ${u.majors.length - 25} more` : ""));
  if (u.languages.length) add("Languages listed", u.languages.join(", "));
  if (u.admissionRate != null) add("Admission rate", `${(u.admissionRate * 100).toFixed(1)}%${u.admissionRateYear ? ` (reporting year ${u.admissionRateYear})` : ""}`);
  if (u.completionRate != null) add("Completion rate", `${(u.completionRate * 100).toFixed(1)}%${u.completionRateYear ? ` (reporting year ${u.completionRateYear})` : ""}`);
  for (const q of u.tuition?.quotes ?? []) {
    add(`Tuition (${q.category.replace(/_/g, " ")})`,
      `${q.amount.toLocaleString("en-US")} ${q.currency} per year, academic year ${q.academicYear}; scope: ${q.scope}${q.status === "outdated" ? "; marked outdated" : ""}`,
      q.sourceUrl, q.academicYear);
  }
  if (u.admissionsWebsite) add("Official admissions page", u.admissionsWebsite, u.admissionsWebsite);
  if (u.applicationWebsite) add("Official application page", u.applicationWebsite, u.applicationWebsite);
  if (u.financialAidWebsite) add("Official financial aid page", u.financialAidWebsite, u.financialAidWebsite);
  if (u.website && !u.admissionsWebsite) add("Official website (homepage, not an admissions source)", u.website, u.website);
  for (const r of records.slice(0, 12)) {
    const parts = [
      r.requirements.length ? `requirements: ${r.requirements.slice(0, 8).join("; ")}` : "",
      r.eligibility ? `eligibility: ${r.eligibility}` : "",
      r.minimumGpa != null ? `minimum GPA ${r.minimumGpa}${r.minimumGpaScale ? ` on a ${r.minimumGpaScale} scale` : ""}` : "",
      r.awardAmount ? `award: ${r.awardAmount}` : "",
      r.deadline ? `source-reported deadline ${r.deadline} (confirm it is current)` : "",
      r.lastVerifiedAt ? `verified ${isoDay(r.lastVerifiedAt)}` : "source-reported, not independently verified",
    ].filter(Boolean).join("; ");
    add(`${r.kind === "funding" ? "Funding" : "Admissions"} record "${clean(r.title, 120)}"`, parts || "listed without further detail",
      r.officialUrl ?? r.sourceUrl, isoDay(r.lastVerifiedAt) ?? r.sourceDate ?? null);
  }
  return facts;
}

/** Render facts as a delimited data block for the model. */
export function renderGrounding(facts: GroundingFact[]): string {
  if (!facts.length) return "No profile or university records were provided for this request.";
  return facts.map((f, i) =>
    `[${i + 1}] ${f.label}: ${f.value}${f.sourceUrl ? ` | source: ${f.sourceUrl}` : ""}${f.asOf ? ` | as of: ${f.asOf}` : ""}`,
  ).join("\n");
}
