-- Noor Ilm Language Learning AI Tutor foundation.
-- Scope: language practice only. No religious-authority, Fatwa, general assistant,
-- payment, credential, private-message, or private-document data is stored here.
-- Idempotent for safe staging re-runs; contains no DROP, DELETE, or destructive ALTER.

create table if not exists public.ai_tutor_preferences (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.profiles(id) on delete cascade,
  target_language text not null check (char_length(target_language) between 2 and 80),
  native_language text not null check (char_length(native_language) between 2 and 80),
  level text not null check (level in ('beginner','elementary','intermediate','upper_intermediate','advanced')),
  goals text[] not null default '{}',
  correction_style text not null default 'standard' check (correction_style in ('gentle','standard','detailed')),
  topics text[] not null default '{}',
  session_length_minutes smallint not null default 15 check (session_length_minutes between 5 and 90),
  difficulty text not null default 'adaptive' check (difficulty in ('gentle','adaptive','challenging')),
  consent_version text not null,
  enabled boolean not null default true,
  instructor_sharing_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (learner_id)
);

create table if not exists public.ai_tutor_conversations (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null,
  lesson_id uuid references public.lessons(id) on delete set null,
  target_language text not null check (char_length(target_language) between 2 and 80),
  practice_mode text not null check (practice_mode in ('conversation','vocabulary','grammar','reading','writing','translation','pronunciation','lesson')),
  title text not null default 'Language practice',
  status text not null default 'active' check (status in ('active','archived','deleted')),
  share_with_instructor boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_tutor_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_tutor_conversations(id) on delete cascade,
  sender_type text not null check (sender_type in ('learner','ai')),
  content text not null check (char_length(content) between 1 and 12000),
  metadata_json jsonb,
  model_version text,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_tutor_progress (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.profiles(id) on delete cascade,
  target_language text not null check (char_length(target_language) between 2 and 80),
  practice_mode text not null check (practice_mode in ('conversation','vocabulary','grammar','reading','writing','translation','pronunciation','lesson')),
  sessions_count integer not null default 0 check (sessions_count >= 0),
  minutes_practised integer not null default 0 check (minutes_practised >= 0),
  vocabulary_count integer not null default 0 check (vocabulary_count >= 0),
  exercises_completed integer not null default 0 check (exercises_completed >= 0),
  confidence smallint check (confidence is null or confidence between 1 and 5),
  correction_count integer not null default 0 check (correction_count >= 0),
  updated_at timestamptz not null default now(),
  unique (learner_id, target_language, practice_mode)
);

create table if not exists public.ai_tutor_saved_items (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.profiles(id) on delete cascade,
  language text not null check (char_length(language) between 2 and 80),
  term text not null check (char_length(term) between 1 and 240),
  explanation text not null check (char_length(explanation) between 1 and 2000),
  example text check (example is null or char_length(example) <= 2000),
  source_conversation_id uuid references public.ai_tutor_conversations(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_tutor_reports (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_tutor_conversations(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('unsafe','incorrect','out_of_scope','privacy','other')),
  description text check (description is null or char_length(description) <= 4000),
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_tutor_conversations_learner_updated_idx on public.ai_tutor_conversations(learner_id, updated_at desc);
create index if not exists ai_tutor_conversations_course_idx on public.ai_tutor_conversations(course_id, updated_at desc);
create index if not exists ai_tutor_messages_conversation_created_idx on public.ai_tutor_messages(conversation_id, created_at);
create index if not exists ai_tutor_progress_learner_updated_idx on public.ai_tutor_progress(learner_id, updated_at desc);
create index if not exists ai_tutor_saved_items_learner_language_idx on public.ai_tutor_saved_items(learner_id, language, created_at desc);
create index if not exists ai_tutor_reports_status_created_idx on public.ai_tutor_reports(status, created_at desc);

alter table public.ai_tutor_preferences enable row level security;
alter table public.ai_tutor_conversations enable row level security;
alter table public.ai_tutor_messages enable row level security;
alter table public.ai_tutor_progress enable row level security;
alter table public.ai_tutor_saved_items enable row level security;
alter table public.ai_tutor_reports enable row level security;

-- Re-running this migration replaces only its own policy definitions.
drop policy if exists ai_tutor_preferences_own on public.ai_tutor_preferences;
drop policy if exists ai_tutor_preferences_admin on public.ai_tutor_preferences;
drop policy if exists ai_tutor_conversations_own_or_admin on public.ai_tutor_conversations;
drop policy if exists ai_tutor_conversations_instructor_consented on public.ai_tutor_conversations;
drop policy if exists ai_tutor_conversations_own_insert on public.ai_tutor_conversations;
drop policy if exists ai_tutor_conversations_own_update on public.ai_tutor_conversations;
drop policy if exists ai_tutor_conversations_own_delete on public.ai_tutor_conversations;
drop policy if exists ai_tutor_messages_own_or_admin on public.ai_tutor_messages;
drop policy if exists ai_tutor_messages_instructor_consented on public.ai_tutor_messages;
drop policy if exists ai_tutor_messages_own_insert on public.ai_tutor_messages;
drop policy if exists ai_tutor_messages_own_delete on public.ai_tutor_messages;
drop policy if exists ai_tutor_progress_own on public.ai_tutor_progress;
drop policy if exists ai_tutor_progress_admin on public.ai_tutor_progress;
drop policy if exists ai_tutor_saved_items_own on public.ai_tutor_saved_items;
drop policy if exists ai_tutor_reports_own_or_moderator on public.ai_tutor_reports;
drop policy if exists ai_tutor_reports_own_insert on public.ai_tutor_reports;
drop policy if exists ai_tutor_reports_moderator_update on public.ai_tutor_reports;

create policy ai_tutor_preferences_own on public.ai_tutor_preferences for all using (learner_id = auth.uid()) with check (learner_id = auth.uid());
create policy ai_tutor_preferences_admin on public.ai_tutor_preferences for select using (public.is_admin_user());

create policy ai_tutor_conversations_own_or_admin on public.ai_tutor_conversations for select using (learner_id = auth.uid() or public.is_admin_user());
create policy ai_tutor_conversations_instructor_consented on public.ai_tutor_conversations for select using (
  share_with_instructor = true and exists (
    select 1 from public.courses c
    where c.id = course_id and c.instructor_id = auth.uid()
  )
);
create policy ai_tutor_conversations_own_insert on public.ai_tutor_conversations for insert with check (learner_id = auth.uid());
create policy ai_tutor_conversations_own_update on public.ai_tutor_conversations for update using (learner_id = auth.uid() or public.is_admin_user()) with check (learner_id = auth.uid() or public.is_admin_user());
create policy ai_tutor_conversations_own_delete on public.ai_tutor_conversations for delete using (learner_id = auth.uid() or public.is_admin_user());

create policy ai_tutor_messages_own_or_admin on public.ai_tutor_messages for select using (
  public.is_admin_user() or exists (select 1 from public.ai_tutor_conversations c where c.id = conversation_id and c.learner_id = auth.uid())
);
create policy ai_tutor_messages_instructor_consented on public.ai_tutor_messages for select using (
  exists (
    select 1 from public.ai_tutor_conversations c join public.courses course on course.id = c.course_id
    where c.id = conversation_id and c.share_with_instructor = true and course.instructor_id = auth.uid()
  )
);
create policy ai_tutor_messages_own_insert on public.ai_tutor_messages for insert with check (
  sender_type = 'learner' and exists (select 1 from public.ai_tutor_conversations c where c.id = conversation_id and c.learner_id = auth.uid())
);
create policy ai_tutor_messages_own_delete on public.ai_tutor_messages for delete using (
  exists (select 1 from public.ai_tutor_conversations c where c.id = conversation_id and c.learner_id = auth.uid()) or public.is_admin_user()
);

create policy ai_tutor_progress_own on public.ai_tutor_progress for all using (learner_id = auth.uid()) with check (learner_id = auth.uid());
create policy ai_tutor_progress_admin on public.ai_tutor_progress for select using (public.is_admin_user());

create policy ai_tutor_saved_items_own on public.ai_tutor_saved_items for all using (learner_id = auth.uid()) with check (learner_id = auth.uid());

create policy ai_tutor_reports_own_or_moderator on public.ai_tutor_reports for select using (reporter_id = auth.uid() or public.is_moderator_user());
create policy ai_tutor_reports_own_insert on public.ai_tutor_reports for insert with check (
  reporter_id = auth.uid() and exists (select 1 from public.ai_tutor_conversations c where c.id = conversation_id and c.learner_id = auth.uid())
);
create policy ai_tutor_reports_moderator_update on public.ai_tutor_reports for update using (public.is_moderator_user()) with check (public.is_moderator_user());

comment on table public.ai_tutor_preferences is 'Language-learning preferences only; never store inferred sensitive attributes.';
comment on table public.ai_tutor_conversations is 'Private language practice conversations; not a religious authority or general assistant record.';
comment on table public.ai_tutor_messages is 'AI and learner language-practice messages; never copy raw content to ordinary logs or audit events.';
comment on column public.ai_tutor_preferences.instructor_sharing_enabled is 'Explicit learner consent flag; instructor aggregate access remains server-policy scoped.';
comment on column public.ai_tutor_conversations.share_with_instructor is 'Explicit per-conversation consent required before any instructor read access.';
