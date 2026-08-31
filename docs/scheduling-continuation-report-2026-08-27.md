# Noor Ilm LMS scheduling continuation — 2026-08-27

## Scope

This continuation reused the existing Supabase PostgreSQL scheduling model and procedures. It did not create staging identities, seed fixtures, weaken RLS, add duplicate tables, expose secrets, or configure unrelated providers.

## Database and procedure boundary

Migration `0012_scheduling_notice_buffer.sql` is additive and limited to `public.instructor_availability`. It adds bounded `buffer_minutes` and `minimum_notice_minutes` fields with defaults and check constraints. No tables are created or dropped, and no rows are deleted.

The existing scheduling procedures remain the contract: availability list/create/update/delete, public approved-instructor slot calculation, trial create/accept/decline/propose/confirm/cancel, learner/instructor trial and booking lists, session lists, and notification reads. Server validation now carries the additive buffer and notice values, checks the selected interval against active availability, enforces minimum notice, and uses buffer-aware overlap checks. Transaction-safe confirmation remains in `server/scheduling-atomic.ts`; notification creation remains idempotent and email/push delivery remains provider setup-needed.

## Connected browser surfaces

The active instructor availability editor reads and writes real protected availability procedures and exposes timezone, active interval, buffer minutes, and minimum notice minutes. The learner trial flow queries `scheduling.availableSlots`, displays server-confirmed slots in learner and instructor timezones, and refuses submission unless the selected start/end pair is returned by the server. Learner/instructor schedules, bookings, trial lists, and notifications render real procedure results with honest empty states; active demo session, notification, and booking fixtures were removed from those surfaces. Classroom/live video remains a provider boundary.

## Validation

| Check | Result |
|---|---|
| Focused scheduling tests | 2 files passed; 10 tests passed. |
| Full Vitest suite | 34 files passed; 162 tests passed. |
| Strict TypeScript | Passed. |
| Production build | Passed; existing large-main-chunk warning remains documented. |
| Learner schedule smoke | Unauthenticated route redirected to `/login?returnTo=%2Fdashboard%2Flearner%2Fschedule`. |
| Instructor availability smoke | Unauthenticated route redirected to `/login?returnTo=%2Fdashboard%2Finstructor%2Favailability`. |
| Runtime/privacy review | No application server errors, scheduling failures, Supabase key names, database URLs, service-role names, or provider tokens found in the reviewed post-change logs. |

## Blockers and setup-needed items

Signed learner/instructor/admin identity matrix testing, cross-user RLS denial, private Storage denial, and race execution remain blocked because staging identities were intentionally not created. Email, push, Realtime, payments/payouts, and live classroom providers remain setup-needed. No completion, payment, attendance, recording, or provider-delivery claims are made.

## Checkpoint

Verified and auto-published as checkpoint `1652c341`.
