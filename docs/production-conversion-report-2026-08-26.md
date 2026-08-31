# Noor Ilm LMS — Production Conversion Report

**Date:** 26 August 2026  
**Scope:** Conversion of demo/localStorage production-flow boundaries to authenticated Supabase procedures and explicit provider-gated states.  
**Evidence standard:** A source artifact is not treated as a live production feature unless its route, server procedure, ownership boundary, and relevant validation agree. No secret values are included in this report.

## Executive decision

Noor Ilm is a deployable LMS foundation with a live public site, Supabase-oriented authentication and persistence contracts, protected Storage boundaries, scheduling procedures, AI Tutor safety boundaries, and a catalog-verified Hifz tracker schema and learner UI. It is **not yet production-ready as a complete paid tutor marketplace or live classroom system**. The remaining blockers are real staging identity-matrix verification, approved live classroom/Realtime/email/push/payment/payout providers, broader private Storage exercises, complete private-route localization, and replacement of remaining admin/relationship/demo repositories with connected procedures.

The latest verified validation is **143 passing Vitest tests**, clean TypeScript, a successful production build, successful representative desktop/mobile route captures, and a clean secret-hygiene scan over source/configuration directories. The build still reports one non-blocking large JavaScript chunk warning. The current deployed domain is `noorilm-lms-yffh7nw8.manus.space`.

## Current conversion status

| Area | Current evidence | Status | Remaining gate |
|---|---|---|---|
| Supabase Auth | Browser client session restoration/token refresh; server bearer identity boundary; signup, login, logout, reset, verification handling; explicit fixture-only fallback | Implemented boundary; needs signed staging tests | Exercise real learner, instructor, admin identities and email lifecycle |
| Profiles and onboarding | Protected profile and instructor-profile upserts; onboarding return state uses URL; fixture draft storage is gated to explicit development fixture mode | Partial connected | Persist and verify every approved profile/preference field; test cross-user reads/writes |
| Requirements | Protected learner-owned listing/create procedure; protected learner response listing; instructor response submission gated by instructor profile and published requirement; trial context uses URL handoff; demo publish/save path removed | Partial connected | Connect response status/moderation workflow and signed learner/instructor matrix |
| Courses | Protected instructor course listing/create contracts; learner enrollment/progress procedures; course repository no longer uses browser localStorage; private learner shelves fail closed | Partial connected | Connect full builder/module/lesson/media/moderation UI to procedures and verify published-only reads |
| Scheduling | Availability, slots, trial lifecycle, booking/session/notification boundaries, conflict/idempotency controls and fail-closed private UI | Implemented boundary; needs signed tests | Staging race tests, provider notifications and calendar integration |
| Private Storage | Permission, authenticated upload, signed download, owner-scoped credential metadata create/list/delete, cleanup on metadata failure; four private bucket contracts | Partial connected | Exercise credentials, instructor media, course media and classroom resources with separate identities; verify delete cleanup and denial |
| Hifz | Additive migration `0009_hifz_tracker.sql` applied through the verified server-side PostgreSQL path; `hifz_plans` and `hifz_reviews`, five indexes, four policies, RLS, constraints, and relationships catalog-verified; protected procedures and learner route mounted/localized | Implemented boundary and verified staging schema | Run signed learner identity/RLS CRUD checks and complete production data-lifecycle review |
| Classroom | Protected participant-bound routes, waiting room, Quran/Qaida, White Board, resources and attendance boundaries | Setup-needed | Approved video and Realtime provider, consent, retention, recording/archive policy |
| Messaging and notifications | Tables/contracts and explicit setup states exist; disconnected admin delivery actions are disabled | Partial/demo boundary | RLS-backed conversation/message procedures, Realtime, email/push provider and locale templates |
| Reviews/reports/moderation | Eligibility and privacy rules, routes and contracts exist; disconnected moderation actions are disabled | Partial boundary | Real completed-session eligibility, reports, moderation persistence and audit verification |
| Billing/earnings/payouts | Currency/fee/ledger models and UI boundaries; payment, withdrawal and notification actions are provider-gated/disabled | Setup-needed | Commercial decision, payment provider, webhooks, reconciliation and payout provider |
| Administration | Role guards, least-privilege matrix, protected route shell, privacy-minimal detail states and disabled disconnected mutations | Partial/demo boundary | Real admin identities, connected queries, audited writes and role-matrix tests |
| AI Tutor | Server-only provider boundary, language-learning safety policy, protected conversation/progress/saved-item procedures and localized controls | Implemented boundary; provider testing pending | Approved provider, usage limits, cost controls, signed privacy and safety tests |
| Localization/RTL | Typed English–Urdu–Arabic catalogue, locale persistence, document direction, public launch/requirements/AI Tutor/Hifz coverage; protected AI Tutor conversation, progress, instructor, and admin boundary labels now localized | Partial | Migrate remaining private dashboard, classroom, messaging, admin, billing and builder strings; native review |

