import assert from "node:assert/strict";
import { db, pool, institutionDirectoryTable, institutionFactsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { reconcileBundledDirectory } from "../../lib/bootstrapDirectory";
import { directorySnapshot } from "../../lib/directorySnapshot";
import { publicRequestFailure } from "../../lib/requestErrors";

async function test() {
  const [before] = await db.select({ count: sql<number>`count(*)::int` }).from(institutionDirectoryTable);
  const [factsBefore] = await db.select({ count: sql<number>`count(*)::int` }).from(institutionFactsTable);
  await db.transaction(async (tx) => {
    // Temporary tables shadow the public directory on this connection only.
    await tx.execute(sql`CREATE TEMP TABLE institution_directory (LIKE public.institution_directory INCLUDING ALL) ON COMMIT DROP`);
    await tx.execute(sql`CREATE TEMP TABLE institution_facts (LIKE public.institution_facts INCLUDING ALL) ON COMMIT DROP`);
    const first = await reconcileBundledDirectory(tx);
    assert.equal(first.imported, 6174);
    assert.equal(first.factsImported, 5573);
    const second = await reconcileBundledDirectory(tx);
    assert.equal(second.imported, 0);
    assert.equal(second.factsImported, 0);
    const [us] = await tx.select({ count: sql<number>`count(*)::int` }).from(institutionDirectoryTable)
      .where(eq(institutionDirectoryTable.countryCode, "US"));
    const [ca] = await tx.select({ count: sql<number>`count(*)::int` }).from(institutionDirectoryTable)
      .where(eq(institutionDirectoryTable.countryCode, "CA"));
    assert.equal(us.count, 5913);
    assert.equal(ca.count, 258);
    const [duplicates] = await tx.select({ count: sql<number>`count(*) - count(distinct ipeds_id)` })
      .from(institutionDirectoryTable).where(sql`ipeds_id IS NOT NULL`);
    assert.equal(Number(duplicates.count), 0);
    // Exercise a partially populated database and preservation of existing enrichment.
    const ipeds = directorySnapshot.institutions.filter((row) => row.ipedsId);
    const markerId = ipeds[1].id;
    await tx.update(institutionDirectoryTable).set({ dataSource: "Temporary preservation test marker" })
      .where(eq(institutionDirectoryTable.id, markerId));
    await tx.delete(institutionDirectoryTable).where(eq(institutionDirectoryTable.id, ipeds[0].id));
    await tx.delete(institutionFactsTable).where(eq(institutionFactsTable.id, directorySnapshot.facts[0].id));
    const repaired = await reconcileBundledDirectory(tx);
    assert.equal(repaired.imported, 1);
    assert.equal(repaired.factsImported, 1);
    const [preserved] = await tx.select().from(institutionDirectoryTable)
      .where(eq(institutionDirectoryTable.id, markerId));
    assert.equal(preserved.dataSource, "Temporary preservation test marker");
    // Match the observed production state: IPEDS present, Canadian pilot absent.
    await tx.delete(institutionFactsTable);
    await tx.delete(institutionDirectoryTable).where(eq(institutionDirectoryTable.countryCode, "CA"));
    const productionLike = await reconcileBundledDirectory(tx);
    assert.equal(productionLike.imported, 258);
    assert.equal(productionLike.factsImported, 5573);
    const rerun = await reconcileBundledDirectory(tx);
    assert.equal(rerun.imported, 0);
    assert.equal(rerun.factsImported, 0);
  });
  const [after] = await db.select({ count: sql<number>`count(*)::int` }).from(institutionDirectoryTable);
  const [factsAfter] = await db.select({ count: sql<number>`count(*)::int` }).from(institutionFactsTable);
  assert.equal(after.count, before.count);
  assert.equal(factsAfter.count, factsBefore.count);
  const failure = publicRequestFailure(new Error("DO_NOT_EXPOSE_PRIVATE_DETAILS", { cause: { code: "ECONNREFUSED" } }));
  assert.equal(failure.status, 503);
  assert.equal(failure.code, "DATABASE_UNAVAILABLE");
  assert.ok(!JSON.stringify(failure).includes("DO_NOT_EXPOSE"));
  assert.equal(publicRequestFailure(new Error("DO_NOT_EXPOSE")).status, 500);
  console.log(`PASS: ${directorySnapshot.institutions.length} real institutions + ${directorySnapshot.facts.length} program records imported in isolated temporary tables; repeat inserted 0; partial recovery and preservation passed; real tables unchanged.`);
}
test().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Directory bootstrap verification failed.");
  process.exitCode = 1;
}).finally(() => pool.end());
