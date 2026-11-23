/**
 * Integration test for the blueprint workspace APIs against a real database:
 * - students can never read or change another student's records;
 * - applications, tasks, checklists, dashboard, export and deletion work;
 * - private documents: the real file type is checked, only the owner can read
 *   or change them, downloads are never rendered inline, and deleting your
 *   data removes the stored files;
 * - AI requests are quota-limited, provider failures are not charged, and
 *   private profile fields (budget, citizenship, region) never reach the provider.
 *
 * The AI provider is stubbed; no external request is made. Uses throwaway user
 * IDs and a temporary storage folder, and removes everything it creates.
 * Existing institutions are read, never modified; a fixture institution is
 * created only if the directory is empty.
 *
 * Run: pnpm run test:integration (reads DATABASE_URL from .env)
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import express from "express";
import { eq, inArray } from "drizzle-orm";
import {
  aiSavedItemsTable, aiUsageTable, applicationTasksTable, applicationsTable, db, institutionDirectoryTable,
  jobApplicationsTable, pool, savedUniversitiesTable, studentDocumentsTable, studentProfilesTable,
} from "@workspace/db";
import studentRouter from "../../routes/student";
import applicationsRouter from "../../routes/applications";
import aiRouter from "../../routes/ai";
import accountRouter from "../../routes/account";
import recommendationsRouter from "../../routes/recommendations";
import documentsRouter from "../../routes/documents";
import { objectExists } from "../../lib/storage";

const A = `test-iso-a-${randomUUID()}`;
const B = `test-iso-b-${randomUUID()}`;
const FIXTURE_ID = `test-iso-inst-${randomUUID()}`;
const CLERK_AUTH_BRAND = Symbol.for("@clerk/express.auth");

// ---- Stub the AI provider (global fetch) ----
const realFetch = globalThis.fetch;
const providerCalls: Array<{ body: { messages: Array<{ role: string; content: string }>; user: string } }> = [];
let providerMode: "ok" | "fail" = "ok";
globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith("https://api.openai.com/")) {
    providerCalls.push({ body: JSON.parse(String(init?.body)) });
    if (providerMode === "fail") return new Response("{}", { status: 500 });
    return Response.json({ model: "stub-model", choices: [{ message: { content: "Stubbed advisory answer [1]." } }], usage: { prompt_tokens: 10, completion_tokens: 5 } });
  }
  return realFetch(input, init);
}) as typeof fetch;

// ---- App with Clerk-compatible test auth ----
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  const userId = req.get("x-test-user") ?? null;
  const auth = () => ({ userId, sessionId: userId ? "test-session" : null, tokenType: "session_token", isAuthenticated: !!userId, getToken: async () => null, has: () => false, debug: () => ({}) });
  (req as unknown as { auth: unknown }).auth = Object.assign(auth, { [CLERK_AUTH_BRAND]: true });
  (req as unknown as { log: unknown }).log = { info() {}, warn() {}, error() {} };
  next();
});
for (const router of [studentRouter, applicationsRouter, aiRouter, accountRouter, recommendationsRouter, documentsRouter]) app.use("/api", router);

let base = "";
async function call(user: string | null, method: string, path: string, body?: unknown, contentType = "application/json") {
  const res = await realFetch(base + path, {
    method,
    headers: { ...(user ? { "x-test-user": user } : {}), ...(body !== undefined ? { "content-type": contentType } : {}) },
    body: body === undefined ? undefined : contentType === "application/json" ? JSON.stringify(body) : String(body),
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

/** Uploads raw bytes the way the web app does (application/octet-stream, metadata in the query). */
async function upload(user: string | null, query: Record<string, string | number>, bytes: Uint8Array, headers: Record<string, string> = {}) {
  const qs = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)]));
  const res = await realFetch(`${base}/api/me/documents?${qs}`, {
    method: "POST",
    headers: { ...(user ? { "x-test-user": user } : {}), "content-type": "application/octet-stream", ...headers },
    body: bytes,
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

async function download(user: string, id: number) {
  const res = await realFetch(`${base}/api/me/documents/${id}/file`, { headers: { "x-test-user": user } });
  return { status: res.status, headers: res.headers, bytes: Buffer.from(await res.arrayBuffer()) };
}

const pdfBytes = (size = 64) => Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(Math.max(0, size - 9), 0x20)]);

