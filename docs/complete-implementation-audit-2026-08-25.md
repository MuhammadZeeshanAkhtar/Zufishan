# Noor Ilm LMS — Complete Evidence-Based Implementation Audit

**Audit date:** 25 August 2026  
**Audit mode:** Read-only inspection of the current repository, active route source, migrations, service boundaries, tests, build output, runtime logs, and deployment metadata. No implementation, database, migration, Supabase configuration, Auth, RLS, Storage, or environment changes were made for this audit. The project checklist received an audit-tracking entry only.

## Audit method and evidence standard

This report distinguishes implementation evidence from claims in previous reports. A source file or migration is treated as an implementation artifact, not as proof that the corresponding production feature is active. A feature is marked **complete and verified** only when the inspected source, an appropriate test or live check, and the relevant route or service boundary agree. A UI placeholder, demo/localStorage repository, migration file, or documentation-only design is not counted as a connected production feature.

Evidence was inspected in `client/src/App.tsx`, `client/src/components/`, `client/src/contexts/`, `client/src/lib/`, `server/`, `supabase/migrations/`, `package.json`, `client/index.html`, `.project-config.json`, current build output, and `.manus-logs/`. Existing non-mutating validation was rerun: `pnpm check`, `pnpm test`, and `pnpm build`.

## Executive conclusion

Noor Ilm is a substantial **LMS product foundation and presentation-ready prototype** with real Supabase-oriented server boundaries. Its public discovery, authentication screens, dashboards, requirements, course, instructor, classroom, messaging, review, administration, scheduling, AI Tutor, and multilingual surfaces exist in the active route graph. The current implementation is not yet safe to treat as a production marketplace, paid tutoring service, or live classroom system because several critical domains remain demo-only, setup-needed, or not proven with signed multi-identity integration tests.

The strongest verified areas are the route/UI foundation, Supabase client/server boundaries, additive migration artifacts, RLS policy design in migrations, private Storage policy design, scheduling conflict constraints, AI Tutor safety boundaries, and automated regression coverage. The largest gaps are current-database catalog/RLS re-verification, real cross-user and cross-role tests, complete replacement of demo repositories, live classroom/Realtime, messaging persistence, payments/payouts, credential/media verification, Hifz tracking, and complete English–Urdu–Arabic coverage across every private route.

## Weighted completion methodology

The percentages below are ranges rather than single optimistic scores. Each range reflects uncertainty where a source artifact exists but live provider, identity, or database execution evidence is absent. Weights are assigned by product risk and scope rather than by counting routes equally.

| Completion view | Weighted categories | Estimate | Interpretation |
|---|---|---:|---|
| Visual/demo completion | Public discovery 15%; auth/onboarding 10%; learner/instructor/admin dashboards 20%; course/requirements/trial/scheduling flows 20%; classroom 10%; messaging/reviews/operations 10%; AI Tutor 5%; responsive/accessibility/SEO presentation 10% | **72–82%** | Most requested screens and flows are present and visually coherent, but several are explicitly demo/setup states and some private surfaces remain English-only or only partially localized. |
| Assigned production LMS completion | Auth/profile 10%; PostgreSQL/RLS procedures 15%; private Storage 8%; requirements/courses/progress 15%; scheduling 15%; classroom/Realtime 12%; messaging/reviews 10%; ledger/payments/payouts 8%; admin/audit/security/testing 7% | **42–55%** | Core boundaries and many data models exist, but production readiness is limited by unverified live RLS identities, demo repositories, absent providers, and incomplete connected UI. |
| Full manager-approved scope | Assigned production LMS 70%; Language Learning AI Tutor 12%; complete three-locale/RTL coverage 12%; final linguistic/accessibility certification 6% | **38–50%** | AI Tutor foundations are present, while complete multilingual coverage and provider/integration validation remain incomplete. |

These ranges should not be added together. They answer different questions: what can be shown, what is connected enough for production hardening, and how much of the complete approved product is actually finished.

## Table 1 — Executive scorecard

