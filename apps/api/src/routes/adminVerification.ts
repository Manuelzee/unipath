import { Router } from "express";
import { getAuth } from "../lib/auth/session";
import { findUserById } from "../lib/auth/users";
import { createHash } from "node:crypto";
import { desc, eq, ilike, or, sql } from "drizzle-orm";
import { db, adminMembershipsTable, institutionDirectoryTable as institutions,
  verificationJobsTable as jobs, verifiedFieldsTable as fields, matchingEvidenceTable as evidence } from "@workspace/db";
import { ConfirmAdminSetupBody, ReviewAdminProposalBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { requireAdministrator, requireAdminMutationOrigin, runtimeEnvironment } from "../lib/admin/security";
import { AdminError, institutionDetail, reviewProposal, runInstitutionCheck, summary } from "../lib/admin/verification";
import type { RequestHandler } from "express";

const router = Router();
const action = (handler: RequestHandler): RequestHandler => async (req, res, next) => {
  try { await handler(req, res, next); } catch (error) {
    if (error instanceof AdminError) res.status(error.status).json({ error: error.message });
    else next(error);
  }
};
async function access(userId: string) {
  const [membership] = await db.select().from(adminMembershipsTable).where(eq(adminMembershipsTable.userId, userId));
  const configured = process.env.UNIPATH_ADMIN_SETUP_USER_ID?.trim();
  return { userId, isAdmin: membership?.status === "active", setupConfigured: !!configured,
    canSetup: !!configured && configured === userId && !membership, environment: runtimeEnvironment() };
}
router.get("/universities/:id/verification", action(async (req, res) => {
  const id = String(req.params.id);
  const [institution] = await db.select({ id: institutions.id }).from(institutions).where(eq(institutions.id, id));
  if (!institution) throw new AdminError(404, "Institution not found.");
  const [accepted, matching, attempts] = await Promise.all([
    db.select().from(fields).where(eq(fields.institutionId, id)),
    db.select().from(evidence).where(eq(evidence.institutionId, id)),
    db.select({ checks: jobs.checks }).from(jobs).where(eq(jobs.institutionId, id)).orderBy(desc(jobs.requestedAt)).limit(20),
  ]);
  const allowed = new Set(["institution_name", ...matching.filter(row => row.kind === "intake" || row.kind === "funding").map(row => `matching:${row.id}`)]);
  res.setHeader("Cache-Control", "no-store");
  res.json({ institutionId: id, fields: accepted.filter(row => allowed.has(row.fieldKey)).map(row => {
    const latest = attempts.flatMap(job => job.checks).find(check => check.fieldKey === row.fieldKey);
    const stale = Date.now() - row.checkedAt.getTime() > 180 * 86400_000;
    return {
    fieldKey: row.fieldKey, title: row.fieldKey === "institution_name" ? "Institution identity" : matching.find(e => `matching:${e.id}` === row.fieldKey)?.kind ?? "Scoped evidence",
    value: row.value, sourceUrl: row.sourceUrl, checkedAt: row.checkedAt.toISOString(),
    status: stale ? "outdated" : latest?.status === "error" ? "previously_verified_check_failed"
      : latest?.status === "unverified" ? "needs_verification" : "verified",
    message: (latest?.status === "error" ? "Latest source check failed; this is the last known good reviewed evidence, retaining its original date. " : "")
      + (latest?.status === "unverified" ? "The latest source does not establish this claim; the original value is retained for review, not freshly verified. " : "")
      + "Reviewed field-level evidence only. Not institution-wide verification or a guarantee of admission or funding.",
  }; }) });
}));
router.get("/me/admin-access", requireAuth, action(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(await access(getAuth(req).userId!));
}));
router.post("/me/admin-setup", requireAuth, requireAdminMutationOrigin, action(async (req, res) => {
  const body = ConfirmAdminSetupBody.safeParse(req.body);
  if (!body.success || body.data.confirmed !== true) throw new AdminError(400, "Explicit owner confirmation is required.");
  const userId = getAuth(req).userId!;
  const before = await access(userId);
  if (before.isAdmin) { res.json(before); return; }
  if (!before.canSetup) throw new AdminError(403, "This account is not the server-configured owner, or setup has already been used. No role was changed.");
  const identity = await findUserById(userId);
  if (identity?.id !== userId || !identity.emailVerifiedAt)
    throw new AdminError(403, "Verify your email address before owner setup.");
  // The server-configured immutable identity AND explicit signed-in confirmation
  // authorize this one-time grant. Revoked records are deliberately never re-granted.
  await db.insert(adminMembershipsTable).values({ userId, status: "active", grantSource: "owner_configured_id_and_explicit_confirmation" })
    .onConflictDoNothing();
  res.setHeader("Cache-Control", "no-store");
  res.json(await access(userId));
}));

