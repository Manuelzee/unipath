/** Input checks for accounts. No database access, so unit tests can use them. */

const EMAIL_PATTERN = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:".]{2,}$/;
/** Trimmed, lower-cased address, or null when it cannot be an email address. */
export function normalizeEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  return email.length <= 254 && EMAIL_PATTERN.test(email) ? email : null;
}

/** Strips control characters and surrounding space; names are at most 60 characters. */
export const cleanName = (value: string | undefined) => (value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 60);

/** A same-site path to return to after signing in; anything else becomes `fallback`. */
export function safeRedirect(value: unknown, fallback = "/dashboard"): string {
  if (typeof value !== "string" || value.length > 500 || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f]/.test(value)) return fallback;
  if (/^\/(sign-in|sign-up|login|register)(\/|\?|$)/.test(value)) return fallback;
  return value;
}