## Demo and localStorage conversion evidence

The following production-flow changes are verified in the current source:

- Auth fixture identity and onboarding draft storage are available only under the explicit development fixture flag; Supabase is fail-closed when unavailable.
- Trial context is transferred through validated internal URL parameters rather than localStorage.
- Instructor profile, requirements, course listing, enrollment, lesson progress, Hifz, credential metadata, and credential Storage operations use protected tRPC/Supabase boundaries where implemented. InstructorSettings now persists full name, display name, preferred language, and interface locale through the protected profile update procedure; verification and notification settings remain explicitly provider-gated. Public instructor profiles now read only published, approved fields through the public instructor-by-slug procedure and show honest not-public/loading states. The public course listing route and CoursesPage now use the publishable-key-only Supabase client, select an explicit public-field allowlist, filter to published status, and show explicit loading/error/empty states without demo-course fallback. CourseDetail now uses the public published-course-by-slug query and shows an honest not-public state rather than substituting a demo course. TeachersPage now uses a publishable-key public query filtered to published and approved instructor profiles, with no demo-record fallback.
- `client/src/lib/course-management-data.ts` no longer reads or writes browser localStorage for private enrollment or lesson-progress state. Its in-memory records remain deterministic test/demo fixtures and are not used by the converted private routes.
- The real Supabase auth hook no longer writes browser auth state to localStorage; the only remaining application localStorage usage is the non-sensitive `DashboardLayout` sidebar-width preference.
- The shared protected dashboard subpage now uses typed English, Urdu, and Arabic labels for its navigation, setup notice, empty states, timezone guidance, and privacy copy. The newly connected public CoursesPage, CourseDetail, and TeachersPage loading, error, approval, and not-public states are also typed across English, Urdu, and Arabic.
- Provider-gate and Storage ownership-contract tests cover server-only AI Tutor configuration, disabled finance/notification actions, authenticated-only Storage policies, identity-prefixed paths, signed-download/delete helper boundaries, and role/relationship access checks.
- Instructor credential removal is owner-scoped in metadata and followed by removal of the matching private Storage object.
- Disconnected admin settings, support, notification retry, payout, review moderation, earnings, wallet, and withdrawal actions are disabled or explicitly setup-needed; they cannot claim a real state transition.
- The latest requirements-flow hardening removes local fake moderation, shortlist, and instructor-selection success paths; protected response submission, response comparison, response-status transitions, and learner goal editing now use Supabase procedures with ownership/status gates and honest translated error states. The public requirements marketplace now uses an anonymous publishable-key query filtered to published rows and an explicit public field allowlist, with no demo-record fallback.
- Requirements dashboard listing uses the protected learner-owned procedure, while the public marketplace and instructor matching surfaces remain explicitly demo-limited and do not expose matching decisions as persisted results.
- Requirement responses now have protected server procedures: learners can list responses only after ownership of the requirement is verified, instructors can submit only with an instructor profile and a published requirement, and instructors can update only their own response status across the canonical pending, shortlisted, accepted, rejected, and withdrawn states. The protected instructor response form now calls the submission procedure and shows translated success/error states without fake success. The protected learner response-comparison route now reads learner-owned responses from Supabase and shows loading, error, empty, and no-fake-response states. The database RLS policies remain the final least-privilege enforcement layer.
- The instructor requirements desk now reads only published requirements through an authenticated Supabase query, with translated loading, error, empty, connected-requirement, and published states. Its matching recommendation records remain clearly demo-only until protected matching decisions are available.
- The shared classroom setup notice, provider-boundary labels, and default classroom shell eyebrow/back navigation now use typed English, Urdu, and Arabic translations; live video, Realtime, attendance, recordings, and private classroom resources remain setup-needed. Classroom source regression coverage now protects these translation and honest-state contracts.
- Protected AI Tutor conversation empty states, input labels, send/thinking states, progress metrics, instructor aggregate boundary, and admin moderation boundary now use typed English, Urdu, and Arabic keys. The provider remains server-only and fail-closed.
- AI Tutor preference forms now localize supported level, correction, difficulty, learning-goal, and practice-mode option labels across English, Urdu, and Arabic, while preserving canonical enum values for persistence and server validation. The full suite now includes a dedicated option-label regression test.
- The additive Hifz migration was applied only through the verified server-side PostgreSQL connection after a redacted target check and catalog preflight. No Auth, Storage, Realtime, or UI schema-changing operations were performed by the migration runner. A read-only live catalog regression test now verifies both Hifz tables, RLS, four policies, three named indexes, and all three foreign-key relationships without mutating data.

