import { getAuth } from "@clerk/express";
import type { RequestHandler } from "express";
import { db, adminMembershipsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export const runtimeEnvironment = () => process.env.REPLIT_DEPLOYMENT === "1" || process.env.NODE_ENV === "production" ? "production" : "preview";
export function trustedOrigins() {
  const origins = new Set(["https://uni-path-explorer.replit.app"]);
  if (runtimeEnvironment() === "preview" && process.env.REPLIT_DEV_DOMAIN)
    origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
  for (const value of (process.env.UNIPATH_TRUSTED_ORIGINS ?? "").split(",")) {
    try {
      const url = new URL(value.trim());
      if (url.protocol === "https:") origins.add(url.origin);
    } catch { /* Invalid configuration grants no trust. */ }
  }
  return origins;
}
export async function administrator(userId: string, database = db) {
  const [membership] = await database.select().from(adminMembershipsTable).where(eq(adminMembershipsTable.userId, userId));
  return membership?.status === "active";
}
export const requireAdministrator: RequestHandler = async (req, res, next) => {
  try {
    const userId = getAuth(req).userId;
    if (!userId) { res.status(401).json({ error: "Sign in first." }); return; }
    if (!await administrator(userId)) {
      res.status(403).json({ error: "Administrator access is required. Student accounts cannot use this endpoint." }); return;
    }
    res.setHeader("Cache-Control", "no-store");
    next();
  } catch (error) { next(error); }
};
export const requireAdminMutationOrigin: RequestHandler = (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) { next(); return; }
  const origin = req.get("origin");
  if (!origin || !trustedOrigins().has(origin) || req.get("sec-fetch-site") === "cross-site") {
    res.status(403).json({ error: "Administrative changes must originate from the trusted app. No change was made." }); return;
  }
  next();
};
