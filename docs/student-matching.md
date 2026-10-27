# Student preference matching

## Account data and student privacy

The student profile keeps its existing fields and adds optional budget choice,
preferred ISO currency, tuition-only/total scope, custom amount, preferred start
term/year, all selected priorities, the separately ordered top three, location,
state/region, domestic/international status, and application track (first-year,
transfer, graduate, unsure). Existing accounts remain intact. Signed-in GET/PUT
profile routes restore/edit the same user's answers; the recommendations route
uses that user's saved profile and returns only that account's results.

Free, Student Plus and Premium pricing and existing feature rules are unchanged.
New preferences and recommendations are available to signed-in students on
every plan. The student-facing app shows the student's **own** budget input,
but never an institution's annual tuition or annual cost figures.

## Evidence and limits

Matching starts with real directory records and source-reported degree/program
fields. Neither an institutional homepage nor a sports nickname establishes
an admissions intake, current scholarship, accepted applicant group, annual
fees, program, academic requirement or employment outcome. Such dimensions
remain unverified instead of being rewarded in the score.

One **scoped pilot**, matched to NCES IPEDS `100751` and the official UA
website, contains six separately sourced rows:

- https://admissions.ua.edu/freshman/ explicitly lists first-year Spring
  2027 (November 2, 2026 priority deadline) and Summer/Fall 2027 (December 4,
  2026 priority deadline). These are **priority**, not final, deadlines.
  The dates do not establish availability for graduate students, transfers,
  international applicants, every major, or periods after the priority date.
- https://afford.ua.edu/cost labels the 2026–27 estimated full-time,
  dependent undergraduate **tuition plus fees** by in-state/out-of-state
  residency, last updated July 2026. Numeric amounts live in a private
  matching-evidence table, not a public university profile or recommendation
  response. This is not tuition-only or an individualized total cost.
- https://afford.ua.edu/scholarships lists opportunities for incoming freshmen,
  including international applicants. A listing is not an eligibility decision,
  award, net-price calculation or promise of aid.

Imported source evidence is insert-only and exact-ID/official-website guarded;
repeated app starts preserve existing verified data. Adding more schools needs
official, scope-specific current sources and separate validation. The rest of
the directory does **not** have verified tuition or start-term evidence and
must display “needs verification” indicators, not inferred numbers/deadlines.

For a domestic U.S. applicant, tuition-plus-fees is usable internally only
when current source, degree, applicant status and potential state category
match. Even when that component fits a tuition-only budget, the indicator
is **“May fit”**, with a residency/charges caveat. A total annual education
budget never gets a positive fit from tuition alone; housing/other costs are
unknown. International applicants cannot inherit domestic U.S. tuition.
Priority deadlines that have passed are labelled as past, not evidence that
applications are closed.

For different currencies, the backend retrieves dated reference rates from
the European Central Bank at
https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml .
The database caches rates with their currency/date/source. Rates older than
seven days and currencies absent from the source are **not** extrapolated;
the affordability result becomes “needs verification.” Reference exchange
rates are indicative, not promised payment/conversion amounts. No API key
or new file upload is required.

## Explainable ranking

Recommendations filter to the student's preferred country, then score
verified evidence for location, degree, program, academic/admissions
requirements (only when comparable), budget, program-scoped intake, funding
and ranked priorities. A ranked first choice has more weight than the
second/third. Unknown or stale dimensions get **no matching points**, reduce
evidence coverage, and are listed as missing. A school with no positive
evidence is not presented as a random “match.”

Scores are estimates of the *stated preferences supported by available
evidence*, not admission probabilities. Funding and academic eligibility are
never inferred. Source-backed official links are distinct from a generic
homepage fallback; the page never claims a school is accepting applications
without term/program-level verification. Results update after a questionnaire
save, and unsaved edits are not discarded by a query refresh.

## Verification

The automated regression checks use the real verified school, intake/cost
evidence and candidate directory, and isolated temporary account tables.
They exercise repeats, account isolation, persistence, changed terms/budgets,
international/graduate unknowns, deadlines and non-disclosure of source
prices. After publishing, recheck the production schema and the authenticated
profile and recommendations flow separately. Do not claim the published
site works until its own database and API have been checked.
