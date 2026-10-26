import { pgTable, real, text, timestamp } from "drizzle-orm/pg-core";

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
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type StudentProfileRecord = typeof studentProfilesTable.$inferSelect;
