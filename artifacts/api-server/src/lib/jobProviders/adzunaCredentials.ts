/** Runtime-only access. Never log or return these credential values to clients. */
export function readAdzunaCredentials() {
  return {
    appId: process.env.ADZUNA_APP_ID?.trim() ?? "",
    appKey: process.env.ADZUNA_APP_KEY?.trim() ?? "",
  };
}

/** Safe diagnostics: booleans only, no values, fragments, lengths, or hashes. */
export function auditAdzunaCredentials() {
  const inspect = (value: string | undefined) => {
    const raw = value ?? "";
    const trimmed = raw.trim();
    const quoted = trimmed.length >= 2 &&
      ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
       (trimmed.startsWith("'") && trimmed.endsWith("'")));
    return {
      present: Boolean(trimmed),
      outerWhitespace: raw !== trimmed,
      surroundingQuotes: quoted,
      internalWhitespace: /\s/.test(trimmed),
      includesAssignment: /^(ADZUNA_(APP_ID|APP_KEY)|app_id|app_key)\s*=/i.test(trimmed),
    };
  };
  const { appId, appKey } = readAdzunaCredentials();
  const id = inspect(process.env.ADZUNA_APP_ID);
  const key = inspect(process.env.ADZUNA_APP_KEY);
  const identical = Boolean(appId) && appId === appKey;
  return {
    ADZUNA_APP_ID: id,
    ADZUNA_APP_KEY: key,
    identical,
    usableFormat: id.present && key.present && !identical &&
      !id.surroundingQuotes && !key.surroundingQuotes &&
      !id.internalWhitespace && !key.internalWhitespace &&
      !id.includesAssignment && !key.includesAssignment,
  };
}
