import { date, index, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/** Jobs a student saved or entered themselves. UniPath never creates these. */
export const jobApplicationsTable = pgTable("job_applications", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  employer: text("employer").notNull(),
  jobType: text("job_type").notNull().default("other"),
  location: text("location"),
  countryCode: text("country_code"),
  sourceUrl: text("source_url"),
  postedDate: date("posted_date", { mode: "string" }),
  sponsorshipClaim: text("sponsorship_claim").notNull().default("not_stated"),
  authorizationNote: text("authorization_note"),
  eligibilityStatus: text("eligibility_status").notNull().default("unknown"),
  status: text("status").notNull().default("saved"),
  appliedDate: date("applied_date", { mode: "string" }),
  interviewDate: date("interview_date", { mode: "string" }),
  employerResponse: text("employer_response"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [index("job_applications_user_idx").on(table.userId)]);

export type JobApplicationRecord = typeof jobApplicationsTable.$inferSelect;
