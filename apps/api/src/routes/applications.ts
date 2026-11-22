import { Router, type IRouter, type Response } from "express";
import { getAuth } from "@clerk/express";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  AddApplicationChecklistParams, AddApplicationChecklistResponse,
  CreateApplicationBody, CreateApplicationResponse,
  CreateApplicationScopedTaskBody, CreateApplicationScopedTaskParams, CreateApplicationScopedTaskResponse,
  DeleteApplicationParams, ListApplicationsResponse,
  UpdateApplicationBody, UpdateApplicationParams, UpdateApplicationResponse,
} from "@workspace/api-zod";
import {
  applicationTasksTable, applicationsTable, db, studentDocumentsTable, studentProfilesTable,
  type ApplicationRecord, type ApplicationTaskRecord,
} from "@workspace/db";
import { findUniversities, findUniversity, type University } from "../lib/universities";
import { requireAuth } from "../middlewares/requireAuth";
import { requireJson } from "../middlewares/requireJson";
import { CHECKLIST_ITEMS, INTERNATIONAL_CHECKLIST_ITEMS, checklistDueDate, safeWebUrl } from "../lib/applicationHelpers";

const router: IRouter = Router();

function studentId(req: Parameters<typeof getAuth>[0]): string {
  const userId = getAuth(req).userId;
  if (!userId) throw new Error("Authenticated user ID was not available.");
  return userId;
}

const toTask = (task: ApplicationTaskRecord) => ({ ...task, createdAt: task.createdAt.toISOString() });

function toApplication(row: ApplicationRecord, university: University | null, tasks: ApplicationTaskRecord[]) {
  return {
    id: row.id, universityId: row.universityId, programName: row.programName, intake: row.intake,
    status: row.status, deadline: row.deadline, applicationUrl: row.applicationUrl, notes: row.notes,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
    university,
    tasks: tasks.slice().sort((a, b) => Number(a.completed) - Number(b.completed) || a.dueDate.localeCompare(b.dueDate)).map(toTask),
  };
}

async function ownedApplication(userId: string, id: number) {
  const [row] = await db.select().from(applicationsTable)
    .where(and(eq(applicationsTable.id, id), eq(applicationsTable.userId, userId))).limit(1);
  return row;
}

async function withDetails(userId: string, row: ApplicationRecord) {
  const [university, tasks] = await Promise.all([
    findUniversity(row.universityId),
    db.select().from(applicationTasksTable)
      .where(and(eq(applicationTasksTable.userId, userId), eq(applicationTasksTable.applicationId, row.id))),
  ]);
  return toApplication(row, university ?? null, tasks);
}

const invalidInput = (res: Response, message: string) => res.status(400).json({ error: message });

router.get("/me/applications", requireAuth, async (req, res): Promise<void> => {
  const userId = studentId(req);
  const rows = await db.select().from(applicationsTable)
    .where(eq(applicationsTable.userId, userId)).orderBy(desc(applicationsTable.updatedAt));
  const ids = rows.map(r => r.id);
  const [universities, tasks] = await Promise.all([
    findUniversities([...new Set(rows.map(r => r.universityId))]),
    ids.length
      ? db.select().from(applicationTasksTable)
        .where(and(eq(applicationTasksTable.userId, userId), inArray(applicationTasksTable.applicationId, ids)))
      : Promise.resolve([] as ApplicationTaskRecord[]),
  ]);
  res.setHeader("Cache-Control", "private, no-store");
  res.json(ListApplicationsResponse.parse(rows.map(row =>
    toApplication(row, universities.get(row.universityId) ?? null, tasks.filter(t => t.applicationId === row.id)))));
});

router.post("/me/applications", requireAuth, requireJson, async (req, res): Promise<void> => {
  const body = CreateApplicationBody.safeParse(req.body);
  if (!body.success) { invalidInput(res, "Check the application details and try again."); return; }
  const url = safeWebUrl(body.data.applicationUrl);
  if (url === false) { invalidInput(res, "The application link must be a web address starting with https:// or http://."); return; }
  const university = await findUniversity(body.data.universityId);
  if (!university) { res.status(404).json({ error: "University listing not found." }); return; }
  const [row] = await db.insert(applicationsTable).values({
    userId: studentId(req), universityId: university.id,
    programName: body.data.programName?.trim() || null, intake: body.data.intake?.trim() || null,
    status: body.data.status ?? "interested", deadline: body.data.deadline ?? null,
    applicationUrl: url, notes: body.data.notes?.trim() || null,
  }).returning();
  res.status(201).json(CreateApplicationResponse.parse(toApplication(row, university, [])));
});