## Security and RLS status

The application contains Supabase migrations and policy contracts for deny-by-default ownership, role-scoped administration, private Storage objects, conversations, scheduling records, Hifz records, and AI Tutor records. The server uses bearer-derived Supabase identity for Supabase-only procedures. Credential object paths are constrained to the authenticated instructor prefix, and signed downloads are time-limited.

What is **not** yet proven is the complete signed identity matrix against the intended staging project: learner A versus learner B, instructor A versus instructor B, learner versus instructor, moderator versus finance/admin roles, and anonymous access to private data. A migration artifact or source-level policy test is not a substitute for those live checks.

## Environment contract

Only variable names and presence/readiness booleans may be surfaced to diagnostics. Required names include `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_DB_URL` for the approved server-side PostgreSQL path. Provider-specific contracts are documented as setup-needed and must be added through secure environment settings; values must never be committed, logged, or rendered in the browser.

The current non-secret readiness summary reports Supabase Auth, database, private Storage, and Realtime environment contracts as present. AI Tutor, classroom/video, notifications, payments, and payouts remain unconfigured, so their UI and server boundaries must remain fail-closed. This summary confirms environment presence only; it does not prove live provider authorization, signed identity behavior, webhook delivery, or database migration state.

## Validation evidence

- **Vitest:** 32 test files, 143 tests passing. Coverage includes provider-gate, private Storage ownership-contract, multilingual messaging, protected AI Tutor route and option-label localization, live Hifz PostgreSQL catalog verification, protected requirement-response ownership/role/status/UI boundaries, owner-scoped requirement editing, auth localStorage, private requirement-edit, classroom multilingual-boundary, locale-module Fast Refresh, and provider-readiness secret-hygiene regression coverage.
- **TypeScript:** `pnpm exec tsc --noEmit` passes.
- **Development runtime:** locale hook state now lives in `client/src/contexts/LocaleContextState.ts`; the React provider module no longer exports non-component diagnostics or hook symbols. Regression coverage protects this boundary, and the latest HMR log shows no new Fast Refresh invalidation warning.
- **Production build:** `pnpm build` passes.
- **Responsive evidence:** representative public and protected AI Tutor route shells were captured at 1280×720 and 390×844, including an RTL-ready public presentation. Protected AI Tutor routes correctly landed on the login guard while signed out. This complements, but does not replace, full accessibility certification.
- **Bundle output:** conservative vendor chunking now emits separate React (~36.7 kB), data (~91.6 kB), and UI (~58.5 kB) chunks; the main chunk decreased from about 1.90 MB to about 1.71 MB. Vite still reports a large main chunk above 500 kB, so route-level code splitting remains a performance follow-up rather than a completed optimization.
- **Runtime logs:** the latest development/browser/network inspection showed successful HMR, no current browser-console errors, and successful route/analytics requests. Retained historical logs may contain earlier warnings and should not be treated as active failures without fresh reproduction.

## Production gate order

1. Confirm the intended staging Supabase project and retain the redacted target/catalog evidence for release records. The canonical 0001 schema was already present and the additive Hifz 0009 schema is now applied and catalog-verified through the approved PostgreSQL path; the managed MySQL/Drizzle channel was not used.
2. Create isolated staging identities for learner, instructor, moderator, finance/admin and super-admin roles; verify Auth lifecycle, RLS, Storage, scheduling and audit boundaries.
3. Connect and test approved classroom/video, Realtime, email/push, payment and payout providers with webhook signatures, idempotency, retention and consent controls.
4. Complete connected public discovery and private dashboard UI cutovers, then finish English/Urdu/Arabic native-speaker review and full RTL route verification.
5. Run production smoke tests, bundle/privacy/log scans, accessibility certification, backup/restore rehearsal, monitoring and incident-response checks.

