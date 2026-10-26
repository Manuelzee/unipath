import { Router, type IRouter } from "express";
import {
  GetUniversityParams,
  GetUniversityResponse,
  ListUniversitiesQueryParams,
  ListUniversitiesResponse,
} from "@workspace/api-zod";
import { findUniversity, sampleUniversities } from "../lib/universities";

const router: IRouter = Router();

router.get("/universities", (req, res): void => {
  const query = ListUniversitiesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const filters = query.data;
  const universities = sampleUniversities.filter((university) => {
    const term = filters.search?.trim().toLowerCase();
    return (
      (!filters.country || university.country === filters.country) &&
      (!filters.major || university.majors.includes(filters.major)) &&
      (!filters.degreeLevel ||
        university.degreeLevels.includes(filters.degreeLevel)) &&
      (filters.maxTuition === undefined ||
        university.tuitionUsd <= filters.maxTuition) &&
      (!filters.admissionRequirement ||
        university.admissions
          .toLowerCase()
          .includes(filters.admissionRequirement.toLowerCase())) &&
      (!term ||
        university.name.toLowerCase().includes(term) ||
        university.country.toLowerCase().includes(term) ||
        university.city.toLowerCase().includes(term) ||
        university.majors.some((major) => major.toLowerCase().includes(term)) ||
        university.admissions.toLowerCase().includes(term))
    );
  });

  res.json(ListUniversitiesResponse.parse(universities));
});

router.get("/universities/:id", (req, res): void => {
  const params = GetUniversityParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const university = findUniversity(params.data.id);
  if (!university) {
    res.status(404).json({ error: "University listing not found." });
    return;
  }
  res.json(GetUniversityResponse.parse(university));
});

export default router;
