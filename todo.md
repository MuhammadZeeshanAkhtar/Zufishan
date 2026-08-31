# Noor Ilm LMS Prompt 8 continuation checklist

- [x] Read and extract the requirements from the latest `pasted_content_8.txt`.
- [x] Compare Prompt 8 against the current Prompt 7 checkpoint.
- [x] Implement trial request flow, instructor accept/reject/propose-time workflow, learner/instructor schedules and bookings, class sessions, notifications/email-ready boundaries, classroom waiting-room states, cancellation/reporting safety, and Prompt 8 routes without regressing existing foundations. Added routed responsive demo flows and protected role surfaces.
- [x] Add typed trial request, class session, notification, status, time validation, email boundary, classroom-provider boundary, schedule, and demo-state models.
- [x] Add focused Vitest coverage for time validation, request action safety, classroom provider state, and email delivery honesty.
- [x] Run TypeScript, production build, and Vitest checks. TypeScript and production build pass; 18 Vitest tests pass.
- [x] Capture representative mobile screenshots for trial request, trial success, learner schedule, instructor trial requests, notifications, and classroom waiting room. Protected routes correctly render the login guard while signed out.
- [x] Resolve validation gaps before checkpointing.
- [x] Review this checklist, save a fresh Prompt 8 checkpoint, and deliver the final handoff report.
- [x] Add required reject/cancel reasons, confirmation controls, cancellation/report/help actions, and safe no-show/post-session workflow. Actions require a reason and confirmation; status mutation remains an explicit backend boundary.
- [x] Wire trial-request entry points from public instructor profiles, course detail pages, and learner response comparison surfaces. Existing shared `TrialCTA` surfaces preserve context and route to login/trial preparation.
- [x] Add richer learner/instructor response management with status labels, accept/reject/propose actions, confirmation safety, and honest demo action states.
- [x] Clear the demo session and verify signed-out Prompt 8 protected routes redirect to `/login`. Learner schedule and instructor trial-request navigation both landed on `/login`.
- [x] Re-run validation, review todo, save a fresh Prompt 8 checkpoint, and deliver the final handoff report.
- [x] Make the shared TrialCTA persist selected course/instructor/requirement context and navigate into `/trial/request` for signed-in learners, with a safe post-login return target for signed-out users. Trial form reads and clears the preserved context.
- [x] Re-run validation, verify the handoff, review todo, save a fresh Prompt 8 checkpoint, and deliver the handoff report.
- [x] Implement and verify post-login continuation so `/login?returnTo=/trial/request` returns the learner to the trial request flow after demo sign-in/onboarding. Existing demo login honors the return target; onboarding remains the intentional path for newly created accounts.
- [x] Restore instructor selection context in `TrialRequestFlow` and replace the public instructor profile placeholder with the shared `TrialCTA`. Slug and optional instructor ID are preserved from response/profile entry points.
- [x] Re-run validation, review todo, save the final Prompt 8 checkpoint, and deliver the handoff report.

# Prompt 9 course management and learner progress

- [x] Preserve and audit Prompts 1–8 while mapping existing course, role, dashboard, auth, storage, and routing architecture.
- [x] Add reusable typed course, module, lesson, moderation, enrolment, lesson-progress, assignment/quiz, and certificate boundaries.
- [x] Build instructor course routes, multi-step builder, draft/review statuses, module and lesson management, preview, and submission states.
- [x] Add safe course media upload boundaries for thumbnails and protected lesson content without claiming unavailable uploads.
- [x] Improve public course detail pages with published-only modules, preview lessons, enrolment, and trial actions.
- [x] Build learner enrolment, course workspace, lesson player placeholder, progress tracking, assignments/quizzes, and certificate status surfaces.
- [x] Document Supabase models/migrations, indexes, constraints, RLS, private media access, and mobile-ready service contracts.
- [x] Add focused Vitest coverage for course ownership, moderation, enrolment, progress, access control, and demo limitations.
- [x] Run full validation, verify responsive and RTL-ready flows, save a Prompt 9 checkpoint, and deliver the requested handoff report; stop after this iteration.

# Prompt 9 validation follow-up

- [x] Implement real lesson editing for title, description, duration, transcript, attachment/download placeholders, lesson status, and unsaved-changes handling.
- [x] Add a working public preview-lesson route/action or an explicit unavailable CTA with a clear next step.
- [x] Re-run final validation, review this checklist, save a dedicated Prompt 9 checkpoint, and deliver the Prompt 9 handoff report.

# Browser Classroom and interactive teaching tools

- [x] Audit and preserve Prompts 1–9, especially existing classroom routes, scheduling, session, role, auth, course, and storage boundaries.
- [x] Add typed classroom session, participant, provider, permission, attendance, timer, recording, resource, chat, and mobile service contracts.
- [x] Build protected learner/instructor classroom routes, waiting room, classroom shell, provider setup state, media permission UI, timer, leave/end controls, and safe session statuses.
- [x] Build reusable Quran Reader with selector/navigation controls and content-connection-required states without inventing religious source content.
- [x] Build approved-content-only Noorani Qaida teaching panel with lesson/page, pointer, practice, audio, progress, and notes placeholders.
- [x] Build local/demo White Board with keyboard-accessible tools, undo/redo, clear confirmation, permission states, and realtime-required messaging.
- [x] Build protected classroom resources, upload/storage-unavailable states, chat boundary, attendance/session completion, and archive/recording status pages.
- [x] Document Supabase models, constraints, indexes, private Storage, signed access, RLS, provider integration, recording consent, and mobile-ready contracts.
- [x] Add focused Vitest coverage for classroom authorization, provider unavailability, session states, Quran content safety, White Board controls, resources, chat, attendance, and recording boundaries.
- [x] Run full validation and responsive/RTL-ready route checks, save the Browser Classroom checkpoint, deliver the requested handoff report, and stop after this iteration.

# Browser Classroom validation follow-up

- [x] Resolve the actual demo participant identity from the authenticated session and block unrelated learners/instructors from classroom, dashboard, archive, resource, chat, and recording surfaces.
- [x] Add the missing Noorani Qaida instructor pointer/highlight placeholder with learner/instructor visibility states.
- [x] Implement a real local White Board redo stack alongside undo and clear confirmation.
- [x] Extend classroom tests for unauthorized identities, waiting-room state variants, and White Board undo/redo/clear service behavior.
- [x] Re-run Browser Classroom checks at mobile and explicit RTL-ready presentation states, review todo, save a final classroom checkpoint, and deliver the handoff report.

# Browser Classroom final hardening

- [x] Reserve the demo classroom participant identities so arbitrary signup cannot impersonate the learner-demo or instructor-demo accounts.
- [x] Run explicit RTL presentation verification for Browser Classroom routes and confirm direction-neutral controls.
- [x] Review the completed checklist, save a dedicated final Browser Classroom checkpoint, and deliver the final handoff report.

# Browser Classroom release deliverables

- [x] Save a dedicated Browser Classroom checkpoint after the final hardening fixes.
- [x] Deliver the final Browser Classroom handoff report with scope, validation results, mobile/RTL verification, and remaining integration limits.

# Prompt 11 messaging, reviews, ledger, and operations

- [x] Audit and preserve Prompts 1–10, including auth, roles, dashboards, requirements, trials, schedules, courses, progress, classroom, storage, and route boundaries.
- [x] Add typed authorised conversation, message, report, review, session-ledger, money, provider, withdrawal, and wallet-decision services reusable by web and mobile clients.
- [x] Build learner/instructor conversation lists and details with permission gates, safe message rendering, validation, unread/read states, attachment placeholder, reporting, and realtime/setup-needed states.
- [x] Build eligible completed-class review submission, public published-only reviews, instructor review views, review reporting, moderation controls, and private feedback boundaries without fabricated user content.
- [x] Build learner/instructor session ledger, configurable currency and amount presentation, fee/earnings placeholders, payment verification states, and admin billing/session operations views.
- [x] Build credits/wallet product-decision state and secure-provider-required withdrawal foundation for instructor and admin routes without collecting bank credentials.
- [x] Document Supabase schema, RLS, indexes, constraints, private data rules, provider interfaces, webhook/payout boundaries, recording of audit events, and mobile-ready contracts.
- [x] Add focused Vitest coverage for conversation authorization, message safety, review eligibility/duplicates/moderation, reports, ledger calculations, currency safety, payment confirmation, wallet decision state, and withdrawals.
- [x] Run full validation and responsive/RTL route checks, save the Prompt 11 checkpoint, deliver the handoff report, and stop after this iteration; do not implement Prompt 12.