| Area | Required scope | Verified status | Evidence | Completion estimate | Remaining work | Priority |
|---|---|---|---|---:|---|---|
| Public discovery | Tutor/course/requirement discovery, filters, detail, trial entry | Partial/demo-only | Active public routes and `App.tsx`, `RequirementsExperience.tsx`, course/instructor data modules | 75–85% | Replace demo repositories with verified public Supabase queries; complete filter dimensions and live ratings/availability | P1 |
| Auth and onboarding | Real signup/login/logout/reset/verification, role/profile bootstrap | Implemented but needs testing | `AuthContext.tsx`, `supabase-auth.ts`, auth migrations, live health assertions | 60–75% | Test real credentials, email verification, reset links, role metadata, profile bootstrap, expiry, and cross-role cases | P0 |
| LMS persistence | Profiles, requirements, courses, modules, lessons, enrolments, progress | Partial/implemented but needs testing | `supabase-core.ts`, migrations `0001`/`0002`, protected tRPC procedures | 50–70% | Connect all mounted UI, verify current catalog, run signed CRUD/ownership tests, remove demo/persistent mixing | P0 |
| Private Storage | Credentials, instructor media, course media, classroom resources | Setup-needed/implemented boundary | Migration `0004`, `supabase-storage.ts`, Storage tests | 55–70% | Re-verify active buckets/policies and exercise signed upload/download/delete with separate identities | P0 |
| Scheduling | Availability, timezone conversion, trial, booking, conflicts, sessions, notifications | Implemented boundary; needs signed testing | Migration `0008`, `scheduling.ts`, `scheduling-atomic.ts`, Scheduling UI | 55–70% | Staging fixtures, race tests, admin session operations, full locale migration, email/calendar/push | P0 |
| Classroom | Provider boundary, waiting room, White Board, Quran/Qaida, resources, attendance, archive | Partial/demo-only/setup-needed | `ClassroomExperience.tsx`, classroom contracts/tests, private Storage policies | 25–40% | Connect approved video/Realtime provider, synchronized board/chat, attendance, consent, retention, recording archive | P0 |
| Messaging and notifications | Persistent conversations/messages, unread/read, in-app/email/push | Partial/demo-only | Relationship UI/contracts, notifications tables and scheduling notification boundary | 25–40% | Connect conversation/message UI to real persistence, Realtime, email delivery, push channel, recipient-locale templates | P1 |
| Reviews and moderation | Eligible reviews, duplicate prevention, reports, moderation, public publication | Partial/implemented boundary | Relationship operations, review/report routes, review tests, moderation tables | 45–60% | Verify persistence, eligibility against completed sessions, moderation workflow, public published-only data | P1 |
| Ledger/payments/payouts | USD/currency, fees, payment state, refunds, disputes, withdrawals | Setup-needed/demo-only | `RelationshipOpsExperience.tsx`, ledger/payment/withdrawal models and tests | 15–30% | Select payment/payout provider, webhooks, reconciliation, refunds, disputes, ledger truth, withdrawal verification | P0 |
| Administration | Users, roles, instructors, courses, sessions, reports, billing, analytics, settings, audit | Partial/demo-only | `AdminExperience.tsx`, admin route guards, admin tests, admin tables | 45–60% | Connect read/write admin procedures and audit persistence; verify least privilege against real identities | P0 |
| AI Tutor | Language practice, vocabulary, grammar, reading/writing, translation, pronunciation boundary, safety | Implemented boundary; needs provider/integration testing | `ai-tutor.ts`, `AITutorExperience.tsx`, migrations `0005`/`0007`, AI tests | 55–70% | Verify provider call, usage limits, progress/saved-item persistence, signed privacy tests, pronunciation provider | P1 |
| Multilingual/RTL | Complete English/Urdu/Arabic UI and RTL/LTR across all routes | Partial | `catalog.ts`, `LocaleContext.tsx`, `LocaleSelector.tsx`, selected public/AI Tutor/requirements surfaces | 35–50% | Migrate dashboards, classroom, messaging, admin, builder, reviews, billing; native-speaker review; complete key coverage | P1 |
| Quality and deployment | Tests, build, SEO, responsive, accessibility, deployment | Implemented but needs human certification | 91 passing tests, clean TypeScript/build, metadata, live domain | 65–80% | Full route automation, assistive-technology certification, performance measurement, current DB/RLS recheck | P1 |

## Table 2 — Requirement-by-requirement matrix

| Source | Requirement | Exact evidence | Status | Percentage | Blocker | Recommended action |
|---|---|---|---|---:|---|---|
| Noor Ilm LMS | Learner/instructor registration and onboarding | `/login`, `/signup`, `/onboarding/learner`, `/onboarding/instructor`, `/onboarding/profile`; `AuthContext.tsx` | Implemented but needs testing | 70% | Real credential and email flows not exercised | Create isolated staging identities and test the complete Auth matrix |
| Noor Ilm LMS | Learner preferences, language, country, timezone, goals, privacy | Profile/onboarding models, `preferred_locale` migration, locale context | Partial | 55% | Several fields remain local/demo and profile sync is narrow | Connect canonical profile CRUD and privacy preferences through RLS |
| Noor Ilm LMS | Learner dashboard | `/dashboard/learner`, `DashboardOverview.tsx` | Partial/demo-only | 65% | Dashboard data modules still include demo paths | Replace each card’s source with signed Supabase queries |
| Noor Ilm LMS | Requirements with subject/language/level/timezone/goal/budget/privacy/moderation | `/requirements`, `/requirements/:id`, learner requirement routes, `RequirementsExperience.tsx`, `requirements-data.ts` | Partial/implemented boundary | 60% | UI is localized in mounted public route, but signed persistence and all fields need proof | Run learner-owned CRUD, moderation, and cross-user tests |
| Noor Ilm LMS / Qutor | Tutor search and filters | `/teachers`, subject/female routes, instructor data modules | Partial/demo-only | 55% | Ratings, credentials, availability, rates, country/timezone are not all live-backed | Add privacy-safe public Supabase search/read procedure and indexes |
| Noor Ilm LMS / Qutor | Public instructor profile | `/teachers/:slug`, `/teachers/:slug/reviews`, profile components | Partial/demo-only | 60% | Ratings/session history/video/trust data are placeholders or demo | Connect published profile projection and approved media/status data |
| Noor Ilm LMS | Instructor verification and credentials/media | `/dashboard/instructor/credentials`, `/verification`, `supabase-storage.ts`, `instructor_credentials`/`instructor_media` | Setup-needed | 40% | Signed Storage and verification workflow not live-tested | Exercise private uploads and moderator review using real identities |
| Noor Ilm LMS | Instructor dashboard/profile/availability | Instructor dashboard routes, `InstructorManagement.tsx`, scheduling service | Partial/implemented boundary | 60% | UI cutover and signed ownership tests are incomplete | Complete profile/availability CRUD and cross-role tests |
| Noor Ilm LMS | Courses/modules/lessons/builder/preview/moderation | Instructor course routes, `CourseManagementExperience.tsx`, course tables | Partial/implemented boundary | 65% | Media, moderation, and all UI persistence are not verified live | Run instructor-owned course CRUD and published-only public reads |
| Noor Ilm LMS | Enrolment/progress/assignments/certificates | Learner course routes and `supabase-core.ts` boundaries | Partial | 45% | Assignments/certificates are foundations/placeholders; signed progress not fully exercised | Add end-to-end learner enrolment/progress fixture tests |
| Noor Ilm LMS / Qutor | Trial request lifecycle | `/trial/request`, trial dashboard/detail routes, `scheduling.ts` | Implemented boundary; needs testing | 65% | No real staging actor matrix | Test request, accept, reject, propose, confirm, cancel, expiry, and stale status |
| Noor Ilm LMS / Qutor | Recurring availability/timezone/conflicts | Migration `0008`, availability procedures, atomic helper, exclusion constraints | Implemented but needs testing | 65% | Current DB catalog and race fixtures not rechecked in audit | Run concurrent confirmation tests against staging PostgreSQL |
| Noor Ilm LMS / Qutor | Session creation/attendance/history | `class_sessions`, `class_participants`, classroom/scheduling services | Partial | 40% | Attendance/live/completion and recording are provider/setup boundaries | Connect class provider and server-validated attendance lifecycle |
| Noor Ilm LMS | Browser classroom | Classroom routes, `ClassroomExperience.tsx`, classroom tests | Setup-needed | 30% | No approved video/Realtime provider | Select and connect provider with consent/retention policy |
| Noor Ilm LMS / Qutor | Messaging/notifications | Message routes, conversations tables, notifications tables, relationship components | Partial/demo-only | 30% | Real persistence/Realtime/email not verified | Connect RLS-backed message procedures and notification delivery |
| Noor Ilm LMS / Qutor | Reviews/reporting/moderation | Review/report routes, relationship tests, moderation tables | Partial | 50% | Live eligible completed-session records not tested | Add signed eligibility and moderation integration tests |
| Noor Ilm LMS / Qutor | Ledger/earnings/withdrawals | Ledger/payment/withdrawal models and admin/instructor routes | Setup-needed | 20% | No payment/payout provider or webhook | Define commercial model and connect verified provider |
| Noor Ilm LMS | Admin operations and audit | `/admin/*`, `AdminExperience.tsx`, admin guards/tests, admin tables | Partial/demo-only | 50% | Real admin identities and persistent mutations not tested | Run super-admin/moderator/finance least-privilege matrix |
| Manager-approved addition | Language Learning AI Tutor | `/dashboard/learner/ai-tutor*`, `ai-tutor.ts`, migrations `0005`/`0007` | Implemented boundary; needs testing | 60% | Provider and signed privacy/usage integration not exercised | Connect approved provider and run privacy/limit/usage fixtures |
| Multilingual requirement | Complete English/Urdu/Arabic website | Locale catalogue/context/selector plus selected public/AI Tutor/requirements surfaces | Partial | 40% | Private routes and many components still contain English strings | Complete route-by-route key migration and native review |
| Multilingual requirement | Persist language after refresh/login | `LocaleContext.tsx`, `preferred_locale` migration and profile update procedure | Implemented but needs testing | 65% | Real profile sync and refresh/login not tested with credentials | Test signed profile update and session restoration |
| Multilingual requirement | RTL/LTR behavior | document direction in `LocaleContext.tsx`, logical CSS utilities, selected screenshots | Partial | 55% | Full private-route visual matrix and assistive certification absent | Capture all route groups at 320/375/768/1024/1280 and review with native speakers |
| Broader specification | Prayer/Qibla/Hijri/Dua/Tasbih/Zakat/Fatwa/marketplace/community/mosque/events/donations/general religious AI | No active implementation evidence in the LMS route graph; AI Tutor explicitly redirects religious-ruling topics | Out of scope | 0% assigned | These are other-team or excluded modules | Do not add to LMS unless scope is explicitly reassigned |

