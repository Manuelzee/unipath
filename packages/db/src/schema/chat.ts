import { index, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { authUsersTable } from "./auth";

/**
 * Community chat. `room` is "general" (every signed-in student) or a lower-case
 * country code ("us", "ca"...) open to students whose profile names that study
 * country. Messages are shown with the author's first name and last initial
 * only, and are removed with the author's account (and by "delete my data").
 */
export const chatMessagesTable = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => authUsersTable.id, { onDelete: "cascade" }),
  room: text("room").notNull().default("general"),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index("chat_messages_user_idx").on(table.userId),
  index("chat_messages_room_idx").on(table.room, table.id),
]);

export type ChatMessageRecord = typeof chatMessagesTable.$inferSelect;

/**
 * Announcements from the site administrators to every student. The author is
 * kept for accountability but never shown; students see "UniPath team".
 */
export const announcementsTable = pgTable("announcements", {
  id: serial("id").primaryKey(),
  authorId: text("author_id").references(() => authUsersTable.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AnnouncementRecord = typeof announcementsTable.$inferSelect;
