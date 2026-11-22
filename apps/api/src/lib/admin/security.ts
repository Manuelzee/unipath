import { getAuth } from "@clerk/express";
import type { RequestHandler } from "express";
import { db, adminMembershipsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export const runtimeEnvironment = () => process.env.NODE_ENV === "production" ? "production" : "development";

/**
 * Browser origins allowed to call the API with credentials and to make admin
 * changes. Production: APP_ORIGIN plus UNIPATH_TRUSTED_ORIGINS, HTTPS only.
 * Development additionally trusts the local web and API servers.
 */
export function trustedOrigins() {
  const production = runtimeEnvironment() === "production";
  const origins = new Set<string>();
  const add = (value: string) => {
    try {
      const url = new URL(value.trim());
      const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
      if (url.protocol === "https:" || (!production && local && url.protocol === "http:")) origins.add(url.origin);
    } catch { /* Invalid configuration grants no trust. */ }
  };
  for (const value of [process.env.APP_ORIGIN ?? "", ...(process.env.UNIPATH_TRUSTED_ORIGINS ?? "").split(",")]) if (value) add(value);
  if (!production) {
    for (const port of [process.env.WEB_PORT || "5173", process.env.PORT || "8080"]) {
      add(`http://localhost:${port}`);
      add(`http://127.0.0.1:${port}`);
    }
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
