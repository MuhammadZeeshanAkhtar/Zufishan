-- Noor Ilm Browser Classroom schema proposal
-- Documentation only for the demo iteration. Do not apply until Supabase
-- profiles, bookings, and auth ownership are connected and reviewed.

create type public.class_session_status as enum (
  'scheduled', 'waiting_room', 'live', 'completed', 'cancelled', 'no_show'
);
create type public.class_recording_status as enum (
  'not_recorded', 'recording_pending', 'processing', 'ready', 'failed',
  'review_required', 'restricted'
);
create type public.class_participant_role as enum ('learner', 'instructor');
create type public.class_attendance_status as enum (
  'not_joined', 'present', 'left_early', 'no_show', 'technical_issue'
);
create type public.class_resource_visibility as enum ('private', 'participants');

create table public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid null references public.bookings(id) on delete set null,
  trial_request_id uuid null references public.trial_requests(id) on delete set null,
  course_id uuid null references public.courses(id) on delete set null,
  learner_id uuid not null references public.profiles(id) on delete restrict,
  instructor_id uuid not null references public.profiles(id) on delete restrict,
  title text not null,
  subject text not null,
  session_type text not null check (session_type in ('trial', 'course')),
  scheduled_start_at timestamptz not null,
  scheduled_end_at timestamptz not null,
  learner_timezone text not null,
  instructor_timezone text not null,
  status public.class_session_status not null default 'scheduled',
  live_provider text null,
  external_session_id text null,
  recording_status public.class_recording_status not null default 'not_recorded',
  started_at timestamptz null,
  ended_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (scheduled_end_at > scheduled_start_at),
  check (ended_at is null or started_at is not null),
  check (ended_at is null or ended_at >= started_at)
);

create table public.class_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.class_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.class_participant_role not null,
  joined_at timestamptz null,
  left_at timestamptz null,
  attendance_status public.class_attendance_status not null default 'not_joined',
  created_at timestamptz not null default now(),
  unique (session_id, user_id),
  check (left_at is null or joined_at is not null),
  check (left_at is null or left_at >= joined_at)
);

create table public.class_resources (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.class_sessions(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  file_type text not null,
  storage_path text not null,
  original_filename text not null,
  visibility public.class_resource_visibility not null default 'participants',
  file_size_bytes bigint null check (file_size_bytes is null or file_size_bytes > 0),
  created_at timestamptz not null default now()
);

create table public.class_recordings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.class_sessions(id) on delete cascade,
  provider text not null,
  external_recording_id text null,
  status public.class_recording_status not null default 'not_recorded',
  consent_recorded boolean not null default false,
  storage_path text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('not_recorded', 'recording_pending', 'processing', 'ready', 'failed', 'review_required', 'restricted')),
  check (status not in ('ready', 'processing') or consent_recorded = true)
);

create table public.whiteboard_states (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.class_sessions(id) on delete cascade,
  page_number integer not null default 1 check (page_number > 0),
  state_json jsonb not null default '{"strokes":[]}'::jsonb,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  updated_at timestamptz not null default now(),
  unique (session_id, page_number)
);

create table public.class_attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.class_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status public.class_attendance_status not null default 'not_joined',
  joined_at timestamptz null,
  left_at timestamptz null,
  duration_seconds integer null check (duration_seconds is null or duration_seconds >= 0),
  created_at timestamptz not null default now(),
  unique (session_id, user_id)
);

create index class_sessions_learner_idx on public.class_sessions (learner_id, scheduled_start_at desc);
create index class_sessions_instructor_idx on public.class_sessions (instructor_id, scheduled_start_at desc);
create index class_sessions_status_idx on public.class_sessions (status, scheduled_start_at);
create index class_participants_user_idx on public.class_participants (user_id, session_id);
create index class_resources_session_idx on public.class_resources (session_id, created_at desc);
create index class_recordings_status_idx on public.class_recordings (status, updated_at desc);
create index class_attendance_session_idx on public.class_attendance (session_id, user_id);

alter table public.class_sessions enable row level security;
alter table public.class_participants enable row level security;
alter table public.class_resources enable row level security;
alter table public.class_recordings enable row level security;
alter table public.whiteboard_states enable row level security;
alter table public.class_attendance enable row level security;

-- The final implementation should use security-definer helper functions for
-- participant membership and role checks. These policies are intentionally
-- explicit so unrelated learner sessions cannot be read.
create policy "session participants can read own sessions"
  on public.class_sessions for select
  using (auth.uid() = learner_id or auth.uid() = instructor_id);

create policy "session participants can read participants"
  on public.class_participants for select
  using (exists (
    select 1 from public.class_sessions s
    where s.id = class_participants.session_id
      and (auth.uid() = s.learner_id or auth.uid() = s.instructor_id)
  ));

create policy "session participants can read resources"
  on public.class_resources for select
  using (exists (
    select 1 from public.class_sessions s
    where s.id = class_resources.session_id
      and (auth.uid() = s.learner_id or auth.uid() = s.instructor_id)
  ));

create policy "assigned instructors can insert resources"
  on public.class_resources for insert
  with check (uploaded_by = auth.uid() and exists (
    select 1 from public.class_sessions s
    where s.id = class_resources.session_id and s.instructor_id = auth.uid()
  ));

create policy "session participants can read recordings"
  on public.class_recordings for select
  using (exists (
    select 1 from public.class_sessions s
    where s.id = class_recordings.session_id
      and (auth.uid() = s.learner_id or auth.uid() = s.instructor_id)
  ));

create policy "session participants can read whiteboards"
  on public.whiteboard_states for select
  using (exists (
    select 1 from public.class_sessions s
    where s.id = whiteboard_states.session_id
      and (auth.uid() = s.learner_id or auth.uid() = s.instructor_id)
  ));

create policy "participants can write whiteboards"
  on public.whiteboard_states for insert
  with check (updated_by = auth.uid() and exists (
    select 1 from public.class_sessions s
    where s.id = whiteboard_states.session_id
      and (auth.uid() = s.learner_id or auth.uid() = s.instructor_id)
  ));

create policy "session participants can read attendance"
  on public.class_attendance for select
  using (exists (
    select 1 from public.class_sessions s
    where s.id = class_attendance.session_id
      and (auth.uid() = s.learner_id or auth.uid() = s.instructor_id)
  ));

-- Attendance, duration, provider state, session transitions, and recording
-- consent should be written through protected server procedures, not arbitrary
-- client updates. Private resource bytes belong in a private Storage bucket;
-- only storage_path metadata is kept in Postgres and files are served through
-- short-lived signed URLs after the same participant check.

-- Mobile-ready service contract:
-- createClassroomSession(sessionId)
-- joinClassroomSession(sessionId, userId)
-- leaveClassroomSession(sessionId, userId)
-- endClassroomSession(sessionId, userId)
-- getParticipantStatus(sessionId)
-- getConnectionStatus(sessionId)
-- createBoard(sessionId)
-- saveBoardState(sessionId, state)
-- loadBoardState(sessionId)
-- broadcastBoardChange(sessionId, change)
-- markParticipantJoined(sessionId, userId)
-- startSession(sessionId, userId)
-- endSession(sessionId, userId)
-- calculateSessionDuration(sessionId)
-- recordAttendance(sessionId, userId, status)