## Table 3 — Route audit

The route registry was inspected in `client/src/App.tsx`. The table groups deterministic route families where they share the same guard and component boundary; parameterized routes are shown explicitly where their data boundary differs.

| Route | Role | Purpose | Connected data source | Auth requirement | RLS requirement | Translation status | Mobile status | Final status |
|---|---|---|---|---|---|---|---|---|
| `/` | Public | Homepage/discovery CTA | Homepage/demo content | Public | None/public projection | EN/UR/AR launch copy | Verified representative mobile | Partial/demo-ready |
| `/how-it-works`, `/help/lms` | Public | Product explanation/help | Static content | Public | None | Present; not fully automated | Partial |
| `/teachers`, `/teachers/female`, `/teachers/subject/:subject` | Public | Instructor directory/filter | Instructor demo/public boundary | Public | Published profile projection | Partially localized | Public responsive pass | Partial/demo-only |
| `/teachers/:slug`, `/teachers/:slug/reviews` | Public | Instructor profile/reviews | Public instructor boundary/review demo | Public | Published profile/review policies | Partially localized | Representative profile checked | Partial |
| `/requirements` | Public | Requirement marketplace | `RequirementsExperience`, public requirements boundary | Public | Published/privacy policy | EN/UR/AR mounted route | RTL mobile checked | Partial/implemented boundary |
| `/requirements/:id` | Public | Requirement detail | Requirement service/demo fallback | Public | Privacy-safe detail policy | Partial | Checked with public routes | Partial |
| `/enrol/:courseId` | Learner/public entry | Enrolment gate | Course/enrolment boundary | Signed learner for write | Course/enrolment ownership | Partial | Not fully route-automated | Partial |
| `/trial/request`, `/trial/request/success` | Learner | Trial request | Real scheduling procedures with demo fallback | Signed learner for persistence | Learner insert/relationship RLS | Partial scheduling copy | Protected guard checked | Partial/implemented boundary |
| `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/verify-email`, `/logout` | Public/auth | Auth lifecycle | Supabase Auth or demo fallback | Public entry | Auth provider/profile policies | Auth launch copy translated | Mobile screenshots checked | Implemented but needs testing |
| `/onboarding/learner`, `/onboarding/instructor`, `/onboarding/profile` | Authenticated/new account | Profile onboarding | Auth metadata/local draft plus profile boundary | Signed account | Profile ownership | Partial | Not fully automated | Partial |
| `/dashboard/learner` | Learner | Overview | Dashboard service plus demo data | Learner | User-owned dashboard tables | Mostly English/partial | Protected guard checked | Partial/demo-only |
| `/dashboard/learner/requirements*` | Learner | Requirement CRUD/responses | Requirements service/demo and Supabase procedures | Learner | Requirement ownership/response RLS | Partial | Protected route | Partial |
| `/dashboard/learner/courses`, `/dashboard/learner/courses/:courseId`, `/dashboard/learner/lessons/:lessonId` | Learner | Enrolment/workspace/progress | Course/progress boundaries plus demo | Learner/enrolled | Enrolment/course/progress RLS | Partial | Protected route | Partial |
| `/dashboard/learner/trial-lessons*`, `/dashboard/learner/schedule`, `/dashboard/learner/bookings`, `/dashboard/learner/sessions` | Learner | Scheduling/session history | `scheduling.ts`, `SchedulingExperience.tsx` with fallback | Learner | Trial/booking/session participant RLS | Legacy English remains | Protected guard and narrow mobile check | Partial/implemented boundary |
| `/dashboard/learner/classrooms`, `/classroom/:sessionId/*` | Learner | Waiting room/classroom/resources/archive | Classroom contracts/demo and Storage boundary | Learner participant | Session/resource/chat RLS | Partial | Classroom mobile/RTL foundation checked | Setup-needed |
| `/dashboard/learner/messages*`, `/reports`, `/reviews*`, `/wallet`, `/notifications`, `/archives` | Learner | Communication/reviews/operations | Relationship/admin demo boundaries | Learner | Conversation/review/report/finance RLS | Partial | Protected guard | Partial/demo-only |
| `/dashboard/learner/ai-tutor*` | Learner | AI language practice | `ai-tutor.ts` and AI tables | Learner | AI conversation/message/progress RLS | AI Tutor launch copy partial | Mobile/RTL route guard checked | Implemented boundary; provider setup-needed |
| `/dashboard/instructor` | Instructor | Overview | Dashboard/instructor demo services | Instructor | Instructor-owned data RLS | Partial | Protected guard | Partial/demo-only |
| `/dashboard/instructor/profile*`, `/credentials`, `/verification`, `/test`, `/training` | Instructor | Profile and verification | Instructor data plus Storage boundary | Instructor | Profile/credential/media RLS | Partial | Protected route | Partial/setup-needed |
| `/dashboard/instructor/availability` | Instructor | Availability CRUD | `scheduling.ts`, instructor editor | Instructor | Instructor availability ownership | Partial | Protected route | Implemented boundary; needs signed testing |
| `/dashboard/instructor/requirements*`, `/courses*`, `/courses/:courseId/*` | Instructor | Respond to requirements/course builder | Requirements/course service and demo modules | Instructor | Instructor ownership/moderation RLS | Partial | Protected route | Partial |
| `/dashboard/instructor/trial-requests*`, `/schedule`, `/bookings`, `/sessions` | Instructor | Trial/booking/session management | Scheduling service and atomic confirmation | Instructor | Instructor relationship/session RLS | Legacy English remains | Protected guard and narrow mobile check | Partial/implemented boundary |
| `/dashboard/instructor/classrooms`, `/classroom-demo` | Instructor | Teaching/classroom shell | Classroom contracts/provider boundary | Instructor participant | Session/resource/chat RLS | Partial | Classroom mobile/RTL foundation checked | Setup-needed |
| `/dashboard/instructor/messages*`, `/reports`, `/reviews`, `/billing`, `/withdrawals`, `/notifications` | Instructor | Communication/reviews/earnings | Relationship/admin demo boundaries | Instructor | Private conversation/finance RLS | Partial | Protected route | Partial/setup-needed |
| `/admin`, `/admin/*` | Moderator/admin/super-admin | Operations and moderation | `AdminExperience.tsx`, admin boundaries/demo states | Admin role | Admin least-privilege RLS | Mostly English/partial | Admin RTL override removed; full matrix pending | Partial/demo-only |
| `/settings/profile`, `/settings/:section` | Authenticated | Preferences/settings | Local/profile boundaries | Authenticated | Profile/settings RLS | Partial | Protected | Partial |
| Unknown routes / `NotFound` | Any | Safe fallback | No data | Public | None | Partial | Responsive | Implemented safe boundary |

