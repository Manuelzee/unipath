import type { ProgrammeSummary } from '@workspace/api-client-react';

export const LEVEL_LABEL: Record<string, string> = {
  bachelor: "Bachelor's", master: "Master's", doctoral: 'PhD / doctorate', diploma: 'Diploma',
  certificate: 'Certificate', foundation: 'Foundation', other: 'Other',
};
export const STUDY_MODE_LABEL: Record<string, string> = { full_time: 'Full time', part_time: 'Part time', online: 'Online', blended: 'Blended' };
const PERIOD_LABEL: Record<string, string> = { year: 'year', semester: 'semester', programme: 'whole programme', credit: 'credit' };

/** Same list as the server (apps/api/src/lib/programmes.ts). */
export const DOCUMENT_KIND_LABEL: Record<string, string> = {
  transcript: 'Transcripts or mark sheets', certificate: 'Diploma or school-leaving certificate', passport: 'Passport',
  english_test: 'English test result', cv: 'CV or résumé', personal_statement: 'Personal statement or motivation letter',
  recommendation: 'Recommendation letter', financial: 'Proof of funds', photo: 'Passport photo', portfolio: 'Portfolio',
  other: 'Other document',
};

export function money(amount: number, currency: string) {
  try { return new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount); }
  catch { return `${currency} ${amount.toLocaleString()}`; }
}

export function tuitionText(p: Pick<ProgrammeSummary, 'tuitionAmount' | 'tuitionCurrency' | 'tuitionPeriod'>) {
  if (p.tuitionAmount == null || !p.tuitionCurrency) return null;
  return `${money(p.tuitionAmount, p.tuitionCurrency)} / ${PERIOD_LABEL[p.tuitionPeriod ?? 'year'] ?? p.tuitionPeriod}`;
}

export const dateText = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export function deadlineText(p: Pick<ProgrammeSummary, 'deadlineType' | 'deadline' | 'deadlineNote'>, today = new Date().toISOString().slice(0, 10)) {
  if (p.deadlineType === 'rolling') return { text: 'Rolling admissions', tone: 'open' as const };
  if (p.deadlineType === 'fixed' && p.deadline) {
    return p.deadline >= today ? { text: `Closes ${dateText(p.deadline)}`, tone: 'open' as const } : { text: `Closed ${dateText(p.deadline)}`, tone: 'closed' as const };
  }
  return { text: 'Not published', tone: 'unknown' as const };
}

export function durationText(months: number | null) {
  if (!months) return null;
  if (months % 12 === 0) return months === 12 ? '1 year' : `${months / 12} years`;
  return months < 12 ? `${months} months` : `${(months / 12).toFixed(1).replace(/\.0$/, '')} years`;
}
