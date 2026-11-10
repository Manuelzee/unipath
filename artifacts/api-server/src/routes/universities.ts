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
} from "@workspace/api-zod";
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
