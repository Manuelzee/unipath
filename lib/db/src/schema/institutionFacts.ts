import { numeric, pgTable, text, timestamp, index, date } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { institutionDirectoryTable } from "./institutionDirectory";

// Only source-reported facts belong here. A reference link is not an opportunity.
export const institutionFactsTable = pgTable("institution_facts", {
  id: text("id").primaryKey(),
  institutionId: text("institution_id").notNull().references(() => institutionDirectoryTable.id),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  fieldsOfStudy: text("fields_of_study").array().notNull().default(sql`'{}'::text[]`),
  degreeLevel: text("degree_level"),
  language: text("language"),
  programType: text("program_type"),
  applicantStatuses: text("applicant_statuses").array().notNull().default(sql`'{}'::text[]`),
  requirements: text("requirements").array().notNull().default(sql`'{}'::text[]`),
  eligibility: text("eligibility"),
  applicantGroup: text("applicant_group"),
  admissionScope: text("admission_scope"),
  fundingCategory: text("funding_category"),
  awardAmount: text("award_amount"),
  eligibleCitizenships: text("eligible_citizenships").array().notNull().default(sql`'{}'::text[]`),
  eligibleResidenceCountries: text("eligible_residence_countries").array().notNull().default(sql`'{}'::text[]`),
  eligibleResidenceRegions: text("eligible_residence_regions").array().notNull().default(sql`'{}'::text[]`),
  eligibleDegreeLevels: text("eligible_degree_levels").array().notNull().default(sql`'{}'::text[]`),
  eligibleMajors: text("eligible_majors").array().notNull().default(sql`'{}'::text[]`),
  majorRequirement: text("major_requirement"),
  eligibleCriteria: text("eligible_criteria").array().notNull().default(sql`'{}'::text[]`),
  minimumGpa: numeric("minimum_gpa", { precision: 4, scale: 3, mode: "number" }),
  minimumGpaScale: text("minimum_gpa_scale"),
  deadline: date("deadline", { mode: "string" }),
  officialUrl: text("official_url"),
  sourceName: text("source_name").notNull(),
  sourceUrl: text("source_url").notNull(),
  sourceDate: text("source_date"),
  sourceLicenseUrl: text("source_license_url"),
  lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
  importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("institution_facts_school_kind_idx").on(table.institutionId, table.kind),
]);
