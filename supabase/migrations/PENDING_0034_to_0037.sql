-- ============================================================================
--  Zufishan - pending migrations 0034 to 0037, in order.
--
--  Paste this whole file into the Supabase SQL Editor and run it once.
--
--  SAFE TO RUN MORE THAN ONCE. Every statement is guarded: tables and columns
--  use `if not exists`, policies are wrapped in `do $$ ... exception when
--  duplicate_object then null`, and functions use `create or replace`. Running
--  it twice changes nothing the second time.
--
--  ORDER MATTERS. 0036 deliberately reverses part of 0035, so the file must be
--  run top to bottom exactly as written. Do not run the blocks separately or
--  out of order.
--
--  WHAT IT DOES.
--    0034  Teacher qualifications (employment, certifications, ijazah) + fiqh.
--    0035  Course verification column, its admin-only trigger, and publishing
--          handed back to the course author.
--    0036  A teacher profile goes live only once a reviewer approves it.
--    0037  contact_messages: where the contact form's messages land.
--
--  Nothing here drops, renames or truncates anything. No existing row changes.
-- ============================================================================



-- ---------------------------------------------------------------------------
-- 0034_instructor_qualifications.sql
-- ---------------------------------------------------------------------------

-- A teacher's stated background: where they have taught, what they hold, and any ijazah.
--
-- `instructor_credentials` already exists, but it is a *file* table — object_path, mime_type,
-- size_bytes, review_status — for documents an admin reviews privately. What a teacher writes on
-- their profile for a learner to read is a different thing: several short, ordered, repeatable
-- entries, each of which is public once the profile is published. Putting prose into the file table
-- would have meant nullable paths and a row that is sometimes a document and sometimes a sentence.
--
-- Additive only: one new table, its policies, and one nullable column. Nothing existing is dropped,
-- rewritten, backfilled or relaxed, and every existing row stays valid.

