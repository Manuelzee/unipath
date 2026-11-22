import { Router } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db, institutionDirectoryTable, institutionLogoAssetsTable } from "@workspace/db";
import { logoObject } from "../lib/logos/storage";

const router = Router();
router.get("/universities/logo-coverage", async (_req, res) => {
  const rows = await db.select({
    countryCode: institutionDirectoryTable.countryCode, status: institutionDirectoryTable.logoVerificationStatus,
    count: sql<number>`count(*)::int`, lastCheckedAt: sql<string>`max(logo_last_checked_at)`,
  }).from(institutionDirectoryTable).groupBy(institutionDirectoryTable.countryCode, institutionDirectoryTable.logoVerificationStatus);
  res.set("Cache-Control", "no-store").json({ rows, note: "Verified means institution identity and permitted image reuse were checked; not every institution has been checked." });
});
router.get("/institution-logos/:file", async (req, res) => {
  const match = /^([a-f0-9]{64})\.webp$/.exec(req.params.file);
  if (!match) { res.status(404).end(); return; }
  const hash = match[1];
  const [asset] = await db.select({ objectKey: institutionLogoAssetsTable.objectKey })
    .from(institutionLogoAssetsTable).innerJoin(institutionDirectoryTable,
      eq(institutionDirectoryTable.logoAssetHash, institutionLogoAssetsTable.hash))
    .where(and(eq(institutionLogoAssetsTable.hash, hash), eq(institutionDirectoryTable.logoVerificationStatus, "verified"))).limit(1);
  if (!asset) { res.status(404).end(); return; }
  const file = logoObject(asset.objectKey);
  if (!(await file.exists())[0]) { res.status(404).end(); return; }
  res.set({ "Content-Type": "image/webp", "Cache-Control": "public, max-age=31536000, immutable",
    ETag: `"${hash}"`, "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'" });
  if (req.headers["if-none-match"] === `"${hash}"`) { res.status(304).end(); return; }
  if (res.destroyed) return;
  const stream = file.createReadStream();
  stream.on("error", () => {
    if (res.destroyed) return;
    if (!res.headersSent) res.status(503).set("Cache-Control", "no-store").end(); else res.destroy();
  });
  res.once("close", () => stream.destroy());
  stream.pipe(res);
});
export default router;
