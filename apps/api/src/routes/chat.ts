import { Router, type IRouter, type Request, type RequestHandler } from "express";
import { and, desc, eq, lt } from "drizzle-orm";
import {
  DeleteChatMessageParams, ListChatMessagesQueryParams, ListChatMessagesResponse, ListChatRoomsResponse,
  SendChatMessageBody, SendChatMessageResponse,
} from "@workspace/api-zod";
import { authUsersTable, chatMessagesTable, db, studentProfilesTable } from "@workspace/db";
import { BurstLimiter } from "../lib/ai/burst";
import { administrator } from "../lib/admin/security";
import { getAuth } from "../lib/auth/session";
import { chatName, cleanChatMessage } from "../lib/chat";
import { countriesIn, countryName, countryRoomName, isCountryCode } from "../lib/countries";
import { requireAuth } from "../middlewares/requireAuth";
import { requireJson } from "../middlewares/requireJson";

/**
 * Community chat rooms. "general" is open to every signed-in student; each
 * country room ("us", "ca"...) is open to students whose profile names that
 * country as where they plan to study, and to administrators for moderation.
 * The page polls GET /chat/messages; authors are shown by first name and last
 * initial only.
 */
const router: IRouter = Router();
router.use("/chat", requireAuth, requireJson, (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });

// Per server process: a short burst, then a steady limit.
const burst = new BurstLimiter(3, 5_000);
const perMinute = new BurstLimiter(20, 60_000);
const DEFAULT_PAGE = 50;
const GENERAL = "general";

const action = (handler: RequestHandler): RequestHandler => async (req, res, next) => {
  try { await handler(req, res, next); } catch (error) { next(error); }
};

/** "general" or a lower-case country code; anything else is null. */
const roomId = (value: unknown): string | null => {
  const room = typeof value === "string" && value.trim() ? value.trim().toLowerCase() : GENERAL;
  return room === GENERAL || isCountryCode(room) ? room : null;
};

/** The countries named in the student's "Where might you study?" answer, as room ids. */
async function studyRooms(userId: string): Promise<string[]> {
  const [profile] = await db.select({ studyCountry: studentProfilesTable.studyCountry }).from(studentProfilesTable)
    .where(eq(studentProfilesTable.userId, userId)).limit(1);
  return countriesIn(profile?.studyCountry).map(code => code.toLowerCase());
}

type Access = { allowed: boolean; reason: string };
async function access(req: Request, room: string): Promise<Access> {
  if (room === GENERAL) return { allowed: true, reason: "" };
  const userId = getAuth(req).userId!;
  if ((await studyRooms(userId)).includes(room) || await administrator(userId)) return { allowed: true, reason: "" };
  const country = countryName(room);
  return { allowed: false, reason: `This room is for students planning to study in ${country}. Add ${country} as your study country in your profile to join it.` };
}

router.get("/chat/rooms", action(async (req, res) => {
  const userId = getAuth(req).userId!;
  const [mine, isAdmin] = await Promise.all([studyRooms(userId), administrator(userId)]);
  const rooms = [...mine];
  if (isAdmin) {
    const active = await db.selectDistinct({ room: chatMessagesTable.room }).from(chatMessagesTable);
    for (const { room } of active) if (room !== GENERAL && !rooms.includes(room) && isCountryCode(room)) rooms.push(room);
  }
  res.json(ListChatRoomsResponse.parse({
    rooms: [{ id: GENERAL, name: "General", kind: "general" }, ...rooms.map(id => ({ id, name: countryRoomName(id), kind: "country" }))],
    studyCountryKnown: mine.length > 0,
    isAdmin,
  }));
}));

router.get("/chat/messages", action(async (req, res) => {
  const query = ListChatMessagesQueryParams.safeParse(req.query);
  const room = roomId(query.success ? query.data.room : undefined);
  if (!query.success || !room) { res.status(400).json({ error: "Choose a valid room and a whole-number limit of 1 to 100." }); return; }
  const check = await access(req, room);
  if (!check.allowed) { res.status(403).json({ error: check.reason }); return; }
  const limit = query.data.limit ?? DEFAULT_PAGE;
  const userId = getAuth(req).userId!;
  const [isAdmin, rows] = await Promise.all([
    administrator(userId),
    db.select({
      id: chatMessagesTable.id, room: chatMessagesTable.room, body: chatMessagesTable.body, createdAt: chatMessagesTable.createdAt,
      userId: chatMessagesTable.userId, firstName: authUsersTable.firstName, lastName: authUsersTable.lastName,
    }).from(chatMessagesTable)
      .innerJoin(authUsersTable, eq(authUsersTable.id, chatMessagesTable.userId))
      .where(and(eq(chatMessagesTable.room, room), query.data.before ? lt(chatMessagesTable.id, query.data.before) : undefined))
      .orderBy(desc(chatMessagesTable.id))
      .limit(limit + 1),
  ]);
  const items = rows.slice(0, limit).reverse().map(row => ({
    id: row.id, room: row.room, body: row.body, createdAt: row.createdAt.toISOString(), authorName: chatName(row.firstName, row.lastName),
    mine: row.userId === userId, canDelete: row.userId === userId || isAdmin,
  }));
  res.json(ListChatMessagesResponse.parse({ items, hasMore: rows.length > limit }));
}));

router.post("/chat/messages", action(async (req, res) => {
  const input = SendChatMessageBody.safeParse(req.body);
  const body = input.success ? cleanChatMessage(input.data.body) : "";
  const room = roomId(input.success ? input.data.room : undefined);
  if (!body || !room) { res.status(400).json({ error: "Write a message of up to 1,000 characters." }); return; }
  const check = await access(req, room);
  if (!check.allowed) { res.status(403).json({ error: check.reason }); return; }
  const userId = getAuth(req).userId!;
  if (!burst.take(userId) || !perMinute.take(userId)) {
    res.status(429).json({ error: "You’re sending messages quickly. Wait a few seconds and try again." }); return;
  }
  const [author] = await db.select({ firstName: authUsersTable.firstName, lastName: authUsersTable.lastName })
    .from(authUsersTable).where(eq(authUsersTable.id, userId)).limit(1);
  if (!author) { res.status(401).json({ error: "Sign in again to join the conversation." }); return; }
  const [message] = await db.insert(chatMessagesTable).values({ userId, room, body }).returning();
  res.status(201).json(SendChatMessageResponse.parse({
    id: message.id, room: message.room, body: message.body, createdAt: message.createdAt.toISOString(),
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
