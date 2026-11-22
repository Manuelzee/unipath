# Annual tuition budgets and payments

## Availability

- Private profile budget: optional range or custom amount, supported display
  currency, tuition/total scope, and explicit skip. Save the profile to persist.
- Registration: sign-up leads to the protected `/onboarding` wizard, whose
  third step is the budget. Skipping the budget saves an explicit "no budget"
  answer; the wizard keeps existing profile facts it does not ask about. Optional annual accommodation, food, transportation and other estimates
  are saved privately in the same selected currency.
- Directory: optional annual maximum, currency, and separately selected in-state,
  out-of-state, domestic, or international tuition. Non-U.S. coverage is limited
  to matched B.C. arts-program figures, not every program. Unknown prices are excluded
  only while a budget is applied, not treated as free or unaffordable.
- Comparison: select two to four real directory records. Missing tuition is
  unknown, not zero. Each record is fetched from the real API.
- School details: native-currency annual amounts, academic year, category, scope,
  source file, licence/attribution, source publication date when supplied, and
  a tuition-import timestamp separate from directory updates. Historical figures
  are labelled outdated. Semester prices and unreported programs are not inferred.
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

As of **2026-11-17**, development contains **6,936 authentic annual tuition
figures** across **3,468 institutions**:

| Official source | Academic year | Imported coverage | Meaning |
| --- | --- | --- | --- |
| NCES IPEDS `IC2023_AY.zip`, `TUITION2` / `TUITION3`, reported flag `R` only | 2023/24 | 6,902 figures, 3,451 of 5,913 U.S. records | Annual full-time undergraduate average tuition in USD, in-state / out-of-state separately; **required fees excluded; outdated** |
| B.C. domestic arts tuition, September 2025 release | 2025/26 | 17 figures, 17 Canadian records | Annual full-time domestic undergraduate arts-program tuition in CAD; not U.S. in-state |
| B.C. international arts tuition, September 2025 release | 2025/26 | 17 figures, the same 17 Canadian records | Annual international arts-program tuition in CAD; not all programs |

There are 6,174 directory records in total, including 258 Canadian records.
The three non-U.S./non-Canadian records have no imported tuition. Missing prices
remain unknown. Neither these counts nor a source reporting year establish
current operation, recognition, DLI eligibility, program availability, or a
current personalized price.

The Scorecard API was securely retried on 2026-11-17 and again returned **HTTP
403**; no API figures were imported. Presence of a secret does not establish
valid access, account activation, or the precise reason for rejection. Official
year-qualified IPEDS downloads supplied the U.S. figures instead. The attempted
2024 IPEDS academic-year ZIP was unavailable (404); no newer year was invented.
Source publication dates not supplied by an archive remain null.

The official U.S. archive has 7,074 reported category/amount pairs; 172 did not
match an existing U.S. IPEDS identity and were not imported. Each B.C. file
contains 25 institutions; 17 matched exact, unambiguous names. Eight unmatched
names per file remain unassigned, including institution-level UBC and Camosun
figures whose directory entries are campus-specific. No fuzzy matching or
campus propagation was used, and no university identity was created or changed.
Worldwide coverage and current institutional quotes remain incomplete.

B.C.'s two datasets explicitly use the **Open Government Licence – British
Columbia**, permitting commercial redistribution with attribution. Every
exposed quote carries the required attribution and licence link; the source
does not endorse UniPath. No restricted WHED, CICIC or EduCanada data was copied.
The U.S. data are public federal institutional statistics; no protected student
records, university marks or images are included in the tuition snapshots.

The server uses Frankfurter's documented v2 USD reference-rate API for the
160 runtime-recognized fiat currency preferences. This is not a claim that rates
are available for every currency. Rates have source dates and retrieval times,
are cached for one hour, and are unusable for conversion after seven days.
Native-currency filtering needs no exchange rate. Cross-currency tuition uses
`amount × (USD→display rate) / (USD→source rate)`; both required rates must be
usable. Original CAD figures are never relabelled USD, and are not written into
legacy USD-only API fields. A tiny machine-precision tolerance handles exact
inclusive boundaries; decimal amounts are not rounded up to whole dollars.
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
- https://nces.ed.gov/ipeds/datacenter/data/IC2023_AY.zip
- https://nces.ed.gov/ipeds/datacenter/data/IC2023_AY_Dict.zip
- https://www.ed.gov/about/ed-overview/required-notices/website-policies/copyright-status-notice
- https://catalogue.data.gov.bc.ca/dataset/670516e0-6cb0-4d3b-ab2b-b82ed9ee59db
- https://catalogue.data.gov.bc.ca/dataset/6e317257-54fe-44d1-89a6-1fcd81f5a484
- https://www2.gov.bc.ca/gov/content/data/policy-standards/data-policies/open-data/open-government-licence-bc

### Reproduce the reviewed file import

From the workspace root, run `pnpm --filter @workspace/db run push` for the
new tuition evidence table, then:

```sh
cd apps/api
pnpm exec tsx src/scripts/loadTuitionSnapshots.ts
```

The task-merge setup script runs this same development-only command after schema
setup, so merging the code does not leave the main development directory with
unknown tuition. It does not publish or connect to a production database.

