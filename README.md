# Zufishan LMS

Zufishan is a web-first Islamic learning management system and tutor marketplace foundation built around the **Quiet Geometry** design system: warm ivory surfaces, forest and moss greens, charcoal ink, restrained saffron accents, precise editorial typography, and subtle geometric motifs. The product remains strictly LMS-focused and does not add general religious modules.

## Current stable release

The current stable project includes real Supabase-backed Auth, protected server procedures, PostgreSQL data contracts, RLS-aware ownership boundaries, private-storage boundaries, learner and instructor course flows, scheduling and trial-request contracts, Hifz tracking and assigned-instructor reviews, multilingual English–Urdu–Arabic UI with RTL support, and the protected Islamic Language Learning AI Tutor boundary.

The AI Tutor uses an optional server-only Gemini adapter with published course/lesson grounding, safety classification, bounded requests, and honest setup-needed/provider failure states. The currently configured model is `gemini-3.7-flash`; model metadata is reachable, but real generation remains provider-blocked by a redacted HTTP 403 `PERMISSION_DENIED` until the owner corrects the Google project/key permission settings. The application does not fabricate AI answers, reviews, ratings, learner records, financial totals, or transactions.

The latest stable visual/UI checkpoint is **`1dc9c492`**. The latest post-secret Gemini diagnostic checkpoint is **`e9d27e1b`**. Use the Git history and project management checkpoint history to select the desired restore point.

## Local development

```bash
pnpm install
pnpm dev
```

Validation commands:

```bash
pnpm check
pnpm test
pnpm build
```

The server reads its deployment port from the environment. Do not hardcode a production port. The `db:push` script is retained for the scaffold, but Supabase/PostgreSQL migrations must follow the project’s reviewed Supabase migration workflow rather than the managed MySQL/Drizzle channel.

## Environment variables

Create local environment configuration through the project’s secure environment settings. Never commit a populated environment file. The application recognizes the following variable names; values are intentionally omitted from this repository documentation.

| Group | Variable names |
|---|---|
| Runtime and auth | `NODE_ENV`, `PORT`, `JWT_SECRET`, `OWNER_OPEN_ID`, `OAUTH_SERVER_URL` |
| Platform services | `BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY` |
| Supabase server | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL` |
| Optional AI Tutor | `GEMINI_API_KEY`, `GEMINI_MODEL`, `RUN_GEMINI_SMOKE` |
| Browser-safe config | `VITE_APP_ID`, `VITE_OAUTH_PORTAL_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_FRONTEND_FORGE_API_URL`, `VITE_FRONTEND_FORGE_API_KEY`, `VITE_ENABLE_TEST_FIXTURES` |

Service-role keys, database URLs, JWT secrets, Gemini keys, payment keys, tokens, and private credentials must remain server-only and must never be placed in `VITE_*` variables.

## Project structure

| Path | Purpose |
|---|---|
| `client/src/App.tsx` | Route composition, shared public shell, and role-aware route boundaries |
| `client/src/components/` | Learner, instructor, marketplace, course, Hifz, classroom, admin, and AI Tutor experiences |
| `client/src/contexts/` | Supabase Auth session and English–Urdu–Arabic locale/RTL state |
| `client/src/i18n/` | Typed translation catalogue |
| `client/src/index.css` | Quiet Geometry tokens and presentation styling |
| `server/supabase-core.ts` | Server-side Supabase procedures and ownership-aware data access |
| `server/ai-tutor.ts` | Protected AI Tutor procedures, safety boundary, persistence, and grounding |
| `server/ai-tutor-provider.ts` | Server-only optional Gemini adapter and safe provider error mapping |
| `supabase/migrations/` | Reviewed PostgreSQL/Supabase migration artifacts |
| `docs/` | Production conversion, route, security, provider, and operating evidence |
| `server/*.test.ts` | Focused server contract, privacy, safety, and integration-boundary tests |

## Security and data rules

Do not disable RLS, bypass server ownership checks, expose private Storage references, or trust client-only role guards. Keep learner, instructor, and admin access least-privilege and verify sensitive operations server-side. Use real Supabase flows only; do not seed fake production data or commit credentials. Store money as integer minor units with a separate currency code and timestamps in UTC.

The AI Tutor is restricted to Islamic language learning. It must not become a general religious advice system. Course grounding is allowlisted to published course and lesson content and excludes private media, instructor-only fields, and untrusted instruction-like course text.

## Known setup-needed boundaries

Live classroom/video, notification delivery, payment and payout providers, production Realtime behavior, and the Gemini generation permission issue require owner-side provider configuration and/or signed staging identities. The application keeps these states explicit and fails closed rather than presenting fake success.

## Claude Code handoff

After cloning, install dependencies and run the validation commands before editing:

```bash
gh repo clone MuhammadZeeshanAkhtar/noor-ilm-lms
cd noor-ilm-lms
pnpm install
pnpm check
pnpm test
pnpm build
```

Open the folder in Claude Code only after confirming that local environment values are supplied through a secure mechanism and are not written into tracked files. Review `docs/production-conversion-report-2026-08-26.md` and the latest checkpoint history before making changes.
