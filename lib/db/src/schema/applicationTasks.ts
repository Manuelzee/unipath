import {
  boolean,
  date,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const applicationTasksTable = pgTable("application_tasks", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  dueDate: date("due_date", { mode: "string" }).notNull(),
  universityId: text("university_id").notNull(),
  completed: boolean("completed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ApplicationTaskRecord = typeof applicationTasksTable.$inferSelect;
