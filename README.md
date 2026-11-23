# UniPath AI

A global university discovery and application-planning app: students explore source-backed school records, get explainable matches, compare schools, track their own applications, keep their documents in one private place and get advisory AI guidance.

## Getting started

Requirements: Node.js 22.9 or later, and pnpm (`corepack enable`, or `npx pnpm@10.34.9 <command>`).

```bash
pnpm install
cp .env.example .env      # then fill in the Clerk keys
pnpm db:local             # zero-install Postgres on port 5433 (or: docker compose up -d db)
pnpm db:push              # create or update the tables
pnpm dev                  # API on http://localhost:8080, web app on http://localhost:5173
```

Public pages work without Clerk keys; signing in needs them (create a free application at https://dashboard.clerk.com). VS Code users can run the API under the debugger with the **Debug API server** launch configuration.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | API and web app together, with reload (`dev:api` / `dev:web` for one) |
| `pnpm build` | Typecheck, then production builds of every package |
| `pnpm start` | Run the built API, which also serves the built web app |
| `pnpm test` | Unit tests; no database needed |
| `pnpm test:integration` | API tests against the database in `.env`; creates and removes throwaway users |
| `pnpm typecheck` | Typecheck the whole workspace |
| `pnpm codegen` | Regenerate the API hooks and Zod schemas from the OpenAPI spec |
| `pnpm db:push` | Apply schema changes to `DATABASE_URL` (additive) |
| `pnpm db:seed` | Load the bundled tuition snapshots |

Environment variables are documented in [`.env.example`](.env.example). Required: `DATABASE_URL` and the Clerk keys. Optional: `OPENAI_API_KEY` for the AI assistant, `STORAGE_DIR` for uploaded files, Adzuna keys for student jobs.

## Stack

- pnpm workspaces, Node.js, TypeScript 5.9
- Web: React 19 + Vite, wouter, TanStack Query, Clerk
- API: Express 5, Clerk auth, esbuild bundle
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
- Server-side entitlements resolve every account to Free until a payment provider is connected and tested.

## Product

Discover and filter institutions, explainable matches with four classifications, shortlist and side-by-side comparison, a 5-step onboarding wizard, an application tracker with statuses, tasks and a document checklist, private document uploads, a dashboard, an AI assistant and essay feedback, a funding finder, student jobs, plans, and settings with data export and deletion.

## Project rules

- Keep the app's existing colors (navy `#173e62` + teal `#378b82`); do not switch to the blueprint's tokens.
- Never invent tuition, requirements, deadlines or scholarships; show missing data as unknown.
- Keep payments closed until the owner approves live billing.

## Gotchas

- Schema changes are additive and applied with `pnpm db:push`; avoid destructive column changes.
- After editing `openapi.yaml`, run `pnpm codegen`, or the server and client will disagree.
- The shared packages publish their types through a build step. If the editor shows stale types after a schema change, run `pnpm typecheck:libs`.
