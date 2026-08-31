# Prompt 10 — Private Storage, RLS Matrix, and Core Persistence Report

## Scope and outcome

Prompt 10 configured private Supabase Storage, added typed server-side Storage boundaries, attached the browser Supabase session to tRPC requests, and registered selected core Supabase persistence procedures. The existing Quiet Geometry UI and route structure were preserved. Realtime, live video, payments, payouts, recording, messaging migration, notifications migration, Quran/Qaida content, and unrelated modules were not implemented.

The Storage infrastructure is active. The selected core procedures are available behind a verified Supabase bearer identity and RLS, but the existing UI pages remain on their demo repositories until real signed-in CRUD tests are completed. This prevents silent mixing of demo and production records.

## Files changed

The principal changed files are `supabase/migrations/0004_private_storage_policies.sql`, `server/supabase-storage.ts`, `server/supabase-storage.test.ts`, `server/supabase-user-client.ts`, `server/supabase-core.ts`, `server/supabase-auth.ts`, `server/_core/trpc.ts`, `server/routers.ts`, `client/src/main.tsx`, `client/src/App.tsx`, and this report. The existing Prompt 9 files `supabase/migrations/0002_auth_and_rls.sql` and `supabase/migrations/0003_conversation_membership_rls_fix.sql` remain part of the active database foundation.

## Part A — Private Supabase Storage

Four private buckets were created through the Supabase Storage admin API. All four report `public=false`.

| Bucket | Purpose | Maximum size | Allowed MIME types |
|---|---|---:|---|
| `instructor-credentials` | Verification documents and credentials | 10 MiB | PDF, JPEG, PNG |
| `instructor-media` | Protected instructor media | 25 MiB | JPEG, PNG, WebP, MP4 |
| `course-media` | Protected course and lesson media | 50 MiB | JPEG, PNG, WebP, PDF, MPEG audio, WAV audio |
| `classroom-resources` | Protected session resources | 25 MiB | JPEG, PNG, WebP, PDF, MPEG audio, WAV audio, MP4 |

The private object migration created **16 Storage object policies**, covering select, insert, update, and delete for each bucket. Storage object RLS was already enabled and remains enabled. No public read policy was created. The policy expressions use instructor ownership, course ownership/enrolment, classroom participant membership, moderator/admin boundaries, and verified role checks.

Object paths are scoped as follows:

| Bucket | Path convention |
|---|---|
| Instructor credentials | `{instructorUserId}/credentials/{sanitizedFilename}` |
| Instructor media | `{instructorUserId}/media/{sanitizedFilename}` |
| Course media | `{instructorUserId}/courses/{courseId}/{sanitizedFilename}` |
| Classroom resources | `{sessionId}/{userId}/{sanitizedFilename}` |

The server validates MIME type, integer positive size, bucket-specific maximum size, and sanitizes filename segments. Path traversal separators are removed. Signed URLs are server-issued for **60–900 seconds**, with a default of 300 seconds. Service-role storage operations occur only after server-side authorization; the service-role key is not exposed in client code. Sanitized Storage errors are returned instead of raw provider errors.

The migration did not add a `class_resources` database table because no such table exists in the canonical 39-table model. Classroom resource metadata remains a documented follow-up boundary; object paths should not be treated as a complete metadata record until that model is approved.

## Part B — Real staging identity and RLS matrix

The staging project currently contains **one Auth user, one profile, and one learner role**. No instructor, moderator, finance, admin, or super-admin staging identities were available, and no credentials were created or printed during this iteration. Therefore, identity-isolated tests were not claimed as passed.