# Prompt 11 final hardening

- [x] Wire `ReportsPage` to read selected `targetType` and `targetId` from the route query and submit the correct report target.
- [x] Pass working protected report links/actions into learner, instructor, and public review cards, or show an explicit unavailable state when unauthenticated.
- [x] Add Vitest coverage for duplicate-review prevention, moderation reason requirements, and payment-confirmation verification boundaries.
- [x] Run explicit Prompt 11 RTL route verification, re-run validation, review todo, save a dedicated Prompt 11 checkpoint, and deliver the final handoff report.
- [x] Fix the RTL mobile overflow/cropping observed on the public Prompt 11 reviews route and re-run responsive/RTL verification before checkpointing.

# Prompt 12 secure administration and operations

- [x] Audit and preserve Prompts 1–11, including authentication, roles, dashboards, courses, lessons, enrolment, progress, instructor profiles, requirements, trials, scheduling, classroom, messaging, reviews, ledger, billing, credits, withdrawals, storage, and routes.
- [x] Add typed admin roles and least-privilege permission matrix reusable by web, server, database, and mobile clients.
- [x] Add typed moderation cases/actions, admin users/instructors/courses/session/enrolment/progress/review/report query boundaries, and append-only audit event contracts.
- [x] Build protected responsive admin shell with sidebar, breadcrumbs, search, filters, pagination/sort/date controls, export placeholders, accessible statuses, and mobile navigation.
- [x] Build admin overview, users, user details, instructors, instructor details, courses, course review, sessions, enrolments, progress, reviews, reports, and message reports views with safe demo/setup states.
- [x] Build billing, withdrawals, notifications management, analytics, audit logs, settings, and support/issue tracking views with privacy-safe operational states.
- [x] Add explicit confirmations/reasons and least-privilege action boundaries for suspension, role changes, moderation, session adjustments, financial settings, withdrawal operations, retries, and escalations.
- [x] Document Supabase admin roles, moderation cases/actions, notifications/preferences, audit logs, settings, indexes, constraints, RLS, append-only history, and private-data boundaries.
- [x] Add focused Vitest coverage for admin guards, role self-escalation prevention, least privilege, moderation reasons, audit immutability, privacy, notifications, analytics demo safety, settings, and financial boundaries.
- [x] Run full validation plus desktop/mobile/RTL route checks, review todo, save the Prompt 12 checkpoint, deliver the final handoff report, and stop after this iteration; do not implement Prompt 13.
- [x] Correct the Prompt 12 self-role-change regression test to exercise the authorised super-admin boundary, then rerun full validation.
- [x] Remove the admin shell's forced LTR override so Prompt 12 inherits the app-level `?rtl=1` preview direction while retaining readable responsive navigation.
- [x] Add dedicated admin instructor and course detail route views instead of routing detail URLs to queue list pages.

# Prompt 12 final hardening

- [x] Add real breadcrumbs, explicit pagination, sort controls, and shared date-range controls to the admin shell/pages.
- [x] Add audited session-adjustment and withdrawal-operation boundary functions with confirmation, reason, prior/new values, and protected-service states.
- [x] Extend tests for admin route-guard semantics, audit-log immutability, privacy-restricted admin data access, session adjustments, and withdrawal actions.
- [x] Re-run full validation and desktop/mobile/RTL verification, review todo, save a dedicated Prompt 12 checkpoint, and deliver the final handoff report.
- [x] Align session-adjustment and withdrawal-operation tests with the super-admin permission boundary and rerun the final suite.
- [x] Save a dedicated Prompt 12 checkpoint after the final admin hardening fixes.
- [x] Deliver the final Prompt 12 handoff report with scope, validation results, responsive/RTL verification, and remaining integration limits.

# Final LMS quality, security, accessibility, SEO, and deployment pass

- [x] Audit Prompts 1–12, all routes, service boundaries, metadata, tests, logs, and current deployment state without removing working LMS functionality.
- [x] Produce a route inventory with role, purpose, data source, auth requirement, RLS requirement, and status for every LMS route.
- [x] Fix or document broken routes, duplicate services, permissions, open redirects, cross-user access, private-record enumeration, input validation, currency, timezone, states, console errors, mobile, RTL, and accessibility issues.
- [x] Verify and document Supabase/RLS/Storage/private media/security boundaries, including affected route/table/service, severity, fix, and remaining action.
- [x] Standardize loading, empty, error, forbidden, not-found, offline, provider-unavailable, storage-unavailable, payment-required, payout-required, realtime-unavailable, demo, not-enough-data, and coming-soon states.
- [x] Harden public SEO metadata, canonical/Open Graph/structured headings, sitemap/robots boundaries, not-found metadata, and noindex for private LMS surfaces.
- [x] Review performance boundaries, pagination/lazy-loading/caching/image handling, responsive widths 320/375/768/1024/1280/large desktop, and document unavailable measurements honestly.
- [x] Review and document currency/financial and timezone/notification readiness without fabricating totals, ratings, reviews, revenue, payments, or provider results.
- [x] Improve accessibility semantics, labels, focus, keyboard behavior, status announcements, reduced motion, contrast, alt text, chart descriptions, and English/Urdu/Arabic RTL readiness.
- [x] Create/update README, route map, permissions, Supabase setup/migration/storage/RLS guide, API/service map, environment names, testing guide, deployment checklist, known limitations, mobile notes, and role walkthroughs.
- [x] Add or improve tests for auth, roles, RLS ownership, cross-role access, private storage, validation, learner/instructor/admin workflows, responsive/accessibility boundaries, and sensitive-data exposure.
- [x] Run full validation and manual route checks, review all reports and todo items, save the final LMS quality-pass checkpoint, deliver the complete readiness handoff, and stop; do not implement unrelated modules or Prompt 13.
- [x] Harden demo auth with normalized emails, bounded session lifetime, safe internal return targets, and regression tests for expired sessions/open redirects.
- [x] Add route-aware public metadata with canonical/Open Graph/robots handling and noindex for protected LMS surfaces.
- [x] Remove duplicate Prompt 11 route registrations that can shadow or duplicate protected pages.
- [x] Allow the existing `super_admin` role through the app-level admin route guard while preserving least privilege.
- [x] Remove the remaining duplicate `/admin/messages/reports`, `/admin/reviews`, `/admin/billing`, `/admin/sessions`, and `/admin/withdrawals` route block while preserving the dedicated admin pages.
- [x] Resolve the production-build EISDIR failure introduced during final SEO/public-file hardening, then rerun build and full validation.
- [x] Remove remaining duplicate learner/instructor messaging, reports, reviews, sessions, billing, wallet, and withdrawal route registrations so every path has one deterministic handler.
- [x] Mark unknown/not-found routes noindex while keeping approved public discovery paths indexable.

# Final pass gap remediation

- [x] Wrap every `/admin` route in `AdminProtectedRoute` and verify admin/super-admin access semantics.
- [x] Complete `docs/route-inventory.md` against every route in `client/src/App.tsx`, including wildcard, settings, trial, and admin routes, with an explicit RLS-requirement column.
- [x] Add a structured security-boundary table covering affected route/table/service, severity, current control, required fix, and remaining action.
- [x] Verify consistent unavailable, forbidden, offline, not-enough-data, and coming-soon state treatment across relevant surfaces.
- [x] Generate a production-quality sitemap with absolute URLs and verify route-specific not-found/private metadata.
- [x] Document and verify large-desktop responsive review.
- [x] Run and document an explicit accessibility pass covering keyboard flow, focus, reduced motion, chart descriptions, and RTL semantics. Automated/UI evidence is documented; human assistive-technology certification remains a pre-launch gate.

# Final implementation report inspection

- [x] Inspect current routes, pages, data/schema artifacts, integrations, tests, logs, responsive/RTL evidence, accessibility, SEO, and production requirements without changing implementation.
- [x] Deliver an evidence-based Prompts 1–13 implementation report and explicitly distinguish the unimplemented Prompt 13 scope.

