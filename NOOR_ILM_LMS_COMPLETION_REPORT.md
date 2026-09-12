# Noor-ilm LMS — Product Completion and Implementation Report

**Prepared for:** Noor-ilm stakeholders
**Status:** Implementation report based on the current codebase
**Date:** 7 September 2026

---

## 1. Executive Summary

Noor-ilm is an Islamic learning management platform that connects three groups of people: **Learners** who wish to study the Qur'an and related subjects, **Instructors** who teach them, and an **Admin/Board** that governs the platform.

The platform is not a single product but several working systems built on one foundation:

- **Learning** — course enrolment, lessons, progress tracking, assessments, Hifz memorisation planning, and verifiable certificates.
- **Teaching** — instructor profiles, a course builder, availability management, and a teaching desk.
- **Administration** — a ten-section Admin desk covering user management, instructor verification, course moderation, content review, and an append-only audit record.
- **Discovery** — two mirrored directories: learners find approved instructors, instructors find published learner profiles.
- **Communication** — messaging that opens only once a genuine teaching relationship exists, supported by notifications and reviews.
- **Islamic learning** — Qur'an, Tajweed, Hifz and Arabic subject structures, with full English, Urdu and Arabic support including right-to-left layout.

The system currently comprises **39 database tables**, **154 row-level security policies**, **29 database migrations**, **43 server modules**, **64 interface components** and **164 application routes**, with an interface catalogue of approximately **1,126 translated strings per language** across three languages.

---

## 2. Technology Architecture

All technologies listed below were confirmed present in the repository.

| Layer | Technology | Version | Role in the platform |
|---|---|---|---|
| Language | TypeScript | 5.9.3 | Type safety across client and server, including the translation catalogue |
| Interface | React | 19.2.1 | All dashboards and public pages |
| Build | Vite | 7.1.7 | Development server and production bundling |
| Styling | Tailwind CSS | 4.1.14 | Utility styling over a custom design-token layer |
| Routing | wouter | 3.3.5 | Client-side routing across 164 routes |
| Data fetching | TanStack Query | 5.90.2 | Server state, caching and retry behaviour |
| API | tRPC | 11.6.0 | End-to-end typed procedures between client and server |
| Validation | Zod | 4.1.12 | Input validation at every procedure boundary |
| Server runtime | Node.js / Express | 4.21.2 | HTTP server hosting the tRPC router |
| Identity | Supabase Auth | 2.112.3 | Email and password authentication, sessions, and identity verification |
| Database | Supabase PostgreSQL | — | 39 tables governed by 154 row-level security policies |
| Schema tooling | Drizzle ORM | 0.44.5 | Schema definitions and typing |
| Motion | GSAP | 3.15.0 | Entrance and transition animation, with reduced-motion support |
| AI | Google Gemini | REST | AI Tutor generation, configured through environment variables |

**Design note.** The platform uses a custom design-token layer (CSS custom properties) beneath Tailwind, which is what allows a single component set to serve light and dark themes and three languages, two of which are right-to-left.

**Not present.** Three.js and WebGL are not used anywhere in the codebase. All visual work is CSS, inline SVG and GSAP.

---

## 3. User Roles and Access Model

| Role | Purpose | Main access |
|---|---|---|
| Learner / Student | Learns Qur'an and courses | Learner Dashboard and learning modules |
| Instructor / Teacher | Teaches learners and manages teaching content | Instructor Dashboard and teaching modules |
| Admin / Board | Moderates and manages the platform | Admin Dashboard and administrative tools |

**Vendor is out of scope.** There is no Vendor role in the schema, in the role ladder, or in any interface. This is enforced by automated checks that fail if the term appears in any role surface.

### Role resolution

Roles are stored in a dedicated `user_roles` table, separate from the account record. An account may hold more than one role row, so the platform resolves a single **effective role** using a fixed privilege ladder:

> super_admin → admin → moderator → finance → advisory_board → instructor → learner

This ladder is defined once and shared by the database, the server and the interface, which guarantees that counts, filters and labels cannot disagree. Three consequences follow:

- Administrator, Instructor and Learner totals are **mutually exclusive** — an account is counted exactly once.
- An Admin account is **never** counted or displayed as a Learner.
- An account with no role is shown as **"Role not assigned"** and is never silently treated as a Learner.

### Admin access