| Test group | Status | Evidence or blocker |
|---|---|---|
| Anonymous access to private LMS tables | Passed at boundary level | Anonymous PostgREST probes returned empty result sets for profiles, courses, requirements, instructor credentials, messages, admin settings, and audit logs. Empty 200 responses do not replace identity-isolated tests. |
| Anonymous access to private Storage buckets | Not conclusive | Object-list probes returned HTTP 200 with empty results because no objects existed. A known-object denial test requires signed staging identities and test objects. |
| Learner A versus Learner B ownership | Blocked / not run | No separate learner B identity or credentials. |
| Instructor A/B ownership | Blocked / not run | No instructor identities or instructor role records. |
| Enrolment and lesson-content protection | Blocked / not run | No signed learner identities and no approved test course/enrolment data. |
| Classroom participant access | Blocked / not run | No signed participant identities or test session object. |
| Conversation membership | Passed at policy/anonymous boundary level | The real anonymous message probe passed after the security-definer recursion fix; signed member/non-member tests remain pending. |
| Moderator/finance/admin/super-admin separation | Blocked / not run | No corresponding staging identities. |
| Role self-escalation and audit immutability | Passed by policy/service-boundary coverage; real identity test blocked | Existing policy and unit coverage passed, but no signed role matrix was available. |
| Signed URL expiry and unauthorised issuance | Not run | Requires a known object and signed staging identities. |

The exact manual setup required is to create separate staging-only identities for learner A, learner B, instructor A, instructor B, moderator, finance operator, admin, and super-admin; assign roles only through a protected administrative process; create non-sensitive test course/session/conversation/object fixtures; run the full 20-case matrix; and remove staging fixtures afterward.

## Part C — Selected core persistence

The server now provides Supabase/RLS-backed procedures for the selected domains:

| Domain | Procedures or service boundary | UI cutover status |
|---|---|---|
| Profiles | Own profile read, learner/instructor profile read, own profile update | Backend ready; current UI remains demo until signed CRUD validation |
| Instructor availability | Own availability read | Backend ready; current instructor UI remains demo |
| Learner requirements | Own requirement list and create | Backend ready; current requirements UI remains demo |
| Responses and shortlists | Existing RLS model inspected; no new server CRUD procedure added in this pass | Not migrated |
| Courses | Own course list and create | Backend ready; current course builder remains demo |
| Modules and lessons | Own course module and lesson reads | Backend ready; writes remain demo |
| Enrolments | Own enrolment list | Backend read boundary ready; UI remains demo |
| Lesson progress | Own progress list and status/progress upsert | Backend ready; UI remains demo |

The procedures validate inputs with zod, use the verified Supabase bearer token, use the publishable-key client with RLS, and return sanitized persistence/unavailable errors. The tRPC transport now forwards the active browser Supabase session token without exposing service-role credentials. No ordinary request uses the service-role key to bypass RLS.

No UI route currently calls the new `supabaseCore` or `storage` procedures. This is intentional pending signed identity CRUD testing; the application continues to show its explicit demo/localStorage mode and does not silently combine records.

## Validation

The final local validation passed **TypeScript, all 75 Vitest tests, and the production build**. The focused Storage/Auth/RLS suite passed 34 tests. Client-bundle scanning found no `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_DB_URL` identifiers in `dist/public`. Route smoke screenshots for `/`, `/courses`, `/teachers`, and `/login` completed successfully at 1280×720; the existing Quiet Geometry layout remained intact. The login notice was updated to describe the current Auth/profile/RLS foundation accurately.

The production build emitted the existing non-blocking Vite warning that some client chunks exceed 500 kB after minification. No new runtime failure was observed in the route smoke pass.

## Remaining demo/localStorage domains and integrations

Messaging, notifications, trials/bookings, billing, withdrawals, classroom presence, recordings, and other operational workflows remain demo or setup-needed. Realtime, email delivery, live classroom provider, recording storage/consent, payments, payouts, and production notification delivery remain unconfigured. Classroom resource metadata requires an approved data model. Public thumbnails remain separate from protected course files; no public protected-file URL was introduced.

Before production, run the full signed identity matrix, create and test known private objects, add a reviewed resource metadata model if required, connect UI pages to the selected procedures one domain at a time, and verify that no demo and production records are mixed. Do not treat the current anonymous 200/empty responses as proof of complete production authorization.
