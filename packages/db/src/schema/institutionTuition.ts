import { sql } from "drizzle-orm";
import { check, doublePrecision, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { institutionDirectoryTable } from "./institutionDirectory";

/** Separate source evidence: tuition imports never update reviewed directory rows. */
export const institutionTuitionTable = pgTable("institution_tuition", {
  id: text("id").primaryKey(),
  institutionId: text("institution_id").notNull().references(() => institutionDirectoryTable.id),
  category: text("category").notNull(),
  amount: doublePrecision("amount").notNull(),
  currency: text("currency").notNull(),
  year: integer("year").notNull(),
  academicYear: text("academic_year").notNull(),
  period: text("period").notNull().default("year"),
  scope: text("scope").notNull(),
  sourceName: text("source_name").notNull(),
  sourceUrl: text("source_url").notNull(),
  sourceFileUrl: text("source_file_url").notNull(),
  sourceLicenseUrl: text("source_license_url").notNull(),
  attribution: text("attribution").notNull(),
  sourcePublishedAt: text("source_published_at"),
  sourceHash: text("source_hash").notNull(),
  importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("institution_tuition_category_uidx").on(table.institutionId, table.category),
  check("institution_tuition_amount_check", sql`${table.amount} >= 0 AND ${table.amount} < 1000000`),
  check("institution_tuition_category_check", sql`${table.category} in ('in_state', 'out_of_state', 'domestic', 'international')`),
  check("institution_tuition_currency_check", sql`${table.currency} in ('USD', 'CAD')`),
  check("institution_tuition_period_check", sql`${table.period} = 'year'`),
  check("institution_tuition_year_check", sql`${table.year} >= 2000 AND ${table.year} <= 2100`),
]);
export const insertInstitutionTuitionSchema = createInsertSchema(institutionTuitionTable);
export type InstitutionTuitionRecord = typeof institutionTuitionTable.$inferSelect;
