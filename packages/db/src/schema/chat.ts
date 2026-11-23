import { index, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { authUsersTable } from "./auth";

/**
 * The community chat room every signed-in student shares. Messages are shown
 * with the author's first name and last initial only, and are removed with
 * the author's account (and by "delete my data").
 */
export const chatMessagesTable = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => authUsersTable.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index("chat_messages_user_idx").on(table.userId),
]);

export type ChatMessageRecord = typeof chatMessagesTable.$inferSelect;
