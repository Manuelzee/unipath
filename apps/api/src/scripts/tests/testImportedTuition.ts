/**
 * Verifies authentic bundled source amounts against development DB/API mapping,
 * comparison inputs and live dated FX. Idempotency checks are rolled back.
 * Does not publish, refresh amounts, or change university rows.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { db, institutionDirectoryTable as schools, institutionTuitionTable as tuition } from "@workspace/db";
import { inArray } from "drizzle-orm";
import { applyTuitionManifest, parseTuitionManifest } from "../../lib/tuitionImport";
import { findUniversities, searchUniversities, TuitionRateUnavailable } from "../../lib/universities";
import { getReferenceRate } from "../../lib/exchangeRates";

let checks = 0;
const check = (name: string, fn: () => void) => { fn(); checks++; process.stdout.write(`PASS ${name}\n`); };
const manifests = await Promise.all(["ipeds-2023", "bc-domestic-2025", "bc-international-2025"].map(async name =>
  parseTuitionManifest(JSON.parse(await readFile(new URL(`../../../data/tuition/${name}.json`, import.meta.url), "utf8")))));
const originalFetch = globalThis.fetch;
try {
  const directory = await db.select().from(schools);
  const quotes = await db.select().from(tuition);
  check("authentic imported tuition is present, with complete source provenance", () => {
    assert.ok(quotes.length > 0, "Run loadTuitionSnapshots.ts in development first");
    for (const { manifest, source } of manifests) {
      const imported = quotes.filter(q => q.sourceHash === manifest.sourceHash);
      assert.ok(imported.length > 0, `${manifest.provider} must have imported evidence`);
      for (const q of imported) {
        const school = directory.find(s => s.id === q.institutionId)!;
        const raw = manifest.rows.find(r => r.category === q.category &&
          (source.countryCode === "US" ? r.ipedsId === school.ipedsId : r.name === school.name));
        assert.ok(raw, "Exact official identity and category match required");
        assert.equal(q.amount, raw.amount);
        assert.equal(q.currency, source.currency);
        assert.equal(q.academicYear, source.academicYear);
        assert.equal(q.scope, source.scope);
        assert.equal(q.period, "year");
        assert.equal(q.sourceUrl, source.sourceUrl);
        assert.equal(q.sourceLicenseUrl, source.sourceLicenseUrl);
      }
    }
  });
  const langara = directory.find(s => s.countryCode === "CA" && s.name === "Langara College")!;
  const douglas = directory.find(s => s.countryCode === "CA" && s.name === "Douglas College")!;
  const us = directory.find(s => s.countryCode === "US" && s.ipedsId === 100654)!;
  const result = await findUniversities([langara.id, douglas.id, us.id]);
  check("real comparison records preserve numeric categories, original currency and academic years", () => {
    const l = result.get(langara.id)!.tuition!;
    const d = result.get(douglas.id)!.tuition!;
    const u = result.get(us.id)!.tuition!;
    assert.equal(l.quotes.find(q => q.category === "international")?.amount, 19911);
    assert.equal(d.quotes.find(q => q.category === "international")?.amount, 19875);
    assert.equal(l.quotes.find(q => q.category === "international")!.amount -
      d.quotes.find(q => q.category === "international")!.amount, 36);
    assert.ok(l.quotes.every(q => q.currency === "CAD" && q.academicYear === "2025/26"));
    assert.equal(l.inStateAmount, null);
    assert.equal(l.internationalAmount, null, "USD-only legacy scalars must not relabel CAD");
    assert.equal(u.inStateAmount, 8610);
    assert.equal(u.outOfStateAmount, 17220);
    assert.equal(u.outOfStateAmount! - u.inStateAmount!, 8610);
    assert.equal(u.internationalAmount, null);
    assert.equal(u.status, "outdated");
    assert.ok(u.quotes.every(q => q.academicYear === "2023/24"));
  });
  // Same-currency filtering must work even when network access fails.
  globalThis.fetch = async () => { throw new Error("NETWORK_DISABLED_BY_TEST"); };
  const native = await searchUniversities({ search: "Langara College", tuitionRate: "international", tuitionCurrency: "CAD", maxAnnualTuition: 19911 });
  const belowNative = await searchUniversities({ search: "Langara College", tuitionRate: "international", tuitionCurrency: "CAD", maxAnnualTuition: 19910.99 });
  check("native CAD budget matches at the exact boundary without any FX request", () => {
    assert.equal(native.total, 1); assert.equal(belowNative.total, 0);
  });
  globalThis.fetch = originalFetch;
  const cad = await getReferenceRate("CAD");
  check("live CAD reference rate has a usable value and source date", () => {
    assert.equal(cad.status, "available");
    assert.ok(cad.rate && cad.rate > 0 && cad.asOf);
  });
  const cadRate = cad.rate!;
  const usdCeiling = 19911 / cadRate;
  const converted = await searchUniversities({ search: "Langara College", tuitionRate: "international", tuitionCurrency: "USD", maxAnnualTuition: usdCeiling });
  const belowConverted = await searchUniversities({ search: "Langara College", tuitionRate: "international", tuitionCurrency: "USD", maxAnnualTuition: usdCeiling - 0.01 });
  const usConverted = await searchUniversities({ search: us.name, tuitionRate: "out_of_state", tuitionCurrency: "CAD", maxAnnualTuition: 17220 * cadRate });
  const belowUs = await searchUniversities({ search: us.name, tuitionRate: "out_of_state", tuitionCurrency: "CAD", maxAnnualTuition: 17220 * cadRate - 0.01 });
  check("authentic CAD→USD and USD→CAD budgets include exact ceilings and exclude one cent below", () => {
    assert.equal(converted.total, 1); assert.equal(belowConverted.total, 0);
    assert.equal(usConverted.total, 1); assert.equal(belowUs.total, 0);
  });
  const domestic = result.get(langara.id)!.tuition!.quotes.find(q => q.category === "domestic")!;
  const domesticMatch = await searchUniversities({ search: "Langara College", tuitionRate: "domestic", tuitionCurrency: "CAD", maxAnnualTuition: domestic.amount });
  const intlAtDomesticPrice = await searchUniversities({ search: "Langara College", tuitionRate: "international", tuitionCurrency: "CAD", maxAnnualTuition: domestic.amount });
  const unknownUsIntl = await searchUniversities({ search: us.name, tuitionRate: "international", tuitionCurrency: "USD", maxAnnualTuition: 1e9 });
  const ubc = await searchUniversities({ search: "University of British Columbia", tuitionRate: "international", tuitionCurrency: "CAD", maxAnnualTuition: 1e9 });
  check("domestic is not international; U.S. nonresident and ambiguous campus data stay unknown", () => {
    assert.equal(domesticMatch.total, 1); assert.equal(intlAtDomesticPrice.total, 0);
    assert.equal(unknownUsIntl.total, 0); assert.equal(ubc.total, 0);
  });
  globalThis.fetch = async () => new Response(JSON.stringify({ base: "USD", quote: "CHF", rate: 1, date: "2000-01-01" }),
    { headers: { "Content-Type": "application/json" } });
  await assert.rejects(() => searchUniversities({ search: "Langara College", tuitionRate: "international", tuitionCurrency: "CHF", maxAnnualTuition: 1e9 }), TuitionRateUnavailable);
  check("stale cross rates fail explicitly instead of returning unfiltered or zero-priced schools", () => {});
  globalThis.fetch = originalFetch;
  const rollback = new Error("EXPECTED_ROLLBACK");
  try {
    await db.transaction(async tx => {
      const before = await tx.select().from(tuition).where(inArray(tuition.institutionId, [langara.id, douglas.id]));
      const m = manifests.find(m => m.manifest.provider === "bc-international-2025")!.manifest;
      const report = await applyTuitionManifest({ ...m, rows: m.rows.map(r => ({ ...r, amount: r.amount + 1 })) }, tx);
      assert.equal(report.insertedQuotes, 0);
      const after = await tx.select().from(tuition).where(inArray(tuition.institutionId, [langara.id, douglas.id]));
      assert.deepEqual(after, before, "Existing values and provenance must not be overwritten");
      assert.throws(() => parseTuitionManifest({ ...m, rows: [{ name: langara.name, category: "out_of_state", amount: 10 }] }));
      assert.throws(() => parseTuitionManifest({ ...m, rows: [{ name: langara.name, category: "international", amount: -1 }] }));
      assert.throws(() => parseTuitionManifest({ ...m, rows: [m.rows[0], m.rows[0]] }));
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  check("reimports preserve existing amounts and provenance; invalid files are rejected", () => {});
  process.stdout.write(`${JSON.stringify({ checks, authenticQuotesVerified: quotes.length, cadReferenceDate: cad.asOf,
    cadPerUsd: cadRate, comparison: { langaraCad: 19911, douglasCad: 19875, differenceCad: 36, langaraUsdEstimate: usdCeiling } })}\n`);
} finally {
  globalThis.fetch = originalFetch;
  await db.$client.end();
}
