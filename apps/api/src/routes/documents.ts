import { createHash, randomUUID } from "node:crypto";
import express, { Router, type IRouter, type Request } from "express";
import { getAuth } from "@clerk/express";
import { and, count, desc, eq } from "drizzle-orm";
import {
  DeleteStudentDocumentParams, DownloadStudentDocumentParams, ListStudentDocumentsResponse,
  UpdateStudentDocumentBody, UpdateStudentDocumentParams, UpdateStudentDocumentResponse,
  UploadStudentDocumentQueryParams, UploadStudentDocumentResponse,
} from "@workspace/api-zod";
import { applicationsTable, db, studentDocumentsTable, type StudentDocumentRecord } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { requireJson } from "../middlewares/requireJson";
import { trustedOrigins } from "../lib/admin/security";
import { deleteObject, objectExists, readObject, writeObject } from "../lib/storage";
import {
  MAX_DOCUMENTS_PER_STUDENT, attachmentHeader, detectDocumentType, documentMaxBytes, safeFileName,
} from "../lib/documentFiles";

const router: IRouter = Router();

function studentId(req: Request): string {
  const userId = getAuth(req).userId;
  if (!userId) throw new Error("Authenticated user ID was not available.");
  return userId;
}

export const toDocument = (row: StudentDocumentRecord) => ({
  id: row.id, applicationId: row.applicationId, title: row.title, fileName: row.fileName,
  contentType: row.contentType, sizeBytes: row.sizeBytes, createdAt: row.createdAt.toISOString(),
});

async function ownsApplication(userId: string, applicationId: number) {
  const [row] = await db.select({ id: applicationsTable.id }).from(applicationsTable)
    .where(and(eq(applicationsTable.id, applicationId), eq(applicationsTable.userId, userId))).limit(1);
  return !!row;
}

router.get("/me/documents", requireAuth, async (req, res): Promise<void> => {
  const rows = await db.select().from(studentDocumentsTable)
    .where(eq(studentDocumentsTable.userId, studentId(req))).orderBy(desc(studentDocumentsTable.createdAt));
  res.setHeader("Cache-Control", "private, no-store");
  res.json(ListStudentDocumentsResponse.parse(rows.map(toDocument)));
});

router.post("/me/documents", requireAuth,
  // Uploads must come from the app itself: a browser only sends this content
  // type cross-site after a CORS preflight, which untrusted origins fail.
  (req, res, next) => {
    const origin = req.get("origin");
    if (origin && !trustedOrigins().has(origin)) { res.status(403).json({ error: "Uploads must come from the UniPath app." }); return; }
    if (!req.is("application/octet-stream")) { res.status(415).json({ error: "Send the file as application/octet-stream." }); return; }
    next();
  },
  (req, res, next) => express.raw({ type: "application/octet-stream", limit: documentMaxBytes() })(req, res, (error?: unknown) => {
    if ((error as { type?: string })?.type === "entity.too.large") {
      res.status(413).json({ error: `Files can be at most ${Math.round(documentMaxBytes() / 1024 / 1024)} MB.` }); return;
    }
    next(error);
  }),
  async (req, res): Promise<void> => {
    const query = UploadStudentDocumentQueryParams.safeParse(req.query);
    if (!query.success) { res.status(400).json({ error: "Add a file name (up to 200 characters) and an optional title." }); return; }
    const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!bytes.length) { res.status(400).json({ error: "The file is empty." }); return; }
    const type = detectDocumentType(bytes);
    if (!type) { res.status(400).json({ error: "Only PDF, PNG, JPEG and Word (.docx) files are accepted." }); return; }
    const userId = studentId(req);
    const applicationId = query.data.applicationId ?? null;
    if (applicationId !== null && !(await ownsApplication(userId, applicationId))) {
      res.status(404).json({ error: "Application not found." }); return;
    }
    const [{ total }] = await db.select({ total: count() }).from(studentDocumentsTable).where(eq(studentDocumentsTable.userId, userId));
    if (total >= MAX_DOCUMENTS_PER_STUDENT) {
      res.status(409).json({ error: `You can keep up to ${MAX_DOCUMENTS_PER_STUDENT} documents. Delete some to upload more.` }); return;
    }
    const fileName = safeFileName(query.data.fileName, type);
    const storageKey = `student-documents/${randomUUID()}`;
    await writeObject(storageKey, bytes);
    try {
      const [row] = await db.insert(studentDocumentsTable).values({
        userId, applicationId, fileName, contentType: type, sizeBytes: bytes.length, storageKey,
        title: query.data.title?.trim() || fileName,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      }).returning();
      res.status(201).json(UploadStudentDocumentResponse.parse(toDocument(row)));
    } catch (error) {
      await deleteObject(storageKey).catch(() => undefined);
      throw error;
    }
  });

router.patch("/me/documents/:id", requireAuth, requireJson, async (req, res): Promise<void> => {
  const params = UpdateStudentDocumentParams.safeParse(req.params);
  const body = UpdateStudentDocumentBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Check the title (up to 160 characters) and application." }); return; }
  const userId = studentId(req);
  if (body.data.applicationId != null && !(await ownsApplication(userId, body.data.applicationId))) {
    res.status(404).json({ error: "Application not found." }); return;
  }
  const changes: Partial<typeof studentDocumentsTable.$inferInsert> = {};
  if (body.data.title !== undefined) changes.title = body.data.title.trim();
  if (body.data.applicationId !== undefined) changes.applicationId = body.data.applicationId;
  if (!Object.keys(changes).length) { res.status(400).json({ error: "Nothing to update." }); return; }
  const [row] = await db.update(studentDocumentsTable).set(changes)
    .where(and(eq(studentDocumentsTable.id, params.data.id), eq(studentDocumentsTable.userId, userId))).returning();
  if (!row) { res.status(404).json({ error: "Document not found." }); return; }
  res.json(UpdateStudentDocumentResponse.parse(toDocument(row)));
});

router.delete("/me/documents/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteStudentDocumentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid document." }); return; }
  const [row] = await db.delete(studentDocumentsTable)
    .where(and(eq(studentDocumentsTable.id, params.data.id), eq(studentDocumentsTable.userId, studentId(req)))).returning();
  if (!row) { res.status(404).json({ error: "Document not found." }); return; }
  await deleteObject(row.storageKey);
  res.sendStatus(204);
});

router.get("/me/documents/:id/file", requireAuth, async (req, res): Promise<void> => {
  const params = DownloadStudentDocumentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid document." }); return; }
  const [row] = await db.select().from(studentDocumentsTable)
    .where(and(eq(studentDocumentsTable.id, params.data.id), eq(studentDocumentsTable.userId, studentId(req)))).limit(1);
  if (!row || !(await objectExists(row.storageKey))) { res.status(404).json({ error: "Document not found." }); return; }
  res.set({
    "Content-Type": row.contentType, "Content-Length": String(row.sizeBytes),
    // Always a download, never rendered inside the app's origin.
    "Content-Disposition": attachmentHeader(row.fileName),
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  });
  const stream = readObject(row.storageKey);
  res.once("close", () => stream.destroy());
  stream.on("error", () => { if (!res.headersSent) res.status(503).end(); else res.destroy(); }).pipe(res);
});

export default router;
