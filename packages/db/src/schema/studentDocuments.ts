import { index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Metadata for private files a student uploads (transcripts, test reports,
 * essays). The bytes live in private storage under `storageKey` and are only
 * ever returned to their owner through an authenticated route.
 */
export const studentDocumentsTable = pgTable("student_documents", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  /** Optional link to one of the student's application trackers. */
  applicationId: integer("application_id"),
  title: text("title").notNull(),
  /** What the document is (passport, transcript...), chosen by the student; matches programme requirements. */
  kind: text("kind"),
  fileName: text("file_name").notNull(),
  /** Detected from the file's contents, never trusted from the upload. */
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  sha256: text("sha256").notNull(),
  storageKey: text("storage_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index("student_documents_user_idx").on(table.userId),
  uniqueIndex("student_documents_storage_key_idx").on(table.storageKey),
]);

export type StudentDocumentRecord = typeof studentDocumentsTable.$inferSelect;