Administrator rights are granted solely by a server-side comparison against a configured administrator address held in environment configuration. The value is never sent to the browser, never written into source code, and does not appear in the client bundle. Selecting the "Board / Admin" card at sign-in grants nothing — it only affects the message shown when the selection and the account's actual role disagree.

### Dashboard redirection

After authentication the server resolves the account's role and onboarding state and returns the destination:

| Account state | Destination |
|---|---|
| Administrator | `/admin` |
| Instructor, onboarding complete | `/dashboard/instructor` |
| Instructor, onboarding outstanding | Instructor onboarding |
| Learner, onboarding complete | `/dashboard/learner` |
| Learner, onboarding outstanding | Learner onboarding |
| No role assigned | Reported to the user; no dashboard is guessed |

---

## 4. Authentication and Onboarding

| Capability | Status | Description |
|---|---|---|
| Learner signup and login | Implemented | Email and password through Supabase Auth |
| Instructor signup and login | Implemented | The role requested at signup is the role granted |
| Admin login and redirection | Implemented | Server-verified address rule, redirecting to the Admin desk |
| Password authentication | Implemented | Supabase Auth, with structured failure states in three languages |
| Role-specific onboarding | Implemented | Separate learner and instructor onboarding, resuming where left off |
| Role isolation | Implemented | Signup grants exactly the requested role, or none |
| Reserved Admin identity | Implemented | The board address cannot be registered as a Learner or Instructor |
| Google sign-in | **Interface complete, provider not enabled** | See below |

**Structured authentication states.** Failures are classified server-side and translated, rather than passing a provider message through: invalid credentials, unconfirmed email address, rate limiting, expired session, network failure, and provider unavailable are each distinguished.

**Google sign-in.** The complete flow is implemented — the button, the OAuth call through Supabase Auth, the return route, role preservation across the redirect, and the failure categories. It is **not yet operational** because the Google provider is not enabled on the Supabase project and no Google client credentials exist. The interface detects this and shows a clear setup message rather than a failure. Enabling it is a configuration task requiring a Google Cloud OAuth client and the Supabase provider settings; no further code changes are required.

---

## 5. Learner / Student Features

| Module | Status | Implemented functionality |
|---|---|---|
| Learner Dashboard | Implemented | Role-specific overview with real figures drawn from live data |
| Onboarding | Implemented | Two-stage collection of required and optional profile detail |
| Learner profile | Implemented | Full profile editing, with automatic publication on completion |
| Profile discoverability | Implemented | A learner controls their own visibility; no administrator approval is involved |
| Find Quran Teacher | Implemented | Directory of approved, published instructors with profile cards and detail pages |
| Instructor profile viewing | Implemented | Public instructor profile with subjects, languages, experience and availability |
| Course discovery | Implemented | Public catalogue with subject, level and language filters |
| Course enrolment | Implemented | Enrolment restricted to published courses, enforced at the database |
| Lessons | Implemented | Lesson delivery with module and lesson structure |
| Lesson progress | Implemented | Per-lesson progress recorded and resumable |
| Assessments | Implemented | Quizzes with attempts and scoring; assignments with submissions |
| Hifz / memorisation | Implemented | Memorisation plans, records, review submission and progress calculation |
| Hifz reminders | Implemented | Scheduled memorisation reminders |
| Surah reference index | Implemented | All 114 surahs with transliteration and verse counts, as reference metadata |
| Bookings | Implemented | Trial requests, booking lifecycle and schedule views |
| Learning requirements | Implemented | Learners publish what they wish to learn; instructors may respond |
| Messaging | Implemented | Conversations, restricted to established teaching relationships |
| Reviews and ratings | Implemented | Learner reviews with a moderation path |
| Notifications | Implemented | In-application notifications with per-type preferences |
| Certificates | Implemented | Eligibility checking, issuance, listing, and public verification by code |
| AI Tutor | Implemented, requires configuration | See Section 9 |
| Wallet and transactions | Interface implemented, provider pending | Records exist; no payment provider is connected |
| Live Classroom | Foundation only | See Section 12 |

---

## 6. Instructor / Teacher Features

