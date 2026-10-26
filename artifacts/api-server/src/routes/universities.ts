import { Router, type IRouter } from "express";
import {
  GetUniversityParams,
  GetUniversityResponse,
  ListUniversitiesQueryParams,
  ListUniversitiesResponse,
} from "@workspace/api-zod";
import {
  findUniversity,
  getUniversityFilterOptions,
  searchUniversities,
} from "../lib/universities";

const router: IRouter = Router();

router.get("/universities/filters", async (_req, res): Promise<void> => {
  res.json(await getUniversityFilterOptions());
});

router.get("/universities", async (req, res): Promise<void> => {
  const query = ListUniversitiesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const universities = await searchUniversities(query.data);
  res.json(ListUniversitiesResponse.parse(universities));
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
