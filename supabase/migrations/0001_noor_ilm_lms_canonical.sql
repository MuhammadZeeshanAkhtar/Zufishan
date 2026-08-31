-- Noor Ilm LMS canonical PostgreSQL migration (Prompt 8)
-- REVIEW ONLY: not applied by this task because no verified Supabase PostgreSQL
-- migration channel/connection string is available. Fails fast on duplicates.
create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null, display_name text not null, avatar_url text,
  country text, city text, timezone text, preferred_language text not null default 'English',
  supported_languages text[] not null default '{}', bio text,
  onboarding_completed boolean not null default false,
  account_status text not null default 'active' check (account_status in ('active','pending','suspended','deleted')),
  profile_visibility text not null default 'public' check (profile_visibility in ('public','private')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.user_roles (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('learner','instructor','moderator','finance','admin','advisory_board','super_admin')),
  created_at timestamptz not null default now(), unique (user_id, role)
);
create table public.learner_profiles (
  user_id uuid primary key references profiles(id) on delete cascade,
  learning_subjects text[] not null default '{}', learning_level text, learning_goal text,
  preferred_class_format text, preferred_days_times text, budget_range text,
  tutor_preference text, profile_status text not null default 'draft' check (profile_status in ('draft','published','paused')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.instructor_profiles (
  user_id uuid primary key references profiles(id) on delete cascade,
  public_slug text not null unique, subjects text[] not null default '{}', teaching_levels text[] not null default '{}',
  teaching_languages text[] not null default '{}', years_experience integer check (years_experience is null or years_experience >= 0),
  teaching_approach text, hourly_rate_minor bigint, currency text, availability_summary text,
  verification_status text not null default 'verification_pending' check (verification_status in ('verification_pending','process_coming_soon','approved','rejected')),
  public_profile_status text not null default 'draft' check (public_profile_status in ('draft','published','hidden')),
  training_status text not null default 'not_started', test_status text not null default 'not_started',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.instructor_credentials (
  id uuid primary key default gen_random_uuid(), instructor_id uuid not null references instructor_profiles(user_id) on delete cascade,
  object_path text not null, mime_type text not null, size_bytes bigint not null check (size_bytes > 0),
  review_status text not null default 'pending' check (review_status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);
create table public.instructor_media (
  id uuid primary key default gen_random_uuid(), instructor_id uuid not null references instructor_profiles(user_id) on delete cascade,
  object_path text not null, mime_type text not null, size_bytes bigint not null check (size_bytes > 0),
  visibility text not null default 'private' check (visibility in ('private','public')), created_at timestamptz not null default now()
);
create table public.learner_requirements (
  id uuid primary key default gen_random_uuid(), learner_id uuid not null references profiles(id) on delete cascade,
  subject text not null, level text not null, goal text not null, preferred_language text not null,
  timezone text not null, availability text not null, budget_minor bigint, currency text,
  status text not null default 'draft' check (status in ('draft','published','matched','closed','cancelled')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.requirement_responses (
  id uuid primary key default gen_random_uuid(), requirement_id uuid not null references learner_requirements(id) on delete cascade,
  instructor_id uuid not null references profiles(id) on delete cascade, message text not null,
  status text not null default 'pending' check (status in ('pending','shortlisted','accepted','rejected','withdrawn')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(requirement_id,instructor_id)
);
create table public.learner_shortlists (
  learner_id uuid not null references profiles(id) on delete cascade, instructor_id uuid not null references profiles(id) on delete cascade,
  requirement_id uuid references learner_requirements(id) on delete set null, created_at timestamptz not null default now(),
  primary key (learner_id,instructor_id,requirement_id)
);
create table public.instructor_availability (
  id uuid primary key default gen_random_uuid(), instructor_id uuid not null references profiles(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6), start_local time not null, end_local time not null,
  timezone text not null, active boolean not null default true, check (end_local > start_local), unique(instructor_id,weekday,start_local,end_local)
);
create table public.trial_requests (
  id uuid primary key default gen_random_uuid(), learner_id uuid not null references profiles(id) on delete cascade,
  instructor_id uuid not null references profiles(id) on delete cascade, course_id uuid,
  requirement_id uuid references learner_requirements(id) on delete set null, subject text not null,
  learner_timezone text not null, instructor_timezone text not null, requested_start_at timestamptz not null,
  requested_end_at timestamptz not null, learner_message text not null, instructor_response text,
  proposed_start_at timestamptz, proposed_end_at timestamptz,
  status text not null default 'pending' check (status in ('draft','pending','proposed','accepted','rejected','cancelled','completed')),
  cancellation_reason text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check(requested_end_at > requested_start_at), check(proposed_end_at is null or proposed_end_at > proposed_start_at)
);
create table public.courses (
  id uuid primary key default gen_random_uuid(), instructor_id uuid not null references profiles(id) on delete cascade,
  slug text not null unique, title text not null, description text not null, subject text not null, level text not null,
  language text not null, thumbnail_path text, status text not null default 'draft' check (status in ('draft','in_review','published','rejected','archived')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.trial_requests add constraint trial_requests_course_fk foreign key (course_id) references public.courses(id) on delete set null;
create table public.course_modules (
  id uuid primary key default gen_random_uuid(), course_id uuid not null references courses(id) on delete cascade,
  title text not null, description text, sort_order integer not null default 0, status text not null default 'draft',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(course_id,sort_order)
);
create table public.lessons (
  id uuid primary key default gen_random_uuid(), module_id uuid not null references course_modules(id) on delete cascade,
  title text not null, description text, duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  transcript text, media_path text, sort_order integer not null default 0, status text not null default 'draft' check (status in ('draft','published','archived')),
  is_preview boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(module_id,sort_order)
);
create table public.class_sessions (
  id uuid primary key default gen_random_uuid(), trial_request_id uuid references trial_requests(id) on delete set null,
  course_id uuid references courses(id) on delete set null, learner_id uuid not null references profiles(id) on delete cascade,
  instructor_id uuid not null references profiles(id) on delete cascade, title text not null, session_type text not null check (session_type in ('trial','course')),
  scheduled_start_at timestamptz not null, scheduled_end_at timestamptz not null, learner_timezone text not null, instructor_timezone text not null,
  status text not null default 'scheduled' check (status in ('scheduled','waiting_room','live','completed','cancelled','no_show')),
  live_provider text, external_session_id text, recording_status text not null default 'not_configured',
  learner_joined_at timestamptz, instructor_joined_at timestamptz, ended_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check(scheduled_end_at > scheduled_start_at)
);
create table public.class_participants (
  session_id uuid not null references class_sessions(id) on delete cascade, user_id uuid not null references profiles(id) on delete cascade,
  participant_role text not null check (participant_role in ('learner','instructor')), joined_at timestamptz, left_at timestamptz, primary key(session_id,user_id)
);
create table public.class_attendance (
  id uuid primary key default gen_random_uuid(), session_id uuid not null references class_sessions(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade, joined_at timestamptz, left_at timestamptz, status text not null default 'pending', unique(session_id,user_id)
);
create table public.enrolments (
  id uuid primary key default gen_random_uuid(), learner_id uuid not null references profiles(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade, status text not null default 'active' check(status in ('pending','active','completed','cancelled')),
  enrolled_at timestamptz not null default now(), completed_at timestamptz, unique(learner_id,course_id)
);
create table public.lesson_progress (
  learner_id uuid not null references profiles(id) on delete cascade, lesson_id uuid not null references lessons(id) on delete cascade,
  status text not null default 'not_started' check(status in ('not_started','in_progress','completed')), progress_percent smallint not null default 0 check(progress_percent between 0 and 100),
  last_position_seconds integer not null default 0, updated_at timestamptz not null default now(), primary key(learner_id,lesson_id)
);
create table public.assignments (
  id uuid primary key default gen_random_uuid(), course_id uuid not null references courses(id) on delete cascade, title text not null, instructions text, due_offset_days integer, created_at timestamptz not null default now()
);
create table public.submissions (
  id uuid primary key default gen_random_uuid(), assignment_id uuid not null references assignments(id) on delete cascade, learner_id uuid not null references profiles(id) on delete cascade,
  object_path text, body text, status text not null default 'submitted', score numeric, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(assignment_id,learner_id)
);
create table public.quizzes (
  id uuid primary key default gen_random_uuid(), course_id uuid not null references courses(id) on delete cascade, title text not null, questions jsonb not null default '[]', created_at timestamptz not null default now()
);
create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(), quiz_id uuid not null references quizzes(id) on delete cascade, learner_id uuid not null references profiles(id) on delete cascade,
  answers jsonb not null default '{}', score numeric, submitted_at timestamptz, created_at timestamptz not null default now()
);
create table public.certificates (
  id uuid primary key default gen_random_uuid(), learner_id uuid not null references profiles(id) on delete cascade, course_id uuid not null references courses(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','issued','revoked')), certificate_path text, issued_at timestamptz, unique(learner_id,course_id)
);
create table public.conversations (
  id uuid primary key default gen_random_uuid(), subject text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.conversation_members (
  conversation_id uuid not null references conversations(id) on delete cascade, user_id uuid not null references profiles(id) on delete cascade,
  member_role text, joined_at timestamptz not null default now(), primary key(conversation_id,user_id)
);
create table public.messages (
  id uuid primary key default gen_random_uuid(), conversation_id uuid not null references conversations(id) on delete cascade, sender_id uuid not null references profiles(id) on delete cascade,
  body text not null, attachment_path text, read_at timestamptz, created_at timestamptz not null default now()
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id) on delete cascade, type text not null, title text not null, body text not null,
  related_entity_type text, related_entity_id uuid, read_at timestamptz, created_at timestamptz not null default now()
);
create table public.notification_preferences (
  user_id uuid primary key references profiles(id) on delete cascade, email_enabled boolean not null default true, class_reminders_enabled boolean not null default true,
  message_notifications_enabled boolean not null default true, course_updates_enabled boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.reviews (
  id uuid primary key default gen_random_uuid(), session_id uuid not null references class_sessions(id) on delete cascade, reviewer_id uuid not null references profiles(id) on delete cascade,
  instructor_id uuid not null references profiles(id) on delete cascade, rating smallint check(rating between 1 and 5), body text not null, status text not null default 'pending' check(status in ('pending','published','rejected','hidden')),
  created_at timestamptz not null default now(), unique(session_id,reviewer_id)
);
create table public.review_reports (
  id uuid primary key default gen_random_uuid(), review_id uuid not null references reviews(id) on delete cascade, reporter_id uuid not null references profiles(id) on delete cascade,
  reason text not null, status text not null default 'open', created_at timestamptz not null default now(), unique(review_id,reporter_id)
);
create table public.reports (
  id uuid primary key default gen_random_uuid(), reporter_id uuid not null references profiles(id) on delete cascade, target_type text not null, target_id uuid not null,
  reason text not null, status text not null default 'open', created_at timestamptz not null default now()
);
create table public.session_ledger (
  id uuid primary key default gen_random_uuid(), session_id uuid not null references class_sessions(id) on delete cascade, learner_id uuid not null references profiles(id) on delete cascade,
  instructor_id uuid not null references profiles(id) on delete cascade, amount_minor bigint, currency text, payment_status text not null default 'not_configured',
  gross_minor bigint, fee_minor bigint, net_minor bigint, created_at timestamptz not null default now(), unique(session_id)
);
create table public.payment_references (
  id uuid primary key default gen_random_uuid(), ledger_id uuid not null references session_ledger(id) on delete cascade, provider text not null, provider_reference text not null,
  status text not null default 'pending', amount_minor bigint not null, currency text not null, created_at timestamptz not null default now(), unique(provider,provider_reference)
);
create table public.withdrawal_requests (
  id uuid primary key default gen_random_uuid(), instructor_id uuid not null references profiles(id) on delete cascade, amount_minor bigint not null check(amount_minor > 0), currency text not null,
  status text not null default 'pending' check(status in ('pending','approved','paid','rejected','cancelled')), provider_reference text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.moderation_cases (
  id uuid primary key default gen_random_uuid(), opened_by uuid not null references profiles(id) on delete cascade, target_type text not null, target_id uuid not null,
  status text not null default 'open' check(status in ('open','investigating','resolved','dismissed')), priority text not null default 'normal', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references moderation_cases(id) on delete cascade, actor_id uuid not null references profiles(id) on delete cascade,
  action_type text not null, reason text not null, prior_value jsonb, new_value jsonb, created_at timestamptz not null default now()
);
create table public.audit_logs (
  id bigint generated always as identity primary key, actor_id uuid references profiles(id) on delete set null, action text not null, entity_type text not null, entity_id uuid,
  metadata jsonb not null default '{}', created_at timestamptz not null default now()
);
create table public.admin_settings (
  key text primary key, value jsonb not null default '{}', updated_by uuid references profiles(id) on delete set null, updated_at timestamptz not null default now()
);

create index learner_requirements_learner_status_idx on learner_requirements(learner_id,status);
create index requirement_responses_instructor_status_idx on requirement_responses(instructor_id,status);
create index courses_instructor_status_idx on courses(instructor_id,status);
create index courses_public_idx on courses(status,subject,level);
create index lessons_module_status_idx on lessons(module_id,status);
create index sessions_learner_time_idx on class_sessions(learner_id,scheduled_start_at);
create index sessions_instructor_time_idx on class_sessions(instructor_id,scheduled_start_at);
create index conversation_members_user_idx on conversation_members(user_id);
create index messages_conversation_time_idx on messages(conversation_id,created_at);
create index notifications_user_read_idx on notifications(user_id,read_at,created_at);
create index ledger_instructor_time_idx on session_ledger(instructor_id,created_at);
create index audit_logs_entity_time_idx on audit_logs(entity_type,entity_id,created_at);

-- RLS is intentionally included as a review marker but not executed here.
-- Apply deny-by-default policies only after validating helper functions and staged identities.
comment on schema public is 'Noor Ilm LMS canonical schema; Prompt 8 migration review artifact';
