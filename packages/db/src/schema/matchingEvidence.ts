import { pgTable, text, integer, doublePrecision, boolean, date, timestamp, index } from "drizzle-orm/pg-core";
import { institutionDirectoryTable } from "./institutionDirectory";

// Internal evidence only. Never serialize these rows into public university profiles.
export const matchingEvidenceTable = pgTable("institution_matching_evidence", {
  id: text("id").primaryKey(),
  institutionId: text("institution_id").notNull().references(() => institutionDirectoryTable.id),
  kind: text("kind").notNull(),
  degreeLevel: text("degree_level"),
  program: text("program"),
  applicantStatus: text("applicant_status"),
  admissionTrack: text("admission_track"),
  residenceRegion: text("residence_region"),
  amount: doublePrecision("amount"),
  currency: text("currency"),
  budgetScope: text("budget_scope"),
  reportingYear: integer("reporting_year"),
  startTerm: text("start_term"),
  startYear: integer("start_year"),
  opensOn: date("opens_on", { mode: "string" }),
  deadline: date("deadline", { mode: "string" }),
  deadlineType: text("deadline_type"),
  signal: text("signal"),
  supported: boolean("supported"),
  sourceUrl: text("source_url").notNull(),
  sourceDate: date("source_date", { mode: "string" }).notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull(),
}, t => [index("matching_evidence_institution_kind_idx").on(t.institutionId, t.kind)]);

export const matchingExchangeRatesTable = pgTable("matching_exchange_rates", {
  currency: text("currency").primaryKey(),
  unitsPerEuro: doublePrecision("units_per_euro").notNull(),
  rateDate: date("rate_date", { mode: "string" }).notNull(),
  sourceUrl: text("source_url").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});
export type MatchingEvidence = typeof matchingEvidenceTable.$inferSelect;
export type MatchingRate = typeof matchingExchangeRatesTable.$inferSelect;