## Readiness summary

The site is suitable for **controlled review, design validation, and staged integration testing**. It should not yet be marketed as a live paid tutor marketplace, a provider-backed live classroom, or a fully connected multilingual production LMS. The current design intentionally favors a visible setup-needed state over fabricated records or success messages.


## Latest verification update

The public RequirementDetail route now reads a single published requirement through `schedulingPublic.publishedRequirementById` using the anonymous publishable-key client and an explicit public-field allowlist. It no longer substitutes a demo requirement when the requested row is absent or not public. Loading, error, not-public, and no-public-responses states are translated across English, Urdu, and Arabic, and the public-requirements regression suite now asserts the Supabase query wiring and absence of the former demo fallback.

Validation after this slice is **32 Vitest files and 143 tests passing**, clean TypeScript, and a successful production build. The existing non-blocking Vite large-chunk warning remains. The next safe production conversion work is not a small public-page patch: remaining learner/instructor course-builder and private workspace surfaces still require broader procedure wiring, full lesson/module/media access verification, and signed staging identities before they can be claimed as complete. No new migration, Auth, Storage, Realtime, payment, notification, or provider configuration was applied in this slice.


The protected learner and instructor dashboard shells were hardened to use the real `useAuth` hook for identity and logout instead of the demo-auth context. Their dashboard data remains intentionally empty and fail-closed, so this change does not invent enrolments, bookings, students, or financial activity. A focused regression test verifies the real-auth imports, absence of `useDemoAuth`, and typed setup-needed messaging. Focused dashboard validation passes 3 tests and TypeScript remains clean.


The protected dashboard overview now derives identity and logout from the real Supabase-backed `useAuth` hook. For authenticated learner sessions, active-enrolment and published-requirement counts are read from the existing protected procedures; unavailable responses render an em dash and awaiting-connected-data detail instead of a fabricated zero. Unsupported saved-tutor, booking, student, and finance metrics remain fail-closed. Focused dashboard regression coverage now verifies both the auth replacement and procedure wiring.

## 2026-08-27 Course Workspace and Instructor Builder Cutover

The mounted learner and instructor course surfaces were cut over from demo/localStorage paths to authenticated Supabase contracts without migrations, role changes, Auth changes, RLS changes, Storage bucket changes, or provider activation.

Learner routes now using the authenticated `learnerWorkspace` aggregate are `/dashboard/learner/courses`, `/dashboard/learner/courses/:courseId`, and `/dashboard/learner/lessons/:lessonId`. The workspace reads only learner-owned enrolments, accessible course/module/lesson rows, and learner-owned progress. Lesson progress writes use the existing authenticated `updateProgress` procedure. Unenrolled, unpublished, unauthenticated, unavailable, and persistence-error states are fail-closed; no demo records are displayed.

Instructor routes now using protected Supabase procedures are `/dashboard/instructor/courses`, `/dashboard/instructor/courses/new`, `/dashboard/instructor/courses/:courseId/edit`, `/dashboard/instructor/courses/:courseId/modules`, and `/dashboard/instructor/courses/:courseId/lessons`. Course list/create/update/submit actions use `courses`, `createCourse`, `updateCourse`, and `submitCourseForReview`. Structure reads use the owner-scoped `structure` aggregate over `courses`, `course_modules`, and `lessons`; module and lesson metadata create/delete actions use protected procedures with existing RLS ownership policies. Course publishing remains review-gated; published-course direct editing is rejected server-side.

Lesson media is metadata-only in this slice. `media_path` is persisted only through authorized server procedures; actual private upload and signed delivery remain Storage/provider-gated. No public URL, upload success, classroom, payment, or provider success is fabricated.

Focused course-management regression coverage passes 12 tests. Full validation passes 32 test files and 147 tests, strict TypeScript passes, and the production build passes with the existing non-blocking large-chunk warning. Desktop route screenshots were captured for the learner course shelf and instructor course list/builder. Real cross-user and cross-role identity exercises remain blocked until the project owner manually creates isolated staging users; no identities or fixtures were created in this slice.

