# UniPath AI: owner and student live verification

## Before you start

The existing directory, student profiles, subscription plan descriptions,
branding and image assets are preserved. Institution counts are measured from
the connected database, not hardcoded. The new dashboard cannot silently
read production while running in development: its environment label tells you
which database that server is querying.

Development and production Clerk instances are separate. Creating an account
locally does not create it on the production site.

## Secure owner setup

1. Deploy the admin update and run `pnpm db:push` against the production
   database (the changes are additive). Do not reset the database or copy
   development roles into production.
2. Open `https://<your-domain>/sign-up` and create your owner account, or
   sign in to your existing **production** owner account.
   Complete the provider's email/identity verification.
3. Open `https://<your-domain>/admin/setup` while signed in.
   Confirm the page says **Production**, then copy **your own Clerk user ID**.
   An email address is not sufficient.
4. In the production server's environment (your host's secret settings),
   add `UNIPATH_ADMIN_SETUP_USER_ID` with that exact production
   user ID. It must be a server-side value; do not prefix it with `VITE_`.
   Do not put the ID in a shared public configuration or use someone else's
   account ID. Never supply a password, Clerk secret key or sign-in ticket.
5. Restart the production server so it reads the new setting.
6. Return to `/admin/setup` as that same owner account. Read and tick the
   explicit authorization checkbox, then confirm administrator setup.
   This step is not automatic. The server verifies the signed-in immutable
   identity against its configured ID and confirms a verified Clerk identity.
7. Open `/admin`. The navigation link appears only after the server grants
   access. Check the **Production** badge, measured database counts and
   actual status-check timestamp.

No owner role is granted by default, email matching, browser storage, request
body `userId`, or client-side role flags. Every `/api/admin/*` request checks
the signed-in identity against the server-owned administrator membership
table. Repeated setup does not duplicate grants or restore revoked grants.
Removing the setup setting does not revoke an already-granted role.

For local testing, configure the development user's ID separately in
your local `.env`. Never assume development and production IDs match.
Automated tests may use an isolated, explicitly authorized development-only test
membership to exercise authorization without changing the owner account.

If you add a custom domain later, configure `UNIPATH_TRUSTED_ORIGINS` with
the exact HTTPS origins, comma-separated, in the appropriate environment
and restart the server. Set `APP_ORIGIN` to the main site origin. Administrative changes reject untrusted origins.

## Separate student test account

1. Sign out, or use a private/incognito browser window.
2. Register at the production site's `/sign-up` using a different email and
   complete normal verification. Keep that email distinct from your owner.
3. Do **not** change the owner setup setting to the student's ID.
4. Search institutions, open a real profile, inspect source links, and use
   My profile and Matches. Save budget/currency/scope, start term/year and
   ranked priorities, then reload. Change the questionnaire and confirm
   the results and saved preferences change.
5. Visit `/admin` directly as the student. It must say administrator access
   is required. Direct `/api/admin/status` and administrative mutations
   must return **403**, not merely hide a button.
6. Student `/api/me/*` endpoints derive ownership from the signed-in user,
   not a supplied user ID. The student's data must remain separate from
   the owner's or any other account's private preferences.

A development sign-in cannot establish a production session.
Production account registration, owner grant and signed-in live checks
remain **NOT TESTED** until someone actually performs them. Do not share
passwords or one-time sign-in tickets in chat.

## Institution source verification

Select an institution in `/admin`, inspect its existing source information,
then run a source check. The job records real attempt times, scoped
findings and errors. It does not verify a field just because a URL returns
HTTP 200.

Current automated claim parsers cover exact official institution names and
the explicitly researched UA first-year intake/funding pilot. They do not
establish all programs, complete admissions requirements, international
eligibility, prices, scholarship awards or every other field. Unparsed or
unsupported fields stay unverified; a successful identity check never
verifies the whole institution.

Supported claims produce **pending proposals**, not immediate verified
changes. Open the authoritative source and confirm the exact claim before
approving. Approval requires a source-grounded note of at least 20
characters and a confirmation checkbox in the interface. Reject unsupported
proposals. Applying a review retains the source fetch's actual timestamp,
separate from the review time. Expired evidence or concurrent changes
produce a conflict rather than overwrite newer information.

Failed requests preserve last known good values and dates. Retry creates
a new job linked to the failed attempt. Interrupted jobs can be retried
after five minutes. Source and job errors do not expose database details,
API keys, session cookies or source response bodies.

Student institution profiles show approved **non-price** field evidence,
its source and real check date; they never expose admin identities, review
notes, private jobs or school annual price figures.

Direct background logo/branding auto-application is paused because it
bypasses review. Existing logos, colors, mascots and their verified
provenance remain intact. No claims are made that new images or rights
have been verified by these text-source checks.

## Test checklist

Record separate Development and Production results for A–L. Use **PASS** only
for an observed result; otherwise **FAIL** or **NOT TESTED** with the reason.

- A: Admin opens dashboard.
- B: Admin inspects institution sources and real dates.
- C: Admin starts a real source check.
- D: Failure/unrelated HTTP 200 never creates a false verified result.
- E: Separate student registers and signs in.
- F: Student searches real institutions and opens profiles.
- G: Student saves/reloads preferences and updates matches.
- H: Student direct admin page/API access is denied.
- I: Private account data stays account-scoped.
- J: No server API keys, cookies or tokens in app bundles/API responses.
- K: Production search returns real production records.
- L: Subscription buttons honestly state checkout is unavailable; no fake
  payment success occurs.

Current plans are informational; payment collection is not configured.
This setup does not add checkout, change prices, or simulate purchases.
