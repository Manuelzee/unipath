import { Router, type IRouter } from "express";
import { getDirectoryImportStatus } from "../lib/bootstrapDirectory";
import {
  GetUniversityParams,
  GetUniversityResponse,
  GetFundingMatchesBody,
  GetFundingFinderOptionsResponse,
  ListUniversitiesQueryParams,
  ListUniversitiesResponse,
  ListUniversityFactsQueryParams,
  ListScholarshipsQueryParams,
  ListScholarshipsResponse,
  ListUniversityScholarshipsResponse,
} from "@workspace/api-zod";
import { db, institutionDirectoryTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import {
  SCHOLARSHIPS, SCHOLARSHIPS_REVIEWED_AT, filterScholarships, scholarshipsFor,
  type ScholarshipProgram,
} from "../lib/scholarships";
import {
  findUniversity,
  getUniversityFilterOptions,
  searchUniversities,
  listUniversityFacts,
  TuitionRateUnavailable,
} from "../lib/universities";
import { DISPLAY_CURRENCIES } from "../lib/exchangeRates";
import {
  getDirectoryCoverage,
  getFundingFinderOptions,
  getFundingMatches,
} from "../lib/directoryCoverage";

const router: IRouter = Router();

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
const SCHOLARSHIP_NOTICE = "Leads to check, not offers. Amounts, deadlines and eligibility change every year; the sponsor's official page controls. UniPath is not affiliated with these sponsors.";

/** Programme for the API: country names and the universities it is tied to. */
async function presentScholarships<T extends ScholarshipProgram>(programs: T[]) {
  const ids = [...new Set(programs.flatMap(p => p.institutionIds))];
  const rows = ids.length ? await db.select({ id: institutionDirectoryTable.id, name: institutionDirectoryTable.name })
    .from(institutionDirectoryTable).where(inArray(institutionDirectoryTable.id, ids)) : [];
  const names = new Map(rows.map(row => [row.id, row.name]));
  return programs.map(({ institutionIds, ...p }) => ({
    ...p,
    studyCountryNames: p.studyCountries.map(code => regionNames.of(code) ?? code),
    // Only universities that are in the directory, so every link opens a page.
    institutions: institutionIds.filter(id => names.has(id)).map(id => ({ id, name: names.get(id)! })),
  }));
}

router.get("/universities/import-status", async (_req, res): Promise<void> => {
  const status = await getDirectoryImportStatus();
  res.status(status.ready ? 200 : 503).json({
    ...status,
    ...(!status.ready ? { error: "Institution data is not fully imported. Please retry shortly; do not interpret this as zero matching schools." } : {}),
  });
});

router.get("/universities/coverage", async (_req, res): Promise<void> => {
  res.json(await getDirectoryCoverage());
});

router.get("/funding/options", async (_req, res): Promise<void> => {
  res.json(GetFundingFinderOptionsResponse.parse(await getFundingFinderOptions()));
});

router.post("/funding/matches", async (req, res): Promise<void> => {
  const input = GetFundingMatchesBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: input.error.message });
    return;
  }
  // Matching inputs are intentionally never logged or persisted.
  res.json(await getFundingMatches(input.data));
});

router.get("/university-facts", async (req, res): Promise<void> => {
  const parsed = ListUniversityFactsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!await findUniversity(parsed.data.institutionId)) {
    res.status(404).json({ error: "Institution not found." });
    return;
  }
  res.json(await listUniversityFacts(parsed.data));
});

router.get("/scholarships", async (req, res): Promise<void> => {
  const parsed = ListScholarshipsQueryParams.safeParse(req.query);
  if (!parsed.success || (parsed.data.country && !/^([A-Za-z]{2}|multi)$/.test(parsed.data.country))) {
    res.status(400).json({ error: "Use a two-letter study country code, multi, or no country." });
    return;
  }
  const items = filterScholarships(parsed.data);
  const counts = new Map<string, number>();
  for (const p of SCHOLARSHIPS) for (const code of p.studyCountries) counts.set(code, (counts.get(code) ?? 0) + 1);
  res.setHeader("Cache-Control", "public, max-age=300");
  res.json(ListScholarshipsResponse.parse({
    items: await presentScholarships(items.slice().sort((a, b) => a.name.localeCompare(b.name))),
    total: items.length,
    countries: [...counts].map(([code, count]) => ({ code, name: regionNames.of(code) ?? code, count }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    reviewedAt: SCHOLARSHIPS_REVIEWED_AT,
    notice: SCHOLARSHIP_NOTICE,
  }));
});

router.get("/universities/:id/scholarships", async (req, res): Promise<void> => {
  const params = GetUniversityParams.safeParse(req.params);
  const university = params.success ? await findUniversity(params.data.id) : null;
  if (!university) {
    res.status(404).json({ error: "University listing not found." });
    return;
  }
  res.setHeader("Cache-Control", "public, max-age=300");
  res.json(ListUniversityScholarshipsResponse.parse({
    items: await presentScholarships(scholarshipsFor(university.id, university.countryCode)),
    notice: SCHOLARSHIP_NOTICE,
  }));
});

router.get("/universities/filters", async (_req, res): Promise<void> => {
  res.json(await getUniversityFilterOptions());
});

router.get("/universities", async (req, res): Promise<void> => {
  if ((req.query.tuitionCurrency !== undefined && !DISPLAY_CURRENCIES.includes(String(req.query.tuitionCurrency))) ||
      (typeof req.query.maxAnnualTuition === "string" && !req.query.maxAnnualTuition.trim())) {
    res.status(400).json({ error: "Use a supported tuition currency and a nonempty numeric maximum." });
    return;
  }
  if (req.query.fundingOnly !== undefined &&
    !["true", "false"].includes(String(req.query.fundingOnly))) {
    res.status(400).json({ error: "fundingOnly must be true or false." });
    return;
  }
  const query = ListUniversitiesQueryParams.safeParse({
    ...req.query,
    ...(req.query.fundingOnly !== undefined ? { fundingOnly: req.query.fundingOnly === "true" } : {}),
  });
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  try {
    const universities = await searchUniversities(query.data);
    res.json(ListUniversitiesResponse.parse(universities));
  } catch (error) {
    if (error instanceof TuitionRateUnavailable) {
      res.status(503).json({ error: error.message, code: "TUITION_RATE_UNAVAILABLE" });
      return;
    }
    throw error;
  }
});

router.get("/universities/:id", async (req, res): Promise<void> => {
  const params = GetUniversityParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const university = await findUniversity(params.data.id);
  if (!university) {
    res.status(404).json({ error: "University listing not found." });
    return;
  }
  res.json(GetUniversityResponse.parse(university));
});

export default router;