| Module | Status | Implemented functionality |
|---|---|---|
| Instructor Dashboard | Implemented | Teaching desk with opportunities, invitations and bookings |
| Onboarding | Implemented | Instructor-specific onboarding including subjects and teaching languages |
| Profile creation and editing | Implemented | Public profile with subjects, levels, languages, experience and approach |
| Profile preview | Implemented | Preview of the public listing before publication |
| Verification submission | Implemented | Submission of the profile for Board review |
| Credentials | Implemented | Credential records with individual review states |
| Find Students | Implemented | Directory of published learner profiles, with cards and detail pages |
| Human verification gate | Seam implemented, provider pending | See note below |
| Course builder | Implemented | Course creation with full metadata |
| Course drafts | Implemented | Draft state, editable until submitted |
| Course submission | Implemented | Submission for Board review |
| Modules and lessons | Implemented | Module and lesson creation, ordering and editing |
| Lesson media metadata | Implemented | Media references recorded against lessons |
| Assessments | Implemented | Quiz creation, submission review and grading |
| Hifz teaching | Implemented | Assigned learner records, review queue and review decisions |
| Availability | Implemented | Availability intervals with a scheduling notice buffer |
| Bookings | Implemented | Trial acceptance, decline, time proposal, cancellation |
| Messaging | Implemented | Conversations, restricted to established teaching relationships |
| Reviews | Implemented | Visibility of learner reviews |
| Notifications | Implemented | Decision and activity notifications |
| Earnings and withdrawals | Interface implemented, provider pending | Records exist; no payout provider is connected |
| Live Classroom | Foundation only | See Section 12 |

**Human verification gate.** Find Students is protected by a verification gate whose server-side check is fully implemented and enforced. No verification provider is currently configured; the platform states this plainly rather than simulating a check it cannot perform. Enabling it requires three environment values for a provider such as Turnstile, hCaptcha or reCAPTCHA, after which the gate becomes active with no code change.

---

## 7. Admin / Board Features

| Module | Status | Implemented functionality |
|---|---|---|
| Overview | Implemented | Exact counts read live, with per-metric availability rather than assumed zeros |
| Accounts by role | Implemented | Mutually exclusive totals reconciling to the account total |
| User management | Implemented | Search, filter by effective role and status, ordered administrators first |
| User detail | Implemented | Account record, activity summary and decision history |
| Account status | Implemented | Suspend and reactivate, requiring a reason, refusing self and other privileged accounts |
| Instructor verification | Implemented | Approve, reject and request changes, with notification to the instructor |
| Credential review | Implemented | Individual credential decisions |
| Course moderation | Implemented | Course review with publish and reject decisions |
| Content moderation | Implemented | Review queue, reported content and moderation cases |
| Bookings oversight | Implemented | Platform-wide booking and session visibility |
| Audit logs | Implemented | Append-only record; no interface can edit or delete an entry |
| System status | Implemented | Integration readiness reported by variable **name** only, never value |
| Settings | Implemented | Administrative settings surface |
| Role isolation | Implemented | Administrators excluded from learner and instructor totals and filters |
| Role assignment | **Deliberately not provided** | No interface grants or changes a role; the only path to Admin is the configured address rule |

**Security posture.** Every administrative procedure verifies the caller's role on the server before reading any data. Administrative reads use a privileged database client only after that check has passed, and every decision is recorded in the audit log.

---

## 8. Course and Learning Management System

The implemented course lifecycle is as follows.

1. **Instructor creates a course.** The record begins in `draft`. Database policy prevents an instructor from creating a course already marked published.
2. **Course metadata is saved.** Title, description, subject, level and language are required fields.
3. **Modules and lessons are added.** Ordered modules each containing ordered lessons, with media metadata.
4. **Course is submitted for review.** The status moves to `in_review`.
5. **The Board reviews the course.** An administrator publishes or rejects it. Course status values are `draft`, `in_review`, `published`, `rejected` and `archived`.
6. **Published courses become visible.** Database policy exposes a course to learners only when its status is `published`; drafts and rejected courses remain visible solely to their owner and to administrators.
7. **A learner enrols.** Enrolment is restricted to published courses, enforced both in the server procedure and by database policy. The instructor is notified.
8. **Progress is tracked.** Lesson progress is recorded per learner and per lesson.
9. **Assessments are used.** Quizzes with attempts and scoring, and assignments with submissions and grading.
10. **A certificate is issued.** Eligibility is checked against course completion and the course pass mark; an issued certificate carries a verification code that can be checked publicly without signing in.

---

## 9. AI Tutor

### AI Tutor — Gemini Integration

An AI Tutor is implemented and available from the **Learner Dashboard**, with a companion view on the Instructor Dashboard that allows an instructor to see an assigned learner's tutor activity.