Known remaining demo-backed mounted course surfaces include instructor preview/submission legacy presentation and the enrolment page's legacy public course lookup; these were not silently claimed as part of the authenticated workspace/builder cutover and remain candidates for a subsequent bounded slice.

The mounted `/enrol/:courseId` route now reads only a published course by ID through the anonymous Supabase client and creates enrolments only through the authenticated learner `createEnrolment` procedure. Unpublished, unavailable, unauthenticated, payment-required, and persistence-error states remain explicit; no demo course lookup or paid-success claim is used on this route.

After this final course slice, focused course and credential coverage passes 19 tests and the full suite passes **32 test files and 148 tests**, with clean TypeScript and a successful production build. The non-blocking large-chunk warning remains. The report’s earlier 143-test historical entries are retained as historical evidence; the latest count is 148.

The instructor `/dashboard/instructor/courses/:courseId/submit` route is now protected by the authenticated course-list query and `submitCourseForReview` mutation. It resolves only the signed-in instructor’s course, permits submission only for draft/rejected states, and reports the moderation boundary without claiming direct publication or reviewer success. The prior mounted demo submission action was removed from this route.

Latest validation after this extension: focused course/credentials tests pass 20 tests; full Vitest passes **32 test files and 149 tests**; strict TypeScript passes; production build passes. The existing non-blocking large-chunk warning remains. Real cross-user identity verification is still blocked pending owner-created staging users.

The mounted instructor `/dashboard/instructor/courses/:courseId/preview` route now reads the authenticated instructor’s course and owner-scoped module/lesson structure through Supabase. Unauthenticated, not-owned, unavailable, and empty-structure states are explicit; the route no longer substitutes a demo course for the protected instructor preview.

Latest validation after this extension: focused course-management coverage passes 15 tests; full Vitest passes **32 test files and 150 tests**; strict TypeScript passes; production build passes. The existing non-blocking large-chunk warning remains. Real cross-user identity and provider tests remain blocked pending owner-created staging identities and approved provider credentials.

## Hifz Tracker and Quran Learning Progress Slice — 2026-08-27

The Hifz slice is now implemented against the verified PostgreSQL Supabase project without creating staging users or fixtures. The additive migration `0010_hifz_progress_and_reviews.sql` was applied previously and the reviewed `0011_hifz_review_assignment_policies.sql` was applied through the server-side `SUPABASE_DB_URL` path. No table drops, data deletes, Auth changes, Storage changes, or provider integrations were performed.

The persisted model covers `hifz_plans`, `hifz_records`, `hifz_reviews`, and `hifz_reminders`. Learner-owned plan creation and update, daily record creation/update, review submission, progress aggregation, and idempotent reminder scheduling are exposed through protected Supabase procedures. Assigned instructors can read only records assigned to their identity and can review a submitted record only through the linked `record_id` and `instructor_id` ownership conditions. Review writes set `reviewed_by` and advance the linked record status. The client does not fabricate Quran text, translations, Tafsir, Tajweed rulings, audio, grades, or successful reminders.

Mounted routes include `/dashboard/learner/hifz`, `/dashboard/learner/hifz/new`, `/dashboard/learner/hifz/:planId`, `/dashboard/learner/hifz/progress`, `/dashboard/learner/reminders`, `/dashboard/instructor/hifz`, `/dashboard/instructor/hifz/:learnerId`, and `/dashboard/instructor/hifz/reviews`. The UI uses typed English, Urdu, and Arabic catalogue keys for record fields, progress, reminders, instructor desk, statuses, and the approved-content setup-needed boundary. RTL remains delegated to the existing locale context.

Focused Hifz validation passed 5 tests, including applied PostgreSQL table/RLS/index/foreign-key catalog checks. Full validation passed 33 test files and 154 tests, strict TypeScript passed, and the production build passed with the existing non-blocking large-chunk warning. A clean server restart completed successfully. Protected Hifz route captures correctly fail closed to the current authentication gate when no signed staging session is present. Real cross-user/cross-role Auth, RLS, and private Storage tests remain blocked until the project owner manually creates isolated staging identities; approved Quran content, notification delivery, Realtime, live classroom, payment, and payout providers remain setup-needed.

## Public Course Demo-Fallback Removal — 2026-08-27

