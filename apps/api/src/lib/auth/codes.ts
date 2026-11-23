import { createHash, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { authCodesTable, db } from "@workspace/db";

/**
 * Six-digit email codes. Only a hash is stored, a new code replaces the
 * previous one, codes expire after 10 minutes, and each code allows at most
 * five tries. The try is counted before the comparison, so parallel guesses
 * cannot get past the limit. Codes confirm a new account's email or reset a
 * password; they never sign anyone in.
 */
export type CodePurpose = "verify_email" | "reset_password";
export type CodeCheck = "ok" | "invalid" | "expired" | "locked";
export const CODE_TTL_SECONDS = 600;
export const MAX_CODE_ATTEMPTS = 5;

const hashCode = (email: string, purpose: CodePurpose, code: string) =>
  createHash("sha256").update(`${purpose}:${email}:${code}`).digest();

export async function issueCode(email: string, purpose: CodePurpose): Promise<string> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.transaction(async tx => {
    await tx.delete(authCodesTable).where(and(eq(authCodesTable.email, email), eq(authCodesTable.purpose, purpose)));
    await tx.insert(authCodesTable).values({
      id: randomUUID(), email, purpose, codeHash: hashCode(email, purpose, code).toString("hex"),
      expiresAt: new Date(Date.now() + CODE_TTL_SECONDS * 1000),
    });
  });
  return code;
}

export async function consumeCode(email: string, purpose: CodePurpose, code: string): Promise<CodeCheck> {
  const [row] = await db.select().from(authCodesTable)
    .where(and(eq(authCodesTable.email, email), eq(authCodesTable.purpose, purpose)))
    .orderBy(desc(authCodesTable.createdAt)).limit(1);
  if (!row) return "invalid";
  const remove = () => db.delete(authCodesTable).where(eq(authCodesTable.id, row.id)).returning({ id: authCodesTable.id });
  if (row.expiresAt.getTime() <= Date.now()) { await remove(); return "expired"; }
  const [claimed] = await db.update(authCodesTable).set({ attempts: sql`${authCodesTable.attempts} + 1` })
    .where(and(eq(authCodesTable.id, row.id), lt(authCodesTable.attempts, MAX_CODE_ATTEMPTS)))
    .returning({ attempts: authCodesTable.attempts });
  if (!claimed) { await remove(); return "locked"; }
  const expected = Buffer.from(row.codeHash, "hex");
  const actual = hashCode(email, purpose, code);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    if (claimed.attempts >= MAX_CODE_ATTEMPTS) { await remove(); return "locked"; }
    return "invalid";
  }
  // Deleting is the claim: of two simultaneous correct submissions only one succeeds.
  return (await remove()).length ? "ok" : "invalid";
}
