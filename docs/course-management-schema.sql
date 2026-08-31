-- Noor Ilm Prompt 9 course management schema reference
-- This file is documentation for the intended Supabase/PostgreSQL implementation.
-- It is not applied in demo mode; no service-role key is exposed to the client.

create type public.course_status as enum ('draft', 'submitted', 'under_review', 'published', 'rejected', 'archived', 'suspended');
create type public.course_access_type as enum ('free', 'paid', 'coming_soon');
create type public.course_level as enum ('beginner', 'intermediate', 'advanced', 'children');
create type public.course_format as enum ('recorded', 'live_planned', 'one_to_one', 'group');
create type public.module_status as enum ('draft', 'published');
create type public.lesson_content_type as enum ('video', 'audio', 'text', 'document', 'quiz', 'assignment');
create type public.lesson_status as enum ('draft', 'published');
create type public.enrolment_status as enum ('active', 'paused', 'completed', 'cancelled');
create type public.lesson_progress_status as enum ('not_started', 'in_progress', 'completed');
create type public.submission_status as enum ('not_started', 'submitted', 'reviewed', 'returned');
create type public.certificate_status as enum ('not_eligible', 'in_progress', 'eligible', 'under_review', 'issued');

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  instructor_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  slug text not null unique,
  short_description text not null default '',
  description text not null default '',
  subject text not null,
  level public.course_level not null,
  language text not null,
  format public.course_format not null,
  price_amount numeric(12,2),
  currency text,
  access_type public.course_access_type not null default 'coming_soon',
  thumbnail_path text,
  duration_minutes integer not null default 0 check (duration_minutes >= 0),
  weekly_effort text not null default '',
  learning_outcomes jsonb not null default '[]'::jsonb,
  prerequisites text not null default '',
  syllabus_summary text not null default '',
  preview_lesson_id uuid,
  status public.course_status not null default 'draft',
  moderation_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((access_type = 'paid' and price_amount is not null and currency is not null) or access_type <> 'paid')
);

create table if not exists public.course_modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  title text not null,
  description text not null default '',
  module_order integer not null check (module_order > 0),
  status public.module_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(course_id, module_order)
);

create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.course_modules(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  title text not null,
  description text not null default '',
  lesson_order integer not null check (lesson_order > 0),
  content_type public.lesson_content_type not null,
  duration_minutes integer not null default 0 check (duration_minutes >= 0),
  media_path text,
  transcript text,
  is_preview boolean not null default false,
  is_downloadable boolean not null default false,
  status public.lesson_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(module_id, lesson_order)
);

alter table public.courses add constraint courses_preview_lesson_fk foreign key (preview_lesson_id) references public.lessons(id) on delete set null;

create table if not exists public.enrolments (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  status public.enrolment_status not null default 'active',
  enrolled_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(learner_id, course_id)
);

create table if not exists public.lesson_progress (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  status public.lesson_progress_status not null default 'not_started',
  progress_percent integer not null default 0 check (progress_percent between 0 and 100),
  last_position_seconds integer not null default 0 check (last_position_seconds >= 0),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(learner_id, lesson_id)
);

create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  instructions text not null default '',
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  learner_id uuid not null references auth.users(id) on delete cascade,
  storage_path text,
  status public.submission_status not null default 'not_started',
  score numeric(6,2),
  feedback text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(assignment_id, learner_id)
);

create table if not exists public.certificates (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  status public.certificate_status not null default 'not_eligible',
  issued_at timestamptz,
  reviewed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(learner_id, course_id)
);

create index if not exists courses_instructor_status_idx on public.courses(instructor_id, status);
create index if not exists courses_public_subject_idx on public.courses(status, subject, level);
create index if not exists modules_course_order_idx on public.course_modules(course_id, module_order);
create index if not exists lessons_course_status_idx on public.lessons(course_id, status, lesson_order);
create index if not exists enrolments_learner_status_idx on public.enrolments(learner_id, status);
create index if not exists progress_learner_course_idx on public.lesson_progress(learner_id, course_id);
create index if not exists submissions_learner_status_idx on public.submissions(learner_id, status);

