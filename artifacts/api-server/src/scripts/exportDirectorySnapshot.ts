/** Exports public source data only. Never reads accounts, saved schools or sessions. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { db, pool, institutionDirectoryTable, institutionFactsTable } from "@workspace/db";
import { asc } from "drizzle-orm";

async function main() {
  const provenance = JSON.parse(await readFile(new URL("../data/ipeds-provenance.json", import.meta.url), "utf8"));
  const rawIpeds = await readFile(new URL("../data/us-colleges-2025.json", import.meta.url));
  if (createHash("sha256").update(rawIpeds).digest("hex") !== provenance.bundledSha256 ||
    !provenance.identityAndCoreFieldsMatch || !provenance.sourceWebsiteLinksMatch) {
    throw new Error("Re-run official IPEDS provenance verification before exporting.");
  }
  const canada = JSON.parse(await readFile(new URL("../../../../generated-artifacts/canada-psc.json", import.meta.url), "utf8"));
  const ipeds = JSON.parse(rawIpeds.toString()) as { unitid: string; name: string; city: string; state: string }[];
  const expected = new Map<string, { name: string; city: string; state: string }>([
    ...ipeds.map((row) => [`nces-${row.unitid}`, row] as const),
    ...canada.institutions.map((row: { id: string; name: string; city: string; state: string }) => [row.id, row] as const),
  ]);
  const rows = await db.transaction(async (tx) => {
    // Capture both public tables from one consistent database view.
    await tx.execute((await import("drizzle-orm")).sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`);
    return {
      institutions: await tx.select().from(institutionDirectoryTable).orderBy(asc(institutionDirectoryTable.id)),
      facts: await tx.select().from(institutionFactsTable).orderBy(asc(institutionFactsTable.id)),
    };
  });
  if (rows.institutions.length !== expected.size) throw new Error("Preview contains institutions outside the verified source sets.");
  for (const row of rows.institutions) {
    const source = expected.get(row.id);
    if (!source || source.name !== row.name || source.city !== row.city || source.state !== row.state) {
      throw new Error("Preview institution does not match its source identity; export stopped.");
    }
  }
  const expectedFacts = new Set(canada.facts.map((row: { id: string }) => row.id));
  if (rows.facts.length !== expectedFacts.size || rows.facts.some((row) => !expectedFacts.has(row.id))) {
    throw new Error("Preview program records do not match the reviewed Canadian source set.");
  }
  // Omitted nulls and empty arrays have identical database defaults and compress better.
  const sparse = (row: object) => Object.fromEntries(Object.entries(row).filter(([, value]) =>
    value !== null && !(Array.isArray(value) && value.length === 0)));
  const countries: Record<string, number> = {};
  for (const row of rows.institutions) countries[row.countryCode] = (countries[row.countryCode] ?? 0) + 1;
  const snapshot = {
    format: "unipath-directory-snapshot-v1", exportedAt: new Date().toISOString(),
    institutions: rows.institutions.map(sparse), facts: rows.facts.map(sparse),
    sources: [provenance, {
      source: "Government of Canada Public Service Commission program-list pilot",
      sourceUrl: canada.sourceUrl, sourceDate: canada.sourceDate, sourceLicenseUrl: canada.sourceLicenseUrl,
      scope: "Limited co-op/internship listing; not a national accreditation or DLI register.",
    }],
  };
  const bytes = Buffer.from(JSON.stringify(snapshot));
  const bundled = {
    format: "unipath-directory-snapshot-bundle-v1",
    sha256: createHash("sha256").update(bytes).digest("hex"),
    counts: { institutions: rows.institutions.length, facts: rows.facts.length, countries },
    gzipBase64: gzipSync(bytes, { level: 9 }).toString("base64"),
  };
  const output = JSON.stringify(bundled);
  if (Buffer.byteLength(output) > 1_000_000) throw new Error("Snapshot exceeds the small bundled-data limit; use durable asset storage instead.");
  await writeFile(new URL("../data/directory-seed.json", import.meta.url), output + "\n");
  console.log(JSON.stringify({ ...bundled.counts, bytes: Buffer.byteLength(output), sha256: bundled.sha256 }));
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Snapshot export failed.");
  process.exitCode = 1;
}).finally(() => pool.end());
