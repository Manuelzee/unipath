import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, institutionDirectoryTable as institutions, matchingEvidenceTable as evidence,
  verificationJobsTable as jobs, verificationProposalsTable as proposals, verifiedFieldsTable as fields,
  type SourceCheck } from "@workspace/db";
import { digest, evidenceDescription, failedSource, fetchOfficialSource, identitySupported, matchingSupported } from "./sources";

export class AdminError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const jobResponse = (j: typeof jobs.$inferSelect) => ({
  id: j.id, institutionId: j.institutionId, status: j.status, requestedAt: j.requestedAt.toISOString(),
  completedAt: j.completedAt?.toISOString() ?? null, error: j.error, checks: j.checks,
});
export const proposalResponse = (p: typeof proposals.$inferSelect) => ({
  id: p.id, jobId: p.jobId, institutionId: p.institutionId, fieldKey: p.fieldKey,
  value: p.value, previousValue: p.previousValue, status: p.status, sourceUrl: p.sourceUrl,
  checkedAt: p.checkedAt.toISOString(), reviewedAt: p.reviewedAt?.toISOString() ?? null, reviewNote: p.reviewNote,
});
export const summary = (i: typeof institutions.$inferSelect) => ({
  id: i.id, name: i.name, country: i.country, website: i.website, dataSource: i.dataSource, dataYear: i.dataYear,
});
function schoolBasis(i: typeof institutions.$inferSelect) { return { name: i.name, website: i.website }; }
export async function institutionDetail(id: string) {
  const [school] = await db.select().from(institutions).where(eq(institutions.id, id));
  if (!school) throw new AdminError(404, "Institution not found.");
  const [ledger, attempts, pending, matching] = await Promise.all([
    db.select().from(fields).where(eq(fields.institutionId, id)),
    db.select().from(jobs).where(eq(jobs.institutionId, id)).orderBy(desc(jobs.requestedAt)).limit(20),
    db.select().from(proposals).where(eq(proposals.institutionId, id)).orderBy(desc(proposals.checkedAt)).limit(100),
    db.select().from(evidence).where(eq(evidence.institutionId, id)),
  ]);
  const details: SourceCheck[] = [
    { fieldKey: "institution_name", title: "Institution name", value: school.name, status: "source_reported",
      sourceUrl: school.website || null, checkedAt: null, message: "Directory-reported identity. An imported record is not independent current verification." },
    { fieldKey: "location", title: "Location", value: [school.city, school.state, school.country].filter(Boolean).join(", "),
      status: school.city ? "source_reported" : "missing", sourceUrl: null, checkedAt: null,
      message: "Source-reported directory location; no current field-level check is claimed." },
    { fieldKey: "institution_type", title: "Institution type and degree levels", value: `${school.institutionType}; ${school.degreeLevels.join(", ")}`,
      status: "source_reported", sourceUrl: null, checkedAt: null, message: `${school.dataSource} / ${school.dataYear}; not proof of current program availability.` },
    ...(["admissionsWebsite", "applicationWebsite", "financialAidWebsite"] as const).map(key => ({
      fieldKey: key, title: key, value: school[key] ?? "Not reported", status: school[key] ? "unverified" : "missing",
      sourceUrl: school[key], checkedAt: null, message: "A URL alone does not establish requirements, current applications or scholarship eligibility.",
    })),
    ...matching.map(row => ({ fieldKey: `matching:${row.id}`, title: `${row.kind} evidence`,
      value: evidenceDescription(row), status: row.verifiedAt ? "previously_checked" : "unverified",
      sourceUrl: row.sourceUrl, checkedAt: row.verifiedAt?.toISOString() ?? null,
      message: `Scope-specific source evidence; source reporting date ${row.sourceDate}. Not an admission or award guarantee.` })),
  ];
  // Existing separately verified branding retains its own source and real dates.
  for (const item of [
    { key: "logo", value: school.logoUrl, status: school.logoVerificationStatus, url: school.logoSource, date: school.logoLastCheckedAt },
    { key: "colors", value: school.primaryColorHex, status: school.colorsVerificationStatus, url: school.colorsSourceUrl, date: school.colorsLastVerifiedAt },
    { key: "mascot", value: school.mascotName, status: school.mascotVerificationStatus, url: school.mascotSourceUrl, date: school.mascotLastVerifiedAt },
  ]) details.push({ fieldKey: item.key, title: item.key, value: item.value ?? "Not reported", status: item.status ?? "unverified",
    sourceUrl: item.url, checkedAt: item.date?.toISOString() ?? null, message: "Existing field-specific provenance retained; this check does not validate image licensing or other fields." });
  for (const row of ledger) {
    const latest = attempts.flatMap(j => j.checks).find(c => c.fieldKey === row.fieldKey);
    const stale = Date.now() - row.checkedAt.getTime() > 180 * 86400_000;
    const current: SourceCheck = { fieldKey: row.fieldKey, title: row.fieldKey, value: row.value, sourceUrl: row.sourceUrl,
      checkedAt: row.checkedAt.toISOString(), status: stale ? "outdated" : latest?.status === "error" ? "previously_verified_check_failed"
        : latest?.status === "unverified" ? "needs_verification" : "verified",
      message: stale ? "Last accepted evidence is older than 180 days. Run a new check." : latest?.status === "error"
        ? "The latest attempt failed; this is the last known good evidence and its original date."
        : latest?.status === "unverified" ? "The latest source no longer establishes this claim. Last known good value/date retained for review, not freshly verified."
          : "Source-supported field accepted by an authorized reviewer. Other institution fields are not thereby verified." };
    const index = details.findIndex(d => d.fieldKey === row.fieldKey);
    if (index >= 0) details[index] = current; else details.push(current);
  }
  return { institution: summary(school), fields: details, jobs: attempts.map(jobResponse), proposals: pending.map(proposalResponse) };
}