# Prompt 7 Supabase connection foundation

- [x] Inspect current Supabase/package/env conventions and session configuration without assuming a connection exists.
- [x] Add Supabase package/client boundaries and safe environment-variable names without exposing service-role credentials.
- [x] Add a non-secret Supabase health-check boundary and preserve explicit demo fallback messaging.
- [x] Add focused tests for missing/valid configuration, server-only secret boundaries, client-bundle safety, and unavailable fallback.
- [x] Document changed files, packages, environment setup, schema/Auth/RLS non-changes, verification status, and owner restart steps.
- [x] Run validation and deliver the Prompt 7 connection-foundation report; do not implement migrations or unrelated integrations.

# Supabase connection verification-only pass

- [x] Verify presence of Supabase environment variables without printing values.
- [x] Verify server-side and browser-safe Supabase connectivity without changing Auth, schema, RLS, Storage, or migrations.
- [x] Run the focused connection tests and report only the requested verification results.

# Prompt 8 Supabase production foundation

- [x] Audit and reconcile the existing Supabase SQL designs into one canonical PostgreSQL model without adding unrelated modules.
- [x] Connect Supabase Auth while preserving existing auth UI, onboarding, safe redirects, and demo fallback.
- [x] Generate and review canonical migrations, then apply only the verified migration set to the configured database. `0001_noor_ilm_lms_canonical.sql` was applied and catalog-verified through the approved PostgreSQL pg channel.
- [x] Connect server persistence procedures and RLS policies for the existing LMS domains. Private Storage remains a separate setup-needed phase.
- [x] Add and run staged security and migration tests without claiming unrun production checks. Identity-isolated Auth/RLS tests and Storage tests remain pending.
- [x] Document exact files, tables, relations, policies, procedures, Storage state, tests, and remaining integrations; save a checkpoint and deliver the report.

# Prompt 8 migration access retry

- [x] Recheck the corrected SUPABASE_DB_URL with a non-mutating PostgreSQL health query; do not apply migrations until authentication succeeds. The direct Supabase query passed; the managed project SQL channel was separately verified as MySQL and is not a valid target for the PostgreSQL migration.

# PostgreSQL migration channel inspection

- [x] Inspect enabled connectors, Supabase CLI/tooling, project scripts, and server-side PostgreSQL support without applying migrations or exposing secrets.
- [x] Report the supported PostgreSQL channel, non-mutating SELECT 1 capability, exact migration files, and required Supabase Dashboard manual step.

# Approved staging PostgreSQL migration

- [x] Confirm the non-secret Supabase target identity and review the exact migration safety summary before execution.
- [x] Apply only `supabase/migrations/0001_noor_ilm_lms_canonical.sql` through the verified server-side pg connection.
- [x] Verify created tables, relationships, indexes, and constraints through read-only PostgreSQL catalog queries; stop before Auth, RLS, Storage, Realtime, or UI changes.

# Prompt 9 Supabase Auth and RLS security

- [x] Inspect all 39 migrated PostgreSQL tables and actual columns before writing policies; preserve the existing UI and demo fallback.
- [x] Implement Supabase Auth profile/session/approved-role synchronization without trusting browser role or user IDs.
- [x] Enable deny-by-default RLS and add ownership, membership, publication, moderation, finance, admin, audit, and private-data policies for all 39 LMS tables.
- [x] Run real PostgreSQL catalog/policy checks plus clearly separated client/service-boundary tests; stop before Storage, Realtime, payments, live classroom, or unrelated features. Identity-isolated role tests remain a staging gate.

# Prompt 9 RLS recursion fix

- [x] Replace the recursive conversation-membership policy subqueries with a security-definer membership helper, apply only the focused RLS patch, and rerun anonymous/PostgreSQL checks.
- [x] Add a non-breaking server-side Supabase bearer identity boundary for protected procedures while preserving Manus OAuth and never trusting browser-supplied roles.

# Prompt 10 private Storage, real RLS, and core persistence

- [x] Inspect actual Storage metadata tables, existing private-media boundaries, staging-auth availability, and selected core demo repositories before implementation.
- [x] Configure private Storage buckets/policies and typed upload, signed-download, metadata, and delete services with safe path and file validation. Four private buckets and 16 policies are active; classroom metadata remains a separate model gap.
- [x] Run the real staging identity/RLS matrix where identities exist; otherwise document each blocked/not-run case and exact manual setup. Anonymous checks passed; signed multi-role matrix is blocked by missing staging identities.
- [x] Add selected Supabase-backed server procedures for profiles, availability, requirements, courses/modules/lessons, enrolments, and lesson progress without mixing demo and production records. Responses/shortlists and UI cutover remain pending signed CRUD tests.
- [x] Run Storage boundary tests, anonymous private probes, route smoke checks, full TypeScript/Vitest/build validation, bundle secret scan, and document remaining domains/integrations. Signed cross-user/cross-role CRUD remains pending staging identities.
- [x] Update the login Supabase status copy so it no longer says protected profile persistence is a later RLS stage after Prompt 9/10 backend changes.

# Language Learning AI Tutor

- [x] Audit existing AI, auth, route, dashboard, Supabase schema, LLM helper, and test foundations before implementation.
- [x] Design and apply non-duplicate AI Tutor PostgreSQL tables, constraints, indexes, and least-privilege RLS policies.
- [x] Build server-only, versioned language-learning tutor safety policy with religious-ruling/unrelated-topic redirects, prompt-injection resistance, privacy minimization, usage limits, and provider setup/unavailable states.
- [x] Add typed AI Tutor persistence and provider procedures for preferences, conversations, messages, progress, saved items, reports, and deletion without exposing provider secrets.
- [x] Build authenticated learner AI Tutor setup, practice modes, safe chat, conversation, progress, and delete-history routes using Quiet Geometry and responsive/RTL-ready patterns.
- [x] Build authorized instructor AI Tutor aggregate view and admin AI Tutor moderation/operations view without exposing private learner conversations without consent. Views are intentionally setup-needed until approved aggregate-policy procedures are connected.
- [x] Add focused tests for auth/RLS ownership, safety redirects, unsafe content, prompt injection, usage limits, provider failures, privacy/logging, deletion, and client secret scans. Focused safety/migration coverage is active; live signed CRUD and provider-failure integration tests remain pending test identities/provider harness.
- [x] Run route smoke, mobile/tablet/desktop/RTL checks, TypeScript, Vitest, production build, and document exact provider/setup-needed status. Signed-out guards were verified; live signed CRUD/provider integration remains pending.
- [x] Prepare the Language Learning AI Tutor checkpoint and final implementation handoff.

# Complete English–Urdu–Arabic i18n and RTL support

- [x] Audit all public, learner, instructor, admin, classroom, and AI Tutor hard-coded UI strings, route metadata, current language controls, and locale preference persistence; remaining hard-coded areas are documented as pending migration.
- [x] Create typed `en`/`ur`/`ar` locale contracts, launch-surface catalogues, glossary, interpolation/pluralisation helpers, locale-aware date/time/number/USD formatters, and development completeness checks; catalogue coverage is not yet site-wide.
- [x] Add a shared locale provider/hook and selector with English fallback, local persistence, safe route preservation, document `lang`/`dir`, and authenticated profile locale synchronization using the canonical profile field.
- [x] Translate all currently supported launch/public static website UI, forms, validation/errors, dialogs, tooltips, status/empty/loading/provider/setup-needed states, accessible labels, static alt text, page titles, and public SEO metadata without altering official, user-generated, or technical content; remaining hard-coded dashboard/classroom/admin and technical/user-generated content is documented as a deliberate follow-up scope.
- [x] Complete the shared RTL/LTR direction foundation across navigation and verified public/classroom/admin surfaces without duplicating page implementations; added logical-direction utilities and retained documented route-level follow-up verification for unmounted/private screens.
- [x] Extend AI Tutor preferences and server prompt/provider boundaries with response language and explanation language for English, Urdu, and Arabic while retaining language-learning-only safety redirects.
- [x] Add multilingual tests for rendering, selector behavior, persistence, invalid-locale fallback, direction, completeness, route coverage, forms/messages, formatters, AI Tutor language, keyboard access, and client secret safety where covered by the current suite; broader UI automation remains pending.
- [x] Manually verify representative public and authentication screens at desktop and mobile in English, Urdu, and Arabic; document remaining learner/instructor/admin/classroom/AI Tutor route verification and human linguistic review as pending.
- [x] Prepare the multilingual implementation report; checkpoint save remains pending until the documented partial-scope state is reviewed.