## Table 4 — Backend audit

| Domain | Table(s) | Migration | Server procedure/service | RLS policy | Storage need | UI connected | Real test result | Status |
|---|---|---|---|---|---|---|---|---|
| Identity/profile | `profiles`, `user_roles`, `learner_profiles`, `instructor_profiles` | `0001`, `0002` | `supabase-auth.ts`, `supabase-core.ts`, router profile procedures | Ownership/admin policies in `0002` | No | Partial | Auth health and helper tests pass; real signup/profile matrix not run | Implemented but needs testing |
| Requirements | `learner_requirements`, `requirement_responses`, `learner_shortlists` | `0001`, `0002` | `supabase-core.ts`, requirements router boundaries | Learner/instructor/public/moderation policies | No | Partial | Static/domain tests pass; signed CRUD not run | Partial |
| Instructor availability | `instructor_availability` | `0001`, `0002`, `0008` | `scheduling.ts` availability procedures | Instructor ownership policies | No | Instructor editor connected | Unit/domain tests pass; signed CRUD not run | Implemented boundary |
| Trials | `trial_requests` | `0001`, `0002`, `0008` | `scheduling.ts`, `scheduling-atomic.ts` | Learner/instructor relationship policies | No | Trial form/list/detail connected with fallback | Transition/domain tests pass; staging lifecycle not run | Implemented boundary |
| Bookings | `bookings` | `0008` | Atomic PostgreSQL confirmation | Party/moderator policies in `0008` | No | Schedule/bookings connected with fallback | Migration/atomic setup tests pass; live race not run | Implemented but needs testing |
| Sessions/participants | `class_sessions`, `class_participants`, `class_attendance` | `0001`, `0002`, `0008` link | Scheduling/classroom boundaries | Membership/participant policies | Classroom resources need Storage | Partial | Classroom boundary tests pass; live session provider absent | Partial/setup-needed |
| Courses | `courses`, `course_modules`, `lessons` | `0001`, `0002` | `supabase-core.ts`, course router | Instructor ownership/public publication/moderation | Course media bucket | Partial | Course ownership/moderation tests pass; live CRUD not run | Partial |
| Enrolment/progress | `enrolments`, `lesson_progress`, assignments/quizzes/certificates | `0001`, `0002` | Core/course procedures | Learner enrolment/progress policies | Lesson files may need Storage | Partial | Domain tests pass; live enrolment/progress not run | Partial |
| AI Tutor | `ai_tutor_preferences`, `ai_tutor_conversations`, `ai_tutor_messages`, `ai_tutor_progress`, `ai_tutor_saved_items`, `ai_tutor_reports` | `0005`, `0007` | `ai-tutor.ts` and router AI namespace | 17 policies/6 RLS statements in `0005` | No required file Storage | Learner route connected; instructor/admin views setup-needed | AI safety/migration tests pass; provider/live privacy not run | Implemented boundary |
| Messaging | `conversations`, `conversation_members`, `messages` | `0001`, `0002`, `0003` | Relationship/demo service boundaries | Membership recursion fix and conversation policies | Attachments setup-needed | Partial/demo | Authorization/message safety tests pass; live Realtime not run | Partial |
| Notifications | `notifications`, `notification_preferences` | `0001`, `0002`, `0008` locale/idempotency | Scheduling notification helper and admin/demo boundaries | Recipient/private policies | No | Partial | Idempotency/domain assertions pass; email/push not run | Partial/setup-needed |
| Reviews/reports | `reviews`, `review_reports`, `reports`, `moderation_cases`, `moderation_actions` | `0001`, `0002` | Relationship/admin boundaries | Eligibility/public publication/moderation policies | No | Partial | Review/report/moderation unit tests pass; live records not run | Partial |
| Ledger/payments | `session_ledger`, `payment_references`, `withdrawal_requests` | `0001`, `0002` | Relationship/admin boundary placeholders | Finance/admin policies | No | Demo/setup screens | Currency/payment boundary tests pass; provider/webhooks absent | Setup-needed |
| Admin/audit | `admin_settings`, `audit_logs`, admin tables | `0001`, `0002` | Admin operations boundaries | Admin/super-admin/append-only policies | No | Demo/setup operations views | Admin guard/least-privilege tests pass; live identities not run | Partial |
| Private media | Supabase `storage.objects` | `0004` | `supabase-storage.ts` | 16 bucket-object policies | Four private buckets: credentials, instructor media, course media, classroom resources | Upload UI is incomplete/setup-needed | File validation/path tests pass; signed live upload/download not run | Setup-needed |
| Global RLS | 39 canonical tables plus AI Tutor/booking additions | `0002`, `0005`, `0008` | Bearer Supabase user client | Migration declares 46 RLS enable statements and 135 policy statements across listed files | N/A | N/A | Static policy/migration tests pass; current catalog not re-queried in this audit | Needs current DB verification |

