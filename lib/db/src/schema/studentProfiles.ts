import { pgTable, real, doublePrecision, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const studentProfilesTable = pgTable("student_profiles", {
  userId: text("user_id").primaryKey(),
  residenceCountry: text("residence_country").notNull(),
  citizenship: text("citizenship").notNull(),
  studyCountry: text("study_country").notNull(),
  degreeLevel: text("degree_level").notNull(),
  major: text("major").notNull(),
  grades: text("grades").notNull(),
  annualBudgetUsd: real("annual_budget_usd").notNull(),
  preferredLanguage: text("preferred_language").notNull(),
  englishTest: text("english_test").notNull(),
  englishScore: text("english_score").notNull(),
  budgetChoice: text("budget_choice"),
  budgetCurrency: text("budget_currency").notNull().default("USD"),
  budgetScope: text("budget_scope").notNull().default("tuition"),
  customBudget: doublePrecision("custom_budget"),
  livingExpenses: jsonb("living_expenses").$type<{
    accommodation?: number | null; food?: number | null;
    transport?: number | null; other?: number | null;
  }>().notNull().default({}),
  startTerm: text("start_term").notNull().default("flexible"),
  startYear: integer("start_year"),
  priorities: text("priorities").array().notNull().default(sql`'{}'::text[]`),
  topPriorities: text("top_priorities").array().notNull().default(sql`'{}'::text[]`),
  preferredLocation: text("preferred_location").notNull().default(""),
  residenceRegion: text("residence_region").notNull().default(""),
  applicantStatus: text("applicant_status").notNull().default("unsure"),
  admissionTrack: text("admission_track").notNull().default("unsure"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type StudentProfileRecord = typeof studentProfilesTable.$inferSelect;