| Aspect | Detail |
|---|---|
| Provider | Google Gemini, called over REST from the server |
| Configuration | Two environment variables: an API key and a model identifier |
| Availability | Learners use the tutor directly; instructors have a read-only learner view |
| Learner surfaces | Setup, conversation, practice, and progress views |
| Grounding | A dedicated grounding module constrains tutor responses to the learning context |
| Key handling | The key is read on the server only. It is never sent to the browser and does not appear in the client bundle |

**Purpose.** The tutor supports Qur'an and Islamic study by allowing a learner to practise in a chosen language and mode, with the conversation grounded in course and lesson context rather than answering as an open-ended chatbot.

**Current limitation.** The integration is implemented but reports **setup-needed** until both environment values are supplied. The platform surfaces this state honestly rather than presenting an unavailable tutor as working. This should be treated as configured-on-deployment rather than complete.

---

## 10. Qur'an, Hifz, and Islamic Learning Features

| Feature | Status | Description |
|---|---|---|
| Qur'an teacher discovery | Implemented | Instructors are discoverable by subject, including Qur'an Recitation, Tajweed, Hifz and Arabic |
| Subject taxonomy | Implemented | Qur'an Recitation, Tajweed, Hifz, Arabic, Hadith, Fiqh, Seerah and Tafsir |
| Hifz planning | Implemented | Memorisation plans with targets and scheduling |
| Hifz records and review | Implemented | Learners submit memorisation records; instructors review and decide |
| Hifz progress | Implemented | Calculated progress across a memorisation plan |
| Hifz reminders | Implemented | Scheduled reminders supporting a memorisation rhythm |
| Surah reference index | Implemented | All 114 surahs with Arabic name, transliteration and verse count (6,236 verses total) |
| Assessments | Implemented | Quizzes and assignments applied to Islamic subjects |
| English, Urdu, Arabic | Implemented | Three complete interface languages |
| Right-to-left layout | Implemented | Urdu and Arabic mirror the entire interface using logical layout properties |

**A deliberate boundary.** The platform contains **no Qur'anic text and no translations of the Qur'an**. The surah index is reference metadata only — names, numbering and verse counts. Scripture delivery would require a properly licensed and verified text source, and was intentionally not improvised.

---

## 11. Communication and Engagement

| Feature | Status | Description |
|---|---|---|
| Conversations | Implemented | Two-party threads between a learner and an instructor |
| Messages | Implemented | Message delivery with attachment references |
| Connection-gated messaging | Implemented | Messaging opens only when a genuine teaching relationship exists |
| Relationship states | Implemented | The interface distinguishes connected, pending and not-yet-connected |
| Trial requests | Implemented | Learner-initiated, with instructor acceptance, decline or time proposal |
| Bookings | Implemented | Confirmation, cancellation, completion and dispute states |
| Learning requirements | Implemented | Learner publishes a request; instructor responds; learner accepts |
| Enrolment relationship | Implemented | An active enrolment establishes the teaching relationship |
| Notifications | Implemented | Notifications on verification decisions, trial events and enrolments |
| Reviews and ratings | Implemented | Learner reviews with moderation and reporting |

### The messaging rule

Discovery does not grant contact. A conversation may be opened only when one of four relationships genuinely exists between the two accounts:

| Relationship | Opens messaging when |
|---|---|
| Trial | Accepted, scheduled, in progress or completed |
| Booking | Confirmed or held |
| Requirement response | Accepted by the learner |
| Enrolment | Active or completed |

Requests that are **pending, declined, rejected, cancelled, expired or withdrawn do not open messaging.** A pending request is reported as such, so the person understands they are waiting rather than being refused. The rule is enforced by a single server-side check shared by both the interface and the write path, so the button and the permission cannot disagree.

### Remaining work

The instructor-to-learner direction currently requires the learner to publish a learning request first, because trial requests are learner-initiated by design. An instructor-initiated connection action would remove that prerequisite and is recommended as a future enhancement.

---

## 12. Booking and Live Classroom Foundations

| Capability | Status | Description |
|---|---|---|
| Availability slots | Implemented | Instructors define availability intervals with a notice buffer |
| Slot discovery | Implemented | Learners see genuinely available times |
| Trial request | Implemented | Learner requests a trial at a chosen time |
| Acceptance and decline | Implemented | Instructor accepts, declines with a reason, or proposes a new time |
| Time confirmation | Implemented | Learner confirms a proposed alternative |
| Booking creation | Implemented | An accepted trial produces a booking |
| Cancellation | Implemented | Either party may cancel, with a reason recorded |
| Completion | Implemented | Completed, no-show and disputed states |
| Session records | Implemented | Class sessions, participants and attendance |
| Classroom waiting room | Implemented | Waiting-room and classroom routes with an access gate |
| Live video provider | **Foundation only** | See below |

