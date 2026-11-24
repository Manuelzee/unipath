/** Chat helpers with no database access, so unit tests can use them. */

/** How an author is shown: first name and last initial, never the email address. */
export function chatName(firstName: string | null | undefined, lastName: string | null | undefined): string {
  const first = (firstName ?? "").trim();
  const last = (lastName ?? "").trim();
  if (!first) return "Student";
  return last ? `${first} ${last[0].toUpperCase()}.` : first;
}

/**
 * Normalizes line breaks, removes control characters and text-direction
 * overrides (which can disguise text), and collapses runs of blank lines.
 * Returns "" when nothing readable is left.
 */
export function cleanChatMessage(value: string, maxLength = 1000): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f‪-‮⁦-⁩]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxLength);
}

/** A one-line title: control characters and runs of spaces become single spaces. */
export function cleanTitle(value: string, maxLength = 120): string {
  return value.replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}
