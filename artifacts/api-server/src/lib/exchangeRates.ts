import { GetExchangeRateResponse } from "@workspace/api-zod";

// ISO fiat currencies recognized by this runtime. Display preference support
// does not imply that a current reference rate or payment method is available.
export const DISPLAY_CURRENCIES = Intl.supportedValuesOf("currency").filter(c => !["XDR", "XSU"].includes(c));
type Rate = typeof GetExchangeRateResponse._output;
const cache = new Map<string, { value: Rate; expires: number }>();
const pending = new Map<string, Promise<Rate>>();
const SOURCE = "https://frankfurter.dev/";

async function fetchReferenceRate(currency: string): Promise<Rate> {
  const fetchedAt = new Date().toISOString();
  const common = { base: "USD" as const, currency, fetchedAt, sourceUrl: SOURCE };
  if (currency === "USD") return { ...common, rate: 1, asOf: null, status: "identity",
    note: "Original USD amount; no conversion. This is not a checkout quote." };
  try {
    const response = await fetch(`https://api.frankfurter.dev/v2/rate/USD/${currency}`, {
      headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000),
      redirect: "error",
    });
    if (!response.ok) throw new Error("Reference rate unavailable");
    const row = await response.json() as { base?: string; quote?: string; rate?: number; date?: string };
    if (row.base !== "USD" || row.quote !== currency || typeof row.rate !== "number" ||
      !Number.isFinite(row.rate) || row.rate <= 0 || !row.date || !/^\d{4}-\d{2}-\d{2}$/.test(row.date))
      throw new Error("Invalid reference rate");
    const date = Date.parse(`${row.date}T00:00:00Z`);
    const age = Date.now() - date;
    if (!Number.isFinite(date) || age < -86_400_000) throw new Error("Invalid reference date");
    const stale = age > 7 * 86_400_000;
    return { ...common, rate: row.rate, asOf: row.date, status: stale ? "stale" : "available",
      note: stale
        ? "Reference rate is more than seven days old; conversion and budget filtering are unavailable."
        : "Frankfurter blended reference rate from published sources. Indicative only; excludes tax, payment-provider markup and bank fees. Not a checkout quote." };
  } catch {
    return { ...common, rate: null, asOf: null, status: "unavailable",
      note: "The reference rate could not be verified. Original USD prices remain available; no conversion or converted budget filter is applied." };
  }
}

export async function getReferenceRate(currency: string): Promise<Rate> {
  if (!DISPLAY_CURRENCIES.includes(currency)) throw new Error("Unsupported display currency");
  const cached = cache.get(currency);
  if (cached && cached.expires > Date.now()) return cached.value;
  const existing = pending.get(currency);
  if (existing) return existing;
  const request = fetchReferenceRate(currency).then(value => {
    cache.set(currency, { value, expires: Date.now() + (value.status === "unavailable" ? 60_000 : 3_600_000) });
    return value;
  }).finally(() => pending.delete(currency));
  pending.set(currency, request);
  return request;
}