This development-only command validates all three bundled normalized
files under `data/tuition/`, stages them, and imports in one transaction. It
hash-checks all directory rows and reviewed institution facts before/after and
rolls back if they change. It inserts into a separate evidence table; it never
updates existing quotes or directory rows. Conflicts are counted as preserved,
not refreshed or falsely reported as new imports. Re-running is safe.

Each manifest retains the SHA-256 of the official downloaded archive/CSV:

- IPEDS: `42d3ee39a107d69b6da02df2ffa934ebe3bb76657568fb9efb7027b6ce0d69ee`
- B.C. domestic: `7886bbc53782f50ee2f3eda7b7250cd68cb06c1e46304f1775ac74b9f1549221`
- B.C. international: `fe73bc6d86f5d7ad6ff1bc216adc3a45ad03b74f6a6f9203e8978d559496af89`

Raw downloads and verification output live under ignored
`generated-artifacts/tuition/`; the small normalized evidence snapshots are
retained with the code so a task merge does not depend on temporary files.
These hashes identify the reviewed raw files; they do not authenticate an
arbitrary edited manifest. The file import is a trusted operator command, not
a public upload endpoint. Review any replacement file against its official
download and terms before running it.

To prepare a fresh copy of the same official sources (paths relative to the
API package):

```sh
python src/scripts/prepareTuitionFiles.py --input /path/to/IC2023_AY.zip \
  --provider ipeds-2023 --output /path/to/ipeds-2023.json
python src/scripts/prepareTuitionFiles.py --input /path/to/bc-domestic.csv \
  --provider bc-domestic-2025 --output /path/to/bc-domestic-2025.json
python src/scripts/prepareTuitionFiles.py --input /path/to/bc-international.csv \
  --provider bc-international-2025 --output /path/to/bc-international-2025.json
pnpm exec tsx src/scripts/importTuition.ts --file /path/to/normalized.json
```

Official Scorecard year-qualified institution files are also accepted:

```sh
python src/scripts/prepareTuitionFiles.py --input /path/to/MERGED2024_25_PP.csv \
  --provider scorecard-2024 --output /path/to/scorecard-2024.json
pnpm exec tsx src/scripts/importTuition.ts --file /path/to/scorecard-2024.json
```

The year must match the official `MERGEDYYYY_YY_PP.csv` filename. A ZIP must
contain exactly one such CSV. Mixed-year “Most Recent” files are rejected;
Scorecard tuition includes required fees and is labelled accordingly. Null,
suppressed, not-applicable and unreported values are not treated as zero.
Existing category evidence (including older amounts) is intentionally preserved;
refreshing/replacing it requires a separately reviewed process.

Run the opt-in tuition-only import in the API package:

```sh
pnpm exec tsx src/scripts/importTuition.ts
```

Without `--file`, it uses `COLLEGE_SCORECARD_API_KEY` from server Secrets, retrieves only small
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
cd apps/api
pnpm exec tsx src/scripts/tests/testTuitionAndRates.ts
pnpm exec tsx src/scripts/tests/testTuitionDatabase.ts
```

The two original TypeScript tests use isolated synthetic fixtures, not live tuition or payment data.
Database filter fixtures are transaction-isolated and always rolled back.
Live development checks separately cover reference-rate retrieval, invalid
budget inputs, unknown-tuition exclusions, and payment availability/access gates.

### Authentic import verification (2026-11-17)

```sh
python -m unittest discover -s apps/api/src/scripts/tests -p test_prepare_tuition.py
cd apps/api
pnpm exec tsx src/scripts/tests/testImportedTuition.ts
```

- Full workspace typecheck passed. Five file-preparation checks, 19 original
  tuition/rate validation checks and seven rolled-back filter checks passed.
- Eight authentic-import checks verified all 6,936 imported figures against
  the official normalized snapshots, including currencies, scope, academic
  years, source links and licence links. The import verified directory/fact
  hashes were unchanged.
- Actual comparison inputs: Langara international CAD 19,911 versus Douglas
  CAD 19,875 for 2025/26, a CAD 36 difference. Alabama A&M 2023/24 in-state
  USD 8,610 versus out-of-state USD 17,220, a USD 8,610 difference; international
  remains unknown. This is historical tuition-only data, not a current offer.
- Live Frankfurter reference on 2026-11-17: 1 USD = 1.427 CAD; Langara's
  indicative USD equivalent was 13,953.05. Real CAD→USD and USD→CAD budget
  searches included exact ceilings and excluded one cent below. A CAD-native
  budget also worked with networking disabled.
- Domestic/international category separation, unknown U.S. international fees,
  ambiguous UBC-campus exclusions, explicit stale-rate failure, and preservation
  of original amounts/provenance on reimport passed. Mutation checks rolled back.
- The full task-merge setup passed, preserving all 6,936 existing quotes and
  leaving directory/fact hashes unchanged. Both managed app services restarted
  cleanly. A public detail-page screenshot showed original CAD amounts,
  USD estimates, source/licence links, academic year and separate import dates
  without overflowing source links. Interactive browser comparison was not run;
  comparison inputs and converted budget boundaries were checked programmatically.
- No production data import, publishing, payment changes, or sign-in changes
  were performed. Earlier sections below are historical checks, not current
  claims that development still has zero tuition.

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
