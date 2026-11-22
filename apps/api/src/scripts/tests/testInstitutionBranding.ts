import assert from "node:assert/strict";
import sharp from "sharp";
import { db, pool, institutionDirectoryTable as table } from "@workspace/db";
import { eq, inArray, sql } from "drizzle-orm";
import { curatedColors, curatedMascot, explicitColors, institutionMetadata, metadataMascot, officialHost, sourceFor } from "../../lib/branding/official";
import { officialImage, permittedMediaLicense, prepareBrandingMedia } from "../../lib/branding/media";
import { importVerifiedBrandingManifest } from "../../lib/branding/manifest";
import manifest from "../../data/institution-branding-manifest.json";

async function main() {
  const guide = "<h2>PRIMARY COLORS</h2><p>Our primary colors define the brand.</p><h3>Crimson Flame</h3><p>HEX 9E1B32</p><h2>SECONDARY COLORS</h2><p>Tips for secondary and metallic colors.</p><h3>Pachyderm</h3><p>HEX 5F6A72</p>";
  assert.deepEqual(curatedColors(guide, "Crimson Flame", "Pachyderm"), { primaryColorHex: "#9E1B32", secondaryColorHex: "#5F6A72" });
  assert.equal(curatedColors(guide, "Wrong palette label", "Pachyderm"), null);
  assert.equal(explicitColors("<style>:root{--primary:#FF0000;--secondary:#00FF00}</style><meta name='theme-color' content='#FF0000'>", "Fixture"), null);
  assert.equal(curatedMascot("<p>The official costumed elephant mascot Big Al made his debut.</p>", "Big Al"), "Big Al");
  assert.equal(curatedMascot("<p>The team nickname is Crimson Tide.</p>", "Crimson Tide"), null);
  assert.equal(sourceFor({ id: "nces-100751", ipedsId: 1, website: "https://www.ua.edu/" }), undefined);
  assert.equal(sourceFor({ id: "nces-100751", ipedsId: 100751, website: "https://wrong.example.edu/" }), undefined);
  assert.equal(officialHost("https://brand.ua.edu/colors", "https://www.ua.edu/"), true);
  assert.equal(officialHost("https://ua.edu.attacker.example/colors", "https://www.ua.edu/"), false);
  const organization = { "@type": "CollegeOrUniversity", name: "Parser Test Institution",
    brand: { primaryColor: "#001122", secondaryColor: "#AABBCC" }, mascot: { name: "Named Mascot" } };
  const html = `<script type="application/ld+json">${JSON.stringify(organization)}</script>`;
  assert.ok(explicitColors(html, "Parser Test Institution"));
  assert.equal(institutionMetadata(html, "Different Campus"), null);
  assert.equal(metadataMascot(institutionMetadata(html, "Parser Test Institution")), "Named Mascot");
  for (const license of ["https://creativecommons.org/licenses/by-nc/4.0/", "https://example.edu/all-rights-reserved"]) {
    assert.equal(permittedMediaLicense(license, "true", "Author", ""), false);
  }
  assert.equal(permittedMediaLicense("https://creativecommons.org/licenses/by-sa/4.0/", "true", "", ""), false);
  assert.equal(permittedMediaLicense("https://creativecommons.org/licenses/by-sa/4.0/", "true", "Photographer", ""), true);
  assert.equal(permittedMediaLicense("https://creativecommons.org/licenses/by-sa/4.0/", "true", "Photographer", "trademarked"), false);
  assert.equal(officialImage({ url: "/mascot.png" }, "https://example.edu/brand", "https://example.edu"), null);
  assert.equal(officialImage({ url: "https://unrelated.example/mascot.png", license: "https://creativecommons.org/publicdomain/zero/1.0/" }, "https://example.edu/brand", "https://example.edu"), null);
  const fixture = await sharp({ create: { width: 1800, height: 900, channels: 4, background: { r: 10, g: 20, b: 30, alpha: .5 } } }).png().toBuffer();
  const photo = await prepareBrandingMedia(fixture, "image/png", "campus");
  assert.equal(photo.info.format, "webp"); assert.equal(photo.info.width, 1280); assert.equal(photo.info.height, 640); assert.equal(photo.info.hasAlpha, true);
  await assert.rejects(() => prepareBrandingMedia(Buffer.from('<svg><image href="http://169.254.169.254/"/></svg>'), "image/svg+xml", "campus"));
  await assert.rejects(() => prepareBrandingMedia(Buffer.from('<svg width="100" height="100"><rect style="fill:url(https://example.invalid/external)"/></svg>'), "image/svg+xml", "mascot"));

  const ids = (manifest.institutions as { id: string }[]).map(row => row.id);
  assert.ok(ids.length > 0, "Package actual verified institution facts before publishing.");
  const parents = await db.select().from(table).where(inArray(table.id, ids));
  const [before] = await db.select({ n: sql<number>`count(*)::int` }).from(table);
  await db.transaction(async tx => {
    await tx.execute(sql`CREATE TEMP TABLE institution_directory (LIKE public.institution_directory INCLUDING ALL) ON COMMIT DROP`);
    await tx.execute(sql`CREATE TEMP TABLE institution_logo_assets (LIKE public.institution_logo_assets INCLUDING ALL) ON COMMIT DROP`);
    await tx.insert(table).values(parents.map(row => ({ ...row, colorsVerificationStatus: "not_checked", mascotVerificationStatus: "not_checked", mascotImageVerificationStatus: "not_checked", campusImageVerificationStatus: "not_checked" })));
    const first = await importVerifiedBrandingManifest(tx);
    assert.ok(first.importedGroups >= 2, "Import real colors and mascot facts.");
    assert.equal((await importVerifiedBrandingManifest(tx)).importedGroups, 0);
    await tx.update(table).set({ primaryColorHex: "#010203", colorsVerificationStatus: "verified" }).where(eq(table.id, "nces-100751"));
    await importVerifiedBrandingManifest(tx);
    const [preserved] = await tx.select().from(table).where(eq(table.id, "nces-100751"));
    assert.equal(preserved.primaryColorHex, "#010203");
    await tx.update(table).set({ colorsVerificationStatus: "not_checked", primaryColorHex: null, website: "https://unrelated.example.edu/" }).where(eq(table.id, "nces-100751"));
    await importVerifiedBrandingManifest(tx);
    const [mismatch] = await tx.select().from(table).where(eq(table.id, "nces-100751"));
    assert.equal(mismatch.primaryColorHex, null, "Do not attach branding when stable institution website identity conflicts.");
  });
  const [after] = await db.select({ n: sql<number>`count(*)::int` }).from(table);
  assert.equal(after.n, before.n);
  console.log("PASS: official ID/domain guards, exact palette roles/HEX, mascot versus nickname, explicit media licensing/attribution, unsafe media rejection, responsive image dimensions/transparency, idempotent real-data manifests, existing verified data preserved; no real institutions added or overwritten.");
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Branding tests failed."); process.exitCode = 1; }).finally(() => pool.end());
