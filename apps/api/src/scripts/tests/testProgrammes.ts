/**
 * Integration test for programme pages, through the real app and database:
 * only administrators can add, edit and confirm programmes; drafts stay
 * hidden; search, filters and deadline sorting work; changing a confirmed
 * detail clears the confirmation; a student sees document readiness from the
 * document types they chose, academic fit from a 4.0-scale GPA, and whether
 * they already track the programme.
 *
 * Uses throwaway accounts and programmes and removes them.
 *
 * Run: pnpm run test:integration (reads DATABASE_URL from .env)
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq, inArray, like } from "drizzle-orm";

process.env.LOG_LEVEL = "silent";
delete process.env.EMAIL_VERIFICATION;
// Test uploads go to a temporary folder, never the real storage.
process.env.STORAGE_DIR = path.join(tmpdir(), `unipath-test-storage-${randomUUID().slice(0, 8)}`);

const { default: app } = await import("../../app");
const {
  adminMembershipsTable, applicationsTable, authUsersTable, db, institutionDirectoryTable, pool, programmesTable,
  studentDocumentsTable, studentProfilesTable,
} = await import("@workspace/db");
const { setMailer } = await import("../../lib/auth/email");
setMailer(async () => undefined);

const DOMAIN = `prog-test-${randomUUID().slice(0, 8)}.example.invalid`;
const TAG = `Test ${randomUUID().slice(0, 6)}`;
let base = "";
class Browser {
  cookie = "";
  async request(method: string, path: string, body?: unknown, contentType = "application/json") {
    const res = await fetch(base + path, {
      method, headers: { origin: base, ...(body !== undefined ? { "content-type": contentType } : {}), ...(this.cookie ? { cookie: this.cookie } : {}) },
      body: body === undefined ? undefined : contentType === "application/json" ? JSON.stringify(body) : body as NonNullable<RequestInit["body"]>,
    });
    const session = res.headers.getSetCookie().find(c => c.startsWith("unipath_session="));
    if (session) this.cookie = session.split(";")[0];
    const text = await res.text();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test reads loosely typed JSON
    return { status: res.status, data: (text ? JSON.parse(text) : null) as any };
  }
  get = (path: string) => this.request("GET", path);
  post = (path: string, body?: unknown) => this.request("POST", path, body);
  put = (path: string, body?: unknown) => this.request("PUT", path, body);
}
async function account(name: string) {
  const b = new Browser();
  const res = await b.post("/api/auth/sign-up", { email: `${name}@${DOMAIN}`, password: "correct horse battery", firstName: name, lastName: "Test" });
  assert.equal(res.data?.status, "signed_in", JSON.stringify(res.data));
  return { b, id: res.data.user.id as string };
}

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
let school = { id: "", countryCode: "" };
const input = (over: Record<string, unknown> = {}) => ({
  institutionId: school.id, name: `${TAG} MSc Data Science`, level: "master", degreeName: "Master of Science", field: `${TAG} Data Science`,
  language: "English", durationMonths: 12, studyMode: "full_time", intakes: ["September 2027"],
  tuitionAmount: 18500, tuitionCurrency: "GBP", tuitionPeriod: "year", tuitionNote: "2027/28 international fee",
  applicationFeeAmount: 0, applicationFeeCurrency: "GBP", deadlineType: "fixed", deadline: day(60), deadlineNote: null,
  academicRequirement: "A good bachelor's degree in a related subject.", languageRequirement: "IELTS 6.5 overall.", otherRequirements: null,
  minimumGpa: 3.0, requiredDocuments: [
    { kind: "transcript", need: "required", note: "Official transcript" },
    { kind: "passport", need: "required", note: null },
    { kind: "english_test", need: "if_applicable", note: "If English is not your first language" },
  ],
  officialUrl: "https://uni.example/msc-data-science", applyUrl: "https://uni.example/apply", sourceUrl: "https://uni.example/msc-data-science",
  checkedAt: day(0), status: "draft", ...over,
});

const tests: Array<[string, () => Promise<void>]> = [];
const test = (name: string, fn: () => Promise<void>) => tests.push([name, fn]);
let admin: Awaited<ReturnType<typeof account>>;
let student: Awaited<ReturnType<typeof account>>;
let programmeId = 0;

test("only administrators can add programmes, and invalid details are refused", async () => {
  assert.equal((await new Browser().post("/api/admin/programmes", input())).status, 401);
  assert.equal((await student.b.post("/api/admin/programmes", input())).status, 403);
  assert.equal((await admin.b.post("/api/admin/programmes", input({ officialUrl: "http://uni.example/x" }))).status, 400);
  assert.equal((await admin.b.post("/api/admin/programmes", input({ institutionId: "ror-000000000" }))).status, 400);
  assert.equal((await admin.b.post("/api/admin/programmes", input({ deadlineType: "rolling" }))).status, 400, "a rolling deadline has no date");
  const created = await admin.b.post("/api/admin/programmes", input());
  assert.equal(created.status, 201, JSON.stringify(created.data));
  programmeId = created.data.id;
  assert.equal(created.data.status, "draft");
  assert.equal(created.data.verification.level, "checked");
});

test("drafts stay hidden until published", async () => {
  assert.equal((await student.b.get(`/api/programmes/${programmeId}`)).status, 404);
  assert.ok(!(await student.b.get(`/api/programmes?search=${encodeURIComponent(TAG)}`)).data.items.length);
  const published = await admin.b.put(`/api/admin/programmes/${programmeId}`, input({ status: "published" }));
  assert.equal(published.status, 200, JSON.stringify(published.data));
  const page = (await new Browser().get(`/api/programmes/${programmeId}`)).data;
  assert.equal(page.programme.name, `${TAG} MSc Data Science`);
  assert.equal(page.programme.institution.id, school.id);
  assert.equal(page.programme.tuitionAmount, 18500);
  assert.equal(page.programme.requiredDocuments.length, 3);
  const atSchool = (await new Browser().get(`/api/universities/${school.id}/programmes`)).data.items.map((p: { id: number }) => p.id);
  assert.ok(atSchool.includes(programmeId));
});

test("search, filters and deadline sorting", async () => {
  const rolling = await admin.b.post("/api/admin/programmes", input({ name: `${TAG} BSc Rolling`, level: "bachelor", deadlineType: "rolling", deadline: null, status: "published" }));
  const closed = await admin.b.post("/api/admin/programmes", input({ name: `${TAG} BSc Closed`, level: "bachelor", deadline: day(-10), status: "published" }));
  const soon = await admin.b.post("/api/admin/programmes", input({ name: `${TAG} MA Soon`, deadline: day(5), status: "published" }));
  assert.ok([rolling, closed, soon].every(r => r.status === 201));
  const ordered = (await student.b.get(`/api/programmes?search=${encodeURIComponent(TAG)}`)).data.items.map((p: { name: string }) => p.name.replace(`${TAG} `, ""));
  assert.deepEqual(ordered, ["MA Soon", "MSc Data Science", "BSc Rolling", "BSc Closed"], "open deadlines soonest first, then rolling, then closed");
  const bachelors = (await student.b.get(`/api/programmes?search=${encodeURIComponent(TAG)}&level=bachelor`)).data;
  assert.equal(bachelors.total, 2);
  const inCountry = (await student.b.get(`/api/programmes?search=${encodeURIComponent(TAG)}&countryCode=${school.countryCode}`)).data;
  assert.equal(inCountry.total, 4);
  const filters = (await student.b.get("/api/programmes/filters")).data;
  assert.ok(filters.fields.some((f: { value: string; count: number }) => f.value === `${TAG} Data Science` && f.count === 4));
  assert.ok(filters.countries.some((c: { value: string }) => c.value === school.countryCode));
  assert.equal((await student.b.get("/api/programmes?level=nursery")).status, 400);
});

test("a university's confirmation is recorded, and changing a detail clears it", async () => {
  assert.equal((await admin.b.post(`/api/admin/programmes/${programmeId}/confirmation`, { note: "no" })).status, 400, "say how it was confirmed");
  const confirmed = await admin.b.post(`/api/admin/programmes/${programmeId}/confirmation`, { note: "Email from the admissions office" });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.data.verification.level, "confirmed");
  assert.equal((await student.b.get(`/api/programmes?search=${encodeURIComponent(TAG)}&confirmedOnly=true`)).data.total, 1);
  const statusOnly = await admin.b.put(`/api/admin/programmes/${programmeId}`, input({ status: "published" }));
  assert.equal(statusOnly.data.verification.level, "confirmed", "saving the same details keeps the confirmation");
  const changed = await admin.b.put(`/api/admin/programmes/${programmeId}`, input({ status: "published", tuitionAmount: 19000 }));
  assert.equal(changed.data.verification.level, "checked", "a new fee needs a new confirmation");
  assert.equal(changed.data.confirmationNote, null);
});

test("readiness counts the student's typed documents and compares a 4.0 GPA", async () => {
  assert.equal((await new Browser().get(`/api/me/programmes/${programmeId}/readiness`)).status, 401);
  let r = (await student.b.get(`/api/me/programmes/${programmeId}/readiness`)).data;
  assert.equal(r.requiredCount, 2);
  assert.equal(r.readyCount, 0);
  assert.equal(r.academic.status, "unknown");
  const pdf = Buffer.from("%PDF-1.4\n% test file\n");
  const up = await student.b.request("POST", "/api/me/documents?fileName=passport.pdf&title=My%20passport&kind=passport", pdf, "application/octet-stream");
  assert.equal(up.status, 201, JSON.stringify(up.data));
  assert.equal(up.data.kind, "passport");
  const other = await student.b.request("POST", "/api/me/documents?fileName=grades.pdf", pdf, "application/octet-stream");
  assert.equal(other.data.kind, null);
  await db.insert(studentProfilesTable).values({ userId: student.id, residenceCountry: "", citizenship: "", studyCountry: "", degreeLevel: "",
    major: "", grades: "3.2", gradingScale: "4.0 GPA", annualBudgetUsd: 0, preferredLanguage: "", englishTest: "", englishScore: "" });
  r = (await student.b.get(`/api/me/programmes/${programmeId}/readiness`)).data;
  assert.equal(r.readyCount, 1);
  assert.deepEqual(r.documents.find((d: { kind: string }) => d.kind === "passport").documentTitles, ["My passport"]);
  assert.equal(r.academic.status, "meets");
  const typed = await student.b.request("PATCH", `/api/me/documents/${other.data.id}`, { kind: "transcript" });
  assert.equal(typed.data.kind, "transcript");
  r = (await student.b.get(`/api/me/programmes/${programmeId}/readiness`)).data;
  assert.equal(r.readyCount, 2, "choosing the type afterwards counts too");
});

test("tracking a programme is remembered for the student only", async () => {
  assert.equal((await student.b.get(`/api/me/programmes/${programmeId}/readiness`)).data.trackedApplicationId, null);
  const tracked = await student.b.post("/api/me/applications", { universityId: school.id, programName: `${TAG} MSc Data Science`, status: "interested" });
  assert.equal(tracked.status, 201);
  assert.equal((await student.b.get(`/api/me/programmes/${programmeId}/readiness`)).data.trackedApplicationId, tracked.data.id);
  assert.equal((await admin.b.get(`/api/me/programmes/${programmeId}/readiness`)).data.trackedApplicationId, null);
});

test("archived programmes disappear from students but stay with administrators", async () => {
  await admin.b.put(`/api/admin/programmes/${programmeId}`, input({ status: "archived", tuitionAmount: 19000 }));
  assert.equal((await student.b.get(`/api/programmes/${programmeId}`)).status, 404);
  assert.equal((await admin.b.get(`/api/admin/programmes/${programmeId}`)).data.status, "archived");
  assert.equal((await student.b.get(`/api/admin/programmes/${programmeId}`)).status, 403);
});

async function cleanup() {
  const users = await db.select({ id: authUsersTable.id }).from(authUsersTable).where(like(authUsersTable.email, `%@${DOMAIN}`));
  const ids = users.map(u => u.id);
  await db.delete(programmesTable).where(like(programmesTable.name, `${TAG}%`));
  if (ids.length) {
    await db.delete(studentDocumentsTable).where(inArray(studentDocumentsTable.userId, ids));
    await db.delete(applicationsTable).where(inArray(applicationsTable.userId, ids));
    await db.delete(studentProfilesTable).where(inArray(studentProfilesTable.userId, ids));
    await db.delete(adminMembershipsTable).where(inArray(adminMembershipsTable.userId, ids));
  }
  await db.delete(authUsersTable).where(like(authUsersTable.email, `%@${DOMAIN}`));
}

async function main() {
  const server = app.listen(0);
  await new Promise(r => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  // Administrative changes must come from a trusted origin: this test server.
  process.env.UNIPATH_TRUSTED_ORIGINS = base;
  let failed = 0;
  try {
    const [row] = await db.select({ id: institutionDirectoryTable.id, countryCode: institutionDirectoryTable.countryCode })
      .from(institutionDirectoryTable).where(eq(institutionDirectoryTable.isActive, true)).limit(1);
    assert.ok(row, "the directory needs at least one university");
    school = row;
    admin = await account("admin");
    student = await account("student");
    await db.insert(adminMembershipsTable).values({ userId: admin.id, status: "active", grantSource: "programmes integration test" });
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
