import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Bytes live in App Storage. Immutable content hashes deduplicate resized assets.
export const institutionLogoAssetsTable = pgTable("institution_logo_assets", {
  hash: text("hash").primaryKey(),
  objectKey: text("object_key").notNull().unique(),
  contentType: text("content_type").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  byteSize: integer("byte_size").notNull(),
  sourceUrl: text("source_url").notNull(),
  licenseUrl: text("license_url").notNull(),
  credit: text("credit").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
