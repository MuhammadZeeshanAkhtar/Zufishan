-- Notifications can actually be written.
--
-- THE BUG. `notify()` writes every notification in this application with, in
-- PostgREST terms, `on_conflict=user_id,idempotency_key` — which Postgres
-- receives as:
--
--     insert into public.notifications (...) values (...)
--     on conflict (user_id, idempotency_key) do nothing
--
-- Migration 0008 created the matching uniqueness as a PARTIAL index:
--
--     create unique index notifications_recipient_idempotency_idx
--       on public.notifications(user_id, idempotency_key)
--       where idempotency_key is not null;
--
-- Postgres will not infer a partial index from a bare `on conflict (columns)`.
-- The index predicate has to be restated in the statement for inference to
-- succeed, and PostgREST's `on_conflict` parameter cannot express one. So every
-- insert raised:
--
--     42P10  there is no unique or exclusion constraint matching the
--            ON CONFLICT specification
--
-- `notify()` logs that and returns `{ delivered: false }` rather than throwing,
-- because a booking that was cancelled correctly must not report failure just
-- because its notification did not land. No caller inspected the return value.
-- The result: every notification since 0008 failed silently, and
-- `public.notifications` held zero rows — verification decisions, course
-- publishing, trial requests, booking changes and messages alike.
--
-- THE FIX. Make the index total, so the conflict target is inferable.
--
-- This is behaviour-preserving for the rows themselves. Under the default
-- `NULLS DISTINCT`, two rows with a null `idempotency_key` still do not
-- conflict, exactly as the partial index allowed — the only thing that changes
-- is that Postgres can now match `on conflict (user_id, idempotency_key)`
-- against it. Every row `notify()` writes carries a key, because
-- `NotifyInput.idempotencyKey` is required.
--
-- No column, policy, trigger or row is touched.

drop index if exists public.notifications_recipient_idempotency_idx;

create unique index if not exists notifications_recipient_idempotency_idx
  on public.notifications (user_id, idempotency_key);

comment on index public.notifications_recipient_idempotency_idx is
  'Total, not partial: a partial unique index cannot be inferred by "on conflict (user_id, idempotency_key)", which is how every notification is written.';
