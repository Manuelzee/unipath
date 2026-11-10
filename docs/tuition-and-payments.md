# Annual tuition budgets and payments

## Availability

- Private profile budget: optional range or custom amount, supported display
  currency, tuition/total scope, and explicit skip. Save the profile to persist.
- Directory: optional annual maximum, currency, and separately selected in-state,
  out-of-state, or verified international tuition. Unknown prices are excluded
  only while a budget is applied, not treated as free or unaffordable.
- Comparison: select two to four real directory records. Missing tuition is
  unknown, not zero. Each record is fetched from the real API.
- School details: reporting-year-qualified annual U.S. undergraduate amounts,
  source link, historical-data warning and distinct directory-record update time.
  No international, semester, or program-level figure is inferred.
- Optional calculator: student-entered annual living costs and tuition estimate,
  in USD, local component state only. Missing tuition gives a living-only subtotal;
  scholarship estimates are not automatically deducted or guaranteed.
- Plans: original USD prices retained; local-currency reference estimates only.
- `/billing`: authenticated setup status. No simulated payment history,
  receipts, invoices, subscription management, or cancellation.
- `/admin/billing`: server-authorized administrator setup status. No fabricated
  revenue, refunds, exports, or financial records.

## Source and currency limitations

The development directory has no imported tuition figures. The tuition-only
College Scorecard import returned HTTP 403 on 2026-11-10 and made no changes.
Worldwide tuition coverage and current institutional quotes are not available.
The source API credentials need valid College Scorecard access, or the owner
can supply official reporting-year-qualified data for a reviewed import.
Do not infer account activation or the precise cause from HTTP 403 alone.

The server uses Frankfurter's documented v2 USD reference-rate API for the
18 allowlisted fiat currencies. Rates have source dates and retrieval times,
are cached for one hour, and are unusable for conversion after seven days.
Unverified rates have no fabricated fallback; a converted budget search fails
explicitly instead of silently returning all institutions. These rates do
not determine a payable checkout amount, bank fees, processor fees, or taxes.
No FX API key is required.

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

The owner declined connecting Stripe. No payment SDK, checkout, webhook,
financial ledger, paid entitlement activation, or crypto processor has been
implemented. The availability endpoints intentionally keep all payment
capabilities unavailable. Presence of a key or a client-side redirect must not
enable paid access.

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
```

The latter uses isolated synthetic fixtures, not live tuition or payment data.
Live development checks separately cover reference-rate retrieval, invalid
budget inputs, unknown-tuition exclusions, and payment availability/access gates.

### Observed development results (2026-11-10)

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
