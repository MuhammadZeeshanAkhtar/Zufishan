# Noor Ilm route inventory

This is the final route and access inventory for the LMS-only application. It mirrors the route registrations in `client/src/App.tsx`, including concrete routes and wildcard fallbacks. The demo release uses typed local repositories; the RLS column records the connected-production requirement.

## Public, discovery, and account routes

| Route | Role / purpose | Data source | Auth requirement | RLS requirement | Status |
|---|---|---|---|---|---|
| `/` | Public landing page | Approved visual assets and static LMS copy | None | Public assets only | Ready |
| `/courses` | Course catalogue/filtering | Published course repository | None | Published rows only | Ready |
| `/courses/category/quran`, `/tajweed`, `/hifz`, `/arabic`, `/hadith`, `/fiqh`, `/seerah`, `/tafsir` | Subject catalogue | Published course repository | None | Published rows only | Ready |
| `/courses/:slug` | Course detail and trial/enrolment entry | Published course boundary | None | Published course and approved instructor projection | Ready |
| `/courses/:slug/preview/:lessonId` | Public preview lesson | Published preview boundary | None | Preview flag and published course | Setup/content boundary |
| `/courses/:slug/reviews` | Public course reviews | Published review boundary | None | Published and consented rows only | Empty-safe |
| `/teachers` | Instructor directory | Approved instructor repository | None | Public profile projection only | Ready |
| `/teachers/subject/quran`, `/tajweed`, `/hifz`, `/arabic`, `/hadith`, `/fiqh` | Subject instructor directory | Approved instructor repository | None | Public profile projection only | Ready |
| `/teachers/female` | Female instructor filter | Approved instructor repository | None | Public profile projection only | Ready |
| `/teachers/:slug` | Instructor profile/trial entry | Public instructor projection | None | Public fields only | Ready |
| `/teachers/:slug/reviews` | Public instructor reviews | Published review boundary | None | Published and consented rows only | Empty-safe |
| `/requirements` | Public learning requirements | Published requirement projection | None | Public/published rows only | Ready |
| `/requirements/:id` | Requirement detail | Requirement service | None or signed-in owner context | Owner or published policy | Ready |
| `/trial/request` | Trial preparation/request | Trial service boundary | Learner session for submit | Learner owns request; participants scoped | Protected/demo |
| `/trial/request/success` | Trial request confirmation | Local request state | Learner session context | Learner-owned request only | Demo-safe |
| `/enrol/:courseId` | Course enrolment gate | Enrolment service boundary | Learner session | Learner owns enrolment | Protected/demo |
| `/how-it-works` | Product guidance | Static copy | None | None | Ready |
| `/about-lms` | LMS scope | Static copy | None | None | Ready |
| `/help/lms` | LMS help centre | Static copy | None | None | Ready |
| `/contact-lms` | Support request preparation | Local form state | None | Persist only through authorised support service | Demo/setup |
| `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/verify-email`, `/auth/callback`, `/logout` | Auth and session states | Demo auth context | None | Auth provider and session tables | Demo/setup |
| `/onboarding/learner`, `/onboarding/instructor`, `/onboarding/profile` | Profile/onboarding | Local onboarding draft | Session | User may mutate only own profile | Demo/setup |

## Learner routes

| Route | Purpose | Data source | Auth requirement | RLS requirement | Status |
|---|---|---|---|---|---|
| `/dashboard/learner` | Learner overview | Dashboard service | Learner + completed onboarding | User-owned dashboard aggregates | Ready/demo |
| `/dashboard/learner/:rest*` | Learner wildcard fallback | Dashboard subpage | Learner + completed onboarding | User-owned dashboard scope | Ready/demo |
| `/dashboard/learner/requirements`, `/new`, `/:id`, `/:id/edit`, `/:id/responses` | Requirement lifecycle | Requirements service | Learner | Owner-scoped rows and responses | Ready/demo |
| `/dashboard/learner/courses`, `/courses/:courseId`, `/lessons/:lessonId` | Enrolment, workspace, progress | Course management service | Learner | Enrolment membership and progress ownership | Ready/demo |
| `/dashboard/learner/classrooms`, `/archives` | Sessions/archive | Classroom service | Learner | Participant membership and private recording access | Demo/setup |
| `/dashboard/learner/trial-lessons`, `/trial-lessons/:id` | Trial list/detail | Scheduling service | Learner | Learner-owned trials | Ready/demo |
| `/dashboard/learner/bookings`, `/schedule`, `/notifications` | Bookings, schedule, notices | Scheduling/notification services | Learner | Participant and user-notification scope | Demo/setup |
| `/dashboard/learner/messages`, `/messages/:conversationId` | Conversations | Relationship service | Learner | Conversation membership only | Demo/realtime setup |
| `/dashboard/learner/reports` | Report workflow | Relationship service | Learner | Reporter and target policy | Ready/demo |
| `/dashboard/learner/reviews`, `/reviews/new` | Review list/submission | Review service | Learner | Completed-event eligibility and owner scope | Empty/demo |
| `/dashboard/learner/sessions` | Session ledger | Finance boundary | Learner | Learner ledger only | Finance setup |
| `/dashboard/learner/wallet` | Wallet decision state | Wallet boundary | Learner | User-owned wallet | Decision/setup |

## Instructor routes

