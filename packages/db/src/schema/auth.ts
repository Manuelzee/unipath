import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * UniPath's own accounts. Every student record elsewhere refers to `id`
 * through its `user_id` column. Emails are stored trimmed and lower-cased.
 * `passwordHash` is null for accounts that only use Google or email codes.
 */
export const authUsersTable = pgTable("auth_users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  /** Set once the owner of the address proves it (code, or a Google-verified email). */
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  /** scrypt; format documented in apps/api/src/lib/auth/password.ts. */
  passwordHash: text("password_hash"),
  firstName: text("first_name").notNull().default(""),
  lastName: text("last_name").notNull().default(""),
  /** Google's stable account id (`sub`), when Google sign-in is linked. */
  googleSubject: text("google_subject").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Signed-in browser sessions. The browser holds a random token in an HttpOnly
 * cookie; only its SHA-256 hash is stored, so a database copy cannot be used
 * to sign in.
 */
export const authSessionsTable = pgTable("auth_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => authUsersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index("auth_sessions_user_idx").on(table.userId),
  index("auth_sessions_expires_idx").on(table.expiresAt),
]);

/**
 * One-time email codes for verifying an address, passwordless sign-in and
 * password resets. Only a hash of the code is stored; at most one live code
 * exists per email and purpose, and it stops working after a few wrong tries.
 */
export const authCodesTable = pgTable("auth_codes", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  purpose: text("purpose").notNull(),
  codeHash: text("code_hash").notNull(),
  attempts: integer("attempts").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index("auth_codes_email_purpose_idx").on(table.email, table.purpose),
]);

export type AuthUserRecord = typeof authUsersTable.$inferSelect;