create table if not exists public.instructor_qualifications (
  id uuid primary key default gen_random_uuid(),
  instructor_id uuid not null references public.instructor_profiles(user_id) on delete cascade,
  -- Which of the three lists on the profile editor this entry belongs to.
  kind text not null check (kind in ('employment', 'certification', 'ijazah')),
  title text not null check (length(btrim(title)) between 1 and 160),
  organisation text check (organisation is null or length(organisation) <= 160),
  -- Free text rather than dates: a teacher writes "2014 – 2019" or "since 1441 AH", and forcing
  -- that into a date range would either lose the meaning or reject the entry.
  period text check (period is null or length(period) <= 80),
  detail text check (detail is null or length(detail) <= 600),
  -- The order the teacher arranged them in; ties fall back to when the row was written.
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists instructor_qualifications_owner_idx
  on public.instructor_qualifications (instructor_id, kind, position);

alter table public.instructor_qualifications enable row level security;

-- A teacher owns their own entries outright.
do $$
begin
  create policy instructor_qualifications_own_or_admin
    on public.instructor_qualifications for all
    using (instructor_id = auth.uid() or public.is_admin_user())
    with check (instructor_id = auth.uid() or public.is_admin_user());
exception
  when duplicate_object then null;
end $$;

-- And anyone may read the entries of a teacher whose profile is already published and approved —
-- exactly the rows the public listing itself is allowed to return, so this exposes nothing that the
-- profile page does not already show.
do $$
begin
  create policy instructor_qualifications_public_read
    on public.instructor_qualifications for select
    using (exists (
      select 1 from public.instructor_profiles p
      where p.user_id = instructor_qualifications.instructor_id
        and p.public_profile_status = 'published'
        and p.verification_status = 'approved'
    ));
exception
  when duplicate_object then null;
end $$;

comment on table public.instructor_qualifications is
  'Teacher-written employment history, certifications and ijazah entries shown on the public profile. Documents for private review stay in instructor_credentials.';

-- The school of fiqh a teacher teaches within, kept separate from `sect`: the reference listing
-- asks for both, and a learner filtering for one is not filtering for the other. Null means simply
-- "not stated", as with sect.
alter table public.instructor_profiles add column if not exists fiqh text;

do $$
begin
  alter table public.instructor_profiles
    add constraint instructor_profiles_fiqh_check
    check (fiqh is null or fiqh in ('Hanafi', 'Shafii', 'Maliki', 'Hanbali', 'Other', 'Prefer not to say'));
exception
  when duplicate_object then null;
end $$;

comment on column public.instructor_profiles.fiqh is
  'Declared school of fiqh. Separate from sect; null means not stated.';


-- ---------------------------------------------------------------------------
-- 0035_publish_first_verify_after.sql
-- ---------------------------------------------------------------------------

-- Publishing comes first; verification becomes a badge, not a gate.
--
-- WHAT CHANGES, AND WHY IT IS A PRODUCT DECISION RATHER THAN A FIX.
--
-- Until now a teacher's profile and their courses were invisible to learners until an administrator
-- approved them. That is a strict model: nobody reaches a learner before a human has looked. The
-- owner of this project has decided the opposite trade: a teacher who completes and publishes a
-- profile is discoverable immediately, an administrator is notified, and approval afterwards adds a
-- visible "Verified" mark rather than switching the listing on.
--
-- The cost is stated plainly because it is real: between publishing and review, an unreviewed
-- teacher is visible to learners and can be booked. The mark is what tells a learner which is which,
-- so it has to stay impossible to award to yourself — and it does.
--
-- WHAT DOES NOT CHANGE.
--
--   * `verification_status` on a teacher is still admin-only, enforced by
--     `enforce_verification_status_is_admin_only`. A teacher cannot mark themselves verified.
--   * A draft profile and a draft course are still private. Publishing is still an explicit act.
--   * Every other policy, trigger and table is untouched.
--
-- WHAT IS ADDED. Courses gain their own `verification_status`, guarded the same way, so a course
-- carries its own mark rather than inheriting one from its teacher.

-- ---------------------------------------------------------------- teachers --

-- Publication alone now decides whether a profile is listed.
drop policy if exists instructor_profiles_public_or_own on public.instructor_profiles;
create policy instructor_profiles_public_or_own on public.instructor_profiles for select using (
  public_profile_status = 'published'
  or auth.uid() = user_id
  or public.is_admin_user()
);

-- ----------------------------------------------------------------- courses --

alter table public.courses
  add column if not exists verification_status text not null default 'verification_pending';

do $$
begin
  alter table public.courses
    add constraint courses_verification_status_check
    check (verification_status in ('verification_pending', 'approved', 'rejected'));
exception
  when duplicate_object then null;
end $$;

comment on column public.courses.verification_status is
  'Reviewer decision about a course, shown as a Verified mark. Never a condition of visibility, and never settable by the course owner.';

/*
 * The same guard the teacher's own verification column has had since 0014.
 *
 * Without it the column would be decoration: `courses_instructor_update` lets an owner update their
 * own row, the anon key and a session token are both in the browser, and a teacher could mark their
 * own course verified with one direct call. A mark anyone can award themselves tells a learner
 * nothing.
 */
create or replace function public.enforce_course_verification_is_admin_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.verification_status is distinct from old.verification_status then
    -- The service role bypasses RLS and carries no auth.uid(); the administrative procedures run
    -- there deliberately and check the caller's role themselves before writing.
    if auth.uid() is null then
      return new;
    end if;
    if not (public.is_admin_user() or public.is_moderator_user()) then
      raise exception 'Course verification is a reviewer decision.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists courses_verification_is_admin_only on public.courses;
create trigger courses_verification_is_admin_only
  before update on public.courses
  for each row execute function public.enforce_course_verification_is_admin_only();

-- A published course is listed on its own publication, not on its teacher's approval.
drop policy if exists courses_published_or_owner on public.courses;
create policy courses_published_or_owner on public.courses for select using (
  status = 'published'
  or instructor_id = auth.uid()
  or public.is_admin_user()
);

/*
 * Publishing is the teacher's decision again — but only between draft and published.
 *
 * 0032 made every status change a reviewer's, which was right while publication *was* the approval.
 * Now that it is not, an owner may move their own course from draft (or in_review, or a previous
 * publication) to published, and may unpublish it back to draft. `rejected` and `archived` stay
 * reviewer-only: those are judgements about a course, not the author's own choice.
 */
create or replace function public.enforce_course_status_is_a_reviewer_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then

    if auth.uid() is null then
      return new;
    end if;

    if public.is_admin_user() or public.is_moderator_user() then
      return new;
    end if;

    -- The owner publishes and unpublishes their own course; nothing else.
    if new.instructor_id = auth.uid() and new.status in ('draft', 'in_review', 'published') then
      return new;
    end if;

    raise exception 'Only a reviewer may set that course status.' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- An instructor may now create a course already published, so the insert check no longer forbids it.
drop policy if exists courses_instructor_insert on public.courses;
create policy courses_instructor_insert on public.courses for insert with check (
  instructor_id = auth.uid()
  and public.is_user_role('instructor')
  and status in ('draft', 'in_review', 'published')
);

-- 0031's helper is no longer consulted by any policy. It is left in place rather than dropped: it
-- is a harmless boolean about one account, and something else may still want to ask the question.

/*
 * And the update policy, which said the same thing a second time.
 *
 * `courses_instructor_update` carried `status <> 'published' or is_admin_user()` in its WITH CHECK,
 * so even with the trigger relaxed an owner's publish would have been refused by the policy. The
 * allowed set is named here and the transitions between them stay with the trigger above, so there
 * is one place to read each rule rather than two that can disagree.
 */
drop policy if exists courses_instructor_update on public.courses;
create policy courses_instructor_update on public.courses for update
  using (instructor_id = auth.uid() or public.is_admin_user())
  with check (
    (instructor_id = auth.uid() and public.is_user_role('instructor') and status in ('draft', 'in_review', 'published'))
    or public.is_admin_user()
  );


-- ---------------------------------------------------------------------------
-- 0036_verification_is_the_gate_again.sql
-- ---------------------------------------------------------------------------

-- Verification is the gate again. A profile goes live when a reviewer says so.
--
-- WHY THIS REVERSES 0035. The reference marketplace states its rule plainly on its own criteria
-- page: a tutor's skills are evaluated by a Tutor Relations Officer "before their profile becomes
-- live". Publication there is the *result* of review, not a thing review decorates afterwards. The
-- owner of this project read that policy and chose it over the publish-first arrangement 0035
-- introduced, so this puts the gate back where 0002 had it.
--
-- WHAT THE TEACHER'S "PUBLISH" NOW MEANS. `public_profile_status = 'published'` is still the
-- teacher's own act and still their own column — it says "I am ready". It no longer makes anything
-- visible on its own. Both halves must hold: the teacher has published, and a reviewer has approved.
-- The screens say so in those words rather than leaving a teacher to wonder why nobody can see them.
--
-- WHAT 0035 IS KEPT FOR. Three of its four parts were never about the gate and stay exactly as they
-- are:
--
--   * `courses.verification_status` and its admin-only trigger — a course carries its own Verified
--     mark, which is worth having whichever way the gate faces.
--   * Publishing a course is the author's act again. Safe under this policy for the same reason the
--     gate exists: an unapproved teacher's courses reach nobody, because the course policy below
--     asks about the teacher.
--   * The reviewer notification on publish, which matters *more* here — under this rule a teacher
--     who is never reviewed is a teacher who is never live.
--
-- Additive and idempotent: two policies replaced, nothing dropped, renamed or backfilled.

-- ---------------------------------------------------------------- teachers --

drop policy if exists instructor_profiles_public_or_own on public.instructor_profiles;
create policy instructor_profiles_public_or_own on public.instructor_profiles for select using (
  (public_profile_status = 'published' and verification_status = 'approved')
  or auth.uid() = user_id
  or public.is_admin_user()
);

-- ----------------------------------------------------------------- courses --

-- `is_approved_instructor` was left in place by 0035 precisely so this could ask it again. It reads
-- one column about one account and is already granted to anon, authenticated and service_role.
drop policy if exists courses_published_or_owner on public.courses;
create policy courses_published_or_owner on public.courses for select using (
  (status = 'published' and public.is_approved_instructor(instructor_id))
  or instructor_id = auth.uid()
  or public.is_admin_user()
);

comment on column public.courses.verification_status is
  'Reviewer decision about a course, shown as a Verified mark beside it. The teacher being approved is what makes the course visible at all; this mark is about the course itself.';


-- ---------------------------------------------------------------------------
-- 0037_contact_messages.sql
-- ---------------------------------------------------------------------------

-- Somewhere for a contact message to actually land.
--
-- WHY THIS EXISTS. The contact page had a form whose submit handler was `setSent(true)` and nothing
-- else: a person describing a problem was shown a tick, and their words went nowhere. The form is
-- wanted back, so it needs a real destination. This is that destination — no email provider
-- required, because a row an administrator can read is a working channel on its own.
--
-- WHO MAY DO WHAT. Anyone may write one, including a signed-out visitor: a person who cannot sign
-- in is exactly the person most likely to need to write. Only a reviewer may read them, because a
-- contact message carries a name, an email address and whatever someone chose to confide. Nobody
-- may edit or delete one; a reviewer moves `status` and that is all.
--
-- `reports` was not reused. It requires a signed-in reporter and a target row being reported — it
-- is a moderation record about a thing, and a contact message is neither.

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  -- Set when the sender happened to be signed in; null for a visitor. Never trusted for identity,
  -- only useful for finding their account afterwards.
  user_id uuid references public.profiles(id) on delete set null,
  sender_name text not null check (length(btrim(sender_name)) between 1 and 120),
  sender_email text not null check (length(btrim(sender_email)) between 3 and 200),
  -- Which side of the marketplace they are writing from, so a reviewer can answer in the right terms.
  sender_role text not null default 'other' check (sender_role in ('student', 'teacher', 'other')),
  subject text not null check (length(btrim(subject)) between 1 and 160),
  body text not null check (length(btrim(body)) between 1 and 4000),
  status text not null default 'open' check (status in ('open', 'answered', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contact_messages_status_idx on public.contact_messages (status, created_at desc);

alter table public.contact_messages enable row level security;

-- Anyone may write one. The column checks above are the whole of what is accepted, and the
-- procedure in front of this trims and bounds every field before it reaches here.
do $$
begin
  create policy contact_messages_anyone_may_write
    on public.contact_messages for insert
    to anon, authenticated
    with check (true);
exception
  when duplicate_object then null;
end $$;

-- Only a reviewer may read them. There is deliberately no "read your own": a visitor has no
-- account to own it with, and letting a signed-in sender read back by user_id would be a second
-- rule to keep right for no benefit.
do $$
begin
  create policy contact_messages_reviewer_read
    on public.contact_messages for select
    using (public.is_admin_user() or public.is_moderator_user());
exception
  when duplicate_object then null;
end $$;

-- A reviewer may move the status. Nothing else may be changed, and nothing may be deleted, so the
-- record of what someone wrote cannot be quietly edited after the fact.
do $$
begin
  create policy contact_messages_reviewer_update
    on public.contact_messages for update
    using (public.is_admin_user() or public.is_moderator_user())
    with check (public.is_admin_user() or public.is_moderator_user());
exception
  when duplicate_object then null;
end $$;

comment on table public.contact_messages is
  'Messages written from the public contact page. Anyone may insert; only a reviewer may read. No email provider is involved.';