The active `/courses/:slug` route no longer branches through the legacy in-memory `getManagedCourseBySlug` lookup. It now always uses the existing Supabase-backed published-course detail component, preserving published-only public fields and its honest loading, error, and not-public states. The active `/courses/:slug/preview/:lessonId` route now fails closed with a setup-needed state because a public Supabase lesson-metadata procedure is not available; it no longer reads demo course or lesson records, transcript text, media, or Quran content.

Focused course-management regression coverage now includes the route-level no-demo assertions. The full suite passes 33 test files and 156 tests; strict TypeScript and production build pass. The build retains the known non-blocking large-main-chunk warning. Private lesson media remains signed-URL/provider gated and no public media URL or fake preview success is claimed.

## Active Route Boundary Localization — 2026-08-27

The bounded localization pass now covers active instructor profile, credentials, availability, course builder/submission, learner course workspace, scheduling trial handoffs, relationship conversation list/detail, reports, review list/form/public rendering, session ledger, withdrawal/payout, AI Tutor fallback/setup, and the protected administration surfaces for overview, users, details, reports, reviews, settings, support, notifications, analytics, billing, and operations. These states use typed English, Urdu, and Arabic catalogue keys and inherit the existing RTL/LTR locale context. No persistence procedure, RLS policy, Storage bucket, provider integration, currency rule, review-content source, or authorization boundary was changed.

Validation after the latest slices remains 33 Vitest files and 156 tests passed, strict TypeScript passed, and the production build passed. The known non-blocking large-main-chunk warning remains. The remaining unchecked readiness gates are intentionally not claimed complete: broader demo/localStorage repository replacement where mounted or still referenced, signed multi-identity Auth/RLS/Storage matrix testing, live payment/payout/classroom/notification/Realtime/provider harnesses, site-wide catalogue completeness beyond the covered boundary states, and human native-language/accessibility certification.

## Browser Supabase Auth cutover — 27 August 2026

The browser shell now mounts `SupabaseAuthProvider`; active protected components use the real Supabase-backed `useAuth` context rather than the template/demo auth hook. The provider restores sessions with `getSession`, tracks sign-in/out changes through `onAuthStateChange`, supports email/password signup and login, logout, password reset, password update, and handles email-verification-required sign-in responses. The browser client uses only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` with session persistence, token refresh, and URL-session detection enabled.

Protected learner/instructor routes, admin routes, and settings routes fail closed until session restoration and server-owned profile/role bootstrap complete. Admin access requires an admin-capable `user_roles` record; browser role metadata is not trusted. Onboarding completion is persisted through the protected profile procedure using `onboarding_completed`. Internal `returnTo` values are encoded and validated before navigation. The active client source contains no `useDemoAuth`, `DemoAuthProvider`, or demo auth session-key references in production route code.

Validation evidence for this slice: `pnpm check` passed; Vitest passed with 34 test files and 160 tests; strict TypeScript passed; the production build passed; the client/build scan found no `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, or `service_role` secret markers; the development server restarted healthy; unauthenticated `/dashboard/learner` and `/admin` smoke checks redirected to encoded internal login return paths without exposing protected content.

This does not constitute signed-user production certification. Isolated learner, instructor, moderator, finance/admin, and super-admin staging identities are still required for real Auth lifecycle, cross-user/cross-role RLS, private Storage, scheduling race, protected CRUD, and role-matrix checks. Live payment, payout, classroom, Realtime, email/push, and AI provider harnesses remain setup-needed. The residual bundle warning remains because the main client chunk is approximately 985 kB after route-level splitting.

## 2026-08-27 continuation: instructor profile and training boundaries

The active instructor profile editor now starts from an honest empty state and hydrates through the protected Supabase core profile bootstrap. The protected instructor preview likewise reads authenticated Supabase profile data and renders an honest loading/unavailable boundary; private credentials, verification decisions, storage paths, and provider-dependent fields remain excluded. The public instructor profile route uses existing English–Urdu–Arabic catalogue keys for loading, unavailable, public-field, trial, back, and messaging setup-needed copy.

The active instructor training route no longer renders fabricated fixture modules or client-side completion progress. It now presents a localized setup-needed boundary until approved training content and completion persistence are connected. The existing online-test route remains intact and explicitly unavailable without an approved test engine.

