import { pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

export const savedUniversitiesTable = pgTable(
  "saved_universities",
  {
    userId: text("user_id").notNull(),
    universityId: text("university_id").notNull(),
    savedAt: timestamp("saved_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.universityId] }),
  ],
);

export type SavedUniversityRecord = typeof savedUniversitiesTable.$inferSelect;
