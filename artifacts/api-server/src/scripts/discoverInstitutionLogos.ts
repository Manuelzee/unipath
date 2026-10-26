import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, pool, institutionDirectoryTable, institutionLogoAssetsTable } from "@workspace/db";
import { cacheLogo } from "../lib/logos/storage";
import { commonsCandidate, discoverOfficialMetadata, matchingCatalogRows, type CatalogRow, type LogoCandidate } from "../lib/logos/discovery";
import { safeFetch } from "../lib/logos/safeFetch";
import { logoObject } from "../lib/logos/storage";
import { gzipSync } from "node:zlib";
import { prepareLogoImage } from "../lib/logos/images";

const args = process.argv.slice(2);
function option(name: string) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; }
export async function runLogoDiscovery(settings?: { catalog: CatalogRow[]; limit: number }) {
  const catalogPath = option("--catalog");
  const limit = settings?.limit ?? Number(option("--limit") ?? 40);
  if (!Number.isInteger(limit) || limit < 1 || limit > 10000) throw new Error("--limit must be 1–10000.");
  let catalog: CatalogRow[] = settings?.catalog ?? [];
  if (catalogPath && !settings) {
    const file = JSON.parse(await readFile(catalogPath, "utf8"));
    if (file.source !== "https://query.wikidata.org/" || !Array.isArray(file.rows)) throw new Error("Unexpected identity catalog format.");
    catalog = file.rows;
    await writeFile(new URL("../data/logo-identity-catalog.json", import.meta.url), JSON.stringify({
      source: file.source, license: file.license, fetchedAt: file.fetchedAt,
      gzipBase64: gzipSync(Buffer.from(JSON.stringify(catalog))).toString("base64"),
    }) + "\n");
  }
  const pausedUntil = await sourcePausedUntil();
  if (pausedUntil && pausedUntil.getTime() > Date.now()) {
    if (!settings) await exportLogoManifest();
    const report = { checked: 0, verifiedNow: 0, sourcePausedUntil: pausedUntil.toISOString(), reason: "Respecting source HTTP 429 cooldown." };
    console.log(JSON.stringify(report));
    return report;
  }
  const schools = await db.select().from(institutionDirectoryTable).where(eq(institutionDirectoryTable.isActive, true))
    .orderBy(asc(institutionDirectoryTable.id));
  const id = settings ? undefined : option("--id");
  const candidates = schools.filter((school) => (!id || school.id === id) &&
    ((!settings && args.includes("--recheck")) || !school.logoLastCheckedAt ||
      Date.now() - school.logoLastCheckedAt.getTime() > (school.logoVerificationStatus === "error" ? 1 : 30) * 86400_000))
    .sort((a, b) => Number(matchingCatalogRows(b.ipedsId, b.website, catalog).length === 1) -
      Number(matchingCatalogRows(a.ipedsId, a.website, catalog).length === 1)).slice(0, limit);
  let verifiedNow = 0;
  let checked = 0;
  const outcomes: Record<string, number> = {};
  for (const school of candidates) {
    checked++;
    let status = "not_found";
    try {
      if (!school.website) status = "missing_website";
      else {
        const matches = matchingCatalogRows(school.ipedsId, school.website, catalog);
        let candidate: LogoCandidate | null = null;
        if (matches.length === 1) {
          candidate = await commonsCandidate(matches[0]);
          if (!candidate) status = "review_required";
        } else if (matches.length > 1) status = "review_required";
        else candidate = await discoverOfficialMetadata(school.name, school.website);
        if (candidate) {
          const [stored] = await db.select().from(institutionLogoAssetsTable)
            .where(eq(institutionLogoAssetsTable.sourceUrl, candidate.imageUrl)).limit(1);
          const cached = stored && (await logoObject(stored.objectKey).exists())[0] ? stored : undefined;
          let asset = cached;
          if (!asset) {
            const host = new URL(candidate.imageUrl).hostname;
            const response = await safeFetch(candidate.imageUrl, 3_000_000, new Set([host]));
            if (response.status !== 200) throw new Error(`Logo image could not be retrieved: HTTP ${response.status}.`);
            const result = await prepareLogoImage(response.body, response.type);
            const hash = createHash("sha256").update(result.data).digest("hex");
            const objectKey = `institution-logos/${hash}.webp`;
            await cacheLogo(objectKey, result.data);
            const row = { hash, objectKey, contentType: "image/webp", width: result.info.width, height: result.info.height,
              byteSize: result.data.length, sourceUrl: candidate.imageUrl, licenseUrl: candidate.licenseUrl, credit: candidate.credit };
            await db.insert(institutionLogoAssetsTable).values(row).onConflictDoNothing();
            [asset] = await db.select().from(institutionLogoAssetsTable).where(eq(institutionLogoAssetsTable.hash, hash));
          }
          // A discovery failure never demotes or replaces an already verified logo.
          const changed = await db.update(institutionDirectoryTable).set({
            logoUrl: candidate.imageUrl, logoSource: candidate.sourceUrl, logoIdentitySource: candidate.identitySource,
            logoLicenseUrl: candidate.licenseUrl, logoUsageNote: candidate.usageNote, logoAssetHash: asset.hash,
            logoVerificationStatus: "verified", logoLastCheckedAt: new Date(), logoLastError: null,
          }).where(and(eq(institutionDirectoryTable.id, school.id),
            sql`${institutionDirectoryTable.logoVerificationStatus} <> 'verified'`)).returning({ id: institutionDirectoryTable.id });
          if (!changed.length) await db.update(institutionDirectoryTable).set({ logoLastCheckedAt: new Date(), logoLastError: null })
            .where(eq(institutionDirectoryTable.id, school.id));
          verifiedNow += changed.length;
          status = "verified";
        }
      }
      if (status !== "verified") await db.update(institutionDirectoryTable).set({
        logoLastCheckedAt: new Date(), logoLastError: status === "review_required" ? "Identity or permitted reuse needs review; image not assigned." : null,
        ...(school.logoVerificationStatus !== "verified" ? { logoVerificationStatus: status } : {}),
      }).where(eq(institutionDirectoryTable.id, school.id));
    } catch (error) {
      status = "error";
      const message = error instanceof Error && /^(Source |Logo |Authorized image |Private network |Unsafe |SVG )/.test(error.message)
        ? error.message.slice(0, 160) : "Image validation or storage failed; details withheld.";
      console.log(JSON.stringify({ id: school.id, error: message }));
      await db.update(institutionDirectoryTable).set({
        logoLastCheckedAt: new Date(), logoLastError: message,
        ...(school.logoVerificationStatus !== "verified" ? { logoVerificationStatus: "error" } : {}),
      }).where(eq(institutionDirectoryTable.id, school.id));
      if (message.includes("HTTP 429")) {
        outcomes.error = (outcomes.error ?? 0) + 1;
        console.log("Source rate limit reached; batch stopped. Retry later without bypassing source restrictions.");
        break;
      }
    }
    outcomes[status] = (outcomes[status] ?? 0) + 1;
    console.log(`${school.id}: ${status}`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!settings) await exportLogoManifest();
  const [total] = await db.select({ count: sql<number>`count(*)::int` }).from(institutionDirectoryTable)
    .where(eq(institutionDirectoryTable.logoVerificationStatus, "verified"));
  const report = { checked, verifiedNow, verifiedTotal: total.count, outcomes, notCheckedThisRun: schools.length - checked };
  console.log(JSON.stringify(report));
  return report;
}

export async function exportLogoManifest() {
  const verified = await db.select().from(institutionDirectoryTable).where(eq(institutionDirectoryTable.logoVerificationStatus, "verified"));
  const hashes = [...new Set(verified.flatMap((row) => row.logoAssetHash ? [row.logoAssetHash] : []))];
  const assets = hashes.length ? await db.select().from(institutionLogoAssetsTable).where(inArray(institutionLogoAssetsTable.hash, hashes)) : [];
  const institutions = verified.map((row) => ({
    id: row.id, logoUrl: row.logoUrl, logoSource: row.logoSource, logoIdentitySource: row.logoIdentitySource,
    logoAssetHash: row.logoAssetHash, logoLicenseUrl: row.logoLicenseUrl, logoUsageNote: row.logoUsageNote,
    logoVerificationStatus: "verified", logoLastCheckedAt: row.logoLastCheckedAt,
  }));
  await writeFile(new URL("../data/institution-logo-manifest.json", import.meta.url),
    JSON.stringify({ format: "unipath-institution-logos-v1", exportedAt: new Date().toISOString(), sourcePausedUntil: await sourcePausedUntil(), institutions, assets }, null, 2) + "\n");
}

async function sourcePausedUntil() {
  const [recent] = await db.select({ checked: sql<Date>`max(logo_last_checked_at)` })
    .from(institutionDirectoryTable).where(sql`${institutionDirectoryTable.logoLastError} LIKE '%HTTP 429%'`);
  return recent.checked ? new Date(new Date(recent.checked).getTime() + 60 * 60_000) : null;
}

// The reusable worker is also bundled into index.mjs; only execute/close the pool for this CLI.
if (process.argv[1]?.replace(/\\/g, "/").endsWith("/discoverInstitutionLogos.ts")) {
  runLogoDiscovery().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Logo discovery failed."); process.exitCode = 1; })
    .finally(() => pool.end());
}