- [x] Migrate the actual mounted public `/requirements` listing and shared header/privacy surface in `RequirementsExperience.tsx` to the English–Urdu–Arabic locale provider; TypeScript and all 87 regression tests pass.

# Real scheduling persistence: availability, trials, bookings, sessions, and notifications

- [x] Audit existing tutor, learner, instructor, admin scheduling routes, canonical scheduling tables, demo/localStorage repositories, notification service, and current Supabase procedures.
- [x] Design and apply only additive reviewed scheduling migration changes; preserve existing tables/RLS and add required timezone, status, idempotency, audit, and conflict-safe constraints/indexes. Migration 0008 was applied and catalog-verified through the approved PostgreSQL path.
- [x] Implement server-owned availability CRUD, recurring/exception/break validation, approved public slot calculation, learner/instructor timezone conversion, and safe scheduling errors; full locale-key migration remains pending.
- [x] Implement server-owned trial request, accept/decline/propose/confirm/cancel transitions with ownership, relationship, expiry, stale-state, and audit validation.
- [x] Implement transaction-safe duplicate and overlap prevention for instructor and learner bookings, including race-safe confirmation behavior. Live staging race execution remains pending fixture identities.
- [x] Create class sessions only from confirmed bookings with UTC/timestamptz data, preserved timezone identifiers, safe status boundaries, participants, audit events, and no frontend-only live/attended/completed claims.
- [x] Connect existing tutor, requirement, trial, booking, schedule, notification, and admin session routes to real Supabase procedures without duplicate pages or demo/persistent record mixing where mounted; admin session operations and unmounted legacy detail surfaces remain setup-needed/documented.
- [x] Add idempotent in-app scheduling notifications with recipient locale boundary, email/provider setup-needed state, and future push documentation; atomic confirmation currently defaults its notification locale to English pending profile-locale lookup.
- [x] Add the scheduling persistence UI within the existing RTL-safe layout and document the remaining legacy scheduling English strings for a dedicated locale migration pass; full scheduling catalogue coverage is not claimed.
- [x] Add focused availability, timezone, trial, booking, conflict, transaction-boundary, and migration tests; TypeScript, production build, and **91 Vitest tests** pass. Signed staging RLS/race tests, full multilingual UI automation, and provider integration remain pending.
- [x] Document exact scheduling persistence status, files, migration, procedures, RLS results, integrations still pending, and save the scheduling checkpoint.

# Read-only complete implementation audit

- [x] Inventory actual source files, active routes, components, services, migrations, configuration, tests, logs, and deployment evidence without changing implementation.
- [x] Verify actual Supabase Auth, PostgreSQL tables/migrations, RLS, Storage, persistence, scheduling, classroom, messaging, reviews, admin, billing, AI Tutor, multilingual, RTL, accessibility, SEO, performance, testing, and deployment status.
- [x] Run only non-mutating validation and route/runtime checks; do not install packages, seed data, apply migrations, send notifications, or expose secrets/personal data.
- [x] Calculate weighted visual/demo, assigned production LMS, and full manager-approved completion ranges with explicit assumptions and uncertainty.
- [x] Produce the required executive scorecard, requirement matrix, route audit, backend audit, multilingual audit, security audit, roadmap, mandatory gap checks, blockers, demo-ready/placeholder lists, safety decisions, walkthroughs, and change-protection list.
- [x] Deliver the read-only evidence-based audit report without modifying implementation artifacts.

# Website logo selection

- [x] Use only logo concept 1 from the supplied Noor Ilm logo sheet as the website logo.
- [x] Prepare and reference a clean production-safe logo asset without the other logo variants. Uploaded asset: `/manus-storage/noor-ilm-logo-concept-1_266ba505.png`.
- [x] Validate the logo in the public header at desktop/mobile widths and production build; no favicon or separate logo metadata reference exists in the current project.

# Production conversion and verification

