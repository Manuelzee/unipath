import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq } from "drizzle-orm";
import { db, studentProfilesTable as profiles } from "@workspace/db";
import { GetBudgetSettingsResponse, SaveBudgetSettingsBody, SaveBudgetSettingsResponse } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { DISPLAY_CURRENCIES } from "../lib/exchangeRates";

const router: IRouter = Router();
const toBudget = (p?: typeof profiles.$inferSelect) => ({
  hasProfile: Boolean(p),
  budget: {
    budgetChoice: p?.budgetChoice ?? (p && p.annualBudgetUsd > 0 ? "custom" : "none"),
    budgetCurrency: p?.budgetCurrency ?? "USD", budgetScope: p?.budgetScope ?? "tuition",
    customBudget: p?.customBudget ?? (p && !p.budgetChoice && p.annualBudgetUsd > 0 ? p.annualBudgetUsd : null),
    livingExpenses: p?.livingExpenses ?? {},
  },
});

router.get("/me/budget", requireAuth, async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const [p] = await db.select().from(profiles).where(eq(profiles.userId, getAuth(req).userId!)).limit(1);
  res.json(GetBudgetSettingsResponse.parse(toBudget(p)));
});
router.put("/me/budget", requireAuth, async (req, res): Promise<void> => {
  const parsed = SaveBudgetSettingsBody.safeParse(req.body);
  if (!parsed.success || !DISPLAY_CURRENCIES.includes(parsed.data.budgetCurrency) ||
      (parsed.data.budgetChoice === "custom" && parsed.data.customBudget === null)) {
    res.status(400).json({ error: "Choose a supported currency and valid budget and living-expense amounts." }); return;
  }
  const p = parsed.data;
  const budget = {
    budgetChoice: p.budgetChoice, budgetCurrency: p.budgetCurrency, budgetScope: p.budgetScope,
    customBudget: p.budgetChoice === "custom" ? p.customBudget : null,
    livingExpenses: p.livingExpenses, annualBudgetUsd: 0, updatedAt: new Date(),
  };
  // Registration saves only budget settings; existing profile facts are never
  // overwritten with onboarding defaults or client-supplied ownership fields.
  const [saved] = await db.insert(profiles).values({
    userId: getAuth(req).userId!, residenceCountry: "", citizenship: "", studyCountry: "",
    degreeLevel: "", major: "", grades: "", preferredLanguage: "", englishTest: "", englishScore: "",
    ...budget,
  }).onConflictDoUpdate({ target: profiles.userId, set: budget }).returning();
  res.setHeader("Cache-Control", "no-store");
  res.json(SaveBudgetSettingsResponse.parse(toBudget(saved)));
});
export default router;