const tests: Array<[string, () => Promise<void>]> = [];
const test = (name: string, fn: () => Promise<void>) => tests.push([name, fn]);
const nextYear = new Date().getFullYear() + 1;
const futureDate = `${nextYear}-01-15`;
let institutionId = "";
let createdFixture = false;
let appId = 0;
let taskId = 0;
let aiItemId = 0;
let documentId = 0;
let storageDir = "";

test("unauthenticated requests are rejected", async () => {
  assert.equal((await call(null, "GET", "/api/me/applications")).status, 401);
  assert.equal((await call(null, "POST", "/api/ai/chat", { message: "hi" })).status, 401);
});

test("profile saves the new onboarding fields", async () => {
  const res = await call(A, "PUT", "/api/me/profile", {
    residenceCountry: "Nigeria", citizenship: "SECRET-CITIZEN", studyCountry: "Any", degreeLevel: "Bachelor",
    major: "Computer Science", grades: "A1 average", annualBudgetUsd: 0, preferredLanguage: "English",
    englishTest: "IELTS Academic", englishScore: "7.0", englishTestDate: "2026-05-01", currentQualification: "WAEC / WASSCE",
    gradingScale: "WAEC A1-F9", graduationYear: 2026, budgetChoice: "custom", customBudget: 987654, budgetCurrency: "USD",
    residenceRegion: "SECRET-REGION", applicantStatus: "international", admissionTrack: "first_year", startTerm: "fall", startYear: nextYear,
  });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal(res.data.currentQualification, "WAEC / WASSCE");
  assert.equal(res.data.graduationYear, 2026);
  assert.equal(res.data.englishTestDate, "2026-05-01");
  const bad = await call(A, "PUT", "/api/me/profile", { ...res.data, updatedAt: undefined, englishTestDate: "not-a-date" });
  assert.equal(bad.status, 400);
});

test("recommendations carry a blueprint classification", async () => {
  const res = await call(A, "GET", "/api/me/recommendations");
  assert.equal(res.status, 200, JSON.stringify(res.data));
  for (const item of res.data.items) {
    assert.ok(["strong_match", "potential_match", "requirements_not_met", "insufficient_information"].includes(item.classification));
    assert.ok(item.classificationReason.length > 10);
  }
});

