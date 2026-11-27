/**
 * Programme rules shared by the API: the vocabulary, how a record's
 * verification is labelled, document readiness and academic fit. No database
 * access, so it can be unit-tested on its own.
 */

export const PROGRAMME_LEVELS = ["bachelor", "master", "doctoral", "diploma", "certificate", "foundation", "other"] as const;
export const STUDY_MODES = ["full_time", "part_time", "online", "blended"] as const;
export const TUITION_PERIODS = ["year", "semester", "programme", "credit"] as const;
export const DEADLINE_TYPES = ["fixed", "rolling", "unknown"] as const;
export const PROGRAMME_STATUSES = ["draft", "published", "archived"] as const;

/** What a student's document is; programmes ask for these by kind. */
export const DOCUMENT_KINDS = {
  transcript: "Transcripts or mark sheets",
  certificate: "Diploma or school-leaving certificate",
  passport: "Passport",
  english_test: "English test result",
  cv: "CV or résumé",
  personal_statement: "Personal statement or motivation letter",
  recommendation: "Recommendation letter",
  financial: "Proof of funds",
  photo: "Passport photo",
  portfolio: "Portfolio",
  other: "Other document",
} as const;
export type DocumentKind = keyof typeof DOCUMENT_KINDS;
export const isDocumentKind = (value: unknown): value is DocumentKind =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(DOCUMENT_KINDS, value);

/** How long a university's written confirmation is shown as current. */
export const CONFIRMATION_VALID_DAYS = 180;
/** After this long without a check, details are labelled as not checked recently. */
export const CHECK_VALID_DAYS = 365;
const DAY = 86_400_000;

export interface Verification {
  level: "confirmed" | "checked" | "stale";
  label: string;
  detail: string;
  checkedAt: string;
  confirmedAt: string | null;
  confirmedUntil: string | null;
}

const longDate = (iso: string) => new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso)
  .toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export function verificationOf(record: { checkedAt: string; confirmedAt: Date | null }, now = new Date()): Verification {
  const confirmedAt = record.confirmedAt?.toISOString() ?? null;
  const until = record.confirmedAt ? new Date(record.confirmedAt.getTime() + CONFIRMATION_VALID_DAYS * DAY) : null;
  const base = { checkedAt: record.checkedAt, confirmedAt, confirmedUntil: until?.toISOString() ?? null };
  if (record.confirmedAt && until && now < until) {
    return { ...base, level: "confirmed", label: "Confirmed by the university",
      detail: `The university confirmed these details in writing on ${longDate(confirmedAt!)}.` };
  }
  const expired = until ? ` The university's confirmation of ${longDate(confirmedAt!)} has expired.` : "";
  const checkedAge = now.getTime() - Date.parse(`${record.checkedAt}T00:00:00Z`);
  if (checkedAge <= CHECK_VALID_DAYS * DAY) {
    return { ...base, level: "checked", label: "From the university's website",
      detail: `Taken from the university's official page, last checked on ${longDate(record.checkedAt)}.${expired} Check the page before you apply.` };
  }
  return { ...base, level: "stale", label: "Not checked recently",
    detail: `Last checked on ${longDate(record.checkedAt)}.${expired} Details may have changed; rely on the university's page.` };
}

export interface DocumentNeed { kind: string; need: "required" | "if_applicable"; note: string | null }
export interface StudentDocumentLite { kind: string | null; title: string }

export function documentReadiness(needs: DocumentNeed[], documents: StudentDocumentLite[]) {
  const items = needs.map(n => {
    const matches = documents.filter(d => d.kind === n.kind).map(d => d.title);
    return {
      kind: n.kind, label: DOCUMENT_KINDS[n.kind as DocumentKind] ?? n.kind, need: n.need, note: n.note,
      status: matches.length ? "ready" as const : "missing" as const, documentTitles: matches.slice(0, 3),
    };
  });
  const required = items.filter(i => i.need === "required");
  return { items, requiredCount: required.length, readyCount: required.filter(i => i.status === "ready").length };
}

/**
 * A GPA on a 4.0 scale from the student's profile, or null. Only a clear
 * number with a 4-point scale is used; other scales are never converted.
 */
export function profileGpa(grades: string, gradingScale: string): number | null {
  const scale = gradingScale.toLowerCase();
  if (!/(^|[^0-9.])4(\.0+)?([^0-9]|$)/.test(scale)) return null;
  const match = /\d+(\.\d+)?/.exec(grades.replace(",", "."));
  if (!match) return null;
  const value = Number(match[0]);
  return value > 0 && value <= 4 ? value : null;
}

export type FitStatus = "meets" | "below" | "unknown" | "not_published";
export function academicFit(minimumGpa: number | null, studentGpa: number | null): { status: FitStatus; message: string } {
  if (minimumGpa === null) return { status: "not_published", message: "This programme does not publish a minimum grade. Check the entry requirements." };
  if (studentGpa === null) return { status: "unknown", message: `The published minimum is ${minimumGpa.toFixed(2)} on a 4.0 scale. Add your GPA on a 4.0 scale to your profile to compare.` };
  return studentGpa >= minimumGpa
    ? { status: "meets", message: `Your GPA of ${studentGpa.toFixed(2)} meets the published minimum of ${minimumGpa.toFixed(2)}. Meeting it does not guarantee admission.` }
    : { status: "below", message: `Your GPA of ${studentGpa.toFixed(2)} is below the published minimum of ${minimumGpa.toFixed(2)}. Ask the university whether other qualifications are considered.` };
}

const https = (value: string | null | undefined) => {
  if (!value) return true;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
};

export interface ProgrammeFields {
  tuitionAmount?: number | null; tuitionCurrency?: string | null; tuitionPeriod?: string | null;
  applicationFeeAmount?: number | null; applicationFeeCurrency?: string | null;
  deadlineType: string; deadline?: string | null;
  officialUrl: string; applyUrl?: string | null; sourceUrl: string; checkedAt: string;
  requiredDocuments: DocumentNeed[]; minimumGpa?: number | null;
}

/** Checks that go beyond the request schema. Returns a message for the administrator, or null. */
export function programmeProblem(p: ProgrammeFields, today = new Date().toISOString().slice(0, 10)): string | null {
  if (!https(p.officialUrl) || !https(p.sourceUrl) || !https(p.applyUrl)) return "Links must be https:// addresses.";
  if ((p.tuitionAmount != null) !== !!p.tuitionCurrency || (p.tuitionAmount != null && !p.tuitionPeriod)) return "Give tuition as an amount, a currency and a period, or leave all three empty.";
  if ((p.applicationFeeAmount != null) !== !!p.applicationFeeCurrency) return "Give the application fee with its currency, or leave both empty.";
  if (p.deadlineType === "fixed" && !p.deadline) return "A fixed deadline needs a date.";
  if (p.deadlineType !== "fixed" && p.deadline) return "Only a fixed deadline has a date.";
  if (p.checkedAt > today) return "The checked date cannot be in the future.";
  if (p.minimumGpa != null && (p.minimumGpa <= 0 || p.minimumGpa > 4)) return "The minimum GPA must be on a 4.0 scale.";
  const kinds = p.requiredDocuments.map(d => d.kind);
  if (kinds.some(k => !isDocumentKind(k))) return "Unknown document type.";
  if (new Set(kinds).size !== kinds.length) return "List each document type once.";
  return null;
}
