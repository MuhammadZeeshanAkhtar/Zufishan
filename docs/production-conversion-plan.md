# Noor Ilm Production Conversion Plan

## Scope and operating rule

Noor Ilm is an LMS and tutor marketplace only. Production user journeys must use Supabase Auth, PostgreSQL, row-level security, private Storage, and authenticated server procedures. A missing provider is a blocking state, not permission to display a fake record or success message.

> Development fixtures are permitted only when `NODE_ENV` is not `production` and `VITE_ENABLE_TEST_FIXTURES=true`. The flag is never honored in production.

## Cutover order

| Order | Boundary | Production source of truth | Current rule when unavailable |
|---|---|---|---|
| 1 | Identity and profiles | Supabase Auth plus `profiles`, role, learner, and instructor tables | Block sign-in/onboarding persistence; do not create a local identity |
| 2 | Core LMS records | Authenticated server procedures using bearer-scoped Supabase clients | Show translated error/empty/setup state; never use seeded user records |
| 3 | Scheduling | PostgreSQL availability, trials, bookings, sessions, notifications, and transaction boundaries | Block booking/confirmation if the service or provider is unavailable |
| 4 | Courses and progress | Courses, modules, lessons, enrolments, progress, assignments, quizzes, and certificates | Block mutations; preserve only published records returned by Supabase |
| 5 | Private media | Supabase private buckets with validated object paths and signed URLs | Block upload/download and show storage setup state |
| 6 | Classroom and messaging | Authorised session/participant/message records plus approved realtime/video services | Block join, send, or recording claims until verified |
| 7 | Finance and operations | Ledger, payment/payout provider references, reports, reviews, and append-only audit events | Display USD as the initial display currency, but block payment/payout success |
| 8 | Language AI Tutor | Server-only approved provider, usage limits, privacy minimisation, and safety policy | Show translated provider-unavailable state; no hard-coded AI reply |

## Provider contract names

The application exposes only boolean readiness and required names through its safe production configuration report. It never returns secret values.

| Integration | Required environment names |
|---|---|
| Supabase server and browser | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` |
| AI Tutor | `AI_TUTOR_PROVIDER`, `AI_TUTOR_MODEL`, `BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY` |
| Classroom | `CLASSROOM_PROVIDER`, `CLASSROOM_PROVIDER_API_KEY` |
| Notifications | `NOTIFICATION_PROVIDER`, `NOTIFICATION_PROVIDER_API_KEY` |
| Payments | `PAYMENT_PROVIDER`, `PAYMENT_PROVIDER_SECRET` |
| Payouts | `PAYOUT_PROVIDER`, `PAYOUT_PROVIDER_SECRET` |
| Test fixtures | `VITE_ENABLE_TEST_FIXTURES=true` only outside production |

## Security invariants

All user-owned reads and writes must be authenticated, scoped to the bearer identity, and protected by database RLS. Status transitions require server validation. Mutations that create multiple related records must use an atomic transaction or a database function. Private object access must use signed URLs after an ownership or role check. Service-role credentials remain server-only and must never be included in browser bundles, logs, database rows, or audit payloads.

## Current implementation inventory

The largest remaining demo repositories are `client/src/lib/course-management-data.ts`, `client/src/lib/relationship-ops-data.ts`, `client/src/lib/classroom-data.ts`, `client/src/lib/lms-data.ts`, and `client/src/lib/requirements-data.ts`. `client/src/lib/auth-models.ts` and `client/src/contexts/AuthContext.tsx` still contain onboarding/session localStorage compatibility paths. These files are the first production cutover targets; their fixture behavior must be isolated behind the explicit development/test flag before real Supabase procedures are wired into every active surface.

## Readiness interpretation

A configured flag means only that required configuration names are present. It is not proof that a provider supports the required operation. Production readiness requires service-level tests against staging identities, RLS cross-user denial, private Storage signed-access tests, provider success/failure/timeout/quota tests, and route verification in English, Urdu, and Arabic. Until those tests pass, the project remains staging-only.