router.patch("/me/applications/:id", requireAuth, requireJson, async (req, res): Promise<void> => {
  const params = UpdateApplicationParams.safeParse(req.params);
  const body = UpdateApplicationBody.safeParse(req.body);
  if (!params.success || !body.success) { invalidInput(res, "Check the application details and try again."); return; }
  const changes: Partial<typeof applicationsTable.$inferInsert> = { updatedAt: new Date() };
  const d = body.data;
  if (d.programName !== undefined) changes.programName = d.programName?.trim() || null;
  if (d.intake !== undefined) changes.intake = d.intake?.trim() || null;
  if (d.status !== undefined) changes.status = d.status;
  if (d.deadline !== undefined) changes.deadline = d.deadline ?? null;
  if (d.notes !== undefined) changes.notes = d.notes?.trim() || null;
  if (d.applicationUrl !== undefined) {
    const url = safeWebUrl(d.applicationUrl);
    if (url === false) { invalidInput(res, "The application link must be a web address starting with https:// or http://."); return; }
    changes.applicationUrl = url;
  }
  const userId = studentId(req);
  const [row] = await db.update(applicationsTable).set(changes)
    .where(and(eq(applicationsTable.id, params.data.id), eq(applicationsTable.userId, userId))).returning();
  if (!row) { res.status(404).json({ error: "Application not found." }); return; }
  res.json(UpdateApplicationResponse.parse(await withDetails(userId, row)));
});

router.delete("/me/applications/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteApplicationParams.safeParse(req.params);
  if (!params.success) { invalidInput(res, "Invalid application."); return; }
  const userId = studentId(req);
  const deleted = await db.transaction(async tx => {
    const [row] = await tx.delete(applicationsTable)
      .where(and(eq(applicationsTable.id, params.data.id), eq(applicationsTable.userId, userId))).returning();
    if (!row) return false;
    await tx.delete(applicationTasksTable)
      .where(and(eq(applicationTasksTable.userId, userId), eq(applicationTasksTable.applicationId, row.id)));
    // Documents belong to the student, not the tracker: keep them, unlinked.
    await tx.update(studentDocumentsTable).set({ applicationId: null })
      .where(and(eq(studentDocumentsTable.userId, userId), eq(studentDocumentsTable.applicationId, row.id)));
    return true;
  });
  if (!deleted) { res.status(404).json({ error: "Application not found." }); return; }
  res.sendStatus(204);
});

router.post("/me/applications/:id/tasks", requireAuth, requireJson, async (req, res): Promise<void> => {
  const params = CreateApplicationScopedTaskParams.safeParse(req.params);
  const body = CreateApplicationScopedTaskBody.safeParse(req.body);
  if (!params.success || !body.success) { invalidInput(res, "Add a task title and a valid due date."); return; }
  const userId = studentId(req);
  const app = await ownedApplication(userId, params.data.id);
  if (!app) { res.status(404).json({ error: "Application not found." }); return; }
  const [task] = await db.insert(applicationTasksTable).values({
    userId, title: body.data.title.trim(), dueDate: body.data.dueDate,
    universityId: app.universityId, applicationId: app.id,
  }).returning();
  await db.update(applicationsTable).set({ updatedAt: new Date() }).where(eq(applicationsTable.id, app.id));
  res.status(201).json(CreateApplicationScopedTaskResponse.parse(toTask(task)));
});

router.post("/me/applications/:id/checklist", requireAuth, requireJson, async (req, res): Promise<void> => {
  const params = AddApplicationChecklistParams.safeParse(req.params);
  if (!params.success) { invalidInput(res, "Invalid application."); return; }
  const userId = studentId(req);
  const app = await ownedApplication(userId, params.data.id);
  if (!app) { res.status(404).json({ error: "Application not found." }); return; }
  const [[profile], existing] = await Promise.all([
    db.select({ applicantStatus: studentProfilesTable.applicantStatus }).from(studentProfilesTable)
      .where(eq(studentProfilesTable.userId, userId)).limit(1),
    db.select({ title: applicationTasksTable.title }).from(applicationTasksTable)
      .where(and(eq(applicationTasksTable.userId, userId), eq(applicationTasksTable.applicationId, app.id))),
  ]);
  const have = new Set(existing.map(t => t.title.trim().toLowerCase()));
  const items = [...CHECKLIST_ITEMS, ...(profile?.applicantStatus === "international" ? INTERNATIONAL_CHECKLIST_ITEMS : [])]
    .filter(title => !have.has(title.toLowerCase()));
  const dueDate = checklistDueDate(app.deadline);
  if (items.length) {
    await db.insert(applicationTasksTable).values(items.map(title => ({
      userId, title, dueDate, universityId: app.universityId, applicationId: app.id,
    })));
  }
  const [updated] = await db.update(applicationsTable).set({ updatedAt: new Date() })
    .where(eq(applicationsTable.id, app.id)).returning();
  res.json(AddApplicationChecklistResponse.parse(await withDetails(userId, updated)));
});

export default router;
