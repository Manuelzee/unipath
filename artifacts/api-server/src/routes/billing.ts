import { Router, type IRouter } from "express";
import {
  GetAdminBillingResponse, GetBillingStatusResponse, GetExchangeRateQueryParams,
  GetExchangeRateResponse, GetMyBillingResponse,
  ListAdminCustomersQueryParams, ListAdminCustomersResponse,
} from "@workspace/api-zod";
import { db, studentProfilesTable as profiles } from "@workspace/db";
import { desc, ilike, or, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { requireAdministrator } from "../lib/admin/security";
import { DISPLAY_CURRENCIES, getReferenceRate } from "../lib/exchangeRates";

const router: IRouter = Router();
// Deliberately closed: the owner declined provider connection and has not
// approved live payments. A redirect or UI selection must never grant access.
const availability = () => ({
  provider: "Stripe (not connected)",
  providerConfigured: false, livePaymentsEnabled: false, cryptoEnabled: false,
  historyAvailable: false, baseCurrency: "USD", displayCurrencies: DISPLAY_CURRENCIES,
  message: "Payment processing is not connected. Checkout, subscriptions, cancellation, invoices, receipts, refunds and financial reports are unavailable. No payment history is fabricated. Cryptocurrency is not configured. Existing tools remain accessible; live payments require owner approval.",
});

router.get("/exchange-rates", async (req, res): Promise<void> => {
  const parsed = GetExchangeRateQueryParams.safeParse(req.query);
  if (!parsed.success || !DISPLAY_CURRENCIES.includes(parsed.data.currency)) {
    res.status(400).json({ error: "Choose a supported display currency." }); return;
  }
  const rate = await getReferenceRate(parsed.data.currency);
  res.setHeader("Cache-Control", rate.status === "unavailable" ? "no-store" : "public, max-age=60");
  res.json(GetExchangeRateResponse.parse(rate));
});
router.get("/billing/status", (_req, res): void => {
  res.setHeader("Cache-Control", "no-store");
  res.json(GetBillingStatusResponse.parse(availability()));
});
router.get("/me/billing", requireAuth, (_req, res): void => {
  res.setHeader("Cache-Control", "no-store");
  res.json(GetMyBillingResponse.parse(availability()));
});
router.get("/admin/billing", requireAuth, requireAdministrator, (_req, res): void => {
  res.setHeader("Cache-Control", "no-store");
  res.json(GetAdminBillingResponse.parse(availability()));
});
router.get("/admin/customers", requireAuth, requireAdministrator, async (req, res): Promise<void> => {
  const input = ListAdminCustomersQueryParams.safeParse(req.query);
  if (!input.success) { res.status(400).json({ error: "Use a valid account search and page." }); return; }
  const search = input.data.search?.trim();
  const pattern = `%${(search ?? "").replace(/[\\%_]/g, "\\$&")}%`;
  const where = search ? or(ilike(profiles.userId, pattern), ilike(profiles.studyCountry, pattern)) : undefined;
  const page = input.data.page ?? 1;
  const [items, [count]] = await Promise.all([
    db.select({ accountReference: profiles.userId, studyCountry: profiles.studyCountry,
      degreeLevel: profiles.degreeLevel, updatedAt: profiles.updatedAt })
      .from(profiles).where(where).orderBy(desc(profiles.updatedAt), profiles.userId).limit(20).offset((page - 1) * 20),
    db.select({ total: sql<number>`count(*)::int` }).from(profiles).where(where),
  ]);
  res.setHeader("Cache-Control", "no-store");
  res.json(ListAdminCustomersResponse.parse({ items: items.map(p => ({
    ...p, updatedAt: p.updatedAt.toISOString(), accessPlan: "Free",
  })), total: count.total, page, pageSize: 20,
  note: "Students with a saved profile only, not all registered accounts or paying customers. All working tools currently have Free access. Private budgets, credentials, and payment information are not included." }));
});
for (const path of ["/billing/checkout", "/billing/crypto/checkout"]) {
  router.post(path, requireAuth, (_req, res): void => {
    // This route has no provider SDK, wallet generation, payment information
    // storage, or subscription activation. It stays closed even if UI is altered.
    res.status(409).json({ code: "PAYMENTS_DISABLED", error: "Not available yet. No payment, wallet address, or subscription was created." });
  });
}
export default router;
