# Annual tuition budgets and payments

## Availability

- Private profile budget: optional range or custom amount, supported display
  currency, tuition/total scope, and explicit skip. Save the profile to persist.
- Registration: sign-up leads to the protected `/onboarding` budget step.
  Save or skip persists budget preferences without overwriting existing profile
  facts. Optional annual accommodation, food, transportation and other estimates
  are saved privately in the same selected currency.
- Directory: optional annual maximum, currency, and separately selected in-state,
  out-of-state, or verified international tuition. Unknown prices are excluded
  only while a budget is applied, not treated as free or unaffordable.
- Comparison: select two to four real directory records. Missing tuition is
  unknown, not zero. Each record is fetched from the real API.
- School details: reporting-year-qualified annual U.S. undergraduate amounts,
  source link, historical-data warning and distinct directory-record update time.
  No international, semester, or program-level figure is inferred.
- Optional calculator: student-entered annual living costs and tuition estimate
  in the selected currency. Saved living estimates can be loaded only when
  currencies match; changing the calculator currency clears inputs rather than
  silently relabeling them. Missing tuition gives a living-only subtotal;
  scholarship estimates are not automatically deducted or guaranteed.
- Plans: original USD prices retained; local-currency reference estimates only.
- `/billing`: authenticated setup status, unavailable history-table layout and
  explicitly disabled BTC/ETH/USDC/USDT future controls. These tokens are examples,
  not verified support. No simulated payment history, receipts, invoices,
  subscription management, cancellation, wallet addresses or transfer requests.
- `/admin/billing`: server-authorized customer/profile search, catalog plan
  layout, unavailable revenue/transaction layouts and disabled payment settings.
  Customer data covers real saved profiles only, not all Clerk registrations;
  private student budgets are never included. No fabricated revenue, refunds,
  exports, or financial records.

## Source and currency limitations

The development directory has no imported tuition figures. The tuition-only
College Scorecard import returned HTTP 403 on 2026-11-10 and made no changes.
Worldwide tuition coverage and current institutional quotes are not available.
The source API credentials need valid College Scorecard access, or the owner
can supply official reporting-year-qualified data for a reviewed import.
Do not infer account activation or the precise cause from HTTP 403 alone.

The server uses Frankfurter's documented v2 USD reference-rate API for the
160 runtime-recognized fiat currency preferences. This is not a claim that rates
are available for every currency. Rates have source dates and retrieval times,
are cached for one hour, and are unusable for conversion after seven days.
Unverified rates have no fabricated fallback; a converted budget search fails
explicitly instead of silently returning all institutions. These rates do
not determine a payable checkout amount, bank fees, processor fees, or taxes.
No FX API key is required. Signed-in students default to their saved currency,
and applying a saved budget to search requires an explicit action. Total-cost,
aid-needed and open-ended preferences are not silently treated as tuition ceilings.

Source references:
- https://frankfurter.dev/
- https://collegescorecard.ed.gov/data/
- https://collegescorecard.ed.gov/data/api-documentation/

Run the opt-in tuition-only import in the API package:

```sh
pnpm exec tsx src/scripts/importTuition.ts
```

It uses `COLLEGE_SCORECARD_API_KEY` from server Secrets, retrieves only small
year-qualified batches, stages all pages before writing, and only fills missing
paired tuition amounts/years. It preserves branding, identities, reviewed
evidence, and existing tuition. No credential-bearing URLs are logged.

## Payment setup still required

The owner explicitly requested continued development without payment providers.
No payment SDK, checkout, webhook,
financial ledger, paid entitlement activation, or crypto processor has been
implemented. The availability endpoints intentionally keep all payment
capabilities unavailable. Authenticated direct POST requests to
`/api/billing/checkout` and `/api/billing/crypto/checkout` return 409
`PAYMENTS_DISABLED`; anonymous requests return 401. No payment details are
collected. Presence of a key or a client-side redirect must not enable paid access.

Before implementing test payments:

1. Connect the Stripe application integration securely; follow the Stripe skill
   for managed credentials, database sync and hosted checkout.
2. Preserve Free $0, Student Plus $9.99/month, Premium $29.99/month and the
   $99/$199/$299 one-time packages. Do not remove existing free tool access.
3. Implement verified, replay-safe webhook processing, checkout idempotency,
   authenticated customer ownership, invoices, cancellation and administrator
   refunds/exports. Never grant paid access from a success URL.
4. Configure merchant country, payment-method/currency availability, tax and
   refund disclosures. Display an authoritative final total before paying.
5. Complete sandbox tests. Keep live payments closed until explicit owner approval.

