-- A published course is visible to learners only while its owner is an approved instructor.
--
-- THE DEFECT THIS CLOSES. `courses_published_or_owner` admitted any row whose status was
-- 'published', and nothing anywhere else made up the difference: the learner listing, the
-- course detail read and the enrolment write all filter on `status = 'published'` alone.
-- So a course published by an instructor who was still `verification_pending`, or who had
-- been `rejected`, appeared in the catalogue and could be enrolled in. The rule was stated
-- in the product and implemented nowhere.
--
-- WHY A FUNCTION AND NOT A SUBQUERY. `instructor_profiles` has its own RLS, and its select
-- policy requires `public_profile_status = 'published'` as well as approval. Inlining a
-- subquery here would therefore hide the courses of an approved instructor who simply had
-- not published their public tutor profile — conflating two decisions this project keeps
-- deliberately separate. A security-definer function reads the verification column and
-- nothing else, which is the question actually being asked.
--
-- WHAT DOES NOT CHANGE. The owner still sees their own drafts, and an administrator still
-- sees everything; only the public branch of the policy is narrowed. No status value is
-- renamed, no column is added, and no row is rewritten.

create or replace function public.is_approved_instructor(account uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.instructor_profiles ip
    where ip.user_id = account
      and ip.verification_status = 'approved'
  );
$$;

-- Readable by the anonymous catalogue and by signed-in callers; it returns a boolean about
-- one account and discloses nothing else.
revoke all on function public.is_approved_instructor(uuid) from public;
grant execute on function public.is_approved_instructor(uuid) to anon, authenticated, service_role;

drop policy if exists courses_published_or_owner on public.courses;

create policy courses_published_or_owner on public.courses for select using (
  (status = 'published' and public.is_approved_instructor(instructor_id))
  or instructor_id = auth.uid()
  or public.is_admin_user()
);