## Table 5 — Multilingual audit

| Route/area | English | Urdu | Arabic | RTL/LTR | Persistence | Missing keys | Status |
|---|---|---|---|---|---|---|---|
| Public homepage/header/footer | Verified | Verified representative screens | Verified representative screens | Direction provider and logical utilities | Local locale; profile sync when authenticated | Lower-priority static copy may remain | Partial/strongest area |
| Authentication | Verified | Verified mobile screenshot | Verified mobile screenshot | RTL direction applied | Local/profile path | Some errors/status strings remain to certify | Partial |
| Course catalogue/detail | Verified | Partially verified | Partially verified | Public RTL checks performed | Demo/public data | Full course detail key coverage not proven | Partial |
| Instructor directory/profile | Verified | Partially verified | Partially verified | Public RTL checks performed | Demo/public data | Reviews/trust/media strings | Partial |
| Requirements listing/detail/form/response | Verified | Verified mounted route pass | Verified mounted route pass | Narrow RTL checked | Real procedure when signed; fallback otherwise | Legacy detail/status strings possible | Partial/implemented tranche |
| Learner dashboard | Verified | Selector available; broad coverage not proven | Selector available; broad coverage not proven | App direction inherited | Local/profile preference | Many component literals | Partial |
| Instructor dashboard/availability | Verified | Broad coverage not proven | Broad coverage not proven | App direction inherited | Profile locale path | Scheduling legacy strings | Partial |
| Admin panel | Verified | Broad coverage not proven | Broad coverage not proven | Admin forced-LTR override removed | Demo/setup | Most admin operations copy | Partial |
| Classroom | Verified | Broad coverage not proven | Broad coverage not proven | Classroom RTL foundation only | Provider/setup state | Controls/resources/chat/archive | Partial/setup-needed |
| Messaging/notifications/reviews/billing | Verified | Not fully verified | Not fully verified | Global direction only | Mostly demo/setup | Most user-facing strings | Partial |
| AI Tutor | Verified | Setup headings/language controls supported | Setup headings/language controls supported | App direction inherited | AI response/explanation languages persisted by server boundary | Full conversation/progress copy | Partial/implemented boundary |
| Locale persistence | Verified fallback | Profile field supported | Profile field supported | `document.lang`/`dir` | `preferred_locale` migration and profile procedure | Live refresh/login identity test | Implemented but needs testing |

The selector is not counted as complete multilingual coverage. The actual evidence supports a launch-surface and selected public-route tranche, not the requested all-dashboard/all-route completion.

## Table 6 — Security audit

