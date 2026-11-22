# UniPath AI

A global university discovery and application-planning app: students explore source-backed school records, get explainable matches, compare schools, track their own applications and get advisory AI guidance.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run test:unit` — database-free unit tests
- Required env: `DATABASE_URL`, Clerk keys. Optional: `OPENAI_API_KEY` for the AI assistant. See `.env.example`.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Web: React 19 + Vite, wouter, TanStack Query, Clerk
- API: Express 5, Clerk auth
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- API contract (source of truth): `lib/api-spec/openapi.yaml` → run codegen after editing
- DB schema: `lib/db/src/schema/*`
- API routes: `artifacts/api-server/src/routes/*`; matching in `src/lib/matching/`; AI in `src/lib/ai/`
- Web pages: `artifacts/unipath-ai/src/components/*`; routes and navigation in `src/App.tsx`
- Theme: `artifacts/unipath-ai/src/index.css` (existing palette) and `src/components/workspace/workspace.css`
- Blueprint mapping: `docs/blueprint-implementation.md`

## Architecture decisions

- The blueprint's Next.js/NestJS/Prisma suggestion was not adopted; the existing modular monolith already meets its architecture rules.
- The AI provider is called only from the server with a grounded, numbered fact list; budgets, citizenship and region are never sent; only student-approved output is stored.
- Match classification checks verified hard requirements separately from the weighted score, so a high score can never hide an unmet requirement.
- Server-side entitlements resolve every account to Free until a payment provider is connected and tested.

## Product

Discover and filter institutions, explainable matches with four classifications, shortlist and side-by-side comparison, a 5-step onboarding wizard, an application tracker with statuses, tasks and a document checklist, a dashboard, an AI assistant and essay feedback, a funding finder, student jobs, plans, and settings with data export and deletion.

## User preferences

- Keep the live app's colors (navy `#173e62` + teal); do not switch to the blueprint's tokens.
- Never invent tuition, requirements, deadlines or scholarships; show missing data as unknown.
- Keep payments closed until the owner approves live billing.

## Gotchas

- Schema changes are additive and applied with `drizzle-kit push`; avoid destructive column changes.
- After editing `openapi.yaml`, run codegen or the server and client will disagree.
- The workspace strips non-Linux native binaries, so local Windows builds need the win32 Rollup, Tailwind Oxide and LightningCSS packages added manually to `node_modules`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