**Live Classroom.** The platform defines a **vendor-agnostic provider boundary**: the interface, routes, session records, participants, attendance and access gate are all implemented. **No video provider is selected and none is contacted.** The design deliberately distinguishes "no provider configured" from "a configured provider that is failing", so an operator can tell a setup task from a fault.

**Live video calling is not complete.** Connecting a provider is remaining work.

---

## 13. Database and Security Implementation

The database comprises **39 tables** governed by **154 row-level security policies**, evolved through **29 migrations**.

| Area | Tables |
|---|---|
| Identity and roles | `profiles`, `user_roles` |
| Learner records | `learner_profiles`, `learner_requirements`, `learner_shortlists` |
| Instructor records | `instructor_profiles`, `instructor_credentials`, `instructor_media` |
| Requirements | `requirement_responses` |
| Scheduling | `instructor_availability`, `trial_requests` |
| Courses | `courses`, `course_modules`, `lessons` |
| Live sessions | `class_sessions`, `class_participants`, `class_attendance` |
| Learning | `enrolments`, `lesson_progress` |
| Assessment | `assignments`, `submissions`, `quizzes`, `quiz_attempts` |
| Recognition | `certificates` |
| Communication | `conversations`, `conversation_members`, `messages` |
| Notifications | `notifications`, `notification_preferences` |
| Feedback | `reviews`, `review_reports`, `reports` |
| Financial records | `session_ledger`, `payment_references`, `withdrawal_requests` |
| Moderation | `moderation_cases`, `moderation_actions` |
| Governance | `audit_logs`, `admin_settings` |

### Security model

Authorisation is enforced in **two independent layers**, so a mistake in one does not become a breach:

1. **Row-level security.** Every table carries policies determining which rows an account may read or write. Discovery, course visibility, enrolment and conversation membership are all governed at the database, not only in application code.
2. **Server-side procedure checks.** Every privileged procedure verifies the caller's role from the server-verified identity before touching data. Administrative reads use a privileged database client only after that check passes.

Specific guarantees implemented:

- Learners cannot read other learners' private profile data.
- Instructors see only learner profiles that have been explicitly published.
- Learners see only approved and published instructors.
- Learners see only published courses; drafts remain private to their owner.
- Enrolment is restricted to published courses at the database level.
- Only the two participants of a conversation may read or write it.
- Administrator identity is decided solely by a server-side address comparison.
- A missing role is reported as missing and never defaults to Learner.

### Data protection

No password, token, secret, private email address, phone number or internal moderation note is exposed through any discovery or profile surface. Administrative screens identify accounts by display name and identifier rather than by email address. Integration readiness is reported by **variable name only**, never by value.

---

## 14. UI/UX and Design System

| Area | Status | Description |
|---|---|---|
| Shared design system | Implemented | Design tokens for colour, spacing, typography, elevation, motion and focus |
| Light theme | Implemented | Warm ivory and cream surfaces with charcoal text |
| Dark theme | Implemented | Deep espresso and warm charcoal, designed independently rather than inverted |
| System theme | Implemented | Three-state control: light, dark, or follow the operating system |
| Theme persistence | Implemented | The choice persists across sessions without a flash of the wrong theme |
| Accent palette | Implemented | Muted mustard-gold as the primary accent, with emerald and teal supporting tones |
| Responsive dashboards | Implemented | Desktop, tablet and mobile layouts across all three roles |
| Internationalisation | Implemented | English, Urdu and Arabic, approximately 1,126 strings each |
| Right-to-left | Implemented | Full mirroring through logical layout properties, not a separate stylesheet |
| Profile cards and detail views | Implemented | Shared card and detail structure used for both instructor and learner profiles |
| Interface states | Implemented | Loading, empty, error, retry, offline, unauthorised and success states throughout |
| Accessibility | Implemented | Labelled controls, visible focus, alert roles, and contrast verified against WCAG AA |
| Animation | Implemented | GSAP entrance and transition work honouring reduced-motion preferences |
| Islamic visual direction | Implemented | Drawn geometric motifs — girih star patterns, arch forms and lantern light — as inline SVG |

