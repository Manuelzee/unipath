import assert from "node:assert/strict";
import { db, pool, studentProfilesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

async function run() {
  await db.transaction(async tx => {
    // Shadow the real table in this transaction. No account or saved profile is touched.
    await tx.execute(sql`CREATE TEMP TABLE student_profiles (LIKE public.student_profiles INCLUDING ALL) ON COMMIT DROP`);
    const empty = { residenceCountry: "United States", citizenship: "United States",
      studyCountry: "United States", degreeLevel: "Bachelor", major: "Biology",
      grades: "3.8 GPA", annualBudgetUsd: 0, preferredLanguage: "English",
      englishTest: "", englishScore: "" };
    await tx.insert(studentProfilesTable).values({
      ...empty, userId: "unit-profile-first", budgetChoice: "custom", customBudget: 20000,
      budgetCurrency: "USD", budgetScope: "tuition", startTerm: "spring", startYear: 2027,
      priorities: ["affordability", "scholarships", "major"], topPriorities: ["scholarships", "major", "affordability"],
      applicantStatus: "domestic", admissionTrack: "first_year", residenceRegion: "Alabama",
    });
    await tx.insert(studentProfilesTable).values({ ...empty, userId: "unit-profile-other", major: "History",
      budgetChoice: "custom", customBudget: 3000000001, budgetCurrency: "VND" });
    const [saved] = await tx.select().from(studentProfilesTable).where(eq(studentProfilesTable.userId, "unit-profile-first"));
    assert.equal(saved.budgetChoice, "custom"); assert.equal(saved.customBudget, 20000);
    assert.equal(saved.startTerm, "spring"); assert.equal(saved.startYear, 2027);
    assert.deepEqual(saved.topPriorities, ["scholarships", "major", "affordability"]);
    await tx.insert(studentProfilesTable).values({ ...empty, userId: "unit-profile-first", grades: "3.9 GPA",
      budgetChoice: "none", customBudget: null, startTerm: "fall",
      priorities: ["major", "scholarships"], topPriorities: ["major", "scholarships"] })
      .onConflictDoUpdate({ target: studentProfilesTable.userId,
        set: { grades: "3.9 GPA", budgetChoice: "none", customBudget: null, startTerm: "fall",
          priorities: ["major", "scholarships"], topPriorities: ["major", "scholarships"] } });
    const [updated] = await tx.select().from(studentProfilesTable).where(eq(studentProfilesTable.userId, "unit-profile-first"));
    const [other] = await tx.select().from(studentProfilesTable).where(eq(studentProfilesTable.userId, "unit-profile-other"));
    assert.equal(updated.grades, "3.9 GPA");
    assert.equal(updated.budgetChoice, "none"); assert.equal(updated.customBudget, null);
    assert.equal(updated.startTerm, "fall"); assert.equal(updated.startYear, 2027);
    assert.deepEqual(updated.topPriorities, ["major", "scholarships"]);
    assert.equal(updated.citizenship, "United States"); assert.equal(updated.admissionTrack, "first_year");
    assert.equal(other.major, "History"); assert.equal(other.budgetChoice, "custom");
    assert.equal(other.customBudget, 3000000001); assert.equal(other.budgetCurrency, "VND");
  });
  console.log("PASS: account-isolated preference storage, reload, edits, ranked priorities, old fields preserved and no real student account changed.");
}
run().catch(e => { console.error(e instanceof Error ? e.message : "Preference regression failed"); process.exitCode = 1; }).finally(() => pool.end());
