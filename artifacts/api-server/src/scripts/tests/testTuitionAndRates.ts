/**
 * Isolated synthetic fixtures only: not evidence of imported school prices
 * or successful live currency/provider calls. No database writes.
 */
import assert from "node:assert/strict";
import type { InstitutionDirectoryRecord } from "@workspace/db";
import { universityTuition } from "../../lib/tuition";
import { DISPLAY_CURRENCIES, getReferenceRate } from "../../lib/exchangeRates";
import { ListUniversitiesQueryParams, SaveBudgetSettingsBody } from "@workspace/api-zod";

let passed = 0;
const check = (name: string, fn: () => void) => { fn(); passed++; process.stdout.write(`PASS ${name}\n`); };
const year = new Date().getUTCFullYear();
const fixture = (patch: Partial<InstitutionDirectoryRecord> = {}) => ({
  countryCode: "US", ipedsId: 123456, scorecardId: null, tuitionInStateUsd: null,
  tuitionInStateYear: null, tuitionOutOfStateUsd: null, tuitionOutOfStateYear: null,
  lastUpdatedAt: new Date(), ...patch,
}) as InstitutionDirectoryRecord;

check("missing tuition remains null, not zero", () => {
  const t = universityTuition(fixture());
  assert.equal(t.status, "missing"); assert.equal(t.inStateAmount, null); assert.equal(t.sourceUrl, null);
});
check("zero tuition is a valid source number only with its reporting year", () => {
  const t = universityTuition(fixture({ tuitionInStateUsd: 0, tuitionInStateYear: year }));
  assert.equal(t.inStateAmount, 0); assert.equal(t.status, "source_reported");
});
check("unqualified numbers and non-US rates remain unknown", () => {
  assert.equal(universityTuition(fixture({ tuitionInStateUsd: 5000 })).inStateAmount, null);
  assert.equal(universityTuition(fixture({ countryCode: "CA", tuitionInStateUsd: 5000, tuitionInStateYear: year })).inStateAmount, null);
  assert.equal(universityTuition(fixture({ ipedsId: null, tuitionInStateUsd: 5000, tuitionInStateYear: year })).inStateAmount, null);
});
check("historical years are stale and international is never inferred", () => {
  const t = universityTuition(fixture({ tuitionOutOfStateUsd: 18000, tuitionOutOfStateYear: year - 3 }));
  assert.equal(t.status, "outdated"); assert.equal(t.outOfStateYear, year - 3);
  assert.equal(t.internationalAmount, null); assert.match(t.sourceUrl!, /123456/);
});
check("future years and negative amounts are not displayed", () => {
  assert.equal(universityTuition(fixture({ tuitionInStateUsd: 1000, tuitionInStateYear: year + 1 })).inStateAmount, null);
  assert.equal(universityTuition(fixture({ tuitionInStateUsd: -1, tuitionInStateYear: year })).inStateAmount, null);
});
check("numeric API boundary rejects invalid budgets", () => {
  for (const maxAnnualTuition of ["NaN", "Infinity", "-1", "1000000000001"])
    assert.equal(ListUniversitiesQueryParams.safeParse({ maxAnnualTuition }).success, false);
  assert.equal(ListUniversitiesQueryParams.parse({ maxAnnualTuition: "25000" }).maxAnnualTuition, 25000);
});
check("all requested currencies are in the allowlist", () => {
  for (const c of ["USD", "CAD", "GBP", "EUR", "AUD", "NGN", "INR", "CNY", "AED"])
    assert.ok(DISPLAY_CURRENCIES.includes(c));
});
check("worldwide fiat preference coverage excludes crypto and accounting units", () => {
  assert.ok(DISPLAY_CURRENCIES.length > 100);
  for (const c of ["KES", "ZAR", "BDT", "TRY", "SAR"]) assert.ok(DISPLAY_CURRENCIES.includes(c));
  for (const c of ["BTC", "ETH", "USDC", "USDT", "XDR", "XSU"]) assert.ok(!DISPLAY_CURRENCIES.includes(c));
});
const budget = { budgetChoice: "custom", budgetCurrency: "JPY", budgetScope: "tuition", customBudget: 18500,
  livingExpenses: { accommodation: 12000, food: 0, transport: null } };
check("saved budget and optional living estimates validate", () => {
  assert.equal(SaveBudgetSettingsBody.safeParse(budget).success, true);
});
check("invalid living estimates are rejected at the server boundary", () => {
  for (const accommodation of [-1, Infinity, 1000000001])
    assert.equal(SaveBudgetSettingsBody.safeParse({ ...budget, livingExpenses: { accommodation } }).success, false);
});
check("invalid custom maximum is rejected at the server boundary", () => {
  for (const customBudget of [0, -1, Infinity, 1000000001])
    assert.equal(SaveBudgetSettingsBody.safeParse({ ...budget, customBudget }).success, false);
});

const originalFetch = globalThis.fetch;
let calls = 0;
let output: unknown = {};
let unavailable = false;
globalThis.fetch = async input => {
  calls++;
  assert.match(String(input), /^https:\/\/api\.frankfurter\.dev\/v2\/rate\/USD\/[A-Z]{3}$/);
  if (unavailable) throw new Error("Synthetic network failure");
  return new Response(JSON.stringify(output), { status: 200, headers: { "Content-Type": "application/json" } });
};
try {
  const usd = await getReferenceRate("USD");
  check("USD identity needs no external rate", () => { assert.equal(usd.rate, 1); assert.equal(usd.status, "identity"); assert.equal(calls, 0); });
  output = { base: "USD", quote: "CAD", rate: 1.4, date: new Date().toISOString().slice(0, 10) };
  const cad = await getReferenceRate("CAD");
  check("current matching rate is usable", () => { assert.equal(cad.status, "available"); assert.equal(cad.rate, 1.4); });
  await getReferenceRate("CAD");
  check("successful rates are cached", () => assert.equal(calls, 1));
  output = { base: "USD", quote: "EUR", rate: 0.9, date: "2020-01-01" };
  const stale = await getReferenceRate("EUR");
  check("stale rates are explicitly unusable for filtering", () => assert.equal(stale.status, "stale"));
  output = { base: "EUR", quote: "GBP", rate: 0.9, date: new Date().toISOString().slice(0, 10) };
  const wrong = await getReferenceRate("GBP");
  check("wrong currency base is not accepted", () => { assert.equal(wrong.status, "unavailable"); assert.equal(wrong.rate, null); });
  output = { base: "USD", quote: "NGN", rate: -1, date: new Date().toISOString().slice(0, 10) };
  const negative = await getReferenceRate("NGN");
  check("negative rates are not accepted", () => assert.equal(negative.status, "unavailable"));
  unavailable = true;
  const network = await getReferenceRate("AED");
  check("network failures have no fabricated fallback", () => { assert.equal(network.status, "unavailable"); assert.equal(network.rate, null); assert.doesNotMatch(network.note, /Synthetic/); });
  await assert.rejects(getReferenceRate("ZZZ"));
  passed++;
  process.stdout.write(`PASS unsupported currencies rejected\n${passed} isolated checks passed; fixtures are not live integration evidence.\n`);
} finally { globalThis.fetch = originalFetch; }
