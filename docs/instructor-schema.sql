-- Prompt 7 Supabase-ready instructor management schema.
-- Apply only after reviewing against the live project migration plan.
create table if not exists public.instructor_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  public_slug text unique not null,
  public_display_name text not null,
  avatar_url text,
  public_bio text,
  teaching_approach text,
  subjects text[] not null default '{}',
  teaching_levels text[] not null default '{}',
  teaching_languages text[] not null default '{}',
  country text,
  city_region text,
  timezone text not null,
  years_experience text,
  hourly_rate numeric,
  currency text,
  trial_rate_placeholder text,
  course_formats text[] not null default '{}',
  profile_visibility text not null default 'private' check (profile_visibility in ('public','private')),
  public_profile_status text not null default 'draft' check (public_profile_status in ('draft','submitted','published','paused')),
  verification_status text not null default 'not_started' check (verification_status in ('not_started','draft','submitted','under_review','more_information_required','approved','rejected','suspended','expired')),
  training_status text not null default 'not_started' check (training_status in ('not_started','in_progress','completed')),
  test_status text not null default 'not_started' check (test_status in ('not_started','in_progress','submitted','passed','failed','retry_required')),
  profile_completion_percent int not null default 0 check (profile_completion_percent between 0 and 100),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.instructor_credentials (
  id uuid primary key default gen_random_uuid(), instructor_id uuid not null references public.instructor_profiles(user_id) on delete cascade,
  credential_type text not null, institution_name text, specialisation text, completion_year int, public_summary text,
  storage_bucket text not null default 'instructor-credentials', storage_path text, original_filename text, mime_type text, file_size bigint,
  review_status text not null default 'draft' check (review_status in ('draft','submitted','under_review','approved','rejected')),
  submitted_at timestamptz, reviewed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.instructor_training_modules (id uuid primary key default gen_random_uuid(), title text not null, description text, content_type text, content_reference text, required boolean not null default true, publication_status text not null default 'draft', created_at timestamptz not null default now());
create table if not exists public.instructor_training_progress (id uuid primary key default gen_random_uuid(), instructor_id uuid not null references public.instructor_profiles(user_id) on delete cascade, training_module_id uuid not null references public.instructor_training_modules(id) on delete cascade, status text not null default 'not_started', completed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(instructor_id, training_module_id));
create table if not exists public.instructor_test_attempts (id uuid primary key default gen_random_uuid(), instructor_id uuid not null references public.instructor_profiles(user_id) on delete cascade, test_id text not null, attempt_number int not null, status text not null default 'not_started', score numeric, submitted_at timestamptz, reviewed_at timestamptz, created_at timestamptz not null default now());
create table if not exists public.instructor_availability (id uuid primary key default gen_random_uuid(), instructor_id uuid not null references public.instructor_profiles(user_id) on delete cascade, day_of_week int not null check(day_of_week between 0 and 6), start_time time not null, end_time time not null, timezone text not null, is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(start_time < end_time));
-- Recommended private bucket: instructor-credentials. Keep it private; issue signed URLs only from authorized server/reviewer procedures.
-- RLS: instructors may select/update their own profile and own credential metadata; public may select only published public fields; public may never select credentials, private notes, training progress, test attempts, or review data.
-- RLS: verification_status, training_status, test_status, review_status, and scores are immutable to instructor clients; only trusted reviewer/admin procedures may update them.
