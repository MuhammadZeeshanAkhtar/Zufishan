-- A learner may only enrol in a course that is actually published.
--
-- THE HOLE. `enrolments_learner_insert` checked one thing:
--
--     with check (learner_id = auth.uid())
--
-- "the row is about me" — and nothing about the course. `createEnrolment` did not
-- check either; it upserted straight in with `status = 'active'`. So any
-- authenticated account could insert an enrolment naming any course id at all,
-- including another instructor's `draft`, `in_review`, `rejected` or `archived`
-- course.
--
-- WHY THAT MATTERS MORE THAN IT LOOKS. `courses_published_or_owner` already stops
-- a learner READING an unpublished course, so this was not a content leak on its
-- own. It became serious in combination with messaging: an active enrolment is
-- one of the four relationships that authorise a conversation. A learner holding
-- any course UUID could therefore insert an enrolment against it and unlock
-- messaging with that instructor — without the instructor ever publishing
-- anything, agreeing to anything, or being asked. The messaging rule was sound;
-- this was the way around it.
--
-- THE RULE. Enrolment now requires, at the database:
--
--   * the row to be about the caller (unchanged);
--   * the caller to hold the learner role — an enrolment is a learner's act;
--   * the course to exist AND be published.
--
-- `courses.status` already carries ('draft','in_review','published','rejected',
-- 'archived'), so 'published' is the existing vocabulary and no status system is
-- added. Reading is untouched, updating is untouched, and an enrolment already
-- made in a course that is later archived is untouched — this governs the moment
-- of enrolling, which is the moment consent is given.

drop policy if exists enrolments_learner_insert on public.enrolments;

create policy enrolments_learner_insert
  on public.enrolments
  for insert
  with check (
    learner_id = auth.uid()
    and public.is_user_role('learner')
    and exists (
      select 1
        from public.courses c
       where c.id = enrolments.course_id
         and c.status = 'published'
    )
  );
