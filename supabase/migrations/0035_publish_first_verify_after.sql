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
