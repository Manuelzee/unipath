/** Never return database messages, SQL, credentials or stack traces to browsers/logs. */
export function publicRequestFailure(error: unknown) {
  let current = error;
  let database = false;
  for (let depth = 0; current && typeof current === "object" && depth < 5; depth++) {
    const item = current as { code?: unknown; cause?: unknown };
    if (typeof item.code === "string" &&
      (/^[0-9A-Z]{5}$/.test(item.code) || ["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "ECONNRESET"].includes(item.code))) {
      database = true;
    }
    current = item.cause;
  }
  return database
    ? { status: 503, code: "DATABASE_UNAVAILABLE", error: "The database could not complete this request. Please try again shortly. This is not a zero-results search." }
    : { status: 500, code: "REQUEST_FAILED", error: "This request could not be completed. Please try again. No search results have been confirmed." };
}
