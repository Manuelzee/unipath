import { date, index, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Student-managed application trackers. UniPath never submits an application;
 * every row here is created and updated by the student. Deadlines, intakes and
 * links are the student's own notes unless they come from a verified source,
 * and the UI labels them that way.
 */
export const APPLICATION_STATUSES = [
  "interested",
  "researching",
  "preparing_documents",
  "ready_to_apply",
  "submitted",
  "under_review",
  "accepted",
  "rejected",
  "waitlisted",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
/** Outcomes that end an application; everything else counts as active. */
export const FINAL_APPLICATION_STATUSES: readonly ApplicationStatus[] = ["accepted", "rejected", "waitlisted"];

export const applicationsTable = pgTable("applications", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  universityId: text("university_id").notNull(),
  programName: text("program_name"),
  intake: text("intake"),
  status: text("status").notNull().default("interested"),
  deadline: date("deadline", { mode: "string" }),
  applicationUrl: text("application_url"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [index("applications_user_idx").on(table.userId)]);

export type ApplicationRecord = typeof applicationsTable.$inferSelect;
