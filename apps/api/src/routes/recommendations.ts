import { Router, type IRouter } from "express";
import { getAuth } from "../lib/auth/session";
import { eq } from "drizzle-orm";
import { db, studentProfilesTable } from "@workspace/db";
import { GetStudentRecommendationsResponse } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { getRecommendations } from "../lib/matching/score";

const router: IRouter = Router();
router.get("/me/recommendations", requireAuth, async (req, res) => {
  const userId = getAuth(req).userId;
  if (!userId) { res.status(401).json({ error: "Sign in required." }); return; }
  const [profile] = await db.select().from(studentProfilesTable).where(eq(studentProfilesTable.userId, userId)).limit(1);
  if (!profile) { res.status(409).json({ error: "Save a profile to see recommendations." }); return; }
  res.setHeader("Cache-Control", "private, no-store");
  res.json(GetStudentRecommendationsResponse.parse(await getRecommendations(profile)));
});
export default router;
