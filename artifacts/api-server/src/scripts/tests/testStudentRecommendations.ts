import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db, pool, institutionDirectoryTable, matchingEvidenceTable, type StudentProfileRecord } from "@workspace/db";
import { importVerifiedMatchingEvidence } from "../../lib/matching/seed";
import { assessBudget, assessFunding, assessTerm, getRecommendations } from "../../lib/matching/score";

async function run() {
  const first = await importVerifiedMatchingEvidence();
  assert.ok("inserted" in first);
  assert.equal((await importVerifiedMatchingEvidence()).inserted, 0);
  const [school] = await db.select().from(institutionDirectoryTable).where(eq(institutionDirectoryTable.id, "nces-100751"));
  assert.equal(school.website, "https://www.ua.edu/");
  const rows = await db.select().from(matchingEvidenceTable).where(eq(matchingEvidenceTable.institutionId, school.id));
  assert.ok(rows.length >= 6, "At least six independently verified pilot evidence records");
  const profile = {
    livingExpenses: {},
    userId: "unit-fixture-not-persisted", residenceCountry: "United States", citizenship: "United States",
    studyCountry: "United States", degreeLevel: "Bachelor", major: "", grades: "", annualBudgetUsd: 0,
    preferredLanguage: "", englishTest: "", englishScore: "", budgetChoice: "custom", budgetCurrency: "USD",
    customBudget: 20000, budgetScope: "tuition", startTerm: "spring", startYear: 2027,
    priorities: ["scholarships", "affordability"], topPriorities: ["scholarships", "affordability"],
    preferredLocation: "", residenceRegion: "Alabama", applicantStatus: "domestic",
    admissionTrack: "first_year", updatedAt: new Date(),
  } satisfies StudentProfileRecord;
  assert.equal(assessTerm(profile, rows, "2026-10-27").status, "listed");
  assert.equal(assessTerm(profile, rows, "2026-11-03").status, "deadline_passed");
  assert.equal(assessTerm({ ...profile, admissionTrack: "graduate" }, rows).status, "needs_verification");
  assert.equal(assessTerm({ ...profile, applicantStatus: "international" }, rows).status, "needs_verification");
  assert.equal(assessTerm(profile, []).status, "needs_verification");
  assert.equal(assessFunding(profile, rows).status, "available");
  assert.equal(assessFunding({ ...profile, admissionTrack: "graduate" }, rows).status, "needs_verification");
  assert.equal((await assessBudget(profile, school, rows)).status, "may_fit");
  assert.equal((await assessBudget({ ...profile, budgetScope: "total", customBudget: 10000 }, school, rows)).status, "above_budget");
  assert.equal((await assessBudget({ ...profile, customBudget: 10000 }, school, rows)).status, "needs_verification");
  assert.equal((await assessBudget({ ...profile, applicantStatus: "international" }, school, rows)).status, "needs_verification");
  assert.equal((await assessBudget({ ...profile, budgetChoice: "50000_plus" }, school, rows)).status, "needs_verification");
  const r = await getRecommendations(profile);
  assert.ok(r.totalCandidates > 5000 && r.items.length > 0);
  assert.ok(r.items.some(item => item.university.id === "nces-100751"));
  assert.equal(JSON.stringify(r).includes("12718"), false);
  assert.equal(JSON.stringify(r).includes("36724"), false);
  assert.equal(JSON.stringify(r).includes("tuitionInStateUsd"), false);
  const canada = await getRecommendations({ ...profile, studyCountry: "Canada" });
  assert.ok(canada.totalCandidates > 200 && canada.totalCandidates < 300);
  assert.ok(canada.items.every(item => item.university.countryCode === "CA"));
  assert.equal((await getRecommendations({ ...profile, studyCountry: "France" })).items.length, 0);
  const unselected = await getRecommendations({ ...profile, studyCountry: "", degreeLevel: "",
    budgetChoice: "none", priorities: [], topPriorities: [], startTerm: "flexible", startYear: null });
  assert.equal(unselected.items.length, 0, "Do not suggest alphabetical schools when no preferences or supporting evidence exist.");
  console.log("PASS: real institution and scoped official evidence, repeat import idempotent, costs never in responses, budget category/total and international fallbacks, priority-only deadlines, graduate and term unknown, Canada country filtering, unsupported country empty, no fabricated matches.");
}
run().catch(e => { console.error(e instanceof Error ? e.message : "Matching regression failed"); process.exitCode = 1; }).finally(() => pool.end());
