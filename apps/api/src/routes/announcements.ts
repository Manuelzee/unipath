import { Router, type IRouter, type RequestHandler } from "express";
import { desc, eq } from "drizzle-orm";
import {
  CreateAnnouncementBody, CreateAnnouncementResponse, DeleteAnnouncementParams, ListAnnouncementsQueryParams, ListAnnouncementsResponse,
} from "@workspace/api-zod";
import { announcementsTable, db, type AnnouncementRecord } from "@workspace/db";
import { administrator, requireAdministrator } from "../lib/admin/security";
import { getAuth } from "../lib/auth/session";
import { cleanChatMessage, cleanTitle } from "../lib/chat";
import { requireAuth } from "../middlewares/requireAuth";
import { requireJson } from "../middlewares/requireJson";

/**
 * Announcements from the site administrators to every signed-in student.
 * Anyone signed in can read them; only administrators can publish or remove.
 */
const router: IRouter = Router();
router.use("/announcements", requireAuth, requireJson, (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });

const action = (handler: RequestHandler): RequestHandler => async (req, res, next) => {
  try { await handler(req, res, next); } catch (error) { next(error); }
};
const view = (row: AnnouncementRecord, isAdmin: boolean) => ({
  id: row.id, title: row.title, body: row.body, createdAt: row.createdAt.toISOString(), canDelete: isAdmin,
});

router.get("/announcements", action(async (req, res) => {
  const query = ListAnnouncementsQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Use a whole-number limit of 1 to 100." }); return; }
  const isAdmin = await administrator(getAuth(req).userId!);
  const rows = await db.select().from(announcementsTable).orderBy(desc(announcementsTable.id)).limit(query.data.limit ?? 30);
  res.json(ListAnnouncementsResponse.parse({ items: rows.map(row => view(row, isAdmin)), canPost: isAdmin }));
}));

router.post("/announcements", requireAdministrator, action(async (req, res) => {
  const input = CreateAnnouncementBody.safeParse(req.body);
  const title = input.success ? cleanTitle(input.data.title) : "";
  const body = input.success ? cleanChatMessage(input.data.body, 4000) : "";
  if (!title || !body) { res.status(400).json({ error: "Write a title (up to 120 characters) and a message (up to 4,000 characters)." }); return; }
  const [row] = await db.insert(announcementsTable).values({ authorId: getAuth(req).userId!, title, body }).returning();
  req.log.info({ announcementId: row.id }, "Administrator published an announcement");
  res.status(201).json(CreateAnnouncementResponse.parse(view(row, true)));
}));

router.delete("/announcements/:id", requireAdministrator, action(async (req, res) => {
  const params = DeleteAnnouncementParams.safeParse(req.params);
  if (!params.success) { res.status(404).json({ error: "Announcement not found." }); return; }
  const removed = await db.delete(announcementsTable).where(eq(announcementsTable.id, params.data.id)).returning({ id: announcementsTable.id });
  if (!removed.length) { res.status(404).json({ error: "Announcement not found." }); return; }
  req.log.info({ announcementId: params.data.id }, "Administrator removed an announcement");
  res.status(204).end();
}));

export default router;
