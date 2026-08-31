-- Noor Ilm LMS: additive Hifz records, instructor reviews, and reminders.
-- Safe migration: no DROP TABLE, DELETE, or destructive rewrite of existing rows.

alter table public.hifz_plans
  add column if not exists instructor_id uuid references public.profiles(id) on delete set null,
  add column if not exists start_date date not null default current_date,
  add column if not exists target_date date,
  add column if not exists current_reference_json jsonb not null default '{}'::jsonb,
  add column if not exists daily_target_json jsonb not null default '{"ayahs":5}'::jsonb,
  add column if not exists weekly_target_json jsonb not null default '{}'::jsonb,
  add column if not exists preferred_days text[] not null default '{}'::text[],
  add column if not exists reminder_time time,
  add column if not exists timezone text not null default 'UTC';

alter table public.hifz_plans
  drop constraint if exists hifz_plans_target_date_check;
alter table public.hifz_plans
  add constraint hifz_plans_target_date_check check (target_date is null or target_date >= start_date);

create table if not exists public.hifz_records (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.hifz_plans(id) on delete cascade,
  learner_id uuid not null references public.profiles(id) on delete cascade,
  instructor_id uuid references public.profiles(id) on delete set null,
  record_date date not null,
  reference_json jsonb not null default '{}'::jsonb,
  session_type text not null check (session_type in ('new_memorisation','revision','assessment')),
  section_type text not null check (section_type in ('sabaq','sabqi','manzil')),
  status text not null default 'planned' check (status in ('planned','practiced','submitted_for_review','reviewed','needs_revision','approved','paused')),
  self_rating smallint check (self_rating between 1 and 5),
  mistake_count integer check (mistake_count is null or mistake_count >= 0),
  practice_minutes integer check (practice_minutes is null or practice_minutes between 0 and 1440),
  learner_note text,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, record_date, section_type)
);

alter table public.hifz_reviews
  add column if not exists record_id uuid references public.hifz_records(id) on delete cascade,
  add column if not exists instructor_id uuid references public.profiles(id) on delete set null,
  add column if not exists status text not null default 'reviewed' check (status in ('submitted_for_review','reviewed','needs_revision','approved')),
  add column if not exists quality_rating smallint check (quality_rating is null or quality_rating between 1 and 5),
  add column if not exists mistake_categories text[] not null default '{}'::text[],
  add column if not exists feedback_note text,
  add column if not exists revision_recommendation text,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;

create table if not exists public.hifz_reminders (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.hifz_plans(id) on delete cascade,
  learner_id uuid not null references public.profiles(id) on delete cascade,
  reminder_type text not null check (reminder_type in ('daily_sabaq','sabqi_revision','manzil_revision','pending_review','needs_revision','weekly_progress')),
  scheduled_for timestamptz not null,
  timezone text not null default 'UTC',
  status text not null default 'scheduled' check (status in ('scheduled','sent','cancelled','skipped')),
  idempotency_key text not null,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (learner_id, idempotency_key)
);

create index if not exists hifz_plans_instructor_idx on public.hifz_plans(instructor_id, updated_at desc);
create index if not exists hifz_records_learner_date_idx on public.hifz_records(learner_id, record_date desc);
create index if not exists hifz_records_plan_section_idx on public.hifz_records(plan_id, section_type, record_date desc);
create index if not exists hifz_records_instructor_status_idx on public.hifz_records(instructor_id, status, record_date desc);
create index if not exists hifz_reviews_record_idx on public.hifz_reviews(record_id, reviewed_at desc);
create index if not exists hifz_reviews_instructor_idx on public.hifz_reviews(instructor_id, reviewed_at desc);
create index if not exists hifz_reminders_learner_schedule_idx on public.hifz_reminders(learner_id, scheduled_for desc);

alter table public.hifz_records enable row level security;
alter table public.hifz_reminders enable row level security;

-- Strengthen the existing review policies without removing any data.
drop policy if exists hifz_reviews_own_select on public.hifz_reviews;
drop policy if exists hifz_reviews_own_write on public.hifz_reviews;
create policy hifz_reviews_authorised_select on public.hifz_reviews for select using (
  learner_id = auth.uid()
  or instructor_id = auth.uid()
  or public.is_moderator_user()
);
create policy hifz_reviews_learner_insert on public.hifz_reviews for insert with check (
  learner_id = auth.uid()
  and instructor_id is null
  and reviewed_by is null
  and exists (select 1 from public.hifz_plans p where p.id = plan_id and p.learner_id = auth.uid())
);
create policy hifz_reviews_learner_update on public.hifz_reviews for update using (
  learner_id = auth.uid() and instructor_id is null and reviewed_by is null
) with check (
  learner_id = auth.uid() and instructor_id is null and reviewed_by is null
);
create policy hifz_reviews_instructor_manage on public.hifz_reviews for all using (
  instructor_id = auth.uid() and public.is_user_role('instructor')
) with check (
  instructor_id = auth.uid() and public.is_user_role('instructor')
);

create policy hifz_records_learner_select on public.hifz_records for select using (
  learner_id = auth.uid() or public.is_moderator_user()
  or instructor_id = auth.uid()
);
create policy hifz_records_learner_insert on public.hifz_records for insert with check (
  learner_id = auth.uid()
  and exists (select 1 from public.hifz_plans p where p.id = plan_id and p.learner_id = auth.uid())
);
create policy hifz_records_learner_update on public.hifz_records for update using (
  learner_id = auth.uid() and status in ('planned','practiced','needs_revision','paused')
) with check (
  learner_id = auth.uid()
  and status in ('planned','practiced','needs_revision','paused','submitted_for_review')
);
create policy hifz_records_instructor_select on public.hifz_records for select using (
  instructor_id = auth.uid() and public.is_user_role('instructor')
);

create policy hifz_reminders_own_select on public.hifz_reminders for select using (learner_id = auth.uid() or public.is_moderator_user());
create policy hifz_reminders_own_write on public.hifz_reminders for all using (learner_id = auth.uid()) with check (
  learner_id = auth.uid()
  and exists (select 1 from public.hifz_plans p where p.id = plan_id and p.learner_id = auth.uid())
);
