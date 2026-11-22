/** Pure helpers for the application workspace (no database access). */

/**
 * Accept only plain web links; anything else (javascript:, data:, credentials)
 * is rejected. Bare domains such as "www.school.edu/apply", common in directory
 * records, are treated as https.
 */
export function safeWebUrl(raw: string | null | undefined): string | null | false {
  if (raw == null) return null;
  const value = raw.trim();
  if (!value) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`);
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) return false;
    return url.href;
  } catch { return false; }
}

/**
 * Common application documents. These are generic reminders, not the
 * institution's verified requirements; the first item says so explicitly.
 */
export const CHECKLIST_ITEMS = [
  "Confirm this program's requirements on the official admissions page",
  "Official transcripts or academic records",
  "Personal statement or admissions essay (if required)",
  "Recommendation letters (if required)",
  "English proficiency test results (if required)",
  "Passport or national ID copy",
  "Application fee or fee waiver (if any)",
];
export const INTERNATIONAL_CHECKLIST_ITEMS = [
  "Proof of funds for a study permit or visa (if required)",
];

export function checklistDueDate(deadline: string | null, today = new Date()) {
  const todayIso = today.toISOString().slice(0, 10);
  if (deadline && deadline >= todayIso) return deadline;
  const later = new Date(today.getTime() + 30 * 86_400_000);
  return later.toISOString().slice(0, 10);
}
