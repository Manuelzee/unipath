/**
 * Integration test for the community chat, through the real app and database:
 * only signed-in students can read or post; authors show as first name and
 * last initial; input is validated and cleaned; posting is rate-limited;
 * paging works; only the author (or an administrator) can delete; chat is
 * included in data export and removed by data deletion.
 *
 * Email delivery is stubbed. Uses throwaway accounts and removes them.
 *
 * Run: pnpm run test:integration (reads DATABASE_URL from .env)
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { eq, inArray, like } from "drizzle-orm";

process.env.LOG_LEVEL = "silent";

const { default: app } = await import("../../app");
const { adminMembershipsTable, authCodesTable, authUsersTable, chatMessagesTable, db, pool } = await import("@workspace/db");
const { setMailer } = await import("../../lib/auth/email");

const DOMAIN = `chat-test-${randomUUID().slice(0, 8)}.example.invalid`;
const outbox: Array<{ to: string; text: string }> = [];
setMailer(async message => { outbox.push(message); });

let base = "";
class Browser {
  cookie = "";
  async request(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await fetch(base + path, {
      method, redirect: "manual",
      headers: { origin: base, ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(this.cookie ? { cookie: this.cookie } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const session = res.headers.getSetCookie().find(c => c.startsWith("unipath_session="));
    if (session) this.cookie = session.split(";")[0];
    const text = await res.text();
    return { status: res.status, data: text ? JSON.parse(text) : null };
  }
  get = (path: string) => this.request("GET", path);
  post = (path: string, body?: unknown) => this.request("POST", path, body);
}

async function student(name: string, firstName: string, lastName: string) {
  const b = new Browser();
  const email = `${name}@${DOMAIN}`;
  const res = await b.post("/api/auth/sign-up", { email, password: "correct horse battery", firstName, lastName });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const code = [...outbox].reverse().find(m => m.to === email)!.text.match(/\b(\d{6})\b/)![1];
  const ok = await b.post("/api/auth/codes/verify", { email, purpose: "verify_email", code });
  assert.equal(ok.data.status, "signed_in");
  return { b, id: ok.data.user.id as string, email };
}

const tests: Array<[string, () => Promise<void>]> = [];
const test = (name: string, fn: () => Promise<void>) => tests.push([name, fn]);
let ada: Awaited<ReturnType<typeof student>>;
let ben: Awaited<ReturnType<typeof student>>;
let cam: Awaited<ReturnType<typeof student>>;

test("signed-out visitors cannot read or post", async () => {
  const b = new Browser();
  assert.equal((await b.get("/api/chat/messages")).status, 401);
  assert.equal((await b.post("/api/chat/messages", { body: "hi" })).status, 401);
});

test("messages show the author's first name and last initial, never the email", async () => {
  const sent = await ada.b.post("/api/chat/messages", { body: "  Hello everyone!\n\n\n\nAnyone applying to Toronto?  " });
  assert.equal(sent.status, 201);
  assert.equal(sent.data.body, "Hello everyone!\n\nAnyone applying to Toronto?", "trimmed, blank lines collapsed");
  const seenByBen = (await ben.b.get("/api/chat/messages")).data.items.find((m: { id: number }) => m.id === sent.data.id);
  assert.deepEqual([seenByBen.authorName, seenByBen.mine, seenByBen.canDelete], ["Ada L.", false, false]);
  assert.ok(!JSON.stringify(seenByBen).includes(ada.email), "no email address in the payload");
  const seenByAda = (await ada.b.get("/api/chat/messages")).data.items.find((m: { id: number }) => m.id === sent.data.id);
  assert.deepEqual([seenByAda.mine, seenByAda.canDelete], [true, true]);
});

test("empty, oversized and disguised messages are handled", async () => {
  assert.equal((await ben.b.post("/api/chat/messages", { body: "   \n  " })).status, 400);
  assert.equal((await ben.b.post("/api/chat/messages", { body: "x".repeat(1001) })).status, 400);
  const tricky = await ben.b.post("/api/chat/messages", { body: "safe‮txt.exe\u0007 text" });
  assert.equal(tricky.status, 201);
  assert.equal(tricky.data.body, "safetxt.exe text", "direction overrides and control characters removed");
});

test("posting too quickly is slowed down", async () => {
  const statuses: number[] = [];
  for (let i = 0; i < 4; i++) statuses.push((await cam.b.post("/api/chat/messages", { body: `quick ${i}` })).status);
  assert.deepEqual(statuses, [201, 201, 201, 429]);
});

test("pages come oldest first, with a cursor for earlier messages", async () => {
  await db.insert(chatMessagesTable).values(Array.from({ length: 60 }, (_, i) => ({ userId: cam.id, body: `bulk ${i}` })));
  const page = (await ada.b.get("/api/chat/messages?limit=50")).data;
  assert.equal(page.items.length, 50);
  assert.equal(page.hasMore, true);
  assert.ok(page.items.every((m: { id: number }, i: number, all: Array<{ id: number }>) => i === 0 || all[i - 1].id < m.id), "ascending ids");
  const earlier = (await ada.b.get(`/api/chat/messages?before=${page.items[0].id}&limit=100`)).data;
  assert.ok(earlier.items.length > 0 && earlier.items.at(-1).id < page.items[0].id);
  assert.equal((await ada.b.get("/api/chat/messages?limit=500")).status, 400);
});

test("only the author or an administrator can delete a message", async () => {
  const mine = (await ben.b.post("/api/chat/messages", { body: "delete me later" })).data;
  assert.equal((await ada.b.request("DELETE", `/api/chat/messages/${mine.id}`)).status, 403);
  assert.equal((await ben.b.request("DELETE", `/api/chat/messages/${mine.id}`, undefined, { origin: "https://evil.example" })).status, 403, "cross-site deletes refused");
  assert.equal((await ben.b.request("DELETE", `/api/chat/messages/${mine.id}`)).status, 204);
  assert.equal((await ben.b.request("DELETE", `/api/chat/messages/${mine.id}`)).status, 404);
  const other = (await ada.b.post("/api/chat/messages", { body: "an administrator may remove this" })).data;
  await db.insert(adminMembershipsTable).values({ userId: cam.id, status: "active", grantSource: "chat integration test" });
  const asAdmin = (await cam.b.get("/api/chat/messages")).data.items.find((m: { id: number }) => m.id === other.id);
  assert.equal(asAdmin.canDelete, true);
  assert.equal((await cam.b.request("DELETE", `/api/chat/messages/${other.id}`)).status, 204);
});

test("chat is in the data export and removed by data deletion", async () => {
  await ben.b.post("/api/chat/messages", { body: "export me" });
  const exported = (await ben.b.get("/api/me/export")).data;
  assert.ok(exported.chatMessages.some((m: { body: string }) => m.body === "export me"));
  const deleted = await ben.b.post("/api/me/data-deletion", { confirm: "DELETE" });
  assert.equal(deleted.status, 200);
  assert.ok(deleted.data.deleted.chatMessages >= 1);
  assert.equal((await db.select().from(chatMessagesTable).where(eq(chatMessagesTable.userId, ben.id))).length, 0);
});

async function cleanup() {
  const users = await db.select({ id: authUsersTable.id }).from(authUsersTable).where(like(authUsersTable.email, `%@${DOMAIN}`));
  if (users.length) await db.delete(adminMembershipsTable).where(inArray(adminMembershipsTable.userId, users.map(u => u.id)));
  await db.delete(authUsersTable).where(like(authUsersTable.email, `%@${DOMAIN}`));
  await db.delete(authCodesTable).where(like(authCodesTable.email, `%@${DOMAIN}`));
}

async function main() {
  const server = app.listen(0);
  await new Promise(r => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  let failed = 0;
  try {
    ada = await student("ada", "Ada", "lovelace");
    ben = await student("ben", "Ben", "");
    cam = await student("cam", "Cam", "Okafor");
    for (const [name, fn] of tests) {
      try { await fn(); console.log(`PASS ${name}`); }
      catch (error) { failed++; console.error(`FAIL ${name}\n  ${(error as Error).stack ?? (error as Error).message}`); }
    }
  } finally {
    await cleanup();
    server.close();
    await pool.end();
  }
  console.log(`\n${tests.length - failed}/${tests.length} passed`);
  process.exit(failed ? 1 : 0);
}

void main();
