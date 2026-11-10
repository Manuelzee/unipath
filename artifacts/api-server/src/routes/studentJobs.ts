import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { and, desc, eq } from "drizzle-orm";
import { CreateJobApplicationBody, UpdateJobApplicationBody, UpdateJobApplicationParams } from "@workspace/api-zod";
import { db, jobApplicationsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { SearchJobListingsQueryParams } from "@workspace/api-zod";
import { getProvider, jobProviders, ProviderError, type JobProvider } from "../lib/jobProviders";
import { logger } from "../lib/logger";
import guidance from "../data/work-guidance.json";

const router: IRouter = Router();
const present = (row: typeof jobApplicationsTable.$inferSelect) => ({
  ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
});
const userId = (req: Parameters<typeof getAuth>[0]) => getAuth(req).userId!;

/** Accept only http(s) URLs so a saved link can never be a script URL. */
function cleanUrl(value: string | null | undefined) {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch { return undefined; }
}
const isDate = (value: string | null | undefined) => value == null || value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));

function values(input: ReturnType<typeof CreateJobApplicationBody.parse>) {
  const sourceUrl = cleanUrl(input.sourceUrl);
  if (sourceUrl === undefined) return "Use a full http or https link for the job posting.";
  for (const d of [input.postedDate, input.appliedDate, input.interviewDate]) if (!isDate(d)) return "Dates must look like 2026-11-30.";
  return {
    title: input.title.trim(), employer: input.employer.trim(), jobType: input.jobType ?? "other",
    location: input.location?.trim() || null, countryCode: input.countryCode?.trim().toUpperCase() || null,
    sourceUrl, postedDate: input.postedDate || null, sponsorshipClaim: input.sponsorshipClaim ?? "not_stated",
    authorizationNote: input.authorizationNote?.trim() || null, eligibilityStatus: input.eligibilityStatus ?? "unknown", status: input.status ?? "saved",
    appliedDate: input.appliedDate || null, interviewDate: input.interviewDate || null,
    employerResponse: input.employerResponse?.trim() || null, notes: input.notes?.trim() || null,
  };
}

router.get("/student-jobs/guidance", (_req, res) => { res.json(guidance); });

const describe = (p: JobProvider) => ({
  id: p.id, name: p.name, configured: p.isConfigured(), countries: [...p.countries], attribution: p.attribution,
});

router.get("/student-jobs/providers", (_req, res) => { res.json(jobProviders.map(describe)); });

router.get("/student-jobs/search", requireAuth, async (req, res) => {
  const query = SearchJobListingsQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Check the search filters and try again." }); return; }
  const { provider: providerId, country, ...filters } = query.data;
  const provider = getProvider(providerId ?? "adzuna");
  if (!provider) { res.status(400).json({ error: "Unknown job provider." }); return; }
  if (!provider.isConfigured()) {
    res.status(503).json({ error: provider.name + " is not connected yet. The site owner must add its API credentials.",
      code: "ADZUNA_NOT_CONFIGURED", retryable: false });
    return;
  }
  const countryCode = country.toUpperCase();
  if (!provider.countries.includes(countryCode)) {
    res.status(400).json({ error: provider.name + " does not cover this country." });
    return;
  }
  try {
    const result = await provider.search({ ...filters, countryCode, page: filters.page ?? 1 });
    res.json({ provider: describe(provider), ...result });
  } catch (error) {
    const status = error instanceof ProviderError ? error.status : 502;
    const code = error instanceof ProviderError ? error.code : "PROVIDER_ERROR";
    const upstreamStatus = error instanceof ProviderError ? error.upstreamStatus : undefined;
    logger.warn({ provider: provider.id, status, code, upstreamStatus }, "job provider search failed");
    res.status(status).json({
      error: error instanceof ProviderError ? error.message : "Job search is unavailable right now.",
      code, upstreamStatus, retryable: error instanceof ProviderError && error.retryable,
    });
  }
});

router.get("/me/jobs", requireAuth, async (req, res) => {
  const rows = await db.select().from(jobApplicationsTable).where(eq(jobApplicationsTable.userId, userId(req))).orderBy(desc(jobApplicationsTable.updatedAt));
  res.json(rows.map(present));
});

router.post("/me/jobs", requireAuth, async (req, res) => {
  const body = CreateJobApplicationBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Check the job details and try again." }); return; }
  const data = values(body.data);
  if (typeof data === "string") { res.status(400).json({ error: data }); return; }
  const [row] = await db.insert(jobApplicationsTable).values({ ...data, userId: userId(req) }).returning();
  res.status(201).json(present(row));
});

router.patch("/me/jobs/:id", requireAuth, async (req, res) => {
  const params = UpdateJobApplicationParams.safeParse(req.params);
  const body = UpdateJobApplicationBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Check the job details and try again." }); return; }
  const data = values(body.data);
  if (typeof data === "string") { res.status(400).json({ error: data }); return; }
  const [row] = await db.update(jobApplicationsTable).set({ ...data, updatedAt: new Date() })
    .where(and(eq(jobApplicationsTable.id, params.data.id), eq(jobApplicationsTable.userId, userId(req)))).returning();
  if (!row) { res.status(404).json({ error: "Job not found." }); return; }
  res.json(present(row));
});

router.delete("/me/jobs/:id", requireAuth, async (req, res) => {
  const params = UpdateJobApplicationParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid job." }); return; }
  const rows = await db.delete(jobApplicationsTable)
    .where(and(eq(jobApplicationsTable.id, params.data.id), eq(jobApplicationsTable.userId, userId(req)))).returning({ id: jobApplicationsTable.id });
  if (!rows.length) { res.status(404).json({ error: "Job not found." }); return; }
  res.status(204).end();
});

export default router;
