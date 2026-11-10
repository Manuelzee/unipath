import { Router, type IRouter } from "express";
import {
  GetAdminBillingResponse, GetBillingStatusResponse, GetExchangeRateQueryParams,
  GetExchangeRateResponse, GetMyBillingResponse,
} from "@workspace/api-zod";
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
export default router;