test("applications: create, validate links, reject forms", async () => {
  assert.equal((await call(A, "POST", "/api/me/saved", { universityId: institutionId })).status, 201);
  const created = await call(A, "POST", "/api/me/applications", {
    universityId: institutionId, programName: "BSc Computer Science", deadline: futureDate, applicationUrl: "www.example.edu/apply",
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.equal(created.data.status, "interested");
  assert.equal(created.data.applicationUrl, "https://www.example.edu/apply");
  assert.equal(created.data.university.id, institutionId);
  appId = created.data.id;
  assert.equal((await call(A, "POST", "/api/me/applications", { universityId: institutionId, applicationUrl: "javascript:alert(1)" })).status, 400);
  assert.equal((await call(A, "POST", "/api/me/applications", { universityId: "no-such-school" })).status, 404);
  assert.equal((await call(A, "POST", "/api/me/applications", `universityId=${institutionId}`, "application/x-www-form-urlencoded")).status, 415);
  assert.equal((await call(A, "PATCH", `/api/me/applications/${appId}`, { status: "not_a_status" })).status, 400);
});

test("application tasks and checklist (no duplicates, international item)", async () => {
  const task = await call(A, "POST", `/api/me/applications/${appId}/tasks`, { title: "Request transcript", dueDate: futureDate });
  assert.equal(task.status, 201);
  assert.equal(task.data.applicationId, appId);
  taskId = task.data.id;
  const first = await call(A, "POST", `/api/me/applications/${appId}/checklist`);
  assert.equal(first.status, 200);
  const titles = first.data.tasks.map((t: { title: string }) => t.title);
  assert.ok(titles.some((t: string) => t.includes("official admissions page")));
  assert.ok(titles.some((t: string) => t.includes("Proof of funds")), "international applicants get the visa item");
  assert.ok(first.data.tasks.every((t: { dueDate: string }) => t.dueDate === futureDate), "checklist uses the future deadline");
  const second = await call(A, "POST", `/api/me/applications/${appId}/checklist`);
  assert.equal(second.data.tasks.length, first.data.tasks.length, "re-adding does not duplicate");
  const moved = await call(A, "PATCH", `/api/me/applications/${appId}`, { status: "preparing_documents", notes: "  Ask for a reference  " });
  assert.equal(moved.data.status, "preparing_documents");
  assert.equal(moved.data.notes, "Ask for a reference");
});

test("another student cannot see or change any of it", async () => {
  assert.deepEqual((await call(B, "GET", "/api/me/applications")).data, []);
  assert.equal((await call(B, "PATCH", `/api/me/applications/${appId}`, { status: "rejected" })).status, 404);
  assert.equal((await call(B, "DELETE", `/api/me/applications/${appId}`)).status, 404);
  assert.equal((await call(B, "POST", `/api/me/applications/${appId}/tasks`, { title: "x", dueDate: futureDate })).status, 404);
  assert.equal((await call(B, "POST", `/api/me/applications/${appId}/checklist`)).status, 404);
  assert.equal((await call(B, "PATCH", `/api/me/tasks/${taskId}`, { completed: true })).status, 404);
  assert.equal((await call(B, "DELETE", `/api/me/tasks/${taskId}`)).status, 404);
  const mine = await call(A, "GET", "/api/me/applications");
  assert.equal(mine.data[0].status, "preparing_documents", "A's record was not changed by B");
});

test("documents: upload checks the real file type, size, origin and application owner", async () => {
  assert.equal((await upload(null, { fileName: "x.pdf" }, pdfBytes())).status, 401);
  const created = await upload(A, { fileName: "C:\\Users\\me\\Transcript 2026.PDF", title: "  Final transcript ", applicationId: appId }, pdfBytes());
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.equal(created.data.contentType, "application/pdf");
  assert.equal(created.data.fileName, "Transcript 2026.pdf");
  assert.equal(created.data.title, "Final transcript");
  assert.equal(created.data.applicationId, appId);
  documentId = created.data.id;

  const html = Buffer.from("<html><script>alert(1)</script></html>");
  assert.equal((await upload(A, { fileName: "essay.pdf" }, html)).status, 400, "HTML renamed to .pdf is refused");
  assert.equal((await upload(A, { fileName: "empty.pdf" }, Buffer.alloc(0))).status, 400);
  assert.equal((await upload(A, { fileName: "x.pdf" }, pdfBytes(), { "content-type": "text/plain" })).status, 415);
  assert.equal((await upload(A, { fileName: "x.pdf" }, pdfBytes(), { origin: "https://evil.example" })).status, 403);
  assert.equal((await upload(A, {}, pdfBytes())).status, 400, "a file name is required");
  assert.equal((await upload(B, { fileName: "x.pdf", applicationId: appId }, pdfBytes())).status, 404, "B cannot attach to A's application");
  process.env.DOCUMENT_MAX_BYTES = "2048";
  try { assert.equal((await upload(A, { fileName: "big.pdf" }, pdfBytes(4096))).status, 413); }
  finally { delete process.env.DOCUMENT_MAX_BYTES; }

  const list = (await call(A, "GET", "/api/me/documents")).data;
  assert.deepEqual(list.map((d: { id: number }) => d.id), [documentId], "refused uploads leave no record");
});

test("documents: only the owner can list, download, rename or delete; downloads are attachments", async () => {
  assert.deepEqual((await call(B, "GET", "/api/me/documents")).data, []);
  assert.equal((await download(B, documentId)).status, 404);
  assert.equal((await call(B, "PATCH", `/api/me/documents/${documentId}`, { title: "Mine now" })).status, 404);
  assert.equal((await call(B, "DELETE", `/api/me/documents/${documentId}`)).status, 404);

  const file = await download(A, documentId);
  assert.equal(file.status, 200);
  assert.ok(file.bytes.equals(pdfBytes()), "the stored bytes come back unchanged");
  assert.match(file.headers.get("content-disposition") ?? "", /^attachment; filename="Transcript 2026\.pdf"/);
  assert.equal(file.headers.get("x-content-type-options"), "nosniff");
  assert.match(file.headers.get("content-security-policy") ?? "", /sandbox/);
  assert.match(file.headers.get("cache-control") ?? "", /no-store/);

  const renamed = await call(A, "PATCH", `/api/me/documents/${documentId}`, { title: "Official transcript" });
  assert.equal(renamed.status, 200, JSON.stringify(renamed.data));
  assert.equal(renamed.data.title, "Official transcript");
  assert.equal((await call(A, "PATCH", `/api/me/documents/${documentId}`, {})).status, 400, "an empty change is refused");
  assert.equal((await call(A, "GET", "/api/me/documents")).data[0].title, "Official transcript", "B's attempts changed nothing");
});

test("documents: deleting one removes its stored file", async () => {
  const extra = await upload(A, { fileName: "photo.png" }, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]));
  assert.equal(extra.status, 201, JSON.stringify(extra.data));
  const [row] = await db.select().from(studentDocumentsTable).where(eq(studentDocumentsTable.id, extra.data.id));
  assert.ok(await objectExists(row.storageKey));
  assert.ok(path.resolve(storageDir, ...row.storageKey.split("/")).startsWith(storageDir + path.sep), "files go to STORAGE_DIR");
  assert.equal((await call(A, "DELETE", `/api/me/documents/${extra.data.id}`)).status, 204);
  assert.equal(await objectExists(row.storageKey), false);
  assert.equal((await download(A, extra.data.id)).status, 404);
});

