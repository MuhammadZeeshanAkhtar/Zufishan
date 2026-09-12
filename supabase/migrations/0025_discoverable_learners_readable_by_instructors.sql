-- A learner who chooses to be discoverable can be found by instructors.
--
-- THE GAP. `learner_profiles.profile_status` has existed since the canonical
-- migration with the vocabulary ('draft','published','paused') this needs, but
-- two things were missing:
--
--   * Nothing ever wrote it. `updateOwnLearnerProfile` never set the column, so
--     every learner profile sat at its default 'draft' forever.
--   * Nothing could read it. `learner_profiles_own` is
--     `for all using (auth.uid() = user_id)`, so an instructor cannot see
--     another account's row at all, whatever its status says.
--
-- So learner-profile discovery was impossible, and the instructor desk could
-- only show published *requirements* — which already work, through
-- `learner_requirements_published_to_instructors` in migration 0020.
--
-- THE RULE. Deliberately the same shape as 0020, and deliberately NOT the shape
-- used for instructors:
--
--   * An instructor appears in public discovery only after an ADMIN approves
--     them, because a learner is trusting them with teaching.
--   * A learner appears to instructors purely by their OWN choice. No admin
--     approval, no moderation queue, no third party. Publishing means
--     "instructors may approach me"; setting it back to draft or paused takes
--     the row out of view immediately, because the policy reads `profile_status`
--     live.
--
-- Anonymous visitors still read nothing: `is_user_role('instructor')` is false
-- without a session. Other learners read nothing either — this names the
-- instructor role specifically, not "any signed-in account".
--
-- Additive and read-only. This is a second permissive SELECT policy, so it can
-- only widen reads for the case it names. `learner_profiles_own` is untouched,
-- and no write policy is added or altered: an instructor still cannot insert,
-- update or delete any part of a learner's profile, including its visibility.

drop policy if exists learner_profiles_discoverable_to_instructors on public.learner_profiles;
create policy learner_profiles_discoverable_to_instructors
  on public.learner_profiles
  for select
  using (profile_status = 'published' and public.is_user_role('instructor'));

comment on policy learner_profiles_discoverable_to_instructors on public.learner_profiles is
  'Lets a signed-in instructor read learner profiles the learner has chosen to publish. No admin approval is involved. Draft and paused profiles stay author-only, and anonymous visitors read nothing.';