A crypto processor has not been selected. Do not request speculative provider
keys or display supported tokens/networks until merchant and customer eligibility
and actual processor support have been confirmed. Use hosted checkout, secure
server API/webhook credentials, signature verification and final settlement
confirmation. Never collect private keys or seed phrases, and never assume
crypto supports recurring subscriptions.

## Verification commands

```sh
pnpm run typecheck
cd artifacts/api-server
pnpm exec tsx src/scripts/tests/testTuitionAndRates.ts
pnpm exec tsx src/scripts/tests/testTuitionDatabase.ts
```

The tests use isolated synthetic fixtures, not live tuition or payment data.
Database filter fixtures are transaction-isolated and always rolled back.
Live development checks separately cover reference-rate retrieval, invalid
budget inputs, unknown-tuition exclusions, and payment availability/access gates.

### Earlier development results (2026-11-10)

- Full workspace typecheck passed; final API and frontend changes also passed
  their package typechecks.
- Fifteen isolated fixture checks passed. These are not live tuition evidence.
- All 18 allowlisted fiat reference-rate checks succeeded (USD identity,
  seventeen live conversions with dated reference rates).
- Real directory stayed at 6,174 records. Missing tuition was excluded by all
  three rate filters, invalid budgets/currencies returned 400, and converted
  CAD and large-budget queries returned valid responses without integer errors.
- Browser: custom CAD budget persisted across reload; skipping and saving
  cleared the custom amount. Missing-value comparisons and annual calculator
  arithmetic passed. Invalid calculator inputs were then fixed to suppress
  totals; that small fix was source/typechecked, not independently browser-retested.
- Browser: CAD/NGN plan estimates, unchanged USD prices, unavailable upgrade
  dialog, billing status and disabled management passed.
- Anonymous account/admin billing requests returned 401. Authenticated student
  admin requests returned 403 and the admin page denied access. Positive
  authorized-admin rendering was not tested; no admin role was granted.
- New surfaces fit at 390×844 with no document-level horizontal overflow.
  Existing top navigation appeared clipped to its scrollable area; its scroll
  affordance was not independently exercised.
- Funding and Jobs routes loaded; visa guidance remained separate and explicitly
  did not approve jobs. No live job search or payment was attempted.

Do not publish or enable live payments without the owner's approval.

### Current development verification (2026-11-10)

- Workspace typecheck passed; after the final frontend repairs its typecheck
  passed again. Both managed services restarted cleanly.
- 19 isolated tuition/rate/budget validation checks and 7 transaction-isolated
  database filter checks passed. Synthetic school rows were rolled back.
- Live reference-rate checks: USD identity plus current CAD, NGN, AED, KES, ZAR,
  BDT, TRY and SAR rates passed. This is representative coverage, not 160 live FX
  providers or a guarantee of a rate for every saved currency preference.
- Development programmatic Clerk accounts verified onboarding save/skip, custom
  CAD budget persistence, annual living estimates, profile reload and preservation
  of unrelated profile facts after a budget-only update. Negative expenses returned
  400 without mutation. A second account could not read the first account's budget.
- Applying the saved CAD budget sent the expected amount, currency and tuition
  category. The real directory still contains 6,174 records with missing tuition;
  applying a ceiling excludes unknown costs rather than declaring them affordable.
- Valid personal calculator amounts totaled correctly; invalid tuition or living
  amounts now suppress totals. Changing currency clears numeric inputs.
- Authenticated checkout and crypto-checkout returned 409 `PAYMENTS_DISABLED`;
  anonymous requests returned 401. Paid actions and crypto controls are disabled.
  There are no card inputs, wallets, fabricated transactions or revenue.
- Student admin requests returned 403. A temporary test-only admin verified
  customer search, canonical plan prices, unavailable revenue and local-only FX
  preview. Its membership was removed, verified absent, and access returned to 403.
- Signed-in billing and admin Settings fit a 390×844 viewport without page-level
  horizontal overflow after repairs. Wide history tables scroll inside their panels.
- Real-school save/list/unsave, application-task create/complete/delete, funding
  options and job-tracker loading passed; temporary save/task records were removed.
- Direct Adzuna requests still return 401 `AUTH_FAIL`; the app search returns
  503 `ADZUNA_CONFIGURATION_ERROR`. Secret-format diagnostics show both variables
  present but identical and containing internal whitespace. No values are logged,
  no live job listings are claimed, and no mock jobs were substituted.
- Full Clerk email/SSO registration was not exercised; its sign-up-to-onboarding
  redirect was inspected, and the protected budget flow was tested after
  programmatic development sign-in.
- Official tuition imports remain blocked by the earlier Scorecard 403; this
  pass did not retry that import. Payments/crypto providers remain intentionally
  unconnected. Production, publishing and live payments were not changed.
