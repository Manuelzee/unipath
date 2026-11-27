# UniPath AI

A global university discovery and application-planning app: students explore source-backed school records, get explainable matches, compare schools, track their own applications, keep their documents in one private place and get advisory AI guidance.

## Getting started

Requirements: Node.js 22.9 or later, and pnpm (`corepack enable`, or `npx pnpm@10.34.9 <command>`).

```bash
pnpm install
cp .env.example .env      # works as is for local development
pnpm db:local             # zero-install Postgres on port 5433 (or: docker compose up -d db)
pnpm db:push              # create or update the tables
pnpm dev                  # API on http://localhost:8080, web app on http://localhost:5173
```

Sign-up and sign-in work straight away. Until email is configured, each one-time code is written to the API server's terminal instead of being emailed (see [Authentication](#authentication)). VS Code users can run the API under the debugger with the **Debug API server** launch configuration.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | API and web app together, with reload (`dev:api` / `dev:web` for one) |
| `pnpm build` | Typecheck, then production builds of every package |
| `pnpm start` | Run the built API, which also serves the built web app |
| `pnpm test` | Unit tests; no database needed |
| `pnpm test:integration` | API tests against the database in `.env` (workspace isolation, then sign-in and accounts); creates and removes throwaway users |
| `pnpm typecheck` | Typecheck the whole workspace |
| `pnpm codegen` | Regenerate the API hooks and Zod schemas from the OpenAPI spec |
| `pnpm db:local` | Start the zero-install development database (reports it if one is already running) |
| `pnpm db:check` | Test the connection to `DATABASE_URL` and explain a failure (never prints the password) |
| `pnpm db:push` | Apply schema changes to `DATABASE_URL` (additive) |
| `pnpm db:seed` | Load the bundled tuition snapshots |

Environment variables are documented in [`.env.example`](.env.example). Required: `DATABASE_URL`. For production, also `APP_ORIGIN`, `RESEND_API_KEY` and `EMAIL_FROM` for sign-up emails. Existing SMTP setups can use `SMTP_URL` instead. Optional: `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` for Google sign-in, `OPENAI_API_KEY` for the AI assistant, `STORAGE_DIR` for uploaded files, Adzuna keys for student jobs.

## Authentication

Accounts are built into the app; there is no outside sign-in service. Students can:

- **Get started** (`/sign-up`) with a name, email and password, then continue to onboarding. With `EMAIL_VERIFICATION=required`, a 6-digit code is emailed first and must be entered before the account can be used.
- **Sign in** (`/sign-in`) with email and password, or ask for a one-time code instead (a first code sign-in creates the account).
- **Continue with Google**. The button appears once `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set.
- Reset a forgotten password with an emailed code, and in Settings change their name or password, sign out other devices, or delete the account.

| Setting | Effect |
|---|---|
| `EMAIL_VERIFICATION` | `required` makes new accounts enter an emailed code before they can be used, and shows "Forgot password?". Off by default (sign-up signs the student in at once, and an email that already has an account cannot be registered again), because Resend delivers only to its account owner until a sending domain is verified. Turn it on after verifying a domain; accounts created meanwhile confirm their email at their next sign-in |
| `RESEND_API_KEY`, `EMAIL_FROM` | Codes are sent through Resend's HTTPS API. An `SMTP_URL` pointing at `smtp.resend.com` is also sent through the API with the same key, because hosts such as Render's free plan block outgoing SMTP. Other SMTP providers can use `SMTP_URL` with `EMAIL_FROM`. Without either configuration, development writes each code to the API server's terminal (`[email not configured] … code for …`), and production turns email codes off |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | From a Google Cloud OAuth client of type "Web application". Add `<site origin>/api/auth/google/callback` as an authorized redirect URI (locally `http://localhost:5173/api/auth/google/callback`) |
| `APP_ORIGIN` | The public HTTPS origin; required in production for Google's redirect and for accepting browser writes |

How it works: passwords are hashed with scrypt; a session is a random token in an HttpOnly, SameSite=Lax cookie (`__Host-` and Secure in production), and only its hash is stored (`auth_sessions`). Sessions last 30 days and renew while in use. Codes are stored hashed, expire after 10 minutes and stop working after 5 wrong tries. State-changing requests from other sites are refused. Sign-in attempts and code requests are rate-limited per server process. The code is in `apps/api/src/lib/auth/` and `apps/api/src/routes/auth.ts`, and the screens are in `apps/web/src/components/auth/AuthFlow.tsx`.

