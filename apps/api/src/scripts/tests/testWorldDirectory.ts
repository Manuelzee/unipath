/**
 * Integration test for worldwide universities (ROR) and scholarships, through
 * the real app and database: the start-up import adds every bundled entry once,
 * search finds them (including other names), African and U.S. duplicates are
 * absent, scholarships attach to universities and countries, the "funding or
 * scholarships" filter includes universities with their own awards, and
 * recommendations narrow to the student's study country.
 *
 * Run: pnpm run test:integration (reads DATABASE_URL from .env). The first run
 * imports about 25,000 rows and takes a little while.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { and, eq, like } from "drizzle-orm";

process.env.LOG_LEVEL = "silent";
delete process.env.EMAIL_VERIFICATION;

const { default: app } = await import("../../app");
const { applicationTasksTable, applicationsTable, authUsersTable, db, institutionDirectoryTable, pool, studentProfilesTable } = await import("@workspace/db");
const { ensureInstitutionDirectory } = await import("../../lib/bootstrapDirectory");
const { ensureWorldDirectory, WORLD_SOURCE } = await import("../../lib/worldDirectory");
const { setMailer } = await import("../../lib/auth/email");
setMailer(async () => undefined);

const DOMAIN = `world-test-${randomUUID().slice(0, 8)}.example.invalid`;
let base = "";
let cookie = "";
async function get(path: string) {
  const res = await fetch(base + path, { headers: cookie ? { cookie } : {} });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test reads loosely typed JSON
  return { status: res.status, data: await res.json() as any };
}

const tests: Array<[string, () => Promise<void>]> = [];
const test = (name: string, fn: () => Promise<void>) => tests.push([name, fn]);

test("the start-up import adds every worldwide entry, and a second run adds none", async () => {
  await ensureInstitutionDirectory();
  const started = Date.now();
  const first = await ensureWorldDirectory();
  console.log(`  imported ${first.imported} (already present ${first.alreadyPresent}) in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  assert.equal(first.imported + first.alreadyPresent, WORLD_SOURCE.count);
  const again = await ensureWorldDirectory();
  assert.equal(again.imported, 0);
  assert.equal(again.alreadyPresent, WORLD_SOURCE.count);
});

test("worldwide universities are searchable by country, name and other names", async () => {
  const uk = (await get("/api/universities?countryCode=GB&pageSize=5")).data;
  assert.ok(uk.total > 500, `UK universities: ${uk.total}`);
  const oxford = (await get("/api/universities?search=Oxford%20University&countryCode=GB")).data.items
    .find((u: { id: string }) => u.id === "ror-052gg0110");
  assert.ok(oxford, "found by its other name");
  assert.equal(oxford.city, "Oxford");
  assert.equal(oxford.website, "https://www.ox.ac.uk/");
  assert.equal(oxford.dataSource, "Research Organization Registry (ROR)");
  assert.equal(oxford.sourceUrl, "https://ror.org/052gg0110");
  const detail = (await get("/api/universities/ror-052gg0110")).data;
  assert.equal(detail.name, "University of Oxford");
  const countries = (await get("/api/universities/filters")).data.countries.map((c: { code: string }) => c.code);
  for (const cc of ["GB", "DE", "JP", "BR", "IN", "AU"]) assert.ok(countries.includes(cc), cc);
  for (const cc of ["NG", "GH", "KE", "ZA", "EG"]) assert.ok(!countries.includes(cc), `${cc} must not appear`);
});

test("no African entries and no ROR copies of U.S. or Canada pilot schools", async () => {
  const [african] = await db.select({ n: institutionDirectoryTable.id }).from(institutionDirectoryTable)
    .where(eq(institutionDirectoryTable.countryCode, "NG")).limit(1);
  assert.equal(african, undefined);
  const [usFromRor] = await db.select({ id: institutionDirectoryTable.id }).from(institutionDirectoryTable)
    .where(and(like(institutionDirectoryTable.sourceKey, "ror:%"), eq(institutionDirectoryTable.countryCode, "US"))).limit(1);
  assert.equal(usFromRor, undefined);
  const toronto = (await get("/api/universities?search=University%20of%20Toronto&countryCode=CA")).data.items
    .filter((u: { name: string }) => u.name === "University of Toronto");
  assert.equal(toronto.length, 1, "listed once (Canada pilot), not again from ROR");
});

test("scholarships attach to universities and their countries", async () => {
  const oxford = (await get("/api/universities/ror-052gg0110/scholarships")).data.items;
  assert.deepEqual(oxford.filter((p: { scope: string }) => p.scope === "institution").map((p: { id: string }) => p.id).sort(), ["clarendon", "rhodes"]);
  assert.ok(oxford.some((p: { id: string; scope: string }) => p.id === "chevening" && p.scope === "country"));
  const rhodes = oxford.find((p: { id: string }) => p.id === "rhodes");
  assert.deepEqual(rhodes.institutions, [{ id: "ror-052gg0110", name: "University of Oxford" }]);
  assert.deepEqual(rhodes.studyCountryNames, ["United Kingdom"]);
  const german = (await get("/api/universities?countryCode=DE&pageSize=1")).data.items[0];
  const forGermany = (await get(`/api/universities/${german.id}/scholarships`)).data.items.map((p: { id: string }) => p.id);
  assert.ok(forGermany.includes("daad") && forGermany.includes("erasmus-mundus"));
  assert.equal((await get("/api/universities/ror-unknown0/scholarships")).status, 404);
  const list = (await get("/api/scholarships?country=GB&level=master")).data;
  assert.ok(list.total >= 4 && list.items.every((p: { studyCountries: string[]; levels: string[] }) => p.studyCountries.includes("GB") && p.levels.includes("master")));
  assert.ok(list.countries.some((c: { code: string }) => c.code === "JP"));
  assert.equal((await get("/api/scholarships?country=Nigeria")).status, 400);
});

test("the funding filter includes universities with their own scholarships", async () => {
  const funded = (await get("/api/universities?fundingOnly=true&countryCode=GB&pageSize=50")).data.items.map((u: { id: string }) => u.id);
  assert.ok(funded.includes("ror-052gg0110") && funded.includes("ror-013meh722"), "Oxford and Cambridge");
  assert.ok(!funded.includes("ror-041kmwe10"), "a university without its own listed award is not included");
});

test("sorting puts the most useful records first", async () => {
  const byName = (await get("/api/universities?countryCode=GB&pageSize=3")).data.items.map((u: { name: string }) => u.name);
  assert.deepEqual(byName, [...byName].sort((a: string, b: string) => a.localeCompare(b)), "the default stays A-Z");
  const funded = (await get("/api/universities?countryCode=GB&sort=funding&pageSize=2")).data.items.map((u: { id: string }) => u.id).sort();
  assert.deepEqual(funded, ["ror-013meh722", "ror-052gg0110"], "Cambridge and Oxford have their own scholarships");
  const detailed = (await get("/api/universities?sort=details&pageSize=1")).data.items[0];
  assert.ok(detailed.degreeLevels.length > 0 || detailed.majors.length > 0, "a record with programme details leads");
  assert.equal((await get("/api/universities?sort=random")).status, 400);
});

test("recommendations narrow to the student's study country", async () => {
  const res = await fetch(`${base}/api/auth/sign-up`, { method: "POST", headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ email: `ada@${DOMAIN}`, password: "correct horse battery", firstName: "Ada", lastName: "Test" }) });
  const user = (await res.json() as { user: { id: string } }).user;
  cookie = res.headers.getSetCookie().find(c => c.startsWith("unipath_session="))!.split(";")[0];
  await db.insert(studentProfilesTable).values({ userId: user.id, residenceCountry: "", citizenship: "", studyCountry: "the UK",
    degreeLevel: "", major: "", grades: "", annualBudgetUsd: 0, preferredLanguage: "", englishTest: "", englishScore: "" });
  const started = Date.now();
  const recs = await get("/api/me/recommendations");
  console.log(`  recommendations in ${Date.now() - started} ms`);
  assert.equal(recs.status, 200);
  assert.ok(recs.data.totalCandidates > 500 && recs.data.totalCandidates < 1000, `UK candidates: ${recs.data.totalCandidates}`);
  assert.ok(recs.data.items.length > 0 && recs.data.items.every((r: { university: { countryCode: string } }) => r.university.countryCode === "GB"));
});

test("notifications list the student's own upcoming deadlines and tasks", async () => {
  assert.equal((await fetch(`${base}/api/me/notifications`)).status, 401);
  const [user] = await db.select({ id: authUsersTable.id }).from(authUsersTable).where(eq(authUsersTable.email, `ada@${DOMAIN}`));
  const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  const [application] = await db.insert(applicationsTable).values({ userId: user.id, universityId: "ror-052gg0110", programName: "MSc Data Science", status: "preparing_documents", deadline: inDays(5) }).returning();
  await db.insert(applicationTasksTable).values({ userId: user.id, universityId: "ror-052gg0110", applicationId: application.id, title: "Ask for references", dueDate: inDays(-2) });
  const items = (await get("/api/me/notifications")).data.items;
  assert.deepEqual(items.map((i: { kind: string }) => i.kind), ["task", "deadline"]);
  assert.equal(items[0].title, "Overdue: Ask for references");
  assert.equal(items[1].title, "Deadline in 5 days");
  assert.match(items[1].detail, /MSc Data Science at University of Oxford/);
});

async function main() {
  const server = app.listen(0);
  await new Promise(r => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  let failed = 0;
  try {
    for (const [name, fn] of tests) {
      try { await fn(); console.log(`PASS ${name}`); }
      catch (error) { failed++; console.error(`FAIL ${name}\n  ${(error as Error).stack ?? (error as Error).message}`); }
    }
  } finally {
    const [user] = await db.select({ id: authUsersTable.id }).from(authUsersTable).where(eq(authUsersTable.email, `ada@${DOMAIN}`));
    if (user) {
      await db.delete(applicationTasksTable).where(eq(applicationTasksTable.userId, user.id));
      await db.delete(applicationsTable).where(eq(applicationsTable.userId, user.id));
      await db.delete(studentProfilesTable).where(eq(studentProfilesTable.userId, user.id));
      await db.delete(authUsersTable).where(eq(authUsersTable.id, user.id));
    }
    server.close();
    await pool.end();
  }
  console.log(`\n${tests.length - failed}/${tests.length} passed`);
  process.exit(failed ? 1 : 0);
}

void main();
