import assert from "node:assert/strict";
import { sql, eq } from "drizzle-orm";
import { db, pool, verifiedFieldsTable as fields, verificationProposalsTable as proposals,
  verificationJobsTable as jobs, adminMembershipsTable as memberships } from "@workspace/db";
import { runInstitutionCheck, reviewProposal, AdminError } from "../../lib/admin/verification";
import { identitySupported, matchingSupported, sourceText } from "../../lib/admin/sources";
import { administrator, trustedOrigins } from "../../lib/admin/security";

async function main() {
  assert.equal(identitySupported("The University of Alabama", "Welcome. The University of Alabama offers study."), true);
  assert.equal(identitySupported("The University of Alabama", "Welcome, this website exists."), false);
  assert.equal(sourceText("<script>The University of Alabama</script><p>Unrelated content</p>").includes("Alabama"), false);
  assert.equal(trustedOrigins().has("https://attacker.example"), false);
  await db.transaction(async tx => {
    // Isolate all writes in temporary shadow tables. Real directory records are read only.
    for (const table of ["institution_verification_jobs", "institution_verification_proposals", "institution_verified_fields", "admin_memberships"])
      await tx.execute(sql.raw(`CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING ALL) ON COMMIT DROP`));
    const database = tx as unknown as typeof db;
    assert.equal(await administrator("unknown-student", database), false);
    await tx.insert(memberships).values({ userId: "isolated-test-admin", status: "active", grantSource: "isolated_unit_test" });
    assert.equal(await administrator("isolated-test-admin", database), true);
    await tx.update(memberships).set({ status: "revoked" }).where(eq(memberships.userId, "isolated-test-admin"));
    assert.equal(await administrator("isolated-test-admin", database), false);
    const knownDate = new Date("2026-10-01T10:00:00.000Z");
    await tx.insert(fields).values({ institutionId: "nces-100751", fieldKey: "institution_name",
      value: "The University of Alabama", sourceUrl: "https://www.ua.edu/", checkedAt: knownDate,
      approvedAt: knownDate, approvedBy: "isolated-test-admin", jobId: "prior-approved-check" });
    const failed = await runInstitutionCheck("nces-100751", "isolated-test-admin", null, database,
      async () => { throw new Error("HTTP_503"); });
    assert.equal(failed.status, "failed");
    assert.ok(failed.checks.length > 0 && failed.checks.every(c => c.status === "error"));
    assert.equal((await tx.select().from(proposals)).length, 0);
    const [preserved] = await tx.select().from(fields);
    assert.equal(preserved.checkedAt.toISOString(), knownDate.toISOString());
    assert.equal(preserved.value, "The University of Alabama");
    const reachable = await runInstitutionCheck("nces-100751", "isolated-test-admin", failed.id, database,
      async url => ({ text: "HTTP 200 but no identity or source claims", url, checkedAt: new Date().toISOString() }));
    assert.equal(reachable.status, "completed");
    assert.equal((await tx.select().from(proposals)).length, 0, "HTTP200 alone must not produce verified evidence");
    const supported = await runInstitutionCheck("nces-100751", "isolated-test-admin", null, database,
      async url => ({ text: "The University of Alabama", url, checkedAt: new Date().toISOString() }));
    assert.equal(supported.status, "needs_review");
    const [pending] = await tx.select().from(proposals);
    assert.equal(pending.status, "pending");
    assert.equal((await tx.select().from(fields))[0].checkedAt.toISOString(), knownDate.toISOString());
    await assert.rejects(() => reviewProposal(pending.id, "isolated-test-admin", "approve", "yes", database),
      e => e instanceof AdminError && e.status === 400);
    const approved = await reviewProposal(pending.id, "isolated-test-admin", "approve",
      "Confirmed exact identity using the authoritative official university source.", database);
    assert.equal(approved.status, "approved");
    const [reviewedJob] = await tx.select().from(jobs).where(eq(jobs.id, supported.id));
    assert.equal(reviewedJob.status, "reviewed");
    assert.equal(reviewedJob.checks.find(check => check.fieldKey === "institution_name")?.status, "verified");
    const [verified] = await tx.select().from(fields);
    assert.equal(verified.checkedAt.toISOString(), pending.checkedAt.toISOString(), "Keep actual fetch date, not approval-time fiction");
    assert.ok(verified.sourceUrl.startsWith("https://"));
    await assert.rejects(() => reviewProposal(pending.id, "isolated-test-admin", "approve",
      "Repeated approval cannot reapply a reviewed proposal.", database), e => e instanceof AdminError && e.status === 409);
    const stale = await runInstitutionCheck("nces-100751", "isolated-test-admin", null, database,
      async url => ({ text: "The University of Alabama", url, checkedAt: new Date().toISOString() }));
    const [next] = await tx.select().from(proposals).where(eq(proposals.jobId, stale.id));
    await tx.update(fields).set({ value: "A concurrent approved value" }).where(eq(fields.fieldKey, "institution_name"));
    assert.equal((await reviewProposal(next.id, "isolated-test-admin", "approve",
      "Checked official evidence, but concurrent updates must not be overwritten.", database)).status, "conflict");
    assert.equal((await tx.select().from(fields))[0].value, "A concurrent approved value");
    assert.equal((await tx.select().from(jobs)).length, 4);
  });
  console.log("PASS: HTTP failure preserves last-good value/date; HTTP200 alone verifies nothing; source-supported proposals await review; note required; real fetch timestamp retained; repeated reviews blocked; concurrent change produces conflict without overwrite; isolated temporary tables only.");
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Verification tests failed"); process.exitCode = 1; }).finally(() => pool.end());
