import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const institutionDirectoryTable = pgTable(
  "institution_directory",
  {
    id: text("id").primaryKey(),
    ipedsId: integer("ipeds_id"),
    scorecardId: integer("scorecard_id"),
    name: text("name").notNull(),
    city: text("city").notNull().default(""),
    state: text("state").notNull().default(""),
    country: text("country").notNull().default("United States"),
    institutionType: text("institution_type").notNull().default("Not reported"),
    ownership: text("ownership"),
    degreeLevels: text("degree_levels")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    degreeTypes: text("degree_types")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    majors: text("majors")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    website: text("website"),
    admissionsWebsite: text("admissions_website"),
    tuitionInStateUsd: integer("tuition_in_state_usd"),
    tuitionInStateYear: integer("tuition_in_state_year"),
    tuitionOutOfStateUsd: integer("tuition_out_of_state_usd"),
    tuitionOutOfStateYear: integer("tuition_out_of_state_year"),
    admissionRate: doublePrecision("admission_rate"),
    admissionRateYear: integer("admission_rate_year"),
    completionRate: doublePrecision("completion_rate"),
    completionRateYear: integer("completion_rate_year"),
    completionRateType: text("completion_rate_type"),
    pellGrantRate: doublePrecision("pell_grant_rate"),
    pellGrantRateYear: integer("pell_grant_rate_year"),
    medianDebtUsd: integer("median_debt_usd"),
    medianDebtYear: integer("median_debt_year"),
    dataSource: text("data_source").notNull(),
    dataYear: text("data_year"),
    sourceUrl: text("source_url").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    lastUpdatedAt: timestamp("last_updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("institution_directory_ipeds_id_uidx").on(table.ipedsId),
    uniqueIndex("institution_directory_scorecard_id_uidx").on(table.scorecardId),
    index("institution_directory_name_idx").on(table.name),
    index("institution_directory_state_idx").on(table.state),
    index("institution_directory_type_idx").on(table.institutionType),
    index("institution_directory_ownership_idx").on(table.ownership),
    index("institution_directory_tuition_in_idx").on(table.tuitionInStateUsd),
    index("institution_directory_tuition_out_idx").on(
      table.tuitionOutOfStateUsd,
    ),
  ],
);

export type InstitutionDirectoryRecord =
  typeof institutionDirectoryTable.$inferSelect;