// Every route under this prefix is protected, including direct POST requests.
router.use("/admin", requireAuth, requireAdministrator, requireAdminMutationOrigin);
router.get("/admin/status", action(async (_req, res) => {
  const result = await db.execute(sql`SELECT
    current_database() AS db, current_user AS dbuser, inet_server_addr()::text AS addr, inet_server_port() AS port,
    (SELECT count(*)::int FROM institution_directory) AS institutions,
    (SELECT count(DISTINCT id)::int FROM institution_directory) AS unique_ids,
    (SELECT count(*)::int FROM institution_facts WHERE kind='program') AS programs,
    (SELECT count(*)::int FROM student_profiles) AS profiles,
    (SELECT count(*)::int FROM institution_verification_proposals WHERE status='pending') AS pending,
    (SELECT count(*)::int FROM institution_verification_jobs WHERE error IS NOT NULL OR status IN ('failed','interrupted')) AS failed`);
  const row = result.rows[0];
  const databaseIdentity = createHash("sha256").update(JSON.stringify({ db: row.db, user: row.dbuser, addr: row.addr, port: row.port })).digest("hex").slice(0, 16);
  res.json({ environment: runtimeEnvironment(), databaseIdentity, checkedAt: new Date().toISOString(),
    institutionCount: Number(row.institutions), uniqueInstitutionIds: Number(row.unique_ids), programFacts: Number(row.programs),
    savedProfiles: Number(row.profiles), pendingProposals: Number(row.pending), failedChecks: Number(row.failed), automaticChangesRequireReview: true });
}));
router.get("/admin/institutions", action(async (req, res) => {
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const page = Number(req.query.page ?? 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || search.length > 160)
    throw new AdminError(400, "Use a valid page and a search of at most 160 characters.");
  const escaped = search.replace(/[\\%_]/g, "\\$&");
  const where = search ? or(ilike(institutions.name, `%${escaped}%`), ilike(institutions.id, `%${escaped}%`)) : undefined;
  const [items, [count]] = await Promise.all([
    db.select().from(institutions).where(where).orderBy(institutions.name, institutions.id).limit(20).offset((page - 1) * 20),
    db.select({ total: sql<number>`count(*)::int` }).from(institutions).where(where),
  ]);
  res.json({ items: items.map(summary), total: count.total, page, pageSize: 20 });
}));
router.get("/admin/institutions/:id", action(async (req, res) => { res.json(await institutionDetail(String(req.params.id))); }));
router.post("/admin/institutions/:id/checks", action(async (req, res) => {
  res.json(await runInstitutionCheck(String(req.params.id), getAuth(req).userId!));
}));
router.post("/admin/checks/:id/retry", action(async (req, res) => {
  const [previous] = await db.select().from(jobs).where(eq(jobs.id, String(req.params.id)));
  if (!previous) throw new AdminError(404, "Verification attempt not found.");
  const expiredRunning = previous.status === "running" && Date.now() - previous.requestedAt.getTime() > 5 * 60_000;
  if (!previous.error && !["failed", "interrupted"].includes(previous.status) && !expiredRunning)
    throw new AdminError(409, "This check is not failed or interrupted. Run a new institution check instead.");
  res.json(await runInstitutionCheck(previous.institutionId, getAuth(req).userId!, previous.id));
}));
router.post("/admin/proposals/:id/review", action(async (req, res) => {
  const input = ReviewAdminProposalBody.safeParse(req.body);
  if (!input.success) throw new AdminError(400, "Choose approve or reject and use a review note of at most 1,000 characters.");
  res.json(await reviewProposal(String(req.params.id), getAuth(req).userId!, input.data.decision, input.data.note));
}));
export default router;
