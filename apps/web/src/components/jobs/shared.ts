export const JOB_TYPES: Record<string, string> = {
  on_campus: 'On-campus', part_time: 'Part-time', internship: 'Internship',
  research_assistant: 'Research assistant', teaching_assistant: 'Teaching assistant',
  post_graduation: 'Post-graduation', other: 'Other',
};
export const STATUSES: Record<string, string> = {
  saved: 'Saved', applied: 'Applied', interviewing: 'Interviewing', offer: 'Offer', rejected: 'Rejected', withdrawn: 'Withdrawn',
};
export const SPONSORSHIP: Record<string, string> = {
  not_stated: 'Sponsorship not stated',
  advertised_unverified: 'Sponsorship advertised, unverified',
  advertised_verified_official: 'Sponsorship confirmed on an official page',
  not_offered: 'Sponsorship not offered',
};

export function fmtDate(d?: string | null) {
  if (!d) return '';
  const date = new Date(d.length === 10 ? `${d}T00:00:00` : d);
  return isNaN(date.getTime()) ? d : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function errorMessage(err: unknown, fallback: string) {
  const data = (err as { data?: { error?: unknown } | null } | null)?.data;
  if (data && typeof data.error === 'string') return data.error;
  return fallback;
}
export const ELIGIBILITY: Record<string, string> = {
  unknown: 'Eligibility unknown',
  potentially_eligible_unverified: 'Potentially eligible - authorization still needs verification',
  additional_authorization_required: 'Additional authorization required',
  likely_restricted: 'Likely restricted',
};
