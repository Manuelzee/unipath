import { date, doublePrecision, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { institutionDirectoryTable } from "./institutionDirectory";

/** A document a programme asks for; `kind` matches student_documents.kind. */
export interface ProgrammeDocumentRequirement { kind: string; need: "required" | "if_applicable"; note: string | null }

/**
 * A degree programme at a university, with the details students compare:
 * level, field, language, duration, intakes, tuition, application fee,
 * deadline, entry requirements and required documents.
 *
 * Every record names the official page it came from and when an administrator
 * last checked that page (`checked_at`). `confirmed_at` is set only when the
 * university itself confirmed the details in writing; the app shows that label
 * for a limited time (lib/programmes.ts) and editing the details clears it.
 * Seeded records (from apps/api/src/data/programmes.json) carry `seed_key`
 * and are inserted once; administrators can then edit them.
 */
export const programmesTable = pgTable("programmes", {
  id: serial("id").primaryKey(),
  institutionId: text("institution_id").notNull().references(() => institutionDirectoryTable.id),
  seedKey: text("seed_key"),
  name: text("name").notNull(),
  /** bachelor, master, doctoral, diploma, certificate, foundation or other. */
  level: text("level").notNull(),
  degreeName: text("degree_name"),
  field: text("field").notNull(),
  language: text("language"),
  durationMonths: integer("duration_months"),
  /** full_time, part_time, online or blended. */
  studyMode: text("study_mode"),
  intakes: text("intakes").array().notNull().default(sql`'{}'::text[]`),
  tuitionAmount: doublePrecision("tuition_amount"),
  tuitionCurrency: text("tuition_currency"),
  /** year, semester, programme or credit. */
  tuitionPeriod: text("tuition_period"),
  tuitionNote: text("tuition_note"),
  applicationFeeAmount: doublePrecision("application_fee_amount"),
  applicationFeeCurrency: text("application_fee_currency"),
  /** fixed (see `deadline`), rolling, or unknown. */
  deadlineType: text("deadline_type").notNull().default("unknown"),
  deadline: date("deadline", { mode: "string" }),
  deadlineNote: text("deadline_note"),
  academicRequirement: text("academic_requirement"),
  languageRequirement: text("language_requirement"),
  otherRequirements: text("other_requirements"),
  /** Published minimum on a 4.0 scale; null when the university publishes none. */
  minimumGpa: doublePrecision("minimum_gpa"),
  requiredDocuments: jsonb("required_documents").$type<ProgrammeDocumentRequirement[]>().notNull().default(sql`'[]'::jsonb`),
  officialUrl: text("official_url").notNull(),
  applyUrl: text("apply_url"),
  sourceUrl: text("source_url").notNull(),
  checkedAt: date("checked_at", { mode: "string" }).notNull(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  confirmedBy: text("confirmed_by"),
  confirmationNote: text("confirmation_note"),
  /** draft (admins only), published, or archived (hidden). */
  status: text("status").notNull().default("draft"),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index("programmes_institution_idx").on(table.institutionId),
  index("programmes_status_idx").on(table.status, table.level),
  uniqueIndex("programmes_seed_key_idx").on(table.seedKey),
]);

export type ProgrammeRecord = typeof programmesTable.$inferSelect;
