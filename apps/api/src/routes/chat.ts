import { Router, type IRouter, type RequestHandler } from "express";
import { desc, eq, lt } from "drizzle-orm";
import {
  DeleteChatMessageParams, ListChatMessagesQueryParams, ListChatMessagesResponse, SendChatMessageBody, SendChatMessageResponse,
} from "@workspace/api-zod";
import { authUsersTable, chatMessagesTable, db } from "@workspace/db";
import { BurstLimiter } from "../lib/ai/burst";
import { administrator } from "../lib/admin/security";
import { getAuth } from "../lib/auth/session";
import { chatName, cleanChatMessage } from "../lib/chat";
import { requireAuth } from "../middlewares/requireAuth";
import { requireJson } from "../middlewares/requireJson";

/**
 * The community chat room shared by every signed-in student. The page polls
 * GET /chat/messages; authors are shown by first name and last initial only.
 */
const router: IRouter = Router();
router.use("/chat", requireAuth, requireJson, (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });

// Per server process: a short burst, then a steady limit.
const burst = new BurstLimiter(3, 5_000);
const perMinute = new BurstLimiter(20, 60_000);
const DEFAULT_PAGE = 50;

const action = (handler: RequestHandler): RequestHandler => async (req, res, next) => {
  try { await handler(req, res, next); } catch (error) { next(error); }
};

router.get("/chat/messages", action(async (req, res) => {
  const query = ListChatMessagesQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Use a whole-number limit of 1 to 100." }); return; }
  const limit = query.data.limit ?? DEFAULT_PAGE;
  const userId = getAuth(req).userId!;
  const [isAdmin, rows] = await Promise.all([
    administrator(userId),
    db.select({
      id: chatMessagesTable.id, body: chatMessagesTable.body, createdAt: chatMessagesTable.createdAt, userId: chatMessagesTable.userId,
      firstName: authUsersTable.firstName, lastName: authUsersTable.lastName,
    }).from(chatMessagesTable)
      .innerJoin(authUsersTable, eq(authUsersTable.id, chatMessagesTable.userId))
      .where(query.data.before ? lt(chatMessagesTable.id, query.data.before) : undefined)
      .orderBy(desc(chatMessagesTable.id))
      .limit(limit + 1),
  ]);
  const items = rows.slice(0, limit).reverse().map(row => ({
    id: row.id, body: row.body, createdAt: row.createdAt.toISOString(), authorName: chatName(row.firstName, row.lastName),
    mine: row.userId === userId, canDelete: row.userId === userId || isAdmin,
  }));
  res.json(ListChatMessagesResponse.parse({ items, hasMore: rows.length > limit }));
}));

router.post("/chat/messages", action(async (req, res) => {
  const input = SendChatMessageBody.safeParse(req.body);
  const body = input.success ? cleanChatMessage(input.data.body) : "";
  if (!body) { res.status(400).json({ error: "Write a message of up to 1,000 characters." }); return; }
  const userId = getAuth(req).userId!;
  if (!burst.take(userId) || !perMinute.take(userId)) {
    res.status(429).json({ error: "You’re sending messages quickly. Wait a few seconds and try again." }); return;
  }
  const [author] = await db.select({ firstName: authUsersTable.firstName, lastName: authUsersTable.lastName })
    .from(authUsersTable).where(eq(authUsersTable.id, userId)).limit(1);
  if (!author) { res.status(401).json({ error: "Sign in again to join the conversation." }); return; }
  const [message] = await db.insert(chatMessagesTable).values({ userId, body }).returning();
  res.status(201).json(SendChatMessageResponse.parse({
    id: message.id, body: message.body, createdAt: message.createdAt.toISOString(),
    authorName: chatName(author.firstName, author.lastName), mine: true, canDelete: true,
  }));
}));

router.delete("/chat/messages/:id", action(async (req, res) => {
  const params = DeleteChatMessageParams.safeParse(req.params);
  if (!params.success) { res.status(404).json({ error: "Message not found." }); return; }
  const userId = getAuth(req).userId!;
  const [message] = await db.select({ userId: chatMessagesTable.userId }).from(chatMessagesTable)
    .where(eq(chatMessagesTable.id, params.data.id)).limit(1);
  if (!message) { res.status(404).json({ error: "Message not found." }); return; }
  if (message.userId !== userId && !await administrator(userId)) {
    res.status(403).json({ error: "You can delete only your own messages." }); return;
  }
  await db.delete(chatMessagesTable).where(eq(chatMessagesTable.id, params.data.id));
  res.status(204).end();
}));

export default router;
