import { writeFile } from "node:fs/promises";
import { and, eq, inArray, ne, or, sql } from "drizzle-orm";
import { db, institutionDirectoryTable as table, institutionLogoAssetsTable, type InstitutionDirectoryRecord } from "@workspace/db";
import manifest from "../../data/institution-branding-manifest.json";
import { imageSourcesPausedUntil } from "./media";
import { validHex } from "./official";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
const groups = [
  { status: "colorsVerificationStatus", keys: ["primaryColorHex", "secondaryColorHex", "colorsSourceUrl", "colorsUsageNote", "colorsVerificationStatus", "colorsLastVerifiedAt"] },
  { status: "mascotVerificationStatus", keys: ["mascotName", "mascotSourceUrl", "mascotVerificationStatus", "mascotLastVerifiedAt"] },
  { status: "mascotImageVerificationStatus", keys: ["mascotImageUrl", "mascotImageAssetHash", "mascotImageSourceUrl", "mascotImageLicenseUrl", "mascotImageCredit", "mascotImageVerificationStatus"] },
  { status: "campusImageVerificationStatus", keys: ["campusImageUrl", "campusImageAssetHash", "campusImageSourceUrl", "campusImageLicenseUrl", "campusImageCredit", "campusImageVerificationStatus", "campusImageLastVerifiedAt"] },
] as const;
export async function refreshBrandingStatus() {
  await db.execute(sql`UPDATE institution_directory SET
    logo_source_url = COALESCE(logo_source_url, logo_source),
    branding_verification_status = CASE
      WHEN logo_verification_status='verified' AND colors_verification_status='verified'
        AND mascot_verification_status='verified' AND campus_image_verification_status='verified'
        AND mascot_image_verification_status='verified' THEN 'verified'
      WHEN logo_verification_status='verified' OR colors_verification_status='verified'
        OR mascot_verification_status='verified' OR campus_image_verification_status='verified' THEN 'partial'
      WHEN branding_last_checked_at IS NOT NULL THEN 'unavailable' ELSE 'not_checked' END
    WHERE logo_source_url IS DISTINCT FROM COALESCE(logo_source_url,logo_source) OR branding_verification_status IS DISTINCT FROM
      CASE WHEN logo_verification_status='verified' AND colors_verification_status='verified'
        AND mascot_verification_status='verified' AND campus_image_verification_status='verified'
        AND mascot_image_verification_status='verified' THEN 'verified'
      WHEN logo_verification_status='verified' OR colors_verification_status='verified'
        OR mascot_verification_status='verified' OR campus_image_verification_status='verified' THEN 'partial'
      WHEN branding_last_checked_at IS NOT NULL THEN 'unavailable' ELSE 'not_checked' END`);
}
export async function importVerifiedBrandingManifest(tx: Transaction) {
  if (manifest.format !== "unipath-branding-v1") throw new Error("Invalid institution branding manifest.");
  const assets = manifest.assets as unknown as (typeof institutionLogoAssetsTable.$inferInsert)[];
  if (assets.some(asset => !/^[a-f0-9]{64}$/.test(asset.hash) || !/^institution-(?:logos|branding)\/[a-f0-9]{64}\.webp$/.test(asset.objectKey))) {
    throw new Error("Invalid institution branding asset.");
  }
  if (assets.length) await tx.insert(institutionLogoAssetsTable).values(assets.map(asset => ({ ...asset, createdAt: asset.createdAt ? new Date(String(asset.createdAt)) : new Date() }))).onConflictDoNothing();
  let imported = 0;
  for (const row of manifest.institutions as unknown as InstitutionDirectoryRecord[]) {
    if (!row.website) throw new Error("Verified branding requires a stable official institution identity.");
    for (const group of groups) {
      if (row[group.status] !== "verified") continue;
      if (group.status === "colorsVerificationStatus" && (!validHex(row.primaryColorHex) || !validHex(row.secondaryColorHex) || !row.colorsSourceUrl)) throw new Error("Invalid verified colors.");
      if (group.status === "mascotVerificationStatus" && (!row.mascotName || !row.mascotSourceUrl)) throw new Error("Invalid verified mascot.");
      if (group.status === "campusImageVerificationStatus" || group.status === "mascotImageVerificationStatus") {
        if (group.status === "mascotImageVerificationStatus" && (row.mascotVerificationStatus !== "verified" || !row.mascotName)) throw new Error("A mascot image requires a verified mascot identity.");
        const prefix = group.status === "campusImageVerificationStatus" ? "campusImage" : "mascotImage";
        if (!assets.some(asset => asset.hash === row[`${prefix}AssetHash`]) || !row[`${prefix}SourceUrl`] || !row[`${prefix}LicenseUrl`]) throw new Error("Missing licensed branding asset.");
      }
      const data = Object.fromEntries(group.keys.map(key => [key, key.endsWith("At") && row[key] ? new Date(String(row[key])) : row[key]]));
      const verifiedAt = row.brandingLastVerifiedAt ? new Date(String(row.brandingLastVerifiedAt)).toISOString() : null;
      const result = await tx.update(table).set({ ...data, brandingLastVerifiedAt: sql`greatest(${table.brandingLastVerifiedAt}, ${verifiedAt}::timestamptz)` })
        .where(and(eq(table.id, row.id), eq(table.website, row.website),
          row.ipedsId ? eq(table.ipedsId, row.ipedsId) : undefined, ne(table[group.status], "verified"))).returning({ id: table.id });
      imported += result.length;
    }
  }
  return { importedGroups: imported, packagedInstitutions: manifest.institutions.length };
}
export async function applyBrandingManifest() {
  const report = await db.transaction(tx => importVerifiedBrandingManifest(tx));
  await refreshBrandingStatus();
  return report;
}
export async function exportBrandingManifest() {
  const records = await db.select().from(table).where(or(...groups.map(group => eq(table[group.status], "verified"))));
  const hashes = [...new Set(records.flatMap(row => [row.mascotImageAssetHash, row.campusImageAssetHash]).filter((value): value is string => !!value))];
  const assets = hashes.length ? await db.select().from(institutionLogoAssetsTable).where(inArray(institutionLogoAssetsTable.hash, hashes)) : [];
  const keys = [...new Set(groups.flatMap(group => [...group.keys]))];
  const institutions = records.map(row => ({ id: row.id, website: row.website, ipedsId: row.ipedsId,
    brandingLastVerifiedAt: row.brandingLastVerifiedAt, ...Object.fromEntries(keys.map(key => [key, row[key]])) }));
  await writeFile(new URL("../../data/institution-branding-manifest.json", import.meta.url),
    JSON.stringify({ format: "unipath-branding-v1", exportedAt: new Date().toISOString(),
      sourcePausedUntil: await imageSourcesPausedUntil(), institutions, assets }, null, 2) + "\n");
  return { institutions: institutions.length, assets: assets.length };
}