test("dashboard summarises only the student's own records", async () => {
  const a = (await call(A, "GET", "/api/me/dashboard")).data;
  assert.equal(a.totalApplications, 1);
  assert.equal(a.activeApplications, 1);
  assert.equal(a.upcomingDeadlines.length, 1);
  assert.equal(a.upcomingDeadlines[0].deadline, futureDate);
  assert.deepEqual(a.applicationsByStatus, [{ status: "preparing_documents", count: 1 }]);
  assert.equal(a.profileCompletion.percent, 100, JSON.stringify(a.profileCompletion));
  assert.ok(a.recentActivity.some((x: { kind: string }) => x.kind === "saved"));
  const b = (await call(B, "GET", "/api/me/dashboard")).data;
  assert.equal(b.totalApplications, 0);
  assert.equal(b.profileCompletion.percent, 0);
});

test("AI: not configured → 503 and nothing is sent", async () => {
  delete process.env.OPENAI_API_KEY;
  const res = await call(A, "POST", "/api/ai/chat", { message: "Hello" });
  assert.equal(res.status, 503);
  assert.equal(res.data.code, "AI_NOT_CONFIGURED");
  assert.equal(providerCalls.length, 0);
  assert.equal((await call(A, "GET", "/api/ai/status")).data.configured, false);
});

