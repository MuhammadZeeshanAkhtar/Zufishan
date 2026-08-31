# Noor Ilm scheduling persistence handoff

## Scope

This iteration connects the existing LMS scheduling surfaces to the canonical Supabase PostgreSQL product database. It does not add payments, payouts, live classroom infrastructure, email delivery, push notifications, or unrelated modules.

## Database changes

Migration `supabase/migrations/0008_scheduling_persistence.sql` was applied previously through the verified server-side PostgreSQL `pg` path. It is additive only. It adds availability exception/break fields, trial expiry/idempotency/cancellation fields, creates `public.bookings`, links bookings to `public.class_sessions`, adds notification idempotency/locale fields, enables `btree_gist`, and adds PostgreSQL exclusion constraints for instructor and learner overlap prevention on bookings and class sessions. It creates the booking ownership policies and preserves the existing table/RLS model. It contains no `drop table`, `delete from`, or `truncate` statements.

The migration uses UTC `timestamptz` columns for requested, proposed, confirmed, booking, and session times. Timezone identifiers are retained separately on trial requests, bookings, sessions, and availability records. Unique constraints prevent duplicate trial retries and duplicate confirmed bookings; exclusion constraints prevent overlapping active slots.

## Server procedures

`server/scheduling.ts` now provides bearer-scoped availability listing/creation/update/deletion, approved public instructor lookup, available-slot calculation, trial creation, learner/instructor trial listing and detail, decline/propose/cancel paths, booking/session/notification listing, and translated-safe error result shapes. Authenticated reads and writes use `getSupabaseUserClient(identity.accessToken)`, so the database RLS boundary remains active. The service-role client is retained only for narrow notification and audit writes and the filtered public instructor lookup.

`server/scheduling-atomic.ts` provides the transaction boundary for instructor acceptance and learner confirmation. It locks the trial row, validates the actor role and ownership, checks expiry and status, inserts one confirmed booking, updates the trial, creates one class session and two participant rows, writes an idempotent notification, writes an audit event, and commits atomically. Any conflict rolls back and is returned as a safe conflict result.

The tRPC namespace now exposes `schedulingPublic.instructorBySlug`, protected availability and trial procedures, learner/instructor trial listings and detail, learner/instructor booking and session listings, and protected notifications. Existing scheduling route paths remain unchanged.

## UI status

The mounted instructor availability editor, trial request form, trial listings, schedule, bookings, and notifications pages now use real procedures when a configured authenticated Supabase session is present and retain clearly bounded demo fallback otherwise. Signed-out protected routes still redirect to login. The trial request form resolves the approved instructor by slug, validates future time and timezone values, and submits an idempotent request through the protected procedure. Calendar view, live classroom, payment, email, and push delivery remain setup-needed or coming-soon boundaries.

## Validation

The following checks passed after the scheduling changes:

- TypeScript: passed.
- Vitest: **91 tests passed across 19 files**.
- Production build: passed. Vite emitted a non-blocking large-chunk warning; no compilation failure occurred.
- Responsive route smoke: protected learner/instructor scheduling paths rendered the existing login guard at a narrow mobile viewport. The standalone `/notifications` path remains intentionally not registered; role-scoped notification routes are used instead.
- No secrets were printed or bundled. Temporary migration/rewrite helpers were removed before checkpointing.

## Remaining work

Signed learner/instructor/admin staging identities are still required for live cross-user and cross-role RLS CRUD tests. Native PostgreSQL transaction execution is implemented but still needs a staging fixture containing approved instructor profiles, roles, availability, and trial rows to exercise successful confirmation and race conflicts. Notification templates currently use the persisted locale boundary but the atomic confirmation path defaults to English until recipient profile-locale lookup is connected. Email, push, calendar, payment, payout, and live classroom providers remain setup-needed. Scheduling copy still contains legacy English strings in the older scheduling component and requires a dedicated multilingual migration pass; no claim is made that every scheduling label is localized.
