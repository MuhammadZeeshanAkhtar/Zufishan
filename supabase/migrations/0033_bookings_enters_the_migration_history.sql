-- `bookings` exists in the running database but in no migration.
--
-- THE PROBLEM THIS FIXES. Every other table in this project can be rebuilt from
-- `supabase/migrations/`. `bookings` could not: it was created directly against the live
-- database and never written down. A new environment built from this folder would come up
-- without it, and the whole trial-to-lesson journey would fail at the first confirmation —
-- `atomicallyConfirmTrial` inserts a booking inside its transaction.
--
-- This is transcription, not design. Every column, default, constraint, index and policy
-- below was read from the live table with `information_schema` and `pg_constraint`, and is
-- reproduced exactly. Running it against the existing database is a no-op; running it
-- against an empty one produces the same table.
--
-- WHAT IS WORTH NOTICING while transcribing it. The two EXCLUDE constraints are the reason
-- double-booking is impossible: the same instructor, or the same learner, cannot hold two
-- overlapping time ranges while a booking still stands. That is enforced by the database
-- rather than by a check in application code, which is why no race between two learners
-- booking the same slot can get through. They need `btree_gist`, because they mix an
-- equality test on a uuid with an overlap test on a range.

create extension if not exists btree_gist;

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  trial_request_id uuid not null unique references public.trial_requests(id) on delete cascade,
  learner_id uuid not null references public.profiles(id) on delete cascade,
  instructor_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null,
  subject text not null,
  scheduled_start_at timestamptz not null,
  scheduled_end_at timestamptz not null,
  learner_timezone text not null,
  instructor_timezone text not null,
  status text not null default 'confirmed'
    check (status in ('confirmed', 'cancelled', 'expired', 'completed', 'no_show', 'disputed')),
  -- One booking per confirmation attempt, so a retried request cannot double-book.
  idempotency_key text not null unique,
  confirmed_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (scheduled_end_at > scheduled_start_at)
);

-- `add constraint` has no IF NOT EXISTS, so each is added only when absent.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bookings_instructor_slot_excl') then
    alter table public.bookings add constraint bookings_instructor_slot_excl
      exclude using gist (
        instructor_id with =,
        tstzrange(scheduled_start_at, scheduled_end_at, '[)') with &&
      ) where (status in ('confirmed', 'completed', 'no_show', 'disputed'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'bookings_learner_slot_excl') then
    alter table public.bookings add constraint bookings_learner_slot_excl
      exclude using gist (
        learner_id with =,
        tstzrange(scheduled_start_at, scheduled_end_at, '[)') with &&
      ) where (status in ('confirmed', 'completed', 'no_show', 'disputed'));
  end if;
end $$;

create index if not exists bookings_instructor_time_status_idx
  on public.bookings (instructor_id, scheduled_start_at, scheduled_end_at, status);
create index if not exists bookings_learner_time_status_idx
  on public.bookings (learner_id, scheduled_start_at, scheduled_end_at, status);

alter table public.bookings enable row level security;

-- Dropped and recreated so this file is the definition, not a guess about what is there.
drop policy if exists bookings_parties_or_moderator on public.bookings;
create policy bookings_parties_or_moderator on public.bookings for select
  using (learner_id = auth.uid() or instructor_id = auth.uid() or public.is_moderator_user());

-- A learner books for themselves and nobody else.
drop policy if exists bookings_learner_insert on public.bookings;
create policy bookings_learner_insert on public.bookings for insert
  with check (learner_id = auth.uid() and public.is_user_role('learner'));

drop policy if exists bookings_parties_update on public.bookings;
create policy bookings_parties_update on public.bookings for update
  using (learner_id = auth.uid() or instructor_id = auth.uid() or public.is_moderator_user())
  with check (learner_id = auth.uid() or instructor_id = auth.uid() or public.is_moderator_user());

drop policy if exists bookings_moderator_delete on public.bookings;
create policy bookings_moderator_delete on public.bookings for delete
  using (public.is_moderator_user());