test("AI: grounded request keeps private fields out; quota and failures behave", async () => {
  process.env.OPENAI_API_KEY = "test-key-not-real";
  process.env.AI_DAILY_LIMIT_FREE = "2";
  const ok = await call(A, "POST", "/api/ai/chat", { message: "What do I need?", universityIds: [institutionId], useProfile: true });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.reply, "Stubbed advisory answer [1].");
  assert.ok(ok.data.grounding.some((f: { kind: string }) => f.kind === "university"));
  assert.ok(ok.data.grounding.some((f: { label: string; value: string }) => f.label === "Intended major" && f.value === "Computer Science"));
  const sent = JSON.stringify(providerCalls[0].body);
  for (const secret of ["SECRET-CITIZEN", "SECRET-REGION", "987654"]) assert.ok(!sent.includes(secret), `provider received ${secret}`);
  assert.ok(!sent.includes(A), "provider never receives the raw user id");
  assert.equal(providerCalls[0].body.messages[0].role, "system");

  providerMode = "fail";
  const failed = await call(A, "POST", "/api/ai/chat", { message: "Again?" });
  assert.equal(failed.status, 502);
  assert.equal(failed.data.code, "AI_PROVIDER_ERROR");
  assert.equal((await call(A, "GET", "/api/ai/status")).data.usedToday, 1, "provider failures are not charged");

  providerMode = "ok";
  const essay = await call(A, "POST", "/api/ai/essay-review", { essay: "I built a radio from spare parts. ".repeat(4), focus: ["grammar"] });
  assert.equal(essay.status, 200);
  assert.ok(!JSON.stringify(providerCalls.at(-1)!.body).includes("Computer Science"), "essay review does not send the academic profile");
  const limited = await call(A, "POST", "/api/ai/chat", { message: "One more" });
  assert.equal(limited.status, 429);
  assert.equal(limited.data.code, "AI_DAILY_LIMIT");
  const status = (await call(A, "GET", "/api/ai/status")).data;
  assert.deepEqual([status.usedToday, status.remainingToday, status.dailyLimit], [2, 0, 2]);
  assert.equal((await call(B, "GET", "/api/ai/status")).data.usedToday, 0, "quotas are per student");
  assert.equal((await call(A, "POST", "/api/ai/essay-review", { essay: "too short" })).status, 400);
});

test("AI saved items: approved content only, unsafe links dropped, private to owner", async () => {
  const saved = await call(A, "POST", "/api/me/ai/saved", { kind: "answer", title: "Checklist", content: "Reviewed text",
    sourceUrls: ["https://example.edu/admissions", "javascript:alert(1)"] });
  assert.equal(saved.status, 201);
  assert.deepEqual(saved.data.sourceUrls, ["https://example.edu/admissions"]);
  aiItemId = saved.data.id;
  assert.deepEqual((await call(B, "GET", "/api/me/ai/saved")).data, []);
  assert.equal((await call(B, "DELETE", `/api/me/ai/saved/${aiItemId}`)).status, 404);
});

test("export contains only the student's own data", async () => {
  const a = (await call(A, "GET", "/api/me/export")).data;
  assert.equal(a.profile.major, "Computer Science");
  assert.equal(a.applications.length, 1);
  assert.ok(a.tasks.length >= 8);
  assert.equal(a.aiSavedItems.length, 1);
  assert.equal(a.savedUniversities.length, 1);
  assert.deepEqual(a.documents.map((d: { id: number; title: string }) => [d.id, d.title]), [[documentId, "Official transcript"]]);
  assert.ok(!JSON.stringify(a.documents).includes("student-documents/"), "storage keys are never exposed");
  const b = (await call(B, "GET", "/api/me/export")).data;
  assert.deepEqual([b.profile, b.applications.length, b.tasks.length, b.aiSavedItems.length, b.documents.length], [null, 0, 0, 0, 0]);
});

