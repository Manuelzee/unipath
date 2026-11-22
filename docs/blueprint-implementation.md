# UniPath AI blueprint: what is built

This maps the *UniPath AI Product & Engineering Blueprint* to the code. Status:
**Built**, **Adapted** (blueprint intent met differently) or **Not built**.

## Key decisions

- **Existing stack kept.** The blueprint suggests Next.js, NestJS and Prisma, but
  also says to inspect the existing app before replacing it. The app already
  meets the architecture rules (TypeScript throughout, PostgreSQL, a modular
  monolith, sensitive work on the server), so it was extended instead of
  rewritten: React + Vite, Express, Drizzle ORM, Clerk, and an OpenAPI contract
  that generates both the server validators and the client hooks.
- **Existing colors kept.** The live app's palette (navy `#173e62`, teal
  `#378b82`, mint `#87d6c6`, background `#f5f8fa`) is used instead of the
  blueprint's suggested tokens, at the owner's request.
- **Payments stay closed.** This follows the blueprint's own "launch control"
  and the owner's earlier instruction. Every working tool is free until billing
  is connected and tested.

## Section by section

| Blueprint section | Status | Where |
|---|---|---|
| 01 Design system | Adapted: existing palette and components | `apps/web/src/index.css`, `components/workspace/workspace.css` |
| 03 Modules | Built | `apps/api/src/routes/*` |
| 04 Pages and routes | Built. Blueprint URLs (`/register`, `/login`, `/universities`, `/universities/:id`, `/pricing`, `/ai-assistant`) also work and redirect to the app's routes | `apps/web/src/App.tsx` |
| 04 Onboarding wizard (5 steps, "why we ask", review) | Built | `components/profile/OnboardingWizard.tsx` |
| 05 Match classifications | Built: Strong Match, Potential Match, Requirements Not Met, Insufficient Information. Verified hard requirements are checked separately and outrank the score. | `api-server/src/lib/matching/classify.ts`, `score.ts` |
| 05 Data integrity and source metadata | Existing, kept: source URLs, reporting years, verification dates, "Not reported" | directory components |
| 06 Dashboard (profile completion, counts, deadlines, overdue tasks, matches, activity, status overview) | Built | `components/dashboard/DashboardView.tsx`, `GET /api/me/dashboard` |
| 06 Applications (9 statuses, lifecycle, tasks, document checklist) | Built. Student-managed: UniPath never submits. | `components/applications/ApplicationsView.tsx`, `routes/applications.ts` |
| Saved schools page and side-by-side comparison (up to 4) | Built | `components/saved/SavedView.tsx`, `components/compare/CompareView.tsx` |
| 07 AI assistant (grounded chat, essay feedback, review-before-save) | Built; needs `OPENAI_API_KEY` | `components/assistant/AssistantView.tsx`, `routes/ai.ts`, `lib/ai/*` |
| 07 AI safeguards | Built: server-only calls, facts shown with sources, daily quota and burst limit, budget/citizenship/region never sent, nothing stored unless approved | `lib/ai/grounding.ts`, `prompts.ts`, `quota.ts` |
| 08 Plans and server-side entitlements | Adapted: prices unchanged; server entitlements exist (`lib/entitlements.ts`) but every account is Free until billing is connected | `components/plans/catalog.ts` |
| 08 Live checkout and webhooks | Not built (deliberately closed) | `routes/billing.ts` |
| 09 Data model | Built: `applications`, `ai_saved_items`, `ai_usage`, `application_tasks.application_id`, and the new profile fields (qualification, grading scale, graduation year, test date) | `packages/db/src/schema/*` |
| 10 Ownership checks, input validation | Built: every student query is scoped to the signed-in user, every input is validated against the OpenAPI schema, and JSON is required for writes | routes |
| 10 Settings: export and delete my data | Built | `components/settings/SettingsView.tsx`, `routes/account.ts` |
| 10 Email verification, password reset, Google sign-in | Provided by Clerk (enable Google in the Clerk dashboard) | |
| 10 Private document uploads (S3/R2, signed URLs, malware scan) | Not built | |
| 10 Admin catalogue and verification | Existing admin console kept unchanged | `components/admin/*` |
| 11 Responsive design and accessibility | Built for new pages: tested at 390px and desktop; labelled controls, focus states, no browser dialogs | |
| 11 Tests | Unit and integration tests added (below). Playwright end-to-end suite not added. | |
| 11 Monitoring (Sentry) | Not built | |

## Turning on the AI assistant

1. Create an API key with your AI provider (the blueprint names OpenAI).
2. In Replit, open **Secrets** and add `OPENAI_API_KEY`. Optionally add
   `OPENAI_MODEL` (default `gpt-4o-mini`) and `AI_DAILY_LIMIT_FREE` (default 15).
3. Restart the app. Until a key is set, `/ai-assistant` shows the earlier
   prepared examples and sends nothing anywhere.

The key stays on the server. Students see exactly which profile fields are
shared, and every answer lists the facts it was given, with sources and dates.

## Database changes

All changes are additive: new tables, plus nullable or defaulted columns.
Replit's post-merge script runs `pnpm --filter @workspace/db run push`, which
applies them without touching existing rows.

## Tests

```bash
# No database needed
pnpm --filter @workspace/api-server run test:unit

# Against a database: student isolation, applications, dashboard, AI quota and
# privacy (provider stubbed), export and deletion. Uses throwaway users and
# removes what it creates.
pnpm --filter @workspace/api-server exec tsx src/scripts/tests/testWorkspaceIsolation.ts
```

## Known data limitation

In the bundled directory snapshot, none of the 5,913 U.S. institutions has a
program list; only the 258 Canadian pilot records do. A student who enters a
field of study will therefore usually see **Insufficient Information** for U.S.
schools. That is accurate: UniPath cannot yet verify that those schools offer
the program. Importing source-backed program data, for example from College
Scorecard field-of-study files, is the most valuable next data task.