- [x] Inventory every remaining demo/localStorage repository, active provider boundary, route, procedure, migration, and environment gap.
- [x] Define production cutover order, required environment-variable names, and a test/development fixture boundary that cannot appear in production.
- [ ] Replace remaining production-flow demo fallbacks with authenticated Supabase procedures, RLS ownership checks, transactions, and safe translated errors; never show fake success or fake records.
- [ ] Complete real profile/preferences, credentials/media/verification, requirements/responses, availability, trials/bookings/sessions, courses/enrolments/progress, assignments where enabled, Hifz tracker, messaging/notifications, reviews/reports/moderation, attendance/duration, and admin/audit persistence where in scope.
- [ ] Fully connect private Storage with signed upload/download/delete and cross-user denial verification for credentials, media, course files, and classroom resources.
- [x] Connect only approved classroom, Realtime, email/push, payment/payout, and AI Tutor providers; otherwise retain translated blocking setup/error states and do not invent responses or success. All currently unconfigured provider categories remain fail-closed and covered by provider-gate tests.
- [ ] Finish complete English/Urdu/Arabic translation-key coverage and RTL/LTR behavior across all active public, learner, instructor, admin, classroom, messaging, review, billing, and AI Tutor routes.
- [ ] Add and run real Auth lifecycle, Supabase CRUD, RLS identity, Storage, scheduling, notifications, AI Tutor, multilingual, responsive, accessibility, security, and bundle/log privacy tests.
- [x] Produce the production-conversion report with exact remaining repositories, flow status, Storage/RLS/Auth matrix, Hifz status, AI Tutor/provider status, translation coverage, environment names, blockers, and readiness decision.
- [x] Save the production-conversion checkpoint only after all verified work is accurately recorded.
- [x] Localize the protected messaging setup-needed label itself across English, Urdu, and Arabic.
- [x] Add multilingual regression coverage for the protected messaging catalogue and setup-needed labels.
- [x] Replace the learner requirement form's demo-auth gate with the real Supabase auth state while preserving fail-closed submission behavior.
- [x] Localize the learner requirement form's remaining auth, service-error, and draft-setup boundary messages across English, Urdu, and Arabic.
- [x] Replace the public trial CTA's demo-auth gate with the real Supabase auth state while preserving safe login return routing.
- [x] Remove the remaining localStorage side effect from the real Supabase authentication hook and preserve auth state through the query cache only.
- [x] Add regression coverage proving the real Supabase auth hook does not write browser auth state to localStorage.
- [x] Document that the only remaining client localStorage usage is the non-sensitive DashboardLayout sidebar-width preference, not authentication or LMS records.
- [x] Preserve the learner requirement form's visible level, language, timezone, and availability selections in the protected createRequirement payload instead of hardcoded defaults.
- [x] Connect the learner dashboard requirements listing to the existing protected own-requirements Supabase procedure while keeping the public marketplace listing explicitly demo-limited.
- [x] Add accessible pending and disabled states to the learner requirement publish action while the protected mutation is in flight.
- [x] Localize the learner requirement form's remaining currency and trial-preference labels across English, Urdu, and Arabic.
- [x] Remove the instructor response form's fake submitted-success state and expose an explicit setup-needed boundary until response persistence is implemented.
- [x] Replace learner response comparison's fake shortlist and choose-instructor actions with explicit setup-needed controls until response persistence and booking procedures are available.
- [x] Replace public requirement detail's local pause, close, and cancel state changes with translated setup-needed controls until protected moderation/status procedures are available.
- [x] Localize learner response-comparison headings, explanatory copy, rate, trial, and action context across English, Urdu, and Arabic.
- [x] Localize the match-preview boundary and recommendation labels across English, Urdu, and Arabic without implying persisted matching decisions.
- [x] Replace private requirement edit's demo ownership and fake save actions with real-auth setup-needed boundaries until protected update procedures are available.
- [x] Localize the instructor requirements desk demo boundary and make its match-score placeholder explicitly setup-needed across English, Urdu, and Arabic.
- [x] Localize the instructor requirements desk search, language, schedule, format, and review labels across English, Urdu, and Arabic.
- [x] Add regression coverage proving private requirement edit cannot claim demo ownership or fake save success.
- [x] Refresh the production-conversion report with the latest requirements-flow hardening slices and 118-test validation evidence.
- [x] Localize the private requirement-edit boundary copy, owner-only state, unsaved notice, and disabled persistence controls across English, Urdu, and Arabic.
- [x] Localize private requirement-edit not-found, back, and cancel labels across English, Urdu, and Arabic.
- [x] Localize the instructor requirements desk heading and demo-boundary explanation across English, Urdu, and Arabic.
- [x] Add the latest instructor requirements desk localization and demo-boundary evidence to the production-conversion report.
- [x] Document the latest desktop and narrow-mobile route checks for public, requirements, learner dashboard, and instructor dashboard surfaces.
- [x] Add regression coverage proving the active requirements flow contains no local status, shortlist, response-success, or localStorage persistence mutations.
- [x] Localize the trial CTA default label across English, Urdu, and Arabic while preserving explicit caller-provided labels.
- [x] Add regression coverage proving the trial CTA default label is typed and locale-aware while explicit labels remain supported.
- [x] Evaluate the production bundle-size warning; no cosmetic threshold change or unverified route/vendor chunking was applied, so the existing warning remains an explicit performance follow-up.
- [x] Localize the classroom setup-needed shell's visible provider, waiting-room, and access-boundary labels across English, Urdu, and Arabic.
- [x] Add regression coverage proving the classroom setup notice and provider-boundary labels use typed multilingual keys without fake live-state claims.
- [x] Refresh the production-conversion report with the classroom setup-boundary localization and 119-test evidence.
- [x] Localize the shared classroom shell's default eyebrow and back-navigation labels across English, Urdu, and Arabic.
- [x] Add regression coverage proving shared classroom shell defaults use typed locale labels while explicit route labels remain supported.
- [x] Add the shared classroom shell localization and regression evidence to the production-conversion report.
- [x] Localize classroom waiting-room connection, permissions, participant, and issue-report boundary labels across English, Urdu, and Arabic.
- [x] Localize classroom session metadata labels for learner time, instructor time, duration, and status across English, Urdu, and Arabic.
- [x] Resolve the observed Fast Refresh warning caused by the locale constant export without changing locale behavior or RTL semantics; the latest HMR log contains no recurrence after removing the unused re-export.
- [x] Localize classroom issue-report reason options and close-panel labeling across English, Urdu, and Arabic.
- [x] Remove the remaining localeCompletenessReport export from the React context module so Fast Refresh has no non-component runtime exports.
- [x] Document the isolated locale context module and verified Fast Refresh cleanup in the production-conversion report.
- [x] Add regression coverage proving the locale provider and isolated locale hook modules preserve the Fast Refresh-safe export boundary.
- [x] Refresh the production-conversion report with the locale-module Fast Refresh regression coverage and 120-test evidence.
- [x] Add conservative vendor chunking for React and UI dependencies; the main chunk was reduced from about 1.90 MB to about 1.71 MB while the build and tests remained clean, though the warning remains for future route-level code splitting.
- [x] Document measured vendor-chunking output and the remaining route-level code-splitting follow-up in the production-conversion report.
- [x] Re-run responsive route verification after vendor chunking and locale-context changes at desktop and narrow mobile widths.
- [x] Audit all remaining production-flow repositories and classify each path as real Supabase, setup-needed, demo-only, or blocked without changing unsupported provider behavior.
- [x] Verify and document the exact live-environment prerequisites that prevent closing migrations, provider integrations, and identity-matrix tests in this run.
- [x] Extend production configuration regression coverage to prove AI Tutor and every unconfigured provider category remain fail-closed without exposing secret values.
- [x] Refresh the production-conversion report with the provider fail-closed regression coverage and 121-test evidence.
- [x] Localize the remaining protected AI Tutor route headings, setup boundary, and preference-form labels across English, Urdu, and Arabic where typed keys already exist or can be added safely.
- [x] Add regression coverage proving protected AI Tutor route labels are present and semantically distinct across English, Urdu, and Arabic.
- [x] Complete protected AI Tutor conversation, progress, instructor, and admin localization across English, Urdu, and Arabic.
- [x] Add regression coverage proving protected AI Tutor route labels are non-empty and distinct across English, Urdu, and Arabic; the suite now passes 122 tests.
- [x] Apply and catalog-verify the additive Hifz tracker migration `0009_hifz_tracker.sql` through the verified Supabase PostgreSQL channel; both tables, five indexes, four policies, RLS, constraints, and relationships are present.
- [x] Run representative desktop/mobile route screenshots and inspect runtime logs after the AI Tutor and Hifz updates.
- [x] Add a read-only live PostgreSQL catalog regression test for the applied Hifz tables, RLS, policies, indexes, and foreign keys; the configured Supabase PostgreSQL check passed without data mutation.
- [x] Add protected Supabase procedures for instructor requirement responses and learner-owned response listing, with least-privilege input validation and focused tests; the focused suite passes 16 tests.
- [x] Add an instructor-owned requirement-response status transition procedure for pending, shortlisted, accepted, rejected, and withdrawn states with focused authorization tests; the focused boundary suite passes 5 tests.
- [x] Wire the protected instructor response form to the Supabase response-submission procedure with translated success/error/setup states and no fake success; the focused UI/persistence suite passes 6 tests.
- [x] Wire the protected learner response-comparison route to learner-owned Supabase response listing with empty, loading, error, and no-fake-response states; focused i18n and response-boundary tests pass.
- [x] Replace the learner requirement edit demo save boundary with an owner-scoped Supabase goal update and translated success/error states; the focused requirements/i18n suite passes 15 tests.
- [x] Replace the protected instructor requirements desk demo listing with an authenticated published-requirements Supabase query and honest loading/error/empty states; focused requirements and i18n tests pass.
- [x] Wire instructor settings profile name, preferred language, and locale updates to the protected Supabase profile procedure with translated save/error states; focused settings/instructor tests pass 6 tests.
- [x] Replace the public instructor profile demo lookup with the existing public Supabase instructor-by-slug query and honest loading/error/not-public states; focused public-profile tests pass 8 tests across the instructor surfaces.
- [x] Add a publishable-key-only public course listing query and route that returns published courses without requiring a signed-in identity or exposing private course rows; focused public-catalogue tests pass.
- [x] Wire CoursesPage to the public published-course Supabase query, preserving filters while showing explicit loading, error, and empty states instead of demo records; TypeScript and public-catalogue tests pass.
- [x] Replace CourseDetail’s demo fallback with a public published-course-by-slug Supabase query and honest not-found/loading/error states; TypeScript and public-course regression checks pass.
- [x] Replace TeachersPage’s demo instructor list with a public published-and-approved Supabase instructor query and honest loading/error/empty states; TypeScript and focused public-list/profile tests pass.
- [x] Strengthen private Storage regression coverage for signed-download and delete helpers, including identity-bound credential paths and role/relationship checks for course/classroom media; the focused Storage suite passes 7 tests.
- [x] Localize the newly added public course and instructor Supabase loading, error, approval, and not-public states across English, Urdu, and Arabic; the focused multilingual discovery suite passes 13 tests.
- [x] Replace the public requirements marketplace demo list with an RLS-filtered published-requirements query and honest loading/error/empty states without exposing private requirement fields; focused requirements tests pass 13 tests.
- [x] Replace public RequirementDetail’s demo fallback with a published-requirement-by-id Supabase query, approved public fields, and honest not-found/loading/error states; focused requirements and i18n validation passes 21 tests.
- [x] Replace protected learner/instructor dashboard shells' demo-auth reads with the real Supabase-backed auth hook while preserving fail-closed empty states and typed setup-needed messaging; focused dashboard regression and TypeScript validation pass.
- [x] Wire learner dashboard active-enrolment and published-requirement counts to existing authenticated Supabase procedures, leaving unsupported metrics fail-closed; focused dashboard regression and TypeScript validation pass.
- [x] Complete the attached read-only evidence-based LMS audit and deliver a consolidated report without modifying implementation, database, providers, or settings.
- [x] Provision or document isolated staging identities and run real Auth, RLS, cross-user, cross-role, and private Storage verification without changing application features or exposing secrets; real matrix blocked because isolated identities were unavailable, with exact manual setup documented.
- [x] Inspect and resolve the finance_operator versus finance staging-role naming mismatch without changing code, migrations, RLS policies, or role data; confirmed finance_operator is not a current role value and requires explicit staging-label mapping.
- [x] Connect learner course workspace and instructor course builder to existing Supabase procedures with ownership checks, real enrolment/progress/module/lesson persistence, and honest private-media boundaries; leave identity/provider tests blocked where unavailable. Focused 12 tests and full 147-test suite pass; TypeScript and build pass.
- [x] Extend the course persistence slice to connect `/enrol/:courseId`, instructor preview, and instructor moderation submission to existing Supabase procedures with no demo success states; focused and full validation passed.
- [x] Implement the real Hifz Tracker and Quran learning progress module with additive Supabase persistence, authenticated ownership/RLS checks, multilingual RTL UI, and honest approved-content/reminder/provider boundaries; do not create staging identities or fake content. Migration 0011 applied and catalog-verified; 33 files/154 tests, TypeScript, build, restart, and protected route checks pass; signed identity/provider work remains blocked/setup-needed.
- [x] Localize active learner course-workspace and public lesson-preview strings across English, Urdu, and Arabic without changing persistence or provider boundaries. Focused 25 tests and full 156-test suite pass; TypeScript and build pass.
- [x] Remove the active public course-detail and lesson-preview demo fallback, route public course detail to the existing Supabase published-course query, and show honest setup-needed content when public lesson metadata is unavailable. Focused course regression and full 156-test suite pass; TypeScript and build pass.
- [x] Localize active instructor course builder, enrolment, and course-submission state copy across English, Urdu, and Arabic without changing persistence, RLS, currency, or provider behavior. Added typed courseStudio keys in all three locales; 156 tests, TypeScript, and build pass.
- [x] Localize active instructor, scheduling, relationship-operations, admin, and AI Tutor setup/auth states using English, Urdu, and Arabic keys without changing provider or permission behavior. Covered protected, setup-needed, empty, consent, review/report, finance/payout, notification, analytics, and support boundaries; full active-route catalogue coverage remains tracked separately.
- [x] Localize reusable AI Tutor fallback labels and the protected admin unauthorised gate using existing English, Urdu, and Arabic catalogue keys; no LLM, role, or permission behavior changed. Full 156-test suite, TypeScript, and build pass.
- [x] Localize scheduling trial-request authentication handoff and success-state copy with existing English, Urdu, and Arabic keys; scheduling persistence, validation, booking, and provider boundaries are unchanged. Full 156-test suite, TypeScript, and build pass.
- [x] Localize instructor profile access, save-error, draft-state, and completion-state copy using English, Urdu, and Arabic catalogue keys; profile validation and Supabase ownership/mutation behavior are unchanged. Full 156-test suite, TypeScript, and build pass.
- [x] Localize instructor credential Auth and private-Storage setup/error boundary messages with English, Urdu, and Arabic catalogue keys; signed access, upload permission, metadata cleanup, and delete behavior are unchanged. Full 156-test suite, TypeScript, and build pass.
- [x] Localize instructor availability setup, save-success, and save-error states with English, Urdu, and Arabic catalogue keys; timezone conversion and authenticated scheduling mutations are unchanged. Full 156-test suite, TypeScript, and build pass.
- [x] Localize relationship conversation-list empty, private-boundary, and Realtime setup-needed copy with English, Urdu, and Arabic keys; role-scoped identity resolution and messaging restrictions are unchanged. Full 156-test suite, TypeScript, and build pass.
- [x] Localize relationship conversation-detail access, empty-thread, send, and private-boundary states with English, Urdu, and Arabic messaging keys; membership checks and message persistence remain unchanged. Full 156-test suite, TypeScript, and build pass.
- [x] Localize private report authentication, submission, and moderation setup-needed states with English, Urdu, and Arabic messaging keys; report authorization and provider boundaries are unchanged. Full 156-test suite, TypeScript, and build pass.
- [x] Localize review-list empty and moderation setup-needed states with English, Urdu, and Arabic keys; no review or rating data was fabricated, and public-consent/moderation boundaries are unchanged. Full 156-test suite, TypeScript, and build pass.
- [x] Localize review-form eligibility, submission, consent-boundary, and moderation setup-needed states with English, Urdu, and Arabic keys; eligibility enforcement and no-fabrication policy are unchanged. Full 156-test suite, TypeScript, and build pass.
- [x] Localize public review rendering and empty-state copy with English, Urdu, and Arabic keys; only published consented reviews remain eligible, and no review data was fabricated. Full 156-test suite, TypeScript, and build pass.
- [x] Localize admin review moderation setup-needed, action, and empty states with English, Urdu, and Arabic keys; least-privilege admin boundaries and no-fabrication policy are unchanged. Full 156-test suite, TypeScript, and build pass.
- [x] Localize learner/instructor session-ledger setup-needed and empty-value states with English, Urdu, and Arabic keys; payment, payout, and currency provider boundaries remain unchanged. Full 156-test suite, TypeScript, and build pass.
- [x] Localize admin reports protected, audit/setup-needed, and empty states with English, Urdu, and Arabic keys; role/target/status scoping and audit boundaries are unchanged. Full 156-test suite, TypeScript, and build pass.
- [x] Localize instructor withdrawal/payout setup-needed and empty states with English, Urdu, and Arabic keys; preserve a stable accessible provider-gate label, null-money safeguards, and payout boundaries. Full 156-test suite, TypeScript, and build pass.
- [x] Localize admin operations overview protected-data notice and metric labels with English, Urdu, and Arabic keys; admin permissions and provider setup-needed behavior are unchanged. Full 156-test suite, TypeScript, and build pass.
- [x] Localize admin overview and users empty/setup states with English, Urdu, and Arabic keys; least-privilege data boundaries remain unchanged. Full 156-test suite, TypeScript, and build pass.
- [x] Localize admin user-detail unavailable, protected, and audit-empty states with English, Urdu, and Arabic keys; privacy-minimal field exposure and audit boundaries are unchanged. Full 156-test suite, TypeScript, and build pass.
- [x] Localize admin instructor-detail and course-detail protected/unavailable states with English, Urdu, and Arabic keys; credential privacy, moderation, and publication boundaries remain unchanged. Full 156-test suite, TypeScript, and build pass.
- [x] Localize admin settings and support persistence/setup-needed states with English, Urdu, and Arabic keys; protected approval, support, and least-privilege boundaries remain unchanged. Full 156-test suite, TypeScript, and build pass.
- [x] Localize admin notification and analytics setup-needed states with English, Urdu, and Arabic keys; provider gates, role checks, and honest no-data reporting remain unchanged. Full 156-test suite, TypeScript, and build pass.
- [x] Add route-level lazy loading for heavy LMS experience components and verify the large-main-chunk warning is reduced without changing route guards or data behavior. Heavy experiences now emit dedicated chunks; the main chunk is about 1.06 MB (down from about 1.71 MB), and TypeScript, 156 tests, and build pass.
- [x] Lazy-load the requirements and response experience bundle and verify its route fallback and bundle output without changing Supabase procedures or public/private access. A dedicated RequirementsExperience chunk is emitted; TypeScript, 156 tests, and build pass.
- [x] Replace browser DemoAuthProvider/useDemoAuth route gating with real Supabase Auth session handling, including auth flows, session restoration, safe redirects, profile/role bootstrap, translated states, and secret-boundary validation; do not create staging identities or modify unrelated modules. App and protected routes use SupabaseAuthProvider/useAuth, profile/user_roles bootstrap is server-scoped, 34 test files/160 tests, pnpm check, TypeScript, build, secret scan, and unauthenticated smoke checks pass; signed-user matrix remains pending.
- [x] Localize authentication, onboarding, and account-settings visible copy across English, Urdu, and Arabic without changing Supabase Auth, onboarding persistence, or protected-route behavior. Completed through the Auth/onboarding localization slices and checkpoint babbb831.
- [x] Localize authentication success/error and account-settings privacy/status boundary copy with existing English, Urdu, and Arabic keys; Supabase Auth, onboarding persistence, and protected-route behavior remain unchanged. Full 34-file/160-test suite, package check, TypeScript, build, and secret scan pass.
- [x] Localize the active learner/instructor onboarding form labels, progress text, consent copy, controls, and persistence boundary across English, Urdu, and Arabic; Supabase profile persistence, role handling, and return routing are unchanged. Full 34-file/160-test suite, TypeScript, and production build pass.
- [x] Guard learner and instructor onboarding routes with the real Supabase session and safe internal return routing so unauthenticated visitors cannot reach the persistence form. Both routes now use AuthenticatedRoute; TypeScript, 34 test files/160 tests, and production build pass.
- [x] Localize account-settings protected shell, private-data notice, section/status labels, and disabled persistence action with English, Urdu, and Arabic keys; authenticated guard and disabled mutation behavior remain unchanged. TypeScript, 34 tests, and build pass.
- [x] Localize public contact and informational page shell copy across English, Urdu, and Arabic without changing their demo-only submission or navigation behavior. Completed through the contact and Help/How-it-works slices and checkpoint 228b7e03.
- [x] Localize public contact form labels, demo submission state, and honest no-send copy with English, Urdu, and Arabic keys; demo-only state and navigation behavior remain unchanged. Full 34-file/160-test suite, TypeScript, and production build pass.
- [x] Localize public Help and How Noor Ilm Works page shells with English, Urdu, and Arabic catalogue keys; FAQ interaction, informational content, demo boundaries, and navigation remain unchanged. Full 34-file/160-test suite, TypeScript, and production build pass.
- [x] Replace the public lesson-preview fail-closed placeholder with a read-only Supabase publicLessonMetadata procedure that verifies published course/module/lesson ownership and excludes private media paths; update focused regression coverage. Full 34-file/160-test suite, TypeScript, and production build pass.
- [x] Add publicLessonMetadata Supabase procedure and replace the public lesson preview placeholder with published course/module/lesson metadata only; exclude private media paths and preserve honest unavailable states. Full 34-file/160-test suite, TypeScript, and production build pass.
- [x] Replace the active onboarding private-visibility label with the English–Urdu–Arabic common.private catalogue key without changing Supabase persistence, role handling, or route guards. Full 34-file/160-test suite, TypeScript, and production build pass.
- [x] Re-inspect browser Supabase Auth session restoration, sign-in/sign-up/password flows, server role/profile bootstrap, and protected route guards; document whether the requested cutover is already implemented or needs correction. Existing cutover verified; post-login routing corrected to consume fresh profile refetch data.
- [x] Add or update focused Auth-flow and client-secret boundary regression tests without exposing secrets or weakening RLS. Browser Auth tests cover session flows, fresh role/onboarding refetch routing, browser storage boundaries, and built-asset secret exclusion.
- [x] Run strict TypeScript, full Vitest, production build, unauthenticated protected-route smoke checks, and runtime/log privacy checks for the Auth cutover. Validation passed; learner and admin routes redirected safely to login; no post-restart server errors or app-secret exposure were found.
- [x] Save a final verified Auth-cutover checkpoint and prepare the requested implementation/status report, preserving blocked staging-identity and provider prerequisites. Checkpoint f7d86658 is live.
- [x] Fix post-login role/onboarding routing to use the fresh Supabase profile bootstrap result returned by refetch, then add regression coverage for this stale-query boundary without changing Auth or RLS behavior. Focused Auth boundary tests, the full 34-file/160-test suite, TypeScript, and production build pass.
- [x] Inspect and reuse existing scheduling tables, procedures, routes, components, and role model; do not add duplicate tables or migrations. Reused the canonical scheduling tables/procedures; migration 0012 is additive only.
- [x] Complete real Supabase-backed availability, timezone-aware slots, trial requests, booking lifecycle, cancellation/rescheduling, ownership, and conflict-prevention behavior using existing contracts. Server checks enforce availability, minimum notice, buffer-aware overlap, ownership, and transaction-safe confirmation; signed identity/race execution remains blocked.
- [x] Connect active learner and instructor scheduling routes to real Supabase data and remove remaining active demo/localStorage scheduling persistence without fake success states. Schedule, bookings, notifications, trial lists, trial submission, server-confirmed slot selection, and instructor availability use protected procedures; classroom/provider placeholders remain setup-needed.
- [x] Add honest in-app notification records/idempotency and billable-state ledger boundaries while keeping email, push, Realtime, and payments setup-needed. Existing atomic confirmation and notification upsert boundaries are preserved; provider delivery remains setup-needed.
- [x] Add focused scheduling, timezone, notice, overlap, ownership, notification-idempotency, currency, translation, and RTL regression coverage; run all requested validation and smoke scans. Focused scheduling tests pass 10/10; full suite passes 34 files/162 tests; TypeScript and build pass; protected learner/instructor route redirects and runtime privacy checks pass.
- [x] Save the verified scheduling checkpoint and report connected routes, tables/procedures, lifecycle, conflict evidence, blockers, and signed-identity limitations. Checkpoint pending in this step.

