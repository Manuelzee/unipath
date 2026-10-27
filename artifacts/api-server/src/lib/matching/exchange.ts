import { eq, sql } from "drizzle-orm";
import { db, matchingExchangeRatesTable, type MatchingRate } from "@workspace/db";
import { safeFetch } from "../logos/safeFetch";
import { logger } from "../logger";

const sourceUrl = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
let nextAttempt = 0;
let pending: Promise<void> | null = null;
const current = (date: string) => Date.now() - new Date(date + "T12:00:00Z").getTime() < 7 * 86_400_000;

async function refreshRates() {
  const response = await safeFetch(sourceUrl, 100_000, new Set(["www.ecb.europa.eu"]));
  if (response.status !== 200 || !response.type.includes("xml")) throw new Error("Official exchange-rate feed unavailable.");
  const xml = response.body.toString("utf8");
  const rateDate = /<Cube\s+time=["'](\d{4}-\d{2}-\d{2})["']/.exec(xml)?.[1];
  if (!rateDate || !current(rateDate) || rateDate > new Date().toISOString().slice(0, 10))
    throw new Error("Official exchange rates are outdated.");
  const rows: { currency: string; unitsPerEuro: number; rateDate: string; sourceUrl: string }[] =
    [{ currency: "EUR", unitsPerEuro: 1, rateDate, sourceUrl }];
  for (const [, currency, raw] of xml.matchAll(/<Cube\s+currency=["']([A-Z]{3})["']\s+rate=["']([0-9.]+)["']/g)) {
    const rate = Number(raw);
    if (Number.isFinite(rate) && rate > 0 && Intl.supportedValuesOf("currency").includes(currency))
      rows.push({ currency, unitsPerEuro: rate, rateDate, sourceUrl });
  }
  if (!rows.some(row => row.currency === "USD") || rows.length < 20) throw new Error("Exchange feed incomplete.");
  await db.insert(matchingExchangeRatesTable).values(rows).onConflictDoUpdate({
    target: matchingExchangeRatesTable.currency,
    set: { unitsPerEuro: sql`excluded.units_per_euro`, rateDate: sql`excluded.rate_date`,
      sourceUrl: sql`excluded.source_url`, fetchedAt: new Date() },
    setWhere: sql`excluded.rate_date >= ${matchingExchangeRatesTable.rateDate}`,
  });
}

export async function exchangeAmount(amount: number, from: string, to: string) {
  if (from === to) return { value: amount, rateDate: null, sourceUrl: null };
  if (Date.now() >= nextAttempt && !pending) {
    nextAttempt = Date.now() + 60 * 60_000;
    pending = refreshRates().catch(() => {
      logger.warn("Official exchange feed unavailable; stale rates will not be used");
    }).finally(() => { pending = null; });
  }
  if (pending) await pending;
  const rates = await db.select().from(matchingExchangeRatesTable)
    .where(eq(matchingExchangeRatesTable.currency, from));
  const targets = await db.select().from(matchingExchangeRatesTable)
    .where(eq(matchingExchangeRatesTable.currency, to));
  const a: MatchingRate | undefined = rates[0], b: MatchingRate | undefined = targets[0];
  if (!a || !b || a.rateDate !== b.rateDate || !current(a.rateDate)) return null;
  return { value: amount * b.unitsPerEuro / a.unitsPerEuro, rateDate: a.rateDate, sourceUrl: a.sourceUrl };
}
