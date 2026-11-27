import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { ListMyNotificationsResponse } from "@workspace/api-zod";
import { applicationTasksTable, applicationsTable, db, institutionDirectoryTable } from "@workspace/db";
import { getAuth } from "../lib/auth/session";
import { requireAuth } from "../middlewares/requireAuth";
import { buildNotifications } from "../lib/notifications";

const router: IRouter = Router();

// Reminders from the student's own applications and plan tasks (lib/notifications.ts).
router.get("/me/notifications", requireAuth, async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;
  const [applications, tasks] = await Promise.all([
    db.select({
      id: applicationsTable.id, status: applicationsTable.status, deadline: applicationsTable.deadline,
      programName: applicationsTable.programName, universityName: institutionDirectoryTable.name,
    }).from(applicationsTable)
      .leftJoin(institutionDirectoryTable, eq(institutionDirectoryTable.id, applicationsTable.universityId))
      .where(eq(applicationsTable.userId, userId)),
    db.select({
      id: applicationTasksTable.id, title: applicationTasksTable.title, dueDate: applicationTasksTable.dueDate,
      completed: applicationTasksTable.completed, applicationId: applicationTasksTable.applicationId,
    }).from(applicationTasksTable).where(eq(applicationTasksTable.userId, userId)),
  ]);
  const now = new Date();
  res.setHeader("Cache-Control", "private, no-store");
  res.json(ListMyNotificationsResponse.parse({
    items: buildNotifications(applications, tasks, now.toISOString().slice(0, 10)),
    generatedAt: now.toISOString(),
  }));
});

export default router;
