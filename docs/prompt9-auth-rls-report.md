# Prompt 9 — Supabase Auth and RLS Report

## Scope

Prompt 9 connected the existing Supabase-first authentication foundation to a server-side bearer identity boundary and applied deny-by-default Row Level Security to the 39 migrated Noor Ilm LMS tables. The implementation did not use the managed MySQL/Drizzle SQL channel and did not change Storage, Realtime, payments, live classroom providers, or the application UI design.

## Files changed

The implementation files are `server/supabase-auth.ts`, `server/_core/context.ts`, and `server/_core/trpc.ts`. The migration files are `supabase/migrations/0002_auth_and_rls.sql`, which adds the Auth profile bootstrap, security-definer role helpers, and the 39-table RLS policy set, and `supabase/migrations/0003_conversation_membership_rls_fix.sql`, which removes a discovered conversation-membership policy recursion by using a security-definer membership helper. The focused test file is `server/supabase-auth.test.ts`. Existing `client/src/contexts/AuthContext.tsx` and `client/src/lib/supabase-client.ts` remain the browser authentication boundary and were not redesigned in this pass.

## Supabase Auth behavior

New Supabase Auth users are handled by the `on_auth_user_created_noor_ilm` trigger on `auth.users`. The trigger creates a `public.profiles` row, a learner-scoped `public.learner_profiles` row, a default `learner` role in `public.user_roles`, and default `notification_preferences`. The trigger does not accept a privileged browser role; approved instructor, moderator, finance, admin, and super-admin roles require protected server or administrative assignment.

The server now extracts a bearer token only from the `Authorization` header and verifies it with Supabase Auth using the public-safe publishable key. It returns only the verified Supabase user ID and email. Browser metadata, browser-submitted user IDs, and browser role claims are not used as authorization. `supabaseProtectedProcedure` accepts either the existing verified Manus OAuth user or the verified Supabase bearer identity, while the existing Manus-specific `protectedProcedure` and `adminProcedure` contracts remain intact.

## RLS status

RLS is enabled on all 39 migrated LMS tables. A read-only PostgreSQL catalog query confirmed 39 enabled tables, 94 policies across all 39 tables, and the Auth profile trigger. The policy set is deny-by-default and covers the following boundaries:

| Boundary | Current policy intent |
|---|---|
| Profiles and roles | Users can access their own profile and roles; administrative role changes are restricted, with super-admin protection for the super-admin role. |
| Learner data | Learner profiles, requirements, shortlists, enrolments, progress, submissions, quiz attempts, notifications, preferences, reviews, reports, session records, and financial records are ownership- or relationship-scoped. |
| Instructor data | Instructor profiles, credentials, media, availability, courses, modules, lessons, responses, sessions, ledger, and withdrawals are instructor-owned or admin/moderator/finance-scoped. |
| Public discovery | Only published courses, approved published instructor profiles/media/availability, published lesson previews, and published reviews are public-readable. |
| Classroom | Session, participant, and attendance access requires the learner/instructor relationship or an approved moderation boundary. |
| Messaging | Conversation and message access requires verified conversation membership; a security-definer helper prevents recursive policy evaluation. |
| Moderation and reports | Moderation cases/actions and report updates are restricted to moderator/admin boundaries; ordinary users can submit their own reports. |
| Finance | Ledger and payment references are limited to the relevant participants or finance/admin roles; withdrawal creation is instructor-owned and processing is finance/admin-owned. |
| Audit and settings | Audit logs are admin-readable and have no ordinary-user write policy; admin settings are admin-readable and super-admin-writable. |

No Storage object policies or buckets were changed. Private object-path authorization remains setup-needed for the later Storage phase.

## Verification results

The first real anonymous PostgREST check detected an infinite recursion in the original conversation-membership policy. That issue was not ignored: the focused migration `0003_conversation_membership_rls_fix.sql` was validated in a rollback-only transaction, applied transactionally, and then rechecked. The final anonymous checks returned HTTP 200 with empty result sets for `profiles`, `user_roles`, `learner_requirements`, `admin_settings`, `courses`, and `messages`. No users or test data were created.

The PostgreSQL checks verified 39 enabled RLS tables, 94 policies spanning all 39 tables, and one Auth profile trigger. The client/service-boundary suite includes bearer-token parsing and browser-role non-authority tests. Full project validation passed TypeScript, all 73 Vitest tests, and the production build. The build emitted a non-blocking Vite chunk-size warning for the existing large client bundle.

## Tests not claimed as passed

No separate learner, instructor, moderator, finance, admin, or super-admin Supabase identities were available in staging, so identity-isolated allow/deny tests were not run. The current real checks establish policy presence, RLS enablement, anonymous behavior, and recursion safety; they do not prove every ownership or cross-role path with real signed-in identities. Those tests remain a required staging gate before production.

## Unchanged or setup-needed areas

Supabase Auth configuration itself was not changed beyond the database-side new-user trigger and the server verification boundary. RLS was changed and is now enabled. Storage, Realtime, payments, payouts, email delivery, live classroom providers, and application UI were not changed. The application retains its clearly labelled demo fallback when Supabase is unavailable.

Before production, create separate staging identities for learner, instructor, moderator, finance operator, admin, and super-admin; run the Prompt 9 ownership and cross-role matrix; review the role-assignment procedure; add Storage bucket/object policies; and validate all protected tRPC procedures against the verified Supabase identity rather than relying on frontend guards alone.