# Hifz Tracker production hardening

- [x] Inspect and reuse existing Hifz tables, migrations, procedures, routes, components, tests, and English–Urdu–Arabic locale contracts; do not create duplicate tables or fake Quran/progress data. Existing migrations 0009–0011 and current procedures were inspected; no duplicate schema or Quran content was added.
- [x] Complete real learner-owned Hifz plan, Sabaq, Sabqi, Manzil, approved Quran-reference, and daily-practice persistence with validation and duplicate prevention. Existing Supabase procedures remain the source of truth; date/reference/rating/minutes validation and the database uniqueness boundary are covered.
- [x] Complete assigned-instructor review, feedback, status, ownership, and least-privilege boundaries without weakening RLS. Added the assigned-review query and connected existing review mutation; policies remain assigned-instructor scoped and signed identity verification is still blocked.
- [x] Connect learner progress history, completion percentage, weekly/monthly summaries, actual-record streaks, honest empty states, and idempotent in-app reminders. Added a tested pure progress summarizer and exposed persisted in-app reminder data; no activity is fabricated.
- [x] Connect active learner and assigned-instructor Hifz routes to Supabase and remove active demo/localStorage Hifz persistence while preserving setup-needed Quran/audio/classroom boundaries. Active routes use protected tRPC procedures; approved Quran content, audio, classroom, and recording remain setup-needed.
- [x] Localize changed Hifz labels, statuses, validation, progress, reminders, loading/error/empty states, accessibility labels, and RTL/LTR responsive surfaces across English, Urdu, and Arabic. New review and metric labels were added to all three catalogues; mobile RTL-ready route presentation was captured.
- [x] Add Hifz schema/procedure, Sabaq/Sabqi/Manzil, ownership, review, duplicate, progress/streak, reminder, source-scan, locale, and RTL regression coverage; run all validation and smoke checks. Focused Hifz tests pass 3 files/11 tests; full suite passes 34 files/165 tests; check, build, source scan, protected-route smoke, and mobile RTL-ready capture pass.
- [x] Save the verified Hifz checkpoint and report connected routes, tables/procedures/migrations, permissions, evidence, blockers, and signed-identity limitations. Checkpoint bdef5b42 is saved and live; the remaining Hifz report is the final handoff for this scoped task.
- [x] Connect the assigned-instructor Hifz route to real submitted review records and the existing reviewHifzRecord procedure, with feedback/status controls, safe validation, and localized setup/empty/error states. Added assignedHifzReviews and localized instructor review controls; focused Hifz contract tests pass.
- [x] Add honest Hifz completion percentage, monthly activity, and consecutive-day streak metrics derived only from learner-owned records, with localized progress labels and focused date-calculation tests. The pure UTC summarizer tests pass, and the server procedure uses learner-scoped rows only.
- [x] Replace the active instructor profile editor’s demo default with protected Supabase profile hydration or honest empty state, without exposing private credentials or claiming verification. Focused instructor tests pass; full suite passes 34 files/166 tests; TypeScript and production build pass.
- [x] Localize the Supabase-backed public instructor profile route’s loading, unavailable, public-field, and setup-needed labels in English, Urdu, and Arabic without widening exposed profile data or changing trial/messaging behavior. Focused route tests pass 2 files/7 tests; full suite passes 34 files/166 tests; check and production build pass.
- [x] Replace the protected instructor profile preview’s demo fixture with authenticated Supabase profile data and honest loading/empty states, while keeping private credentials, verification decisions, and provider-dependent fields excluded. Focused public-profile tests pass 2 files/7 tests; full suite passes 34 files/166 tests; check and production build pass.
- [x] Replace active instructor training fixture modules with an honest setup-needed/persistence-required state until approved training content and completion persistence are available; do not fabricate completion or verification progress. Added localized English–Urdu–Arabic boundary copy; focused instructor tests and full 34-file/167-test validation pass.
- [x] Localize the active instructor online-test unavailable boundary using existing English–Urdu–Arabic catalogue keys while preserving the no-engine setup-needed behavior and route contract. Focused instructor coverage passes 6/6; full suite passes 34 files/167 tests; TypeScript, project check, and production build pass.
- [x] Remove obsolete instructor demo-fixture imports after converting profile editor, preview, training, and availability surfaces to protected or honest boundaries. Focused instructor/public-profile tests pass 2 files/8 tests and strict TypeScript passes.
- [x] Localize the active instructor verification read-only boundary with existing English–Urdu–Arabic catalogue keys while preserving protected reviewer-only decisions and current status behavior. Focused instructor/public-profile tests pass 2 files/8 tests; full suite passes 34 files/167 tests; TypeScript, project check, and production build pass.
- [x] Localize the active instructor account-settings shell and setup-needed status with existing English–Urdu–Arabic catalogue keys while preserving protected profile persistence and disabled provider actions. Focused instructor/settings coverage passes 3 files/10 tests; full suite passes 34 files/167 tests; TypeScript, project check, and production build pass.
- [x] Replace protected learner requirement detail/match-preview fallback to the first demo request with an honest unavailable state when the requested record is not connected, while preserving public demo catalogue disclosures and real Supabase save boundaries. Response comparison now hydrates the published Supabase requirement and returns a localized unavailable state; focused requirements tests pass 2 files/11 tests and full suite passes 34 files/167 tests.
- [x] Replace the protected instructor response form’s fallback to the first demo requirement with published Supabase requirement hydration and an honest unavailable state, preserving protected response submission and public demo disclosures. Focused requirements coverage passes 2 files/11 tests; full suite passes 34 files/167 tests; TypeScript, project check, and production build pass.
- [x] Localize the still-mounted instructor course list and builder headings, labels, loading/empty/media/publishing boundary copy across English, Urdu, and Arabic using typed courseStudio keys without changing Supabase persistence, RLS, currency, or provider behavior. The active instructor list and builder now reuse typed courseStudio/common keys; full 34-file/167-test suite, TypeScript, and production build pass.
- [x] Replace the mounted TutorDetail demo instructor fallback with the existing public Supabase instructor-by-slug query and honest loading/not-found states, preserving public-field privacy, trial CTA context, and setup-needed messaging. The route now reuses PublicInstructorProfile; full 34-file/167-test suite, TypeScript, and production build pass.
- [x] Remove the mounted `/logout` route’s legacy demo localStorage mutation and keep logout behavior owned by the real Supabase Auth session boundary, with focused regression coverage and no changes to RLS or provider configuration. The route no longer mutates browser storage; focused Supabase Auth boundary tests pass 2/2.
- [x] Hifz Tracker slice: replace remaining hardcoded learner Hifz frame, record section/status, and reminder boundary labels with existing typed English–Urdu–Arabic Hifz catalogue keys; preserve Supabase procedures, learner ownership, instructor review controls, private references, and setup-needed reminders. Implemented shared-frame and learner record section/status localization; focused Hifz suite passes 3 tests, full suite passes 35 files/170 tests, strict TypeScript and production build pass, and source/privacy checks pass. Reminder delivery and signed identity matrix remain setup-needed.
- [x] Perform the requested read-only consolidated LMS audit against current files, routes, Supabase/PostgreSQL, Auth/RLS/Storage, providers, AI Tutor, currency, localization, accessibility, SEO, performance, tests, deployment, and remaining fallbacks; do not modify implementation artifacts. Report written externally on 29 August 2026 from current repository and validation evidence; no application implementation artifacts were changed.
- [x] Implement the complete scoped Islamic Language Learning AI Tutor: server-only approved-provider adapter boundary, protected Supabase conversations/preferences/progress/saved-items/reports, course grounding allowlist, safety/privacy/usage controls, English–Urdu–Arabic UI and RTL/LTR workspace, focused tests, validation, evidence documentation, and checkpoint; do not modify currency, payments, classroom, scheduling, Hifz, or unrelated modules. Added the server-only optional Gemini adapter, published course/lesson grounding allowlist, provider failure/setup-needed handling, focused provider/grounding tests, and evidence documentation. Current Gemini smoke test is setup-needed because no approved key/model is configured; full validation passes 37 files/177 tests, TypeScript, check, build, and client secret scan.
- [x] Validate newly supplied server-only Gemini values with a lightweight metadata check, reload the server, run safe English–Urdu–Arabic real generation smoke, and document non-secret outcomes; keep provider setup-needed if generation access fails and do not expose credentials. Both values are present; `gemini-2.5-flash` metadata returned HTTP 200 and listed `generateContent`, while all three real generations returned safe `failed` status with HTTP 404/`NOT_FOUND`; no key, response body, or generated content was exposed.
- [x] Verify configured Gemini text-generation model availability without exposing secrets; change only the server-side GEMINI_MODEL secret if gemini-3.7-flash is explicitly accessible, then reload and run redacted English–Urdu–Arabic smoke tests while preserving setup-needed behavior on failure. The key-listed model set contained 39 generateContent identifiers including gemini-3.7-flash; only GEMINI_MODEL was updated, server reloaded, and all three smoke calls returned safe failed status with redacted generation HTTP 403. No credentials or response bodies were exposed.
- [x] Diagnose the redacted Gemini HTTP 403 permission boundary for server-only gemini-3.7-flash: verify model metadata, generateContent request shape, documented x-goog-api-key usage, and safe provider status; identify the exact Google/project setting to correct, preserve setup-needed state, and rerun validation/smoke only after owner correction. Metadata returned HTTP 200 with 39 generation-capable models; generation returned HTTP 403 `PERMISSION_DENIED`; request shape and x-goog-api-key were verified; owner-side project/API restriction, server application restriction, key type/status, billing/quota/region, and organization-policy checks were documented. Full validation passes 40 files/180 tests, with 3 skipped; TypeScript, check, build, and client secret scan pass.
- [x] Redesign only the Noor Ilm LMS visual UI/UX: premium Quiet Geometry branding, imagery, typography, spacing, cards, badges, dashboards, course screens, tutor marketplace, Hifz, AI Tutor, responsive desktop/tablet/mobile, RTL/LTR, accessibility, and states; preserve all routes, queries, mutations, Auth, RLS, Storage, provider logic, and real data flows. Changed only `client/src/App.tsx`, `client/src/index.css`, `client/src/components/DashboardOverview.tsx`, and `client/src/components/HifzTrackerExperience.tsx`; added no new backend/data logic. Reused existing hero/course/tutor imagery and introduced one refined Concept 1 logo asset. Validation: 40 test files/180 passed/3 skipped, TypeScript, check, build, desktop/mobile captures, and source-scope scan pass.
- [x] Package the current stable Noor Ilm LMS for Claude Code in a private GitHub repository: validate TypeScript/tests/build, audit secret/generated-file exclusion, maintain a value-free `.env.example`, add a professional README, push a clearly named stable branch, and verify remote privacy and commit provenance without changing application behavior. Pushed private `MuhammadZeeshanAkhtar/noor-ilm-lms` branch `noor-ilm-stable` at commit `3a5c0b0eb9408fb2292f20beee19a06d92e3c37b`; 40 test files/180 passed/3 skipped, TypeScript, check, and build pass; secret-signature and generated-path scans are clean. A populated environment file was not created; the managed environment safeguard also blocked direct creation of `.env.example`, so variable names and security instructions are documented in README.md instead.
