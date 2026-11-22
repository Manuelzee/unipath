import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq } from "drizzle-orm";
import { DeleteMyDataBody, DeleteMyDataResponse, ExportMyDataResponse } from "@workspace/api-zod";
import {
  aiSavedItemsTable, aiUsageTable, applicationTasksTable, applicationsTable, db,
  jobApplicationsTable, savedUniversitiesTable, studentDocumentsTable, studentProfilesTable,
} from "@workspace/db";
import { deleteObject } from "../lib/storage";
import { toDocument } from "./documents";
import { requireAuth } from "../middlewares/requireAuth";
import { requireJson } from "../middlewares/requireJson";
import { profileResponse } from "./student";

const router: IRouter = Router();

function studentId(req: Parameters<typeof getAuth>[0]): string {
  const userId = getAuth(req).userId;
  if (!userId) throw new Error("Authenticated user ID was not available.");
  return userId;
}

const iso = (d: Date) => d.toISOString();

router.get("/me/export", requireAuth, async (req, res): Promise<void> => {
  const userId = studentId(req);
  const [[profile], saved, applications, tasks, aiItems, jobs, documents] = await Promise.all([
    db.select().from(studentProfilesTable).where(eq(studentProfilesTable.userId, userId)).limit(1),
    db.select().from(savedUniversitiesTable).where(eq(savedUniversitiesTable.userId, userId)),
    db.select().from(applicationsTable).where(eq(applicationsTable.userId, userId)),
    db.select().from(applicationTasksTable).where(eq(applicationTasksTable.userId, userId)),
    db.select().from(aiSavedItemsTable).where(eq(aiSavedItemsTable.userId, userId)),
    db.select().from(jobApplicationsTable).where(eq(jobApplicationsTable.userId, userId)),
    db.select().from(studentDocumentsTable).where(eq(studentDocumentsTable.userId, userId)),
  ]);
  res.setHeader("Cache-Control", "private, no-store");
  res.json(ExportMyDataResponse.parse({
    exportedAt: new Date().toISOString(),
    note: "Everything UniPath AI stores for your account. Sign-in details are managed by the authentication provider and are not included. AI usage counters hold no message text and are not included. Document files are listed here; download each one from the Documents page.",
    profile: profile ? profileResponse(profile) : null,
    savedUniversities: saved.map(s => ({ universityId: s.universityId, savedAt: iso(s.savedAt) })),
    applications: applications.map(a => ({
      id: a.id, universityId: a.universityId, programName: a.programName, intake: a.intake, status: a.status,
      deadline: a.deadline, applicationUrl: a.applicationUrl, notes: a.notes, createdAt: iso(a.createdAt), updatedAt: iso(a.updatedAt),
    })),
    tasks: tasks.map(t => ({ ...t, createdAt: iso(t.createdAt) })),
    aiSavedItems: aiItems.map(i => ({ ...i, createdAt: iso(i.createdAt) })),
    jobApplications: jobs.map(j => ({ ...j, createdAt: iso(j.createdAt), updatedAt: iso(j.updatedAt) })),
    documents: documents.map(toDocument),
  }));
});

router.post("/me/data-deletion", requireAuth, requireJson, async (req, res): Promise<void> => {
  const body = DeleteMyDataBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: 'Type DELETE to confirm. Nothing was deleted.' }); return; }
  const userId = studentId(req);
  const files: string[] = [];
  const deleted = await db.transaction(async tx => {
    const count = async (rows: Promise<unknown[]>) => (await rows).length;
    const documents = await tx.delete(studentDocumentsTable).where(eq(studentDocumentsTable.userId, userId))
      .returning({ storageKey: studentDocumentsTable.storageKey });
    files.push(...documents.map(d => d.storageKey));
    return {
      documents: documents.length,
      tasks: await count(tx.delete(applicationTasksTable).where(eq(applicationTasksTable.userId, userId)).returning({ id: applicationTasksTable.id })),
      applications: await count(tx.delete(applicationsTable).where(eq(applicationsTable.userId, userId)).returning({ id: applicationsTable.id })),
      savedUniversities: await count(tx.delete(savedUniversitiesTable).where(eq(savedUniversitiesTable.userId, userId)).returning({ id: savedUniversitiesTable.universityId })),
      aiSavedItems: await count(tx.delete(aiSavedItemsTable).where(eq(aiSavedItemsTable.userId, userId)).returning({ id: aiSavedItemsTable.id })),
      aiUsage: await count(tx.delete(aiUsageTable).where(eq(aiUsageTable.userId, userId)).returning({ id: aiUsageTable.id })),
      jobApplications: await count(tx.delete(jobApplicationsTable).where(eq(jobApplicationsTable.userId, userId)).returning({ id: jobApplicationsTable.id })),
      profiles: await count(tx.delete(studentProfilesTable).where(eq(studentProfilesTable.userId, userId)).returning({ id: studentProfilesTable.userId })),
    };
  });
  // Remove stored files only after the records are gone.
  await Promise.all(files.map(key => deleteObject(key).catch(() => undefined)));
  req.log.info({ deleted }, "Student deleted their UniPath data");
  res.json(DeleteMyDataResponse.parse({
    deleted,
    note: "Your UniPath records were permanently deleted. Your sign-in account still exists; delete it from Account settings if you no longer want it.",
  }));
});

export default router;
