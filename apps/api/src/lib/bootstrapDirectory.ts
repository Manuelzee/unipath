import { db, institutionDirectoryTable, institutionFactsTable } from "@workspace/db";
import { inArray, sql } from "drizzle-orm";
import { directorySnapshot } from "./directorySnapshot";

type Connection = Pick<typeof db, "select" | "insert" | "execute">;

/** Insert missing public source records only. No DDL, UPDATE, DELETE, network or account-table access. */
export async function reconcileBundledDirectory(connection: Connection) {
  // All autoscale instances share this transaction-level lock.
  await connection.execute(sql`select pg_advisory_xact_lock(740619128)`);
  const { institutions, facts, fingerprint } = directorySnapshot;
  const ids = institutions.map((row) => row.id);
  const factIds = facts.map((row) => row.id);
  const existing = await connection.select({
    id: institutionDirectoryTable.id, ipedsId: institutionDirectoryTable.ipedsId,
    countryCode: institutionDirectoryTable.countryCode, sourceKey: institutionDirectoryTable.sourceKey,
  }).from(institutionDirectoryTable).where(inArray(institutionDirectoryTable.id, ids));
  const byId = new Map(existing.map((row) => [row.id, row]));
  for (const row of institutions) {
    const present = byId.get(row.id);
    if (present && (present.ipedsId !== (row.ipedsId ?? null) ||
      present.countryCode !== row.countryCode || present.sourceKey !== (row.sourceKey ?? null))) {
      throw new Error("An existing institution has a conflicting source identity. Import rolled back; existing data preserved.");
    }
  }
  const existingFacts = await connection.select({
    id: institutionFactsTable.id, institutionId: institutionFactsTable.institutionId,
  }).from(institutionFactsTable).where(inArray(institutionFactsTable.id, factIds));
  const factsById = new Map(existingFacts.map((row) => [row.id, row]));
  if (facts.some((row) => factsById.has(row.id) && factsById.get(row.id)!.institutionId !== row.institutionId)) {
    throw new Error("An existing fact has a conflicting institution identity. Import rolled back.");
  }
  const missing = institutions.filter((row) => !byId.has(row.id));
  const missingFacts = facts.filter((row) => !factsById.has(row.id));
  let imported = 0;
  let factsImported = 0;
  for (let start = 0; start < missing.length; start += 100) {
    const added = await connection.insert(institutionDirectoryTable).values(missing.slice(start, start + 100))
      .onConflictDoNothing().returning({ id: institutionDirectoryTable.id });
    imported += added.length;
  }
  // All parent institutions are inserted before program/fact records.
  for (let start = 0; start < missingFacts.length; start += 100) {
    const added = await connection.insert(institutionFactsTable).values(missingFacts.slice(start, start + 100))
      .onConflictDoNothing().returning({ id: institutionFactsTable.id });
    factsImported += added.length;
  }
  const [verified] = await connection.select({ count: sql<number>`count(*)::int` })
    .from(institutionDirectoryTable).where(inArray(institutionDirectoryTable.id, ids));
  const [verifiedFacts] = await connection.select({ count: sql<number>`count(*)::int` })
    .from(institutionFactsTable).where(inArray(institutionFactsTable.id, factIds));
  if (verified.count !== institutions.length || verifiedFacts.count !== facts.length) {
    throw new Error("Source snapshot count verification failed. Import rolled back; check source-identity conflicts.");
  }
  return { imported, existing: existing.length, factsImported, factsExisting: existingFacts.length,
    verifiedInstitutions: verified.count, verifiedFacts: verifiedFacts.count, fingerprint,
    source: "NCES IPEDS HD2025 and Canadian PSC pilot" };
}

export async function ensureInstitutionDirectory() {
  return db.transaction((tx) => reconcileBundledDirectory(tx));
}

export async function getDirectoryImportStatus() {
  const ids = directorySnapshot.institutions.map((row) => row.id);
  const factIds = directorySnapshot.facts.map((row) => row.id);
  const [[matched], [matchedFacts], [total]] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(institutionDirectoryTable)
      .where(inArray(institutionDirectoryTable.id, ids)),
    db.select({ count: sql<number>`count(*)::int` }).from(institutionFactsTable)
      .where(inArray(institutionFactsTable.id, factIds)),
    db.select({ count: sql<number>`count(*)::int`, lastImportedAt: sql<string>`max(last_updated_at)` })
      .from(institutionDirectoryTable),
  ]);
  return {
    ready: matched.count === ids.length && matchedFacts.count === factIds.length,
    expectedInstitutions: ids.length, presentSnapshotInstitutions: matched.count,
    expectedFacts: factIds.length, presentSnapshotFacts: matchedFacts.count,
    totalInstitutions: total.count, sourceDataUpdatedAt: total.lastImportedAt,
    snapshotFingerprint: directorySnapshot.fingerprint,
    sources: directorySnapshot.sources, exportedAt: directorySnapshot.exportedAt,
  };
}
