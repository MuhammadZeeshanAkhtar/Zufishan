-- Noor Ilm LMS: additive Hifz tracker foundation.
-- Apply through the verified Supabase PostgreSQL channel after review.
-- No DROP, DELETE, or changes to existing user data.

create table if not exists public.hifz_plans (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  daily_target_ayahs integer not null default 5 check (daily_target_ayahs between 1 and 100),
  status text not null default 'active' check (status in ('active','paused','completed','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hifz_reviews (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.hifz_plans(id) on delete cascade,
  learner_id uuid not null references public.profiles(id) on delete cascade,
  review_type text not null check (review_type in ('sabaq','sabqi','manzil')),
  surah_number smallint not null check (surah_number between 1 and 114),
  ayah_from integer not null check (ayah_from >= 1),
  ayah_to integer not null check (ayah_to >= ayah_from),
  quality smallint not null check (quality between 1 and 5),
  notes text,
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists hifz_plans_learner_updated_idx on public.hifz_plans(learner_id, updated_at desc);
create index if not exists hifz_reviews_learner_reviewed_idx on public.hifz_reviews(learner_id, reviewed_at desc);
create index if not exists hifz_reviews_plan_type_idx on public.hifz_reviews(plan_id, review_type, reviewed_at desc);

alter table public.hifz_plans enable row level security;
alter table public.hifz_reviews enable row level security;

create policy hifz_plans_own_select on public.hifz_plans for select using (learner_id = auth.uid() or public.is_moderator_user());
create policy hifz_plans_own_write on public.hifz_plans for all using (learner_id = auth.uid()) with check (learner_id = auth.uid());
create policy hifz_reviews_own_select on public.hifz_reviews for select using (learner_id = auth.uid() or public.is_moderator_user());
create policy hifz_reviews_own_write on public.hifz_reviews for all using (learner_id = auth.uid()) with check (learner_id = auth.uid() and exists (select 1 from public.hifz_plans p where p.id = plan_id and p.learner_id = auth.uid()));