**Translation integrity.** The three language catalogues are enforced by the type system: a missing Urdu or Arabic string is a compile error, not a silent fallback to English.

**Not present.** There are no 3D elements. All visual work is CSS, inline SVG and GSAP.

---

## 15. Completed vs In Progress vs Planned

| Area | Completed implementation | In progress / partial | Planned or not implemented |
|---|---|---|---|
| Authentication | Email and password, sessions, role isolation, structured error states | Google sign-in (built; provider not enabled) | Multi-factor authentication |
| Roles and access | Three roles, effective-role ladder, Admin address rule, mutually exclusive counts | — | Self-service role administration (deliberately excluded) |
| Onboarding | Learner and instructor onboarding, automatic learner publication | — | — |
| Learner Dashboard | Overview, profile, courses, lessons, progress, Hifz, certificates, notifications | — | — |
| Instructor Dashboard | Teaching desk, profile, verification, course builder, availability, reviews | — | — |
| Admin Dashboard | Ten operational sections, moderation, audit log, system status | — | — |
| Discovery | Find Quran Teacher; Find Students with profile cards and detail views | Human-verification gate (built; provider not configured) | — |
| Courses | Draft, submission, Board review, publication, modules, lessons | — | Course versioning |
| Learning | Enrolment, lesson progress, quizzes, assignments, certificates | — | — |
| Hifz | Plans, records, review workflow, progress, reminders | — | Qur'anic text delivery (requires a licensed source) |
| Messaging | Conversations, connection-gated eligibility, relationship states | Instructor-initiated connection action | Group conversations |
| Bookings | Availability, trials, acceptance, rescheduling, cancellation, completion | — | — |
| Live Classroom | Sessions, participants, attendance, waiting room, provider boundary | — | Video provider connection |
| AI Tutor | Learner surfaces, instructor view, grounding, provider boundary | Requires Gemini configuration | — |
| Notifications | In-application notifications, preferences, verification and enrolment notices | — | Email and push delivery |
| Payments and payouts | Ledger, transactions and withdrawal records | — | Payment provider, currency conversion, refunds |
| Design system | Tokens, light and dark themes, responsive layouts, accessibility | — | — |
| Internationalisation | English, Urdu, Arabic with right-to-left support | — | Additional languages |
| Database and security | 39 tables, 154 policies, dual-layer authorisation | — | — |

---

## 16. Current Product Position

Noor-ilm LMS is a functioning Islamic learning platform with its core teaching relationship implemented end to end.

**The platform can currently support:**

- **Role-based learning and teaching** across three clearly separated roles, with an access model enforced at both the database and the server.
- **Qur'an and Islamic education** through a subject taxonomy covering Qur'an Recitation, Tajweed, Hifz, Arabic, Hadith, Fiqh, Seerah and Tafsir.
- **Instructor discovery**, where learners find instructors the Board has verified, and instructors find learners who have chosen to be found.
- **Courses and lessons** with a complete lifecycle from draft through Board review to publication, enrolment and delivery.
- **Assessments and Hifz**, including quizzes, assignments, memorisation planning and instructor-reviewed memorisation records.
- **Bookings and communication**, with availability, trials, the full booking lifecycle, and messaging that opens only on a genuine teaching relationship.
- **Admin moderation**, covering instructor verification, course review, content moderation, user management and an append-only audit record.
- **AI Tutor integration** grounded in the learner's study context.
- **A secure database and strict role separation**, with 154 row-level security policies and server-side authorisation on every privileged procedure.
- **Three languages**, including full right-to-left support, in premium light and dark themes.

**Remaining implementation areas**, in order of readiness:

1. **Configuration only** — Google sign-in, the human-verification provider, and the AI Tutor key. All three are fully built and await provider credentials.
2. **Provider connection** — the Live Classroom video provider and the payment and payout providers. Interfaces, records and boundaries exist; a vendor must be selected and connected.
3. **Feature completion** — an instructor-initiated connection action, and email or push delivery for notifications.
4. **Requires an external decision** — Qur'anic text delivery, which needs a properly licensed and verified source before it can responsibly be built.

The platform is at the point where the learning and teaching journey works end to end, and the outstanding work is predominantly the connection of external providers rather than the construction of new systems.

---

*This report describes the implementation present in the Noor-ilm codebase. Features are marked complete only where the implementation supports the claim.*
