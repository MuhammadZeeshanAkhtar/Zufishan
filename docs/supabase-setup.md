# Noor Ilm Supabase setup and migration guide

The current application is demo-backed. The SQL files in `docs/` are design documents and must be reviewed, generated, and applied through the project’s schema-first migration workflow before production data is introduced. The connection-only foundation now includes `server/supabase-connection.ts`, an isolated browser-safe boundary at `client/src/lib/supabase-client.ts`, and the public `supabase.health` tRPC procedure. No product tables, Auth flow, RLS policy, or feature repository was changed by this foundation pass.

## Required environment names

| Variable | Purpose | Handling |
|---|---|---|
| `DATABASE_URL` | Server database connection | Managed secret; never expose to the client |
| `JWT_SECRET` | Session signing | Managed secret; rotate through the platform |
| `OAUTH_SERVER_URL` | Manus OAuth backend | Server configuration |
| `VITE_OAUTH_PORTAL_URL` | Browser login portal | Public configuration only |
| `BUILT_IN_FORGE_API_URL` | Built-in storage/notification/data gateway | Server configuration |
| `BUILT_IN_FORGE_API_KEY` | Server gateway credential | Managed secret; never send to browser |
| `VITE_FRONTEND_FORGE_API_URL` | Browser-safe built-in API base | Public configuration only |
| `VITE_FRONTEND_FORGE_API_KEY` | Browser-safe frontend credential | Use only where the platform explicitly allows it |
| `VITE_APP_TITLE` / `VITE_APP_LOGO` | Product branding | Public configuration |
| `SUPABASE_URL` | Supabase project URL used by the server connection boundary | Managed project configuration; safe to use server-side |

| `SUPABASE_PUBLISHABLE_KEY` | Browser-safe Supabase publishable/anon key for the server health check and future public client configuration | Public key; never treat it as authorization; strict RLS remains required |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` | Optional Vite-exposed browser client values used only by `client/src/lib/supabase-client.ts` | Public configuration only; never put the service-role key in a `VITE_*` variable |
| `SUPABASE_SERVICE_ROLE_KEY` | Future server-only administrative key | Managed secret; never expose to browser |
| `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | Future classroom provider | Server-only credentials except public WebSocket URL |
| `EMAIL_PROVIDER_API_KEY` | Future notification provider | Managed secret |
| `PAYMENT_PROVIDER_SECRET` / `PAYMENT_WEBHOOK_SECRET` | Future payment/payout provider | Managed secrets; verify signatures |

## Connection-only foundation

The server boundary reads `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` from managed environment variables. It reports only `configured`, `missing`, `reachable`, `serverKeyConfigured`, and an HTTP status; it never returns a key, raw provider error, access token, or database record. The browser module reads only optional `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`; the service-role name and value do not appear in client code. The `supabase.health` procedure is safe to call for readiness checks and returns an explicit unavailable state when configuration is absent or the endpoint cannot be reached.

When Supabase variables are missing or unavailable, existing local/demo repositories remain the fallback and UI messaging must say that a Supabase connection is required. This is not production persistence.

### Owner setup and restart

Add the three server variables through the project’s managed Secrets settings: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. If browser client access is later enabled, separately add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` with the same public values; never add `SUPABASE_SERVICE_ROLE_KEY` to a `VITE_*` variable. Restart the dev server after changing dependencies or environment configuration, then redeploy through the normal project checkpoint workflow. Verify the health result in a non-production/staging environment before connecting product persistence.

## Migration sequence

1. Review the source design files against `supabase/migrations/0001_noor_ilm_lms_canonical.sql`; the canonical file contains the approved LMS table set and fails fast on duplicate names.
2. Treat `supabase/migrations/0001_noor_ilm_lms_canonical.sql` as a review artifact until a verified Supabase PostgreSQL migration channel is available. Keep UTC timestamps and integer minor-unit money fields.
3. Generate migrations, inspect the SQL, and apply them through the managed database tool. Do not run destructive SQL against existing production data without a backup and explicit review.
4. Create private Storage buckets for course media, classroom resources, and recordings. Public profile images may use an approved public bucket only when the profile field is explicitly public.
5. Add RLS policies for ownership, membership, role, moderation assignment, and finance scope. Deny by default. Add indexes for every common owner/status/course/session/time query.
6. Add server procedures for every private query and mutation. The client route guards must never be the only authorization layer.
7. Add provider webhooks for payments, payouts, notifications, and classroom lifecycle events. Verify signatures, make handlers idempotent, persist provider IDs, and append an audit event.
8. Run focused security tests against a staging project before enabling real users. The current task did not apply this migration: `SUPABASE_DB_URL`, `psql`, and the Supabase CLI are unavailable, so no SQL was sent to the configured project. PostgREST confirmed that `profiles` is not currently present (HTTP 404).

## Private Storage rules

File bytes belong in Storage, not database columns. Store file metadata and object keys in the database. Generate short-lived signed URLs only after an ownership or membership check. Never place bank statements, payment-provider secrets, private messages, or recording URLs in public buckets. Remove EXIF metadata where appropriate and define retention/deletion policies before recording sessions.

## Cutover checklist

Production readiness requires configured credentials, server-side auth, RLS policy tests, private bucket verification, provider webhook verification, backups, monitoring, error redaction, data-retention decisions, and a rollback plan. Until those steps are complete, keep the UI in the explicit demo/setup-needed state used by this release.
