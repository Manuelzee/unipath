import manifest from "../../data/institution-logo-manifest.json";
import { db, institutionDirectoryTable, institutionLogoAssetsTable } from "@workspace/db";
import { and, eq, ne } from "drizzle-orm";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function importVerifiedLogoManifest(tx: Transaction) {
  if (manifest.format !== "unipath-institution-logos-v1") throw new Error("Invalid logo manifest.");
  type Asset = typeof institutionLogoAssetsTable.$inferInsert;
  type Institution = typeof institutionDirectoryTable.$inferInsert;
  const assets = manifest.assets as (Omit<Asset, "createdAt"> & { createdAt?: string })[];
  const institutions = manifest.institutions as (Partial<Omit<Institution, "logoLastCheckedAt">> & { id: string; logoLastCheckedAt: string })[];
    for (const asset of assets) {
      await tx.insert(institutionLogoAssetsTable).values({ ...asset, createdAt: asset.createdAt ? new Date(asset.createdAt) : new Date() })
        .onConflictDoNothing();
    }
    let imported = 0;
    for (const row of institutions) {
      if (row.logoVerificationStatus !== "verified" || !row.logoAssetHash ||
        !assets.some((asset) => asset.hash === row.logoAssetHash)) throw new Error("Unverified or missing logo asset in manifest.");
      const changed = await tx.update(institutionDirectoryTable).set({
        logoUrl: row.logoUrl, logoSource: row.logoSource, logoIdentitySource: row.logoIdentitySource,
        logoAssetHash: row.logoAssetHash, logoLicenseUrl: row.logoLicenseUrl, logoUsageNote: row.logoUsageNote,
        logoVerificationStatus: "verified", logoLastCheckedAt: new Date(row.logoLastCheckedAt), logoLastError: null,
      }).where(and(eq(institutionDirectoryTable.id, row.id), ne(institutionDirectoryTable.logoVerificationStatus, "verified")))
        .returning({ id: institutionDirectoryTable.id });
      imported += changed.length;
    }
    return { imported, packaged: institutions.length };
}

export async function applyLogoManifest() {
  return db.transaction((tx) => importVerifiedLogoManifest(tx));
}
