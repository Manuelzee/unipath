import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * Password hashing with Node's built-in scrypt (no native add-on to install).
 * Stored format: `scrypt$N$r$p$<salt base64url>$<hash base64url>`, so the cost
 * can be raised later without breaking existing hashes.
 */
const COST = { N: 2 ** 15, r: 8, p: 1 };
const KEY_LENGTH = 32;
const MAX_MEMORY = 96 * 1024 * 1024;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

const derive = (password: string, salt: Buffer, options: ScryptOptions & { N: number }) =>
  new Promise<Buffer>((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, { ...options, maxmem: MAX_MEMORY }, (error, key) => error ? reject(error) : resolve(key));
  });

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, COST);
  return ["scrypt", COST.N, COST.r, COST.p, salt.toString("base64url"), key.toString("base64url")].join("$");
}

/** Constant-time check. A missing hash still costs one derivation, so timing does not reveal which accounts exist. */
export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  const parts = stored?.split("$") ?? [];
  if (parts.length !== 6 || parts[0] !== "scrypt") {
    await derive(password, randomBytes(16), COST);
    return false;
  }
  const [N, r, p] = parts.slice(1, 4).map(Number);
  if (![N, r, p].every(Number.isSafeInteger) || N > 2 ** 20 || r > 32 || p > 16) return false;
  const expected = Buffer.from(parts[5], "base64url");
  const actual = await derive(password, Buffer.from(parts[4], "base64url"), { N, r, p });
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** A short, student-facing reason the password cannot be used, or null. */
export function passwordProblem(password: string, email?: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters for your password.`;
  if (password.length > PASSWORD_MAX_LENGTH) return `Use at most ${PASSWORD_MAX_LENGTH} characters for your password.`;
  if (!password.trim()) return "Your password can’t be only spaces.";
  if (email && password.trim().toLowerCase() === email.toLowerCase()) return "Choose a password that isn’t your email address.";
  if (/^(.)\1+$/.test(password)) return "Choose a password that isn’t one repeated character.";
  return null;
}
