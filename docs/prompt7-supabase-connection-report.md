# Prompt 7 Supabase connection-foundation report

## Scope

This iteration is connection-only. The Noor Ilm UI, routes, local/demo repositories, and existing LMS-only scope were preserved. No product migrations, product tables, live video, payments, payouts, email delivery, Realtime, Quran content, marketplace expansion, prayer utilities, Zakat, Fatwa/Q&A, community, donations, or general religious AI were added.

## Files changed

| File | Change |
|---|---|
| `server/supabase-connection.ts` | Server-only Supabase configuration status, service-role client boundary, and safe lightweight health check |
| `client/src/lib/supabase-client.ts` | Browser-safe client boundary reading only optional `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` |
| `server/routers.ts` | Added public `supabase.health` tRPC procedure returning non-secret readiness state |
| `server/_core/env.ts` | Added typed server environment references for the three server-side Supabase names |
| `client/src/lib/auth-models.ts` | Updated demo fallback copy to say “Supabase connection required for production persistence” |
| `server/supabase-connection.test.ts` | Added configuration, secret-boundary, browser-source, health endpoint, and unavailable-fallback tests |
| `docs/supabase-setup.md` | Added connection-only architecture, environment names, owner setup, restart/redeploy, and migration non-change notes |
| `docs/prompt7-supabase-connection-report.md` | This handoff report |
| `package.json`, `pnpm-lock.yaml` | Added the official `@supabase/supabase-js` package through the package manager |

## Required environment names

| Variable | Required location | Purpose |
|---|---|---|
| `SUPABASE_URL` | Server environment | Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Server environment; safe public key | Health-check authentication and future public-client configuration |
| `SUPABASE_SERVICE_ROLE_KEY` | Server environment only | Server-side service-role access; never expose in browser code or any `VITE_*` variable |
| `VITE_SUPABASE_URL` | Optional browser environment | Browser-safe URL for `client/src/lib/supabase-client.ts` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Optional browser environment | Browser-safe public key for the client boundary |

The service-role value is not returned by the health procedure, tests, logs, or client module. The browser module does not contain the service-role variable name or import the server module.

## Connection verification

The server health boundary calls the lightweight Supabase Auth health endpoint and returns only configuration completeness, whether a server key is configured, reachability, and HTTP status. It converts network/provider errors to `Supabase connection unavailable.` and does not expose raw errors, keys, tokens, or database records.

The environment-backed health test runs against the configured environment when the three server variables are present. The same suite also verifies missing configuration, valid configuration shape, server-only key classification, absence of the service-role key from the browser source, and a bounded unavailable response for an invalid endpoint. Report the current health result from the latest test run rather than assuming configuration is valid.

## Database/Auth/RLS status

No product database tables were created or altered. `drizzle/schema.ts` still contains only the scaffold `users` table, `drizzle/relations.ts` remains empty, and `drizzle/migrations/` still contains only `.gitkeep`. The documented SQL designs remain design artifacts and were not applied.

The existing Manus OAuth/demo session architecture was not replaced. Supabase Auth was not made the active product authentication flow. No RLS policy was applied or changed. The connection foundation only prepares safe boundaries and documentation for a later schema-first migration and server-authorization pass.

## Validation

The focused Prompt 7 suite passes **15 tests across the existing auth boundary file and the new Supabase connection file**. TypeScript validation passes. The dev server restarted successfully after package installation and remains available. A full project test/build pass is required before the next production checkpoint if additional changes are made.

## Owner setup steps

Add `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` through managed project Secrets. If the browser client is intentionally enabled later, separately add the two `VITE_` public variables; never add the service-role key to a `VITE_*` variable. Restart the dev server after dependency or environment changes. Verify `supabase.health` in staging, then consolidate and review the SQL design files before generating or applying migrations. Do not remove demo labels or connect product persistence until Auth, RLS, private Storage, server procedures, and ownership tests are active.
