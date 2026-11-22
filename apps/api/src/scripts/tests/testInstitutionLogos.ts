import assert from "node:assert/strict";
import { publicAddress } from "../../lib/logos/safeFetch";
import { matchingCatalogRows, officialMetadataCandidate, type CatalogRow } from "../../lib/logos/discovery";
import { prepareLogoImage } from "../../lib/logos/images";
import { importVerifiedLogoManifest } from "../../lib/logos/manifest";
import manifest from "../../data/institution-logo-manifest.json";
import { db, pool, institutionDirectoryTable } from "@workspace/db";
import { eq, inArray, sql } from "drizzle-orm";

async function test() {
  for (const ip of ["127.0.0.1", "10.0.0.1", "169.254.169.254", "192.168.1.1", "::1", "::ffff:127.0.0.1", "fc00::1", "0.0.0.0"]) assert.equal(publicAddress(ip), false, ip);
  assert.equal(publicAddress("208.80.154.224"), true);
  const row: CatalogRow = { item: { value: "https://www.wikidata.org/wiki/Q1" }, ipeds: { value: "123" },
    logo: { value: "http://commons.wikimedia.org/wiki/Special:FilePath/Test.svg" }, website: { value: "https://www.example.edu/" } };
  assert.equal(matchingCatalogRows(123, "https://example.edu", [row]).length, 1);
  assert.equal(matchingCatalogRows(124, "https://example.edu", [row]).length, 0, "Similar name/domain does not replace the exact stable ID check.");
  assert.equal(matchingCatalogRows(123, "https://wrong.example.edu", [row]).length, 0);
  assert.equal(matchingCatalogRows(123, "https://example.edu/another-campus", [row]).length, 0);
  const data = { "@type": "CollegeOrUniversity", name: "Parser Test Institution", logo: {
    "@type": "ImageObject", url: "/official.svg", license: "https://creativecommons.org/publicdomain/zero/1.0/" } };
  const html = `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
  assert.ok(officialMetadataCandidate(html, "Parser Test Institution", "https://example.edu/"));
  assert.equal(officialMetadataCandidate(html, "Different Institution", "https://example.edu/"), null);
  delete (data.logo as { license?: string }).license;
  assert.equal(officialMetadataCandidate(`<script type="application/ld+json">${JSON.stringify(data)}</script>`,
    "Parser Test Institution", "https://example.edu/"), null, "An official website alone is not a reuse license.");
  assert.equal(officialMetadataCandidate('<meta property="og:image" content="https://example.edu/banner.jpg">', "Parser Test Institution", "https://example.edu"), null);
  const image = await prepareLogoImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="180" height="60"><rect width="180" height="60" fill="green"/></svg>'), "image/svg+xml");
  assert.equal(image.info.format, "webp");
  assert.equal(image.info.width, 180);
  for (const unsafe of [
    '<svg><script>alert(1)</script></svg>',
    '<svg><image href="http://169.254.169.254/latest/meta-data"/></svg>',
    '<!DOCTYPE svg [<!ENTITY leak SYSTEM "file:///etc/passwd">]><svg/>',
  ]) await assert.rejects(() => prepareLogoImage(Buffer.from(unsafe), "image/svg+xml"));

  const ids = (manifest.institutions as { id: string }[]).map((record) => record.id);
  assert.ok(ids.length > 0, "Production manifest must include real verified records.");
  const [before] = await db.select({ count: sql<number>`count(*)::int` }).from(institutionDirectoryTable)
    .where(eq(institutionDirectoryTable.logoVerificationStatus, "verified"));
  await db.transaction(async (tx) => {
    await tx.execute(sql`CREATE TEMP TABLE institution_directory (LIKE public.institution_directory INCLUDING ALL) ON COMMIT DROP`);
    await tx.execute(sql`CREATE TEMP TABLE institution_logo_assets (LIKE public.institution_logo_assets INCLUDING ALL) ON COMMIT DROP`);
    const parents = await db.select().from(institutionDirectoryTable).where(inArray(institutionDirectoryTable.id, ids));
    // Real source institutions only. Temporary tables never affect the app's directory.
    await tx.insert(institutionDirectoryTable).values(parents.map((record) => ({ ...record, logoVerificationStatus: "not_checked" })));
    const first = await importVerifiedLogoManifest(tx);
    assert.equal(first.imported, ids.length);
    const second = await importVerifiedLogoManifest(tx);
    assert.equal(second.imported, 0);
    await tx.update(institutionDirectoryTable).set({ logoSource: "https://example.invalid/temporary-preservation-check" })
      .where(eq(institutionDirectoryTable.id, ids[0]));
    await importVerifiedLogoManifest(tx);
    const [preserved] = await tx.select().from(institutionDirectoryTable).where(eq(institutionDirectoryTable.id, ids[0]));
    assert.equal(preserved.logoSource, "https://example.invalid/temporary-preservation-check");
  });
  const [after] = await db.select({ count: sql<number>`count(*)::int` }).from(institutionDirectoryTable)
    .where(eq(institutionDirectoryTable.logoVerificationStatus, "verified"));
  assert.equal(after.count, before.count);
  console.log(`PASS: stable-ID/domain identity, explicit permission, SSRF guards, SVG safety, resize/transparency, and ${ids.length} real manifest logos imported idempotently; verified records preserved; real tables unchanged.`);
}
test().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Logo checks failed."); process.exitCode = 1; }).finally(() => pool.end());
