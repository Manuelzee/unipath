import { Router } from "express";
import { and, eq, or, sql } from "drizzle-orm";
import { db, institutionDirectoryTable as table, institutionLogoAssetsTable as assets } from "@workspace/db";
import { logoObject } from "../lib/logos/storage";
const router = Router();
router.get("/universities/branding-coverage", async (_req, res) => {
  const [row] = await db.select({
    total: sql<number>`count(*)::int`,
    logos: sql<number>`count(*) FILTER (WHERE logo_verification_status='verified' AND logo_asset_hash IS NOT NULL)::int`,
    colors: sql<number>`count(*) FILTER (WHERE colors_verification_status='verified' AND primary_color_hex IS NOT NULL AND secondary_color_hex IS NOT NULL)::int`,
    mascots: sql<number>`count(*) FILTER (WHERE mascot_verification_status='verified' AND mascot_name IS NOT NULL)::int`,
    mascotImages: sql<number>`count(*) FILTER (WHERE mascot_image_verification_status='verified' AND mascot_image_asset_hash IS NOT NULL AND mascot_verification_status='verified')::int`,
    campusImages: sql<number>`count(*) FILTER (WHERE campus_image_verification_status='verified' AND campus_image_asset_hash IS NOT NULL)::int`,
    attempted: sql<number>`count(*) FILTER (WHERE branding_last_checked_at IS NOT NULL OR colors_verification_status='verified'
      OR mascot_verification_status='verified' OR campus_image_verification_status='verified')::int`,
  }).from(table).where(eq(table.isActive, true));
  res.set("Cache-Control", "no-store").json({ ...row,
    note: "Counts are verified categories, not complete institution branding. Mascot names and image permissions are checked separately. Missing data uses UniPath defaults." });
});
router.get("/institution-branding/images/:file", async (req, res) => {
  const match = /^([a-f0-9]{64})\.webp$/.exec(req.params.file);
  if (!match) { res.status(404).set("Cache-Control", "no-store").end(); return; }
  const hash = match[1];
  const [asset] = await db.select({ objectKey: assets.objectKey }).from(assets).innerJoin(table, or(
    and(eq(table.campusImageAssetHash, assets.hash), eq(table.campusImageVerificationStatus, "verified")),
    and(eq(table.mascotImageAssetHash, assets.hash), eq(table.mascotImageVerificationStatus, "verified"), eq(table.mascotVerificationStatus, "verified")),
  )).where(eq(assets.hash, hash)).limit(1);
  if (!asset) { res.status(404).set("Cache-Control", "no-store").end(); return; }
  const etag = `"${hash}"`;
  res.set({ ETag: etag, "Content-Type": "image/webp", "Cache-Control": "public, max-age=31536000, immutable",
    "Content-Security-Policy": "default-src 'none'", "X-Content-Type-Options": "nosniff" });
  if (req.headers["if-none-match"] === etag) { res.status(304).end(); return; }
  const file = logoObject(asset.objectKey);
  if (!(await file.exists())[0]) { res.status(404).set("Cache-Control", "no-store").end(); return; }
  if (res.destroyed) return;
  const stream = file.createReadStream();
  res.once("close", () => stream.destroy());
  stream.on("error", () => {
    if (res.destroyed) return;
    if (!res.headersSent) res.status(503).set("Cache-Control", "no-store").end(); else res.destroy();
  }).pipe(res);
});
export default router;