test("data deletion needs confirmation and removes only the requester's records", async () => {
  await call(B, "POST", "/api/me/saved", { universityId: institutionId });
  const bDoc = await upload(B, { fileName: "b-passport.jpg" }, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 9]));
  assert.equal(bDoc.status, 201, JSON.stringify(bDoc.data));
  const storedFiles = async (user: string) =>
    (await db.select({ key: studentDocumentsTable.storageKey }).from(studentDocumentsTable).where(eq(studentDocumentsTable.userId, user))).map(r => r.key);
  const [aFile] = await storedFiles(A);
  const [bFile] = await storedFiles(B);
  assert.ok(await objectExists(aFile));
  assert.equal((await call(A, "POST", "/api/me/data-deletion", { confirm: "yes" })).status, 400);
  assert.ok(await objectExists(aFile), "an unconfirmed request deletes nothing");
  const res = await call(A, "POST", "/api/me/data-deletion", { confirm: "DELETE" });
  assert.equal(res.status, 200);
  assert.equal(res.data.deleted.documents, 1);
  assert.equal(await objectExists(aFile), false, "A's stored file is removed");
  assert.ok(await objectExists(bFile), "B's stored file is untouched");
  assert.equal((await download(B, bDoc.data.id)).status, 200);
  assert.equal(res.data.deleted.applications, 1);
  assert.equal(res.data.deleted.profiles, 1);
  assert.equal(res.data.deleted.aiSavedItems, 1);
  assert.equal(res.data.deleted.savedUniversities, 1);
  assert.ok(res.data.deleted.aiUsage >= 3);
  const after = (await call(A, "GET", "/api/me/export")).data;
  assert.deepEqual([after.profile, after.applications.length, after.tasks.length], [null, 0, 0]);
  assert.equal((await call(B, "GET", "/api/me/saved")).data.length, 1, "B's shortlist is untouched");
  assert.equal((await call(A, "DELETE", `/api/me/applications/${appId}`)).status, 404, "deleted tracker is gone");
});

async function cleanup() {
  const users = [A, B];
  await db.delete(studentDocumentsTable).where(inArray(studentDocumentsTable.userId, users));
  await db.delete(applicationTasksTable).where(inArray(applicationTasksTable.userId, users));
  await db.delete(applicationsTable).where(inArray(applicationsTable.userId, users));
  await db.delete(savedUniversitiesTable).where(inArray(savedUniversitiesTable.userId, users));
  await db.delete(aiSavedItemsTable).where(inArray(aiSavedItemsTable.userId, users));
  await db.delete(aiUsageTable).where(inArray(aiUsageTable.userId, users));
  await db.delete(jobApplicationsTable).where(inArray(jobApplicationsTable.userId, users));
  await db.delete(studentProfilesTable).where(inArray(studentProfilesTable.userId, users));
  if (createdFixture) await db.delete(institutionDirectoryTable).where(eq(institutionDirectoryTable.id, FIXTURE_ID));
}

async function main() {
  // Uploaded test files go to a throwaway folder, never the real storage.
  storageDir = await mkdtemp(path.join(os.tmpdir(), "unipath-test-storage-"));
  process.env.STORAGE_DIR = storageDir;
  const [existing] = await db.select({ id: institutionDirectoryTable.id }).from(institutionDirectoryTable)
    .where(eq(institutionDirectoryTable.isActive, true)).limit(1);
  if (existing) institutionId = existing.id;
  else {
    await db.insert(institutionDirectoryTable).values({
      id: FIXTURE_ID, name: "Test Isolation University", city: "Springfield", state: "IL", majors: ["Computer Science"],
      degreeLevels: ["Undergraduate"], degreeTypes: ["bachelor"], dataSource: "Test fixture", sourceUrl: "https://example.edu",
      admissionsWebsite: "https://example.edu/admissions",
    } as typeof institutionDirectoryTable.$inferInsert);
    institutionId = FIXTURE_ID; createdFixture = true;
  }
  const server = app.listen(0);
  await new Promise(r => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  let failed = 0;
  try {
    for (const [name, fn] of tests) {
      try { await fn(); console.log(`PASS ${name}`); }
      catch (error) { failed++; console.error(`FAIL ${name}\n  ${(error as Error).message}`); }
    }
  } finally {
    await cleanup();
    await rm(storageDir, { recursive: true, force: true });
    server.close();
    await pool.end();
  }
  console.log(`\n${tests.length - failed}/${tests.length} passed`);
  if (failed) process.exit(1);
}

void main();