| Route | Purpose | Data source | Auth requirement | RLS requirement | Status |
|---|---|---|---|---|---|
| `/dashboard/instructor` | Instructor overview | Dashboard service | Instructor + completed onboarding | User-owned aggregates | Ready/demo |
| `/dashboard/instructor/:rest*` | Instructor wildcard fallback | Dashboard subpage | Instructor + completed onboarding | User-owned dashboard scope | Ready/demo |
| `/dashboard/instructor/profile`, `/profile/preview` | Profile management/preview | Instructor service | Instructor | Owner mutation; public projection only | Ready/demo |
| `/dashboard/instructor/verification`, `/credentials`, `/training`, `/test` | Verification and credentials | Instructor service | Instructor | Private owner/admin review scope | Setup-needed |
| `/dashboard/instructor/availability`, `/settings` | Availability/preferences | Instructor service | Instructor | Owner-only mutation | Ready/demo |
| `/dashboard/instructor/requirements`, `/:id`, `/:id/respond` | Matching and responses | Requirements service | Instructor | Eligible response ownership | Ready/demo |
| `/dashboard/instructor/courses`, `/courses/new`, `/courses/:courseId/edit`, `/modules`, `/lessons`, `/preview`, `/submit` | Course authoring/moderation | Course management service | Instructor | Course owner and moderator policy | Ready/demo |
| `/dashboard/instructor/classrooms`, `/classroom-demo`, `/archives` | Classroom/session archive | Classroom service | Instructor | Participant and reserved-demo identity scope | Demo/setup |
| `/dashboard/instructor/trial-requests`, `/:id`, `/bookings`, `/schedule`, `/notifications` | Trial and schedule operations | Scheduling service | Instructor | Instructor ownership and participant scope | Ready/demo |
| `/dashboard/instructor/messages`, `/messages/:conversationId` | Conversations | Relationship service | Instructor | Conversation membership only | Demo/realtime setup |
| `/dashboard/instructor/reports`, `/reviews` | Reports and review view | Relationship service | Instructor | Reporter/subject scope | Ready/empty |
| `/dashboard/instructor/sessions`, `/billing`, `/withdrawals` | Ledger, earnings, withdrawals | Finance boundary | Instructor | Owner ledger; finance provider scope | Finance setup |

## Classroom routes

| Route | Purpose | Data source | Auth requirement | RLS requirement | Status |
|---|---|---|---|---|---|
| `/classroom/:sessionId/waiting-room` | Waiting room | Classroom service | Authenticated participant | Session participant membership | Provider setup |
| `/classroom/:sessionId` | Browser classroom | Classroom/realtime service | Authenticated participant | Session membership and provider token | Provider/realtime setup |
| `/classroom/:sessionId/ended` | Ended session | Classroom service | Authenticated participant | Participant/recording policy | Demo-safe |

## Administration routes

All administration paths are wrapped by `AdminProtectedRoute`, which permits only `admin` or `super_admin` demo sessions before the page-level `AdminGate` applies the actor permission matrix. Connected deployments must repeat this in server procedures and RLS.

| Route | Purpose | Data source | Auth requirement | RLS requirement | Status |
|---|---|---|---|---|---|
| `/admin`, `/admin/overview` | Operations overview | Admin operations service | Admin/super-admin | Admin aggregate scope | Protected/demo |
| `/admin/:rest*` | Admin wildcard fallback | Admin overview | Admin/super-admin | Same admin aggregate scope | Protected/demo |
| `/admin/users`, `/admin/users/:userId` | User operations/detail | Admin users service | Admin permission | Private row access, redacted detail | Protected/demo |
| `/admin/instructors`, `/admin/instructors/:instructorId` | Instructor operations/detail | Admin instructor service | Admin permission | Private review data by permission | Protected/demo |
| `/admin/courses`, `/admin/courses/:courseId`, `/admin/course-review` | Course operations/moderation | Admin course service | Admin/moderator permission | Course owner/moderation case scope | Protected/demo |
| `/admin/sessions`, `/admin/enrolments`, `/admin/progress` | Session, enrolment, progress operations | Admin operations service | Admin permission | Scoped records and privacy-safe aggregates | Protected/setup |
| `/admin/reviews`, `/admin/reports`, `/admin/messages/reports` | Moderation queues | Moderation service | Moderator/admin permission | Assigned case and target scope | Protected/demo |
| `/admin/billing`, `/admin/withdrawals` | Finance operations | Finance/admin service | Finance/admin or super-admin permission | Finance-scoped rows and provider IDs | Protected/setup |
| `/admin/notifications`, `/admin/analytics` | Notifications and analytics | Admin service | Admin permission | Preference scope and aggregate-only analytics | Protected/setup |
| `/admin/audit-logs` | Append-only audit history | Audit service | Admin/super-admin | Read-only role-scoped audit access | Protected/demo |
| `/admin/settings`, `/admin/support`, `/admin/permissions` | Settings, support, permission reference | Admin service | Permission-scoped admin | Sensitive setting/support scope; no self-escalation | Protected/demo |

## Cross-cutting route rules

The route table is a client navigation map, not a security boundary. Every private route requires server-side session validation, role and permission checks, target ownership or membership checks, safe input validation, and an audit event for sensitive writes. Public unknown paths fall through to the not-found view and receive `noindex,nofollow` metadata. No route exposes private message bodies, bank credentials, recording URLs, or unpublished moderation data through public projections.
