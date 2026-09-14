-- Publishing a course is a reviewer's decision, enforced by the database.
--
-- THE GAP THIS CLOSES. The server procedures were already correct: `updateOwnCourse`
-- accepts no status at all, and `submitOwnCourseForReview` only moves a course from
-- 'draft' or 'rejected' to 'in_review'. But `courses_instructor_update` permits an owner
-- to UPDATE their own row with no restriction on which columns change, and the anon key
-- plus a session token are both in the browser. So an instructor could set
-- `status = 'published'` with one direct call and skip review entirely. Admin approval
-- was enforced in application code and nowhere else.
--
-- This is the same shape as the guards the project already uses for the columns that
-- carry a decision: `enforce_verification_status_is_admin_only`,
-- `enforce_review_status_is_moderated`, `enforce_session_status_is_instructors`,
-- `enforce_response_decision_is_the_learners`. Course status was the one left out.
--
-- WHAT THE OWNER MAY STILL DO. Everything they could do before except publish: edit the
-- course freely (the guard only looks at `status`), submit a draft or a rejected course
-- for review, and withdraw a submission back to draft. Only a reviewer moves a course to
-- 'published', 'rejected' or 'archived'.
--
-- VERIFICATION IS A SEPARATE GATE. Being an approved instructor is what 0031 requires of
-- a course that is ALREADY published; it never approves a course. Both must hold.

create or replace function public.enforce_course_status_is_a_reviewer_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Ordinary course edits are untouched; only a change to the column is restricted.
  if new.status is distinct from old.status then

    -- The service role bypasses RLS and carries no auth.uid(). The administrative
    -- procedures run there deliberately, and they do their own role check before writing.
    if auth.uid() is null then
      return new;
    end if;

    if public.is_admin_user() or public.is_moderator_user() then
      return new;
    end if;

    -- The owner submits, and may take a submission back. Nothing else.
    if new.instructor_id = auth.uid()
       and (
         (old.status in ('draft', 'rejected') and new.status = 'in_review')
         or (old.status = 'in_review' and new.status = 'draft')
       )
    then
      return new;
    end if;

    raise exception
      using errcode = '42501',
            message = 'course status may only be changed by a reviewer',
            hint    = 'Submit the course for review; publishing is a reviewer decision.';
  end if;

  return new;
end;
$$;

drop trigger if exists courses_status_guard on public.courses;

create trigger courses_status_guard
before update on public.courses
for each row execute function public.enforce_course_status_is_a_reviewer_decision();