-- Public read policy: only published course metadata, published modules, and published lessons.
alter table public.courses enable row level security;
alter table public.course_modules enable row level security;
alter table public.lessons enable row level security;
alter table public.enrolments enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.assignments enable row level security;
alter table public.submissions enable row level security;
alter table public.certificates enable row level security;

create policy "public reads published courses" on public.courses for select using (status = 'published');
create policy "instructors read owned courses" on public.courses for select using (auth.uid() = instructor_id);
create policy "instructors create owned drafts" on public.courses for insert with check (auth.uid() = instructor_id and status = 'draft');
create policy "instructors edit owned drafts" on public.courses for update using (auth.uid() = instructor_id and status in ('draft', 'rejected')) with check (auth.uid() = instructor_id and status in ('draft', 'submitted', 'under_review', 'rejected'));
-- Publishing is reviewer-only; no instructor policy grants status = published.
create policy "public reads published modules" on public.course_modules for select using (exists (select 1 from public.courses c where c.id = course_id and c.status = 'published' and status = 'published'));
create policy "owners manage draft modules" on public.course_modules for all using (exists (select 1 from public.courses c where c.id = course_id and c.instructor_id = auth.uid() and c.status in ('draft', 'rejected'))) with check (exists (select 1 from public.courses c where c.id = course_id and c.instructor_id = auth.uid() and c.status in ('draft', 'rejected')));
create policy "public reads published lessons" on public.lessons for select using (exists (select 1 from public.courses c join public.course_modules m on m.course_id = c.id where c.id = course_id and c.status = 'published' and m.id = module_id and m.status = 'published' and status = 'published'));
create policy "owners manage draft lessons" on public.lessons for all using (exists (select 1 from public.courses c where c.id = course_id and c.instructor_id = auth.uid() and c.status in ('draft', 'rejected'))) with check (exists (select 1 from public.courses c where c.id = course_id and c.instructor_id = auth.uid() and c.status in ('draft', 'rejected')));
create policy "learners read own enrolments" on public.enrolments for select using (auth.uid() = learner_id);
create policy "learners create free enrolments" on public.enrolments for insert with check (auth.uid() = learner_id and exists (select 1 from public.courses c where c.id = course_id and c.status = 'published' and c.access_type = 'free'));
create policy "learners update own enrolments" on public.enrolments for update using (auth.uid() = learner_id) with check (auth.uid() = learner_id);
create policy "learners read own progress" on public.lesson_progress for select using (auth.uid() = learner_id);
create policy "learners write own progress" on public.lesson_progress for insert with check (auth.uid() = learner_id and exists (select 1 from public.enrolments e where e.learner_id = auth.uid() and e.course_id = course_id and e.status in ('active', 'completed')));
create policy "learners update own progress" on public.lesson_progress for update using (auth.uid() = learner_id) with check (auth.uid() = learner_id);
create policy "enrolled learners read assignments" on public.assignments for select using (exists (select 1 from public.lessons l join public.enrolments e on e.course_id = l.course_id where l.id = lesson_id and e.learner_id = auth.uid() and e.status in ('active', 'completed')));
create policy "learner manages own submissions" on public.submissions for all using (auth.uid() = learner_id) with check (auth.uid() = learner_id);
create policy "learner reads own certificates" on public.certificates for select using (auth.uid() = learner_id);

-- Storage buckets:
-- 1. course-thumbnails: public read only for paths referenced by published courses; instructor write only to own prefix.
-- 2. lesson-media-private: private; signed URLs only after server-side enrolment/instructor authorization.
-- 3. assignment-submissions-private: private; learner and authorized instructor/reviewer only.
-- Service-role credentials remain server-side. The browser never receives a private bucket URL directly.
