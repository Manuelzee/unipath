# Adzuna connection checks

Credentials are server-only Replit Secrets:

- `ADZUNA_APP_ID` is the Application ID.
- `ADZUNA_APP_KEY` is the Application Key from **the same Adzuna application**.

Save only each value, not a sentence, assignment, JSON object or surrounding
quotes. They must be two distinct values, with no embedded whitespace.
The server trims surrounding whitespace but never deletes embedded characters,
swaps values, or bypasses Adzuna authentication.

## Developer account

1. Sign in at <https://developer.adzuna.com/>.
2. Complete email activation if the account is not activated.
3. Open your application's credentials and copy its matching ID and key into
   the two corresponding Replit Secrets fields. Do not share them in chat.
4. Use Adzuna's [interactive documentation](https://developer.adzuna.com/activedocs)
   to test that application against the US job search endpoint.
5. If the correct pair still returns `AUTH_FAIL`, check the application's
   status and API access with Adzuna. The app cannot determine or change
   account-side access from an authentication failure.

## Official request

`GET https://api.adzuna.com/v1/api/jobs/us/search/1`

Authentication uses the `app_id` and `app_key` query parameters, never a browser
request or a Bearer header. JSON is requested with `Accept: application/json`.
Adzuna also documents the `content-type=application/json` query alternative.

References:
- <https://developer.adzuna.com/overview>
- <https://developer.adzuna.com/docs/search>

## Safe local diagnostics

From `artifacts/api-server`:

```sh
pnpm exec tsx src/scripts/testAdzunaLive.ts
pnpm exec tsx src/scripts/tests/testAdzunaProvider.ts
```

The first script uses real requests and reports only safe credential-format
flags, allowlisted upstream errors and public listing fields. Exit code 1 means
the live check failed. The second uses test doubles to exercise request/error
handling; it is **not** evidence that the live integration works.

An upstream 401/403 is an authentication/access rejection. An upstream 503 is
an availability failure and does not establish whether authentication passed.
UniPath returns distinct safe error codes so a missing/malformed configuration
is not misreported as a temporary outage.

Do not publish until real searches, application links and Save to Tracker have
been tested successfully and the owner has approved publishing.
