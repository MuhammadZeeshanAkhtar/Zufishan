-- Noor Ilm LMS Prompt 4 reference migration for a future Supabase project.
-- This file is documentation only in demo mode; it is not executed automatically.
-- Passwords remain exclusively in Supabase Auth (auth.users).

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  display_name text not null,
  avatar_url text,
  country text,
  city text,
  timezone text,
  preferred_language text not null default 'English',
  supported_languages text[] not null default '{}',
  bio text,
  onboarding_completed boolean not null default false,
  account_status text not null default 'active' check (account_status in ('active','pending','suspended','deleted')),
  profile_visibility text not null default 'public' check (profile_visibility in ('public','private')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('learner','instructor','moderator','admin','advisory_board','super_admin')),
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create table if not exists public.learner_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  learning_subjects text[] not null default '{}',
  learning_level text,
  learning_goal text,
  preferred_class_format text,
  preferred_days_times text,
  budget_range_placeholder text,
  tutor_preference_placeholder text,
  profile_status text not null default 'draft' check (profile_status in ('draft','published','paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.instructor_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  public_slug text unique not null,
  subjects text[] not null default '{}',
  teaching_levels text[] not null default '{}',
  teaching_languages text[] not null default '{}',
  years_experience integer,
  teaching_approach text,
  hourly_rate_placeholder text,
  availability_summary text,
  verification_status text not null default 'verification_pending' check (verification_status in ('verification_pending','process_coming_soon','approved','rejected')),
  public_profile_status text not null default 'draft' check (public_profile_status in ('draft','published','hidden')),
  training_status text not null default 'not_started',
  test_status text not null default 'not_started',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email_enabled boolean not null default true,
  class_reminders_enabled boolean not null default true,
  message_notifications_enabled boolean not null default true,
  course_updates_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_consents (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  consent_type text not null,
  consent_version text not null,
  accepted_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.learner_profiles enable row level security;
alter table public.instructor_profiles enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.user_consents enable row level security;

create policy "users read own profile" on public.profiles for select using (auth.uid() = id);
create policy "users update own profile" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "users insert own profile" on public.profiles for insert with check (auth.uid() = id);
create policy "users read own roles" on public.user_roles for select using (auth.uid() = user_id);
create policy "users read own learner profile" on public.learner_profiles for select using (auth.uid() = user_id);
create policy "learners update own learner profile" on public.learner_profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users read approved public instructors" on public.instructor_profiles for select using (public_profile_status = 'published' and verification_status = 'approved' or auth.uid() = user_id);
create policy "instructors update own profile fields" on public.instructor_profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id and verification_status = (select verification_status from public.instructor_profiles old where old.user_id = auth.uid()));
create policy "users manage own notifications" on public.notification_preferences for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users manage own consents" on public.user_consents for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Privileged role assignment and verification approval must be performed in a protected server/admin process.