| Area | Test | Result | Evidence | Severity | Remaining action |
|---|---|---|---|---|---|
| Server TypeScript | `pnpm check` | Passed | Current validation run | Low | Keep in CI |
| Automated regression | `pnpm test` | **91 tests passed, 19 files** | Current validation run | Medium | Add signed integration suites rather than relying only on domain tests |
| Production build | `pnpm build` | Passed with non-blocking large-chunk warning | Vite and esbuild output | Low/Medium | Split client bundle and measure performance |
| PostgreSQL reachability | `select 1` through `SUPABASE_DB_URL` | Passed in existing live DB test | `supabase-db-connection.test.ts` | High if absent; currently positive | Run current catalog/RLS verification in the next controlled staging task |
| Browser-safe Supabase Auth health | Auth health endpoint | Passed in existing connection suite with HTTP 200 | `supabase-connection.test.ts` | Medium | Exercise real signup/login/reset/verification with isolated identities |
| Service-role exposure | Browser source check | Passed | `supabase-client.ts` contains no service-role symbol; server-only admin helper exists | High | Add a built-bundle scan to CI and keep server/client imports separated |
| Bearer identity | Server authorization boundary | Implemented in source; helper tests pass | `supabase-auth.ts`, protected tRPC boundary | High | Run signed cross-user and cross-role requests |
| RLS current activation | Catalog/policy query | **Not re-run in this audit** | Migration files declare RLS/policies; no current catalog query was executed | Critical | Re-run read-only catalog and policy queries against staging |
| Cross-user access | Learner/instructor/admin identity matrix | **Not tested** | No separate staging identities were available in audit evidence | Critical | Create isolated identities and test every private domain |
| Private Storage | Signed upload/download/delete | **Not tested live** | Static path/file tests pass; migration declares policies | Critical | Exercise all four buckets with owner/non-owner/admin cases |
| Open redirects | Internal return target validation | Covered by auth boundary tests | `auth.boundaries.test.ts`, `auth-models.ts` | High | Keep URL allowlist regression tests |
| Demo identity impersonation | Reserved demo actor checks | Covered | Classroom tests | High | Keep demo accounts isolated from public signup |
| Prompt injection/unsafe AI | Classification and sanitization | Covered at unit level | `ai-tutor.test.ts`, `ai-tutor.ts` | High | Add provider integration and adversarial fixture review |
| Privacy/logging | Secret and context minimization | Partially covered | AI context sanitizer, connection tests | High | Audit production logs and add explicit no-private-transcript admin tests |
| Financial integrity | Payment/payout/webhook/reconciliation | Not implemented | Demo/setup boundaries and tests explicitly avoid claims | Critical | Do not process real money until provider and ledger reconciliation exist |
| Classroom safety | Provider/permissions/recording/consent | Setup-needed | Classroom tests intentionally assert unavailable provider | Critical | Connect provider and server-side attendance/consent boundaries |
| Historical runtime errors | Console/server log inspection | Historical errors present; current TypeScript clean | `.manus-logs` contains prior scheduling TransformErrors at 10:23 and 10:27; latest dev server reports no TypeScript errors | Medium | Clear/rotate stale logs only in a normal maintenance task and recheck after next edits |

## Table 7 — Remaining work roadmap

| Priority | Task | Source requirement | Why it matters | Dependency | Estimated effort category | Status |
|---|---|---|---|---|---|---|
| P0 | Current Supabase catalog/RLS/Storage re-verification | A.26; mandatory checks 129–132 | A migration file is not proof of active production policy | Read-only staging DB access | Small–Medium | Required |
| P0 | Signed identity matrix across learner/instructor/moderator/finance/admin/super-admin | A.26; mandatory check 131 | Prevents cross-user/private-data leaks | Isolated staging accounts | Medium | Blocked by identities |
| P0 | Replace demo/localStorage repositories domain by domain | Audit rules 5 and 7 | Demo records must not mix with production records | Signed procedures and fixtures | Large | In progress |
| P0 | Live classroom, Realtime, attendance, recording consent/retention | A.21–22; B.36–38 | Screens do not create a real class | Provider selection and Storage | Large | Setup-needed |
| P0 | Payments, payouts, withdrawals, refunds, disputes, reconciliation | A.24; B.40 | Financial screens are not payment integrations | Commercial model/provider | Large | Missing/setup-needed |
| P1 | Persist messaging and connect Realtime/email/push | A.22; B.37 | Communication is core marketplace functionality | RLS and provider choices | Medium–Large | Partial |
| P1 | Complete multilingual migration across all private routes | E.58–65 | Home-only/selected-route selector is insufficient | Catalogue expansion and native review | Large | Partial |
| P1 | Credential/Ijazah/media upload and verification | A.14; mandatory check 141 | Trust and instructor approval depend on it | Storage live verification/admin workflow | Medium–Large | Setup-needed |
| P1 | Hifz tracker with Sabaq/Sabqi/Manzil, approvals, charts, reminders | Mandatory check 140 | Explicit LMS gap | Product/data design, notifications | Medium–Large | Missing |
| P1 | Approved Quran/Qaida licensing/content/audio status | Mandatory check 142 | Religious content requires approved source and rights | Content owner/licensing | Medium | Missing/setup-needed |
| P1 | AI Tutor provider, usage, progress, saved vocabulary, privacy integration | D; mandatory check 151 | Current AI Tutor is a boundary, not proven provider service | Approved provider and staging identity | Medium | Partial/setup-needed |
| P2 | Performance/code splitting and full route automation | Quality/deployment | Current client bundle is approximately 1.86 MB before gzip | Build tooling and test harness | Medium | Improvement |
| P2 | Human accessibility certification and native-language review | Quality/E.64 | Automated checks cannot certify assistive technology or translation quality | Human reviewers/devices | Medium | Pre-launch gate |
| P2 | Parent/Guardian role decision | Mandatory check 150 | Current role model does not evidence it | Product decision | Small–Medium | Missing/decision-needed |

## Mandatory gap checks