Focused instructor/public-profile coverage and the full suite pass after these changes; strict TypeScript, project checks, and the production build pass. Remaining aggregate gates are unchanged: cross-domain demo cleanup, complete persistence across all modules, signed private-Storage identity verification, complete site-wide linguistic certification, and real signed-user/provider security testing.


## Hifz Tracker continuation evidence — 28 August 2026

This bounded slice addressed presentation-contract drift in the active learner Hifz Tracker. The shared Hifz frame now uses the typed `dashboard.back` catalogue key instead of hardcoded English navigation copy. Learner record section labels (`sabaq`, `sabqi`, and `manzil`) and record status labels (`planned`, `practiced`, `needs_revision`, `paused`, and `submitted_for_review`) now resolve through the English–Urdu–Arabic Hifz catalogue keys. Supabase procedures, learner ownership checks, instructor review controls, RLS policies, migration state, and stored Quran references were not changed.

A focused source-boundary test was added at `server/hifz-i18n-boundary.test.ts`. It verifies the shared frame translation call, the learner section/status mappings, and the presence of each required key in all three locale catalogues. The test is deliberately source-level because signed learner/instructor identities are not available for this run; live cross-user and cross-role RLS/Storage verification remains setup-needed.

The Hifz reminders surface remains intentionally setup-needed for provider-backed scheduling and delivery. No Quran text, audio, tafsir, recording, or other fabricated production content was introduced. This slice therefore improves multilingual/RTL readiness while preserving the existing fail-closed data and provider boundaries.


Validation for this continuation passed the focused Hifz suite (3 tests), the full Vitest suite (35 test files, 170 tests), strict TypeScript (`pnpm check`), and the production build. The source/privacy scan found no Hifz component browser-storage access, secret values, fake Quran data, or fixture writes; the only scan matches were intentionally documented boundary words and environment-variable names. Changed paths are limited to `client/src/components/HifzTrackerExperience.tsx`, this report, the focused test file, and `todo.md`.


## Islamic Language Learning AI Tutor implementation — 29 August 2026

The AI Tutor send path now uses a server-only optional Gemini adapter at `server/ai-tutor-provider.ts`. It reads `GEMINI_API_KEY` only on the server, accepts a configurable `GEMINI_MODEL`, uses the `x-goog-api-key` request header rather than placing the key in the endpoint or payload, bounds prompts/history/output, applies a 15-second timeout, retries transient failures once, and returns safe unavailable/failed states. No Gemini key or model was present in the current environment, so no real provider call was made and real provider-backed answers remain setup-needed. The existing built-in platform LLM helper was not called by this AI Tutor path.

The existing protected Supabase conversation, message, preferences, progress, saved-item, report, and delete-history procedures remain in use. The send path preserves learner ownership checks and finite learner-turn limits, and stores only non-secret provider metadata. Course grounding now validates the selected course, module, and lesson server-side as published before message persistence, retrieves only an allowlisted course title, lesson title, description/transcript excerpt, and excludes media paths, credentials, assessments, answer keys, and private notes. Course text is explicitly treated as untrusted reference material so embedded instructions cannot override the tutor policy. The learner-selected general context remains bounded and is not treated as approved course content.

Focused AI Tutor coverage now includes 19 tests across provider, grounding, safety, and existing AI Tutor suites. Full validation passed 37 Vitest files and 177 tests, strict TypeScript, `pnpm check`, and the production build. The client secret scan found no Gemini key, Google API header, Gemini endpoint, Supabase service-role key, or database URL in client source. The AI Tutor source contains no localStorage/sessionStorage persistence and no private credential, payment, or answer-key fields in the grounding allowlist. The build retains the known non-blocking large-main-chunk warning.

The implementation is production-oriented but not complete provider certification. Real English, Urdu, and Arabic Gemini smoke tests are setup-needed because `GEMINI_API_KEY` and `GEMINI_MODEL` are absent. Signed learner ownership/RLS tests, provider abuse/failure tests, native-language review, and course-content grounding verification with real published records remain required. No currency, payments, classroom, scheduling, Hifz, Auth, RLS policy, Storage bucket, migration, or unrelated module was changed in this slice.


## Gemini secure configuration and smoke follow-up — 29 August 2026

The platform secure environment input accepted `GEMINI_API_KEY` and `GEMINI_MODEL`; presence checks reported both values present, without exposing either value. The configured non-secret model identifier is `gemini-2.5-flash`. The lightweight model metadata endpoint passed with HTTP 200, confirming the server can reach Gemini metadata and the configured model is listed with `generateContent` capability.

