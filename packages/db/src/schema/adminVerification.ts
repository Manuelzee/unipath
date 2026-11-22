import { pgTable, text, timestamp, jsonb, primaryKey, index } from "drizzle-orm/pg-core";
import { institutionDirectoryTable } from "./institutionDirectory";

export type SourceCheck = {
  fieldKey: string; title: string; value: string; status: string;
  sourceUrl: string | null; checkedAt: string | null; message: string;
};
// No public email matching or automatic first-user promotion.
export const adminMembershipsTable = pgTable("admin_memberships", {
  userId: text("user_id").primaryKey(),
  status: text("status").notNull(),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  grantSource: text("grant_source").notNull(),
});
export const verificationJobsTable = pgTable("institution_verification_jobs", {
  id: text("id").primaryKey(),
  institutionId: text("institution_id").notNull().references(() => institutionDirectoryTable.id),
  requestedBy: text("requested_by").notNull(),
  retryOf: text("retry_of"),
  status: text("status").notNull(),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  error: text("error"),
  checks: jsonb("checks").$type<SourceCheck[]>().notNull().default([]),
}, t => [index("verification_jobs_institution").on(t.institutionId, t.requestedAt)]);
export const verifiedFieldsTable = pgTable("institution_verified_fields", {
  institutionId: text("institution_id").notNull().references(() => institutionDirectoryTable.id),
  fieldKey: text("field_key").notNull(),
  value: text("value").notNull(),
  sourceUrl: text("source_url").notNull(),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
  approvedAt: timestamp("approved_at", { withTimezone: true }).notNull().defaultNow(),
  approvedBy: text("approved_by").notNull(),
  jobId: text("job_id").notNull(),
}, t => [primaryKey({ columns: [t.institutionId, t.fieldKey] })]);
export const verificationProposalsTable = pgTable("institution_verification_proposals", {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull().references(() => verificationJobsTable.id),
  institutionId: text("institution_id").notNull().references(() => institutionDirectoryTable.id),
  fieldKey: text("field_key").notNull(),
  value: text("value").notNull(),
  previousValue: text("previous_value"),
  basisDigest: text("basis_digest").notNull(),
  previousDigest: text("previous_digest").notNull(),
  status: text("status").notNull().default("pending"),
  sourceUrl: text("source_url").notNull(),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewedBy: text("reviewed_by"),
  reviewNote: text("review_note"),
}, t => [index("verification_proposals_review").on(t.institutionId, t.status)]);