let inFlight = 0;
export async function runInstitutionCheck(id: string, actor: string, retryOf: string | null = null,
  database = db, fetchSource = fetchOfficialSource) {
  if (inFlight >= 2) throw new AdminError(429, "Two source checks are already running. Retry when they finish.");
  const [school] = await database.select().from(institutions).where(eq(institutions.id, id));
  if (!school) throw new AdminError(404, "Institution not found.");
  const jobId = randomUUID();
  await database.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`verification:${id}`}))`);
    await tx.update(jobs).set({ status: "interrupted", completedAt: new Date(), error: "Previous process did not finish. Retry creates a new attempt." })
      .where(and(eq(jobs.institutionId, id), eq(jobs.status, "running"), sql`${jobs.requestedAt} < now() - interval '5 minutes'`));
    const [running] = await tx.select().from(jobs).where(and(eq(jobs.institutionId, id), eq(jobs.status, "running")));
    if (running) throw new AdminError(409, "A check is already running for this institution.");
    await tx.insert(jobs).values({ id: jobId, institutionId: id, requestedBy: actor, retryOf, status: "running" });
  });
  inFlight++;
  const checks: SourceCheck[] = [];
  try {
    const [matching, currentFields] = await Promise.all([
      database.select().from(evidence).where(eq(evidence.institutionId, id)),
      database.select().from(fields).where(eq(fields.institutionId, id)),
    ]);
    const cached = new Map<string, Awaited<ReturnType<typeof fetchOfficialSource>> | Error>();
    async function check(key: string, title: string, value: string, url: string, basis: unknown,
      supports: (text: string) => boolean, unsupportedMessage: string) {
      try {
        if (!cached.has(url)) {
          if (cached.size >= 4) {
            checks.push({ fieldKey: key, title, value, sourceUrl: url, checkedAt: null, status: "not_checked", message: "Per-job source limit reached. No verification claimed." }); return;
          }
          try { cached.set(url, await fetchSource(url)); } catch (error) {
            cached.set(url, error instanceof Error ? error : new Error("SOURCE_FAILED"));
          }
        }
        const source = cached.get(url)!;
        if (source instanceof Error) throw source;
        const supported = supports(source.text);
        checks.push({ fieldKey: key, title, value, sourceUrl: source.url, checkedAt: source.checkedAt,
          status: supported ? "pending_review" : "unverified",
          message: supported ? "Source content supports this scoped value; an administrator must review before verification is applied." : unsupportedMessage });
        if (supported) {
          const previous = currentFields.find(f => f.fieldKey === key);
          await database.insert(proposals).values({ id: randomUUID(), jobId, institutionId: id, fieldKey: key,
            value, previousValue: previous?.value ?? null, previousDigest: digest(previous),
            basisDigest: digest(basis), sourceUrl: source.url, checkedAt: new Date(source.checkedAt), status: "pending" });
        }
      } catch (error) { checks.push(failedSource(key, title, value, url, error)); }
    }
    if (school.website) await check("institution_name", "Official institution identity", school.name, school.website,
      schoolBasis(school), text => identitySupported(school.name, text),
      "Reachable content did not establish the exact directory identity. Review the official source; no verified status was assigned.");
    else checks.push({ fieldKey: "institution_name", title: "Official institution identity", value: school.name, status: "missing",
      sourceUrl: null, checkedAt: null, message: "No official website was reported. No request or verification was fabricated." });
    for (const row of matching.slice(0, 12)) await check(`matching:${row.id}`, `${row.kind} evidence`, evidenceDescription(row),
      row.sourceUrl, row, text => matchingSupported(row, text),
      row.kind === "tuition" ? "Source availability is not verification of tuition, residency or fees. This field requires scope-specific human research; existing data was preserved."
        : "The source did not establish the complete expected scope and claim. No new verification was assigned.");
    const errors = checks.filter(c => c.status === "error").length;
    const [finished] = await database.update(jobs).set({
      status: checks.some(c => c.status === "pending_review") ? "needs_review" : errors ? "failed" : "completed",
      completedAt: new Date(), checks, error: errors ? `${errors} source field check(s) failed. Last known good data was preserved.` : null,
    }).where(eq(jobs.id, jobId)).returning();
    return jobResponse(finished);
  } catch {
    await database.update(jobs).set({ status: "failed", completedAt: new Date(), checks,
      error: "Verification could not finish. Existing institution values were preserved." }).where(eq(jobs.id, jobId));
    throw new AdminError(503, "Verification could not finish. Existing data was preserved; retry from the dashboard.");
  } finally { inFlight--; }
}

export async function reviewProposal(id: string, actor: string, decision: "approve" | "reject", note = "", database = db) {
  return database.transaction(async tx => {
    const [proposal] = await tx.select().from(proposals).where(eq(proposals.id, id)).for("update");
    if (!proposal) throw new AdminError(404, "Proposal not found.");
    if (proposal.status !== "pending") throw new AdminError(409, "This proposal has already been reviewed or conflicted. Refresh the record.");
    if (decision === "approve" && note.trim().length < 20)
      throw new AdminError(400, "Review the official source and provide a source-grounded review note of at least 20 characters.");
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`field:${proposal.institutionId}:${proposal.fieldKey}`}))`);
    const [previous] = await tx.select().from(fields).where(and(eq(fields.institutionId, proposal.institutionId), eq(fields.fieldKey, proposal.fieldKey)));
    let basis: unknown;
    if (proposal.fieldKey === "institution_name") {
      const [school] = await tx.select().from(institutions).where(eq(institutions.id, proposal.institutionId)).for("update");
      basis = school && schoolBasis(school);
    } else if (proposal.fieldKey.startsWith("matching:")) {
      const [row] = await tx.select().from(evidence).where(and(eq(evidence.id, proposal.fieldKey.slice(9)), eq(evidence.institutionId, proposal.institutionId))).for("update");
      basis = row;
    } else throw new AdminError(400, "Unsupported field; no change was made.");
    const expired = Date.now() - proposal.checkedAt.getTime() > 24 * 3600_000;
    const conflict = decision === "approve" && (expired || digest(previous) !== proposal.previousDigest || digest(basis) !== proposal.basisDigest);
    const [reviewed] = await tx.update(proposals).set({
      status: conflict ? "conflict" : decision === "approve" ? "approved" : "rejected",
      reviewedAt: new Date(), reviewedBy: actor, reviewNote: conflict
        ? "Evidence expired or the underlying value/previous verification changed. Run a fresh check; nothing was overwritten." : note.trim() || null,
    }).where(eq(proposals.id, id)).returning();
    if (decision === "approve" && !conflict) {
      const values = { institutionId: proposal.institutionId, fieldKey: proposal.fieldKey, value: proposal.value,
        sourceUrl: proposal.sourceUrl, checkedAt: proposal.checkedAt, approvedAt: new Date(), approvedBy: actor, jobId: proposal.jobId };
      await tx.insert(fields).values(values).onConflictDoUpdate({ target: [fields.institutionId, fields.fieldKey], set: values });
      if (proposal.fieldKey.startsWith("matching:"))
        await tx.update(evidence).set({ verifiedAt: proposal.checkedAt }).where(eq(evidence.id, proposal.fieldKey.slice(9)));
    }
    // Serialize sibling reviews so two simultaneous decisions cannot leave the
    // job saying "pending review" after its last proposal has been resolved.
    const [job] = await tx.select().from(jobs).where(eq(jobs.id, proposal.jobId)).for("update");
    if (job) {
      const remaining = await tx.select({ id: proposals.id }).from(proposals)
        .where(and(eq(proposals.jobId, proposal.jobId), eq(proposals.status, "pending")));
      const checks = job.checks.map(check => check.fieldKey !== proposal.fieldKey ? check : {
        ...check, status: reviewed.status === "approved" ? "verified" : reviewed.status,
        message: reviewed.status === "approved"
          ? "This source-supported field was approved by an authorized reviewer; its original check timestamp is retained."
          : reviewed.status === "conflict"
            ? "Not applied: evidence expired or underlying data changed. Run a fresh check; existing values were preserved."
            : "The reviewer rejected this proposal. Existing verified data was not changed.",
      });
      await tx.update(jobs).set({
        checks, status: remaining.length ? "needs_review" : job.error ? "reviewed_with_errors" : "reviewed",
      }).where(eq(jobs.id, job.id));
    }
    return proposalResponse(reviewed);
  });
}
