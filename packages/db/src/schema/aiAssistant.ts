import { index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Only material the student explicitly reviewed and approved is stored.
 * Chat transcripts are not persisted server-side.
 */
export const aiSavedItemsTable = pgTable("ai_saved_items", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  sourceUrls: text("source_urls").array().notNull().default(sql`'{}'::text[]`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [index("ai_saved_items_user_idx").on(table.userId)]);

/**
 * Usage metering for quotas and abuse monitoring. Holds no prompt or reply
 * text, only what is needed to enforce limits and watch costs.
 */
export const aiUsageTable = pgTable("ai_usage", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  kind: text("kind").notNull(),
  outcome: text("outcome").notNull(),
  promptTokens: integer("prompt_tokens"),
  completionTokens: integer("completion_tokens"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [index("ai_usage_user_created_idx").on(table.userId, table.createdAt)]);

export type AiSavedItemRecord = typeof aiSavedItemsTable.$inferSelect;
export type AiUsageRecord = typeof aiUsageTable.$inferSelect;
