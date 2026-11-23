import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { authUsersTable, db, type AuthUserRecord } from "@workspace/db";

/** The account as the browser may see it: never the password hash or Google id. */
export const publicUser = (user: AuthUserRecord) => ({
  id: user.id,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  emailVerified: !!user.emailVerifiedAt,
  hasPassword: !!user.passwordHash,
  googleConnected: !!user.googleSubject,
  createdAt: user.createdAt.toISOString(),
});

export const newUserId = () => `user_${randomBytes(16).toString("hex")}`;

export async function findUserByEmail(email: string): Promise<AuthUserRecord | undefined> {
  const [user] = await db.select().from(authUsersTable).where(eq(authUsersTable.email, email)).limit(1);
  return user;
}

export async function findUserById(id: string): Promise<AuthUserRecord | undefined> {
  const [user] = await db.select().from(authUsersTable).where(eq(authUsersTable.id, id)).limit(1);
  return user;
}

export async function findUserByGoogleSubject(subject: string): Promise<AuthUserRecord | undefined> {
  const [user] = await db.select().from(authUsersTable).where(eq(authUsersTable.googleSubject, subject)).limit(1);
  return user;
}

/** Postgres unique-constraint violation (two sign-ups racing for one email). */
export function isUniqueViolation(error: unknown): boolean {
  for (let current = error, depth = 0; current && depth < 4; current = (current as { cause?: unknown }).cause, depth++) {
    if ((current as { code?: unknown }).code === "23505") return true;
  }
  return false;
}
