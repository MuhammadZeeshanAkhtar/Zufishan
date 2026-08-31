-- Noor Ilm scheduling persistence: additive only; no table drops or data deletion.
-- Booking is required because trial_requests represent the negotiation lifecycle,
-- while bookings represent the confirmed slot used to create exactly one session.

create extension if not exists btree_gist;

alter table public.instructor_availability
  add column if not exists available_on date,
  add column if not exists exception_type text not null default 'weekly',
  add column if not exists is_break boolean not null default false,
  add column if not exists course_id uuid references public.courses(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

alter table public.instructor_availability
  drop constraint if exists instructor_availability_exception_type_check;
alter table public.instructor_availability
  add constraint instructor_availability_exception_type_check
  check (exception_type in ('weekly','date_exception','break'));

alter table public.instructor_availability
  drop constraint if exists instructor_availability_date_shape_check;
alter table public.instructor_availability
  add constraint instructor_availability_date_shape_check
  check ((exception_type = 'weekly' and available_on is null) or (exception_type in ('date_exception','break') and available_on is not null));

create index if not exists instructor_availability_public_slot_idx
  on public.instructor_availability(instructor_id, available_on, weekday, active, start_local, end_local);

alter table public.trial_requests
  add column if not exists expires_at timestamptz,
  add column if not exists idempotency_key text,
  add column if not exists confirmed_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references public.profiles(id) on delete set null;

alter table public.trial_requests
  drop constraint if exists trial_requests_status_check;
alter table public.trial_requests
  add constraint trial_requests_status_check
  check (status in ('draft','pending','requested','proposed','proposed_new_time','accepted','declined','rejected','cancelled','scheduled','waiting_room','live','completed','no_show','disputed'));

create unique index if not exists trial_requests_learner_idempotency_idx
  on public.trial_requests(learner_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists trial_requests_instructor_time_status_idx
  on public.trial_requests(instructor_id, requested_start_at, requested_end_at, status);
create index if not exists trial_requests_learner_time_status_idx
  on public.trial_requests(learner_id, requested_start_at, requested_end_at, status);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  trial_request_id uuid not null references public.trial_requests(id) on delete cascade,
  learner_id uuid not null references public.profiles(id) on delete cascade,
  instructor_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null,
  subject text not null,
  scheduled_start_at timestamptz not null,
  scheduled_end_at timestamptz not null,
  learner_timezone text not null,
  instructor_timezone text not null,
  status text not null default 'confirmed' check (status in ('confirmed','cancelled','expired','completed','no_show','disputed')),
  idempotency_key text not null,
  confirmed_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(trial_request_id),
  unique(idempotency_key),
  check (scheduled_end_at > scheduled_start_at)
);

create index if not exists bookings_instructor_time_status_idx
  on public.bookings(instructor_id, scheduled_start_at, scheduled_end_at, status);
create index if not exists bookings_learner_time_status_idx
  on public.bookings(learner_id, scheduled_start_at, scheduled_end_at, status);

alter table public.class_sessions
  add column if not exists booking_id uuid references public.bookings(id) on delete set null;
create unique index if not exists class_sessions_booking_unique_idx
  on public.class_sessions(booking_id)
  where booking_id is not null;

alter table public.notifications
  add column if not exists locale text not null default 'en',
  add column if not exists idempotency_key text;
create unique index if not exists notifications_recipient_idempotency_idx
  on public.notifications(user_id, idempotency_key)
  where idempotency_key is not null;

-- PostgreSQL exclusion constraints make accepted/scheduled slot races fail safely.
alter table public.bookings
  drop constraint if exists bookings_instructor_slot_excl;
alter table public.bookings
  add constraint bookings_instructor_slot_excl
  exclude using gist (
    instructor_id with =,
    tstzrange(scheduled_start_at, scheduled_end_at, '[)') with &&
  ) where (status in ('confirmed','completed','no_show','disputed'));

alter table public.bookings
  drop constraint if exists bookings_learner_slot_excl;
alter table public.bookings
  add constraint bookings_learner_slot_excl
  exclude using gist (
    learner_id with =,
    tstzrange(scheduled_start_at, scheduled_end_at, '[)') with &&
  ) where (status in ('confirmed','completed','no_show','disputed'));

alter table public.class_sessions
  drop constraint if exists class_sessions_instructor_slot_excl;
alter table public.class_sessions
  add constraint class_sessions_instructor_slot_excl
  exclude using gist (
    instructor_id with =,
    tstzrange(scheduled_start_at, scheduled_end_at, '[)') with &&
  ) where (status in ('scheduled','waiting_room','live','completed','no_show'));

alter table public.class_sessions
  drop constraint if exists class_sessions_learner_slot_excl;
alter table public.class_sessions
  add constraint class_sessions_learner_slot_excl
  exclude using gist (
    learner_id with =,
    tstzrange(scheduled_start_at, scheduled_end_at, '[)') with &&
  ) where (status in ('scheduled','waiting_room','live','completed','no_show'));

alter table public.bookings enable row level security;

create policy bookings_parties_or_moderator on public.bookings
  for select using (learner_id = auth.uid() or instructor_id = auth.uid() or public.is_moderator_user());
create policy bookings_learner_insert on public.bookings
  for insert with check (learner_id = auth.uid() and public.is_user_role('learner'));
create policy bookings_parties_update on public.bookings
  for update using (learner_id = auth.uid() or instructor_id = auth.uid() or public.is_moderator_user())
  with check (learner_id = auth.uid() or instructor_id = auth.uid() or public.is_moderator_user());
create policy bookings_moderator_delete on public.bookings
  for delete using (public.is_moderator_user());

-- Tighten direct table status manipulation: transition procedures remain the application boundary.
comment on table public.bookings is 'Confirmed scheduling records. Use protected server procedures for status transitions; exclusion constraints prevent overlapping confirmed slots.';
comment on column public.trial_requests.idempotency_key is 'Client retry key scoped to learner; never trusted as authorization.';
comment on column public.notifications.idempotency_key is 'Recipient-scoped retry key preventing duplicate in-app scheduling notifications.';