| Check | Evidence-based finding |
|---|---|
| Supabase Auth signup/login/logout/reset/email verification | AuthContext calls real Supabase methods when configured and keeps demo fallback. Health tests pass. Real credential lifecycle was not executed. |
| Profile bootstrap and role persistence | Auth metadata and profile/RLS migrations exist; role/profile synchronization is implemented in boundary code. Real bootstrap and role-isolation execution were not tested. |
| 39 LMS tables and applied migrations | `0001` declares 39 canonical tables. Eight migration files exist, adding six AI Tutor tables and one booking table. Current database catalog was not re-queried in this audit, so active application is not independently re-certified here. |
| RLS on private tables | `0002` declares 39 RLS enables and 94 policies; AI Tutor and booking migrations add more. Current live `pg_class`/policy catalog was not queried in this audit. |
| Real cross-user/cross-role identity tests | Not run; separate staging identities are the principal blocker. |
| Private Storage buckets and signed URLs | Four private bucket policy groups are declared in `0004`; path and validation tests pass. Live signed operations were not run. |
| Demo/localStorage repositories | Still active in many client data modules, including dashboard, instructor, requirements, scheduling, classroom, relationship operations, course management, and admin. Several mounted screens use real procedures only when a configured signed session exists and otherwise use explicit demo fallback. |
| Learner requirements persistence | Server procedure boundary exists; mounted public requirements route supports real signed mode with fallback. Signed CRUD and moderation persistence were not tested. |
| Instructor availability/conflict prevention | Availability service and booking/session exclusion constraints exist. Live conflict/race execution was not run. |
| Trial/booking/session persistence | Trial, booking, and atomic confirmation services exist. Current staging records and successful end-to-end transaction were not executed. |
| Timezone correctness | UTC/timestamptz and timezone fields are present in scheduling migration/service. Unit/domain checks exist; DST and real multi-timezone fixtures remain untested. |
| In-app/email notification delivery | In-app notification/idempotency boundary exists. Email and push delivery are setup-needed; atomic confirmation currently has an English default caveat. |
| Courses/modules/lessons/enrolment/progress | Tables, procedures, UI, and domain tests exist, but live signed CRUD and full UI replacement are incomplete. |
| Hifz tracker | No dedicated Sabaq/Sabqi/Manzil implementation was found. **Missing.** |
| Credentials/Ijazah/audio/video | Tables and private Storage policies exist; upload/verification/provider workflows are not live-tested. |
| Approved Quran/Qaida content/licensing | Classroom teaching panels are approved-content placeholders and do not establish licensed content/audio delivery. **Setup-needed/missing.** |
| Live classroom/Realtime | Provider and Realtime remain setup-needed; classroom tests explicitly preserve unavailable states. |
| White Board synchronization | Local/demo White Board with undo/redo/clear exists; server/Realtime synchronization is not implemented. |
| Attendance/recording consent/retention/archive | Boundaries and UI states exist; real provider, consent persistence, attendance, recording, retention, and archive are not connected. |
| Messaging persistence/Realtime | Schema and authorization foundations exist; live message persistence/Realtime is not proven. |
| Review/report/moderation persistence | Models, routes, and unit boundaries exist; live eligible completed-session workflow is not proven. |
| Ledger/USD/currency/payments/refunds/payouts | Ledger and currency presentation boundaries exist; payment/payout/refund/reconciliation providers are absent. |
| Admin roles/moderation/analytics/notifications/settings/audit | Admin guards, UI, models, and unit tests exist. Real persisted operations and identity matrix are not proven; analytics values intentionally remain setup/demo states. |
| Parent/Guardian role | Not evidenced in active role model or route graph. **Missing/decision-needed.** |
| AI Tutor provider/privacy/usage/language/safety | Server-only safety, language settings, context minimization, usage result states, and religious-ruling redirects exist. Provider execution and signed privacy/usage tests remain pending. |
| Complete EN/UR/AR coverage | Not complete. Catalogue/context/selector and selected public/AI Tutor/requirements surfaces exist; many private surfaces retain English literals or lack route-level verification. |
| RTL/LTR visual status | App-level direction and logical CSS helpers exist; selected public/auth/classroom/admin previews passed. Full route matrix and human RTL/accessibility certification remain pending. |
| Accessibility/SEO/performance/test/deployment | TypeScript, 91 tests, build, metadata, route guards, and responsive previews pass. Human assistive-tech certification, performance measurements, and complete route automation remain pending. |

## Top 10 blockers in priority order

1. No completed signed learner/instructor/admin staging identity matrix.
2. Current live PostgreSQL catalog, RLS policy state, and Storage objects were not re-queried during this audit.
3. Demo/localStorage repositories remain active across major LMS domains.
4. No approved live video classroom or Realtime provider.
5. No payment, payout, refund, dispute, webhook, or reconciliation provider.
6. Messaging and notification delivery are not fully persisted or externally delivered.
7. Complete English–Urdu–Arabic migration is unfinished across private routes.
8. Credential/Ijazah/media verification is not proven through private signed Storage operations.
9. Hifz tracking and approved/licensed Quran/Qaida content/audio are not implemented as production features.
10. Human assistive-technology, native-language, and full-route QA certification has not been completed.

## Top 10 presentation-ready features

1. Quiet Geometry public homepage and responsive navigation.
2. Public instructor/course/requirement discovery and detail route shells.
3. Authentication, signup role selection, recovery, verification, and onboarding screens.
4. Learner and instructor dashboard shells with role-aware navigation.
5. Course builder, modules, lessons, preview, and moderation-state presentation.
6. Trial request, response, schedule, booking, and waiting-room flows.
7. Browser classroom shell with provider/setup, Quran/Qaida, White Board, resource, and attendance states.
8. Messaging/review/report/ledger/withdrawal/admin operation presentations with honest setup states.
9. AI Tutor learner setup, practice, conversation, progress, and language controls.
10. English/Urdu/Arabic launch-surface selector with responsive RTL presentation.

## Top 10 demo/placeholder features

1. Live video/audio classroom and WebRTC provider.
2. Realtime White Board and classroom chat synchronization.
3. Email, push, calendar, and fully delivered scheduling notifications.
4. Payment checkout, fee collection, refunds, disputes, payouts, and withdrawals.
5. Hifz Sabaq/Sabqi/Manzil tracker, charts, approvals, and reminders.
6. Credential, Ijazah, audio sample, introduction video upload and verification.
7. Fully persistent messaging and Realtime unread/read state.
8. Live ratings, review publication, and completed-session eligibility records.
9. Complete AI provider execution, pronunciation service, and production usage accounting.
10. Full multilingual coverage of private dashboards, classroom, messaging, reviews, billing, and admin screens.

## Exact remaining work by category

The remaining work is approximately **18–28 percentage points** of visual/demo scope, **45–58 percentage points** of assigned production LMS scope, and **50–62 percentage points** of the complete manager-approved scope. By category, the highest effort is live classroom/Realtime (**large**), payments/payouts (**large**), full demo-to-Supabase cutover (**large**), complete multilingual migration (**large**), identity/RLS/Storage staging verification (**medium**), messaging delivery (**medium–large**), credential verification (**medium–large**), Hifz/content licensing (**medium–large**), AI provider integration (**medium**), and human accessibility/native review (**medium**).

## Top 10 presentation-ready versus production-ready distinction