`pnpm start` always runs in production mode, so locally it needs Resend or SMTP settings for email codes (or use `pnpm dev`). Production must be served over HTTPS, or browsers will not keep the session cookie.

## Running in production

Hosted setup (Cloudflare Pages for the web app, Render for the API, Supabase for the database, Resend for email): follow [`docs/deployment.md`](docs/deployment.md). The pieces are `render.yaml` and the `/api` proxy in `apps/web/functions/`.

To run everything as one server instead:

```bash
pnpm build                 # set VITE_* variables first: Vite embeds them at build time
pnpm start                 # the built server always runs in production mode
```

One Node process serves the API and the built web app on `PORT`. Set `APP_ORIGIN` to the public site origin, run `pnpm db:push` against the production database during each deployment, and put the server behind HTTPS (set `TRUST_PROXY=1` behind a proxy or load balancer).

- `GET /api/healthz`: the process is up (liveness).
- `GET /api/readyz`: the database answers; returns 503 when it does not (use for readiness checks).
- Logs are JSON on stdout. Requests slower than `SLOW_REQUEST_MS` (default 1500) are logged as warnings.
- On `SIGTERM` the server stops accepting connections, finishes in-flight requests and closes the database pool.
- Uploaded files live in `STORAGE_DIR`: put it on persistent storage and include it in backups alongside the database.

## Stack

- pnpm workspaces, Node.js, TypeScript 5.9
- Web: React 19 + Vite, wouter, TanStack Query
- API: Express 5, built-in accounts (cookie sessions, scrypt, Nodemailer for SMTP), esbuild bundle
- Database: PostgreSQL + Drizzle ORM
- Validation: Zod and `drizzle-zod`
- API contract: OpenAPI, with Orval generating the client hooks and server validators

## Where things live

| Path | Contents |
|---|---|
| `apps/api` | Express API. Routes in `src/routes/`, matching in `src/lib/matching/`, AI in `src/lib/ai/`, file storage in `src/lib/storage.ts`, tests in `src/scripts/tests/` |
| `apps/web` | React app. Pages in `src/components/`, routes and navigation in `src/App.tsx` |
| `packages/api-spec` | `openapi.yaml`, the source of truth for the API. Run `pnpm codegen` after editing it |
| `packages/api-zod`, `packages/api-client-react` | Generated validators and React Query hooks (do not edit by hand) |
| `packages/db` | Drizzle schema (`src/schema/`) and database client |
| `docs/` | Feature notes; [`blueprint-implementation.md`](docs/blueprint-implementation.md) maps the product blueprint to the code |

Theme: `apps/web/src/index.css` (the app's palette) and `apps/web/src/components/workspace/workspace.css`.

## Architecture decisions

- The blueprint's Next.js/NestJS/Prisma suggestion was not adopted; the existing modular monolith already meets its architecture rules.
- The AI provider is called only from the server with a grounded, numbered fact list; budgets, citizenship and region are never sent; only student-approved output is stored.
- Match classification checks verified hard requirements separately from the weighted score, so a high score can never hide an unmet requirement.
- Uploaded documents are checked by their bytes, stored outside any public folder and only ever returned to their owner, as downloads.
- Sign-in is built in (replacing Clerk) so the app has no outside identity service: account records live in the app's own database (`auth_users`), and every student record keys on that account id.
- Server-side entitlements resolve every account to Free until a payment provider is connected and tested.

## Product

Discover and filter institutions (the U.S., a Canada pilot and about 24,500 universities in 158 other countries outside Africa; see `docs/global-college-directory.md`), a scholarships and sponsorships list with official links, explainable matches with four classifications, shortlist and side-by-side comparison, a 5-step onboarding wizard, an application tracker with statuses, tasks and a document checklist, private document uploads, a dashboard, an AI assistant and essay feedback, a funding finder, student jobs, plans, and settings with data export and deletion.

## Project rules

- Keep the app's existing colors (navy `#173e62` + teal `#378b82`); do not switch to the blueprint's tokens.
- Never invent tuition, requirements, deadlines or scholarships; show missing data as unknown.
- Keep payments closed until the owner approves live billing.

## Gotchas

- Schema changes are additive and applied with `pnpm db:push`; avoid destructive column changes.
- After editing `openapi.yaml`, run `pnpm codegen`, or the server and client will disagree.
- The shared packages publish their types through a build step. If the editor shows stale types after a schema change, run `pnpm typecheck:libs`.
