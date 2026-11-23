import { createHash, randomBytes } from "node:crypto";
import type { CookieOptions, Request, RequestHandler, Response } from "express";
import { and, eq, gt, lt, ne } from "drizzle-orm";
import { authCodesTable, authSessionsTable, db } from "@workspace/db";
import { logger } from "../logger";

/**
 * Cookie sessions. The browser keeps a random 256-bit token in an HttpOnly,
 * SameSite=Lax cookie; the database stores only its SHA-256 hash. Sessions
 * last 30 days and slide forward at most once a day while in use.
 */
export type AuthState = { userId: string | null; sessionId: string | null };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set for every API request by `sessionMiddleware`. Read it with `getAuth`. */
      auth?: AuthState;
    }
  }
}

const SESSION_TTL_MS = 30 * 86400_000;
const REFRESH_AFTER_MS = 86400_000;
const signedOut = (): AuthState => ({ userId: null, sessionId: null });
const production = () => process.env.NODE_ENV === "production";

/** `__Host-` binds the cookie to this exact HTTPS origin (no Domain, Path=/). */
export const sessionCookieName = () => production() ? "__Host-unipath_session" : "unipath_session";
export const cookieBase = (): CookieOptions => ({ httpOnly: true, sameSite: "lax", secure: production(), path: "/" });
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index > 0 && part.slice(0, index).trim() === name) {
      try { return decodeURIComponent(part.slice(index + 1).trim()); } catch { return undefined; }
    }
  }
  return undefined;
}

export function getAuth(req: Request): AuthState {
  return req.auth ?? signedOut();
}

/** Signs this browser in as `userId`, replacing any session it already had. */
export async function startSession(req: Request, res: Response, userId: string): Promise<void> {
  const previous = getAuth(req).sessionId;
  if (previous) await db.delete(authSessionsTable).where(eq(authSessionsTable.id, previous));
  const token = randomBytes(32).toString("base64url");
  const id = hashToken(token);
  await db.insert(authSessionsTable).values({ id, userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) });
  res.cookie(sessionCookieName(), token, { ...cookieBase(), maxAge: SESSION_TTL_MS });
  req.auth = { userId, sessionId: id };
  void pruneExpired();
}

export async function endSession(req: Request, res: Response): Promise<void> {
  const { sessionId } = getAuth(req);
  if (sessionId) await db.delete(authSessionsTable).where(eq(authSessionsTable.id, sessionId));
  res.clearCookie(sessionCookieName(), cookieBase());
  req.auth = signedOut();
}

/** Ends every session of `userId` except `keepSessionId` (pass null to end them all). */
export async function endOtherSessions(userId: string, keepSessionId: string | null): Promise<number> {
  const rows = await db.delete(authSessionsTable)
    .where(keepSessionId ? and(eq(authSessionsTable.userId, userId), ne(authSessionsTable.id, keepSessionId)) : eq(authSessionsTable.userId, userId))
    .returning({ id: authSessionsTable.id });
  return rows.length;
}

export const sessionMiddleware: RequestHandler = async (req, res, next) => {
  req.auth = signedOut();
  const token = readCookie(req, sessionCookieName());
  if (!token) { next(); return; }
  try {
    const now = Date.now();
    const [session] = token.length > 100 ? [] : await db.select().from(authSessionsTable)
      .where(and(eq(authSessionsTable.id, hashToken(token)), gt(authSessionsTable.expiresAt, new Date(now)))).limit(1);
    if (!session) {
      res.clearCookie(sessionCookieName(), cookieBase());
      next(); return;
    }
    req.auth = { userId: session.userId, sessionId: session.id };
    if (now - session.lastSeenAt.getTime() > REFRESH_AFTER_MS) {
      await db.update(authSessionsTable).set({ lastSeenAt: new Date(now), expiresAt: new Date(now + SESSION_TTL_MS) })
        .where(eq(authSessionsTable.id, session.id));
      res.cookie(sessionCookieName(), token, { ...cookieBase(), maxAge: SESSION_TTL_MS });
    }
    next();
  } catch (error) { next(error); }
};

let lastPrune = 0;
/** Removes expired sessions and codes, at most once an hour. */
async function pruneExpired() {
  if (Date.now() - lastPrune < 3600_000) return;
  lastPrune = Date.now();
  try {
    const now = new Date();
    await db.delete(authSessionsTable).where(lt(authSessionsTable.expiresAt, now));
    await db.delete(authCodesTable).where(lt(authCodesTable.expiresAt, now));
  } catch {
    logger.warn("Could not remove expired sign-in sessions and codes; will retry later");
  }
}