A screen is presentation-ready when its route, layout, states, and safe fallback render coherently. It is not production-ready until its data source, authorization, persistence, provider behavior, monitoring, and failure handling are verified. Noor Ilm currently has many presentation-ready routes, but only a subset of their server boundaries have been exercised against real signed records. This distinction is especially important for bookings, classroom sessions, messages, reviews, billing, withdrawals, and AI Tutor responses.

## Safety decisions

| Question | Decision |
|---|---|
| Is it safe to expose real learner/instructor data? | **No, not yet.** Use synthetic staging data only until current RLS/Storage policies are re-queried and signed cross-user/cross-role tests pass. |
| Is it safe to invite real users? | **No for production marketplace use.** A limited internal staging invitation may be appropriate only after isolated identities, monitoring, and privacy review are in place. |
| Is it safe to process real payments? | **No.** Payment/payout providers, webhooks, reconciliation, refunds, disputes, and ledger truth are not connected. |
| Is it safe to run real live classes? | **No.** The classroom provider, Realtime synchronization, attendance, recording consent, retention, and archive are setup-needed. |
| Is it safe to demonstrate the product? | **Yes, as a clearly labeled demo/staging experience.** Do not present demo records, placeholders, or unavailable-provider states as real marketplace activity. |

## Recommended demo walkthroughs

### Five-minute learner walkthrough

Begin at the public homepage in Urdu or Arabic, show the language selector, RTL direction, and the public tutor/course/requirement discovery route. Open a tutor or course detail page and follow the trial CTA to the authenticated flow. Sign in with a reserved staging/demo learner, open the learner dashboard, review the requirements and trial screens, then show the schedule/booking/waiting-room setup state. Finish in AI Tutor setup by selecting target, response, and explanation languages, open practice mode, and demonstrate the safe redirect behavior for a non-language-learning religious-ruling question without claiming a live provider response.

### Five-minute instructor walkthrough

Sign in with a reserved staging/demo instructor and open the instructor dashboard. Show profile, public preview, credentials/verification setup states, and the availability editor with timezone and exception controls. Open requirements, review a learner requirement, enter the trial-request list, and show accept/reject/propose actions with reason and confirmation controls. Open schedule, bookings, and waiting room to demonstrate timezone presentation and provider-unavailable status. Finish with course builder/moderation, messages, reviews, session ledger, and withdrawal screens, explicitly distinguishing setup-needed operations from real persistence.

### Three-minute admin walkthrough

Sign in with an approved admin or super-admin staging identity. Open the admin overview, use breadcrumbs/search/filter/date controls, and navigate to users, instructors, courses, sessions, reports, reviews, notifications, analytics, settings, audit logs, billing, and withdrawals. Demonstrate that privileged actions require role boundaries, confirmations, and reasons. Show setup-needed states for analytics, billing, and payout operations. Do not open or expose private learner conversations or personal records unless the approved staging policy and consented test fixture explicitly authorize it.

## Exact next three implementation tasks

1. **Staging verification task:** create separate learner, instructor, moderator, finance, admin, and super-admin identities; re-query current PostgreSQL tables/RLS/Storage metadata; execute signed ownership, cross-user, cross-role, Storage, booking-conflict, and atomic-confirmation tests.
2. **Persistence cutover task:** replace the remaining learner/instructor/admin demo repositories with Supabase procedures for requirements, profiles, courses, enrolments/progress, messaging, reviews, and admin operations, keeping each change behind RLS and adding integration tests before moving to the next domain.
3. **Provider and multilingual task:** choose approved classroom, Realtime, email/push, payment/payout, and AI provider integrations, then complete route-by-route English/Urdu/Arabic translation and native RTL/accessibility review with explicit setup and monitoring contracts.

## Files and routes that should not be changed casually in the next task

The next implementation should preserve the canonical migration order and avoid editing earlier migrations in place: `supabase/migrations/0001_noor_ilm_lms_canonical.sql`, `0002_auth_and_rls.sql`, `0003_conversation_membership_rls_fix.sql`, `0004_private_storage_policies.sql`, `0005_ai_tutor_language_learning.sql`, `0006_preferred_locale.sql`, `0007_ai_tutor_response_languages.sql`, and `0008_scheduling_persistence.sql`. It should also avoid casual changes to `server/supabase-auth.ts`, `server/supabase-user-client.ts`, `server/supabase-admin-client.ts`, `server/_core/trpc.ts`, `server/_core/env.ts`, `client/src/contexts/AuthContext.tsx`, `client/src/contexts/LocaleContext.tsx`, `client/src/lib/supabase-client.ts`, `client/src/App.tsx`, and the RLS-sensitive services `server/supabase-core.ts`, `server/supabase-storage.ts`, `server/ai-tutor.ts`, `server/scheduling.ts`, and `server/scheduling-atomic.ts`. Any change to these files should be paired with focused tests, current route checks, and a fresh security review.

Do not use the managed MySQL/Drizzle SQL channel for Supabase PostgreSQL work. Do not apply migrations, alter RLS, expose secrets, or create staging data as part of a UI-only task. Do not remove honest demo/setup-needed states until the underlying provider or persistence boundary is verified.

## References and evidence locations

1. `client/src/App.tsx` — active route registry, guards, public metadata, and route composition.
2. `client/src/components/` — mounted LMS, classroom, scheduling, AI Tutor, admin, and navigation surfaces.
3. `client/src/contexts/AuthContext.tsx` and `client/src/contexts/LocaleContext.tsx` — Auth/session and locale persistence boundaries.
4. `server/routers.ts`, `server/supabase-auth.ts`, `server/supabase-core.ts`, `server/scheduling.ts`, `server/scheduling-atomic.ts`, and `server/ai-tutor.ts` — server procedure boundaries.
5. `supabase/migrations/0001_noor_ilm_lms_canonical.sql` through `0008_scheduling_persistence.sql` — inspected schema, RLS, Storage, AI Tutor, locale, and scheduling artifacts.
6. `server/*.test.ts` — current automated test contracts; the audit run passed 91 tests across 19 files.
7. `package.json`, `client/index.html`, `.project-config.json`, `dist/`, and `.manus-logs/` — build, metadata, deployment, and runtime evidence.
