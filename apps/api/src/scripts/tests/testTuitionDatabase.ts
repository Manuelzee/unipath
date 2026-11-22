/**
 * Transaction-isolated synthetic school fixtures. Always rolled back; never
 * appear in the app. These checks verify filter arithmetic, not live tuition.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db, institutionDirectoryTable as schools } from "@workspace/db";
import { eq } from "drizzle-orm";
import { searchUniversities } from "../../lib/universities";

const fixture = `tuition-test-${randomUUID()}`;
const rollback = new Error("ROLLBACK_TEST_FIXTURES");
let checks = 0;
try {
  await db.transaction(async tx => {
    const year = new Date().getUTCFullYear() - 1;
    await tx.insert(schools).values([
      { id: `${fixture}-known`, name: `${fixture} Known`, countryCode: "US", country: "United States",
        ipedsId: 900000001, tuitionInStateUsd: 10000, tuitionInStateYear: year,
        tuitionOutOfStateUsd: 25000, tuitionOutOfStateYear: year,
        dataSource: "TRANSACTION TEST FIXTURE", sourceUrl: "https://example.invalid" },
      { id: `${fixture}-unknown`, name: `${fixture} Unknown`, countryCode: "US", country: "United States",
        dataSource: "TRANSACTION TEST FIXTURE", sourceUrl: "https://example.invalid" },
    ]);
    for (const [rate, maximum, expected] of [
      ["in_state", 10000, 1], ["in_state", 9999, 0],
      ["out_of_state", 25000, 1], ["out_of_state", 24999, 0],
      ["international", 1000000, 0], ["out_of_state", 0, 0],
    ] as const) {
      const r = await searchUniversities({ search: fixture, tuitionCurrency: "USD",
        maxAnnualTuition: maximum, tuitionRate: rate }, tx);
      assert.equal(r.total, expected, `${rate} ${maximum}`);
      checks++;
    }
    const unfiltered = await searchUniversities({ search: fixture }, tx);
    assert.equal(unfiltered.total, 2);
    assert.equal(unfiltered.items.find(x => x.id.endsWith("-unknown"))?.tuition?.status, "missing");
    checks++;
    throw rollback;
  });
} catch (error) {
  if (error !== rollback) throw error;
} finally {
  const leftovers = await db.select({ id: schools.id }).from(schools).where(eq(schools.id, `${fixture}-known`));
  assert.equal(leftovers.length, 0, "Test fixtures must not persist");
  await db.$client.end();
}
process.stdout.write(`${checks} database filter checks passed with rolled-back synthetic fixtures; no claim of imported tuition or live school costs.\n`);
