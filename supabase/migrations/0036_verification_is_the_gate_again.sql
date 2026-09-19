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