The minimal real generation smoke was then run in English, Urdu, and Arabic using safe language-learning prompts only. All three attempts returned the safe adapter status `failed` rather than generated content, with observed latencies of approximately 345 ms (English), 247 ms (Urdu), and 86 ms (Arabic). A non-secret endpoint probe recorded HTTP 404 / provider status `NOT_FOUND` for `generateContent`; the official v1 and v1beta generation paths both returned 404, and the Interactions endpoint returned 404. An Authorization-header probe returned 401 while the documented `x-goog-api-key` header returned 404. No response body, API key, or generated content was logged.

Conclusion: provider metadata is reachable and the model identifier is recognized, but generation is not currently available through the configured endpoint/key combination. Real English/Urdu/Arabic provider answers remain **setup-needed/provider-blocked**. The smoke test is now opt-in through `RUN_GEMINI_SMOKE=true` so routine validation does not make external provider calls; the failed real smoke evidence remains recorded here. The likely next action is for the owner to verify that the secure value is a Google Gemini API key authorized for text generation and that `gemini-2.5-flash` is enabled for the associated project, then rotate/update the server-only values through secure project settings if needed. No key values were printed or persisted.


## Gemini model availability verification — 29 August 2026

The configured server-only key was used for a read-only `v1beta/models` query. The response returned HTTP 200 and 39 models advertising `generateContent`; the non-secret list included `gemini-3.7-flash` and `gemini-2.5-flash`. No key, request header, full secret URL, or response body was logged. `gemini-3.7-flash` was therefore selected explicitly from the accessible model list and the server-only `GEMINI_MODEL` secret was updated from `gemini-2.5-flash` to `gemini-3.7-flash`. `GEMINI_API_KEY` was not changed and no VITE-prefixed Gemini secret was created.

After server reload, the minimal real language-learning smoke ran in English, Urdu, and Arabic. All three calls returned the adapter’s safe `failed` result: English approximately 402 ms, Urdu 291 ms, and Arabic 111 ms. A separate redacted generation-status probe for `gemini-3.7-flash` returned HTTP 403. No response body, generated text, API key, or request header was recorded. The model remains **provider-blocked/setup-needed** for generation despite being listed as supporting `generateContent`; the owner must verify the key’s generation permission/project entitlement and enablement for this model through the provider settings. No unrelated module, database, RLS, Storage, Auth, currency, payment, classroom, scheduling, or Hifz artifact was changed.


## Gemini HTTP 403 permission diagnosis — 29 August 2026

A redacted permission diagnostic against the configured server-only `GEMINI_MODEL=gemini-3.7-flash` returned HTTP 403 with the allowlisted category `PERMISSION_DENIED`. The same key successfully queried model metadata with HTTP 200; the model list exposed 39 identifiers with `generateContent`, including `gemini-3.7-flash`. This distinguishes model-list visibility from authorization to generate content. No API key, request header, secret-bearing URL, response body, generated content, or private data was printed or persisted.

The adapter request shape remains correct for the documented GenerateContent API: exact `v1beta/models/{model}:generateContent` path, `x-goog-api-key` authentication, `contents`, `systemInstruction`, bounded `generationConfig`, and no bearer token. The bearer diagnostic returned HTTP 401, so no bearer token is used. Google’s troubleshooting guidance treats 403 as a client/permission problem rather than a transient error and recommends checking key status, API version, model, and project configuration.

The provider remains **setup-needed/provider-blocked**. The owner-side correction is to inspect the Google Cloud project associated with this key and verify that the Generative Language API/Gemini API is enabled in that same project; the key’s API restriction includes the Generative Language API; any application restriction is compatible with server-side execution (do not use browser HTTP-referrer restriction for this server call, or configure the actual server egress IP if IP restriction is required); the key is not blocked or leaked in Google AI Studio; any authorization-key service-account binding and organization policy permit Gemini API use; and billing, quota, region, and model terms/availability are active for `gemini-3.7-flash`. No model was silently substituted and no application, Auth, RLS, Storage, Hifz, scheduling, currency, payment, or unrelated module was modified. The multilingual generation smoke should be rerun only after the owner corrects the Google/project setting, using the existing opt-in smoke test and redacted output.
