-- A completed learner profile is discoverable, without an administrator.
--
-- THE CORRECTION. A learner needs no approval to be found. Completing the
-- required fields and saving is the whole of it — there is no queue, no
-- moderator, and no verification status anywhere in this path. That check
-- belongs to instructors, who are trusted with teaching, and it is not borrowed
-- for learners.
--
-- `updateOwnLearnerProfile` now promotes a row from 'draft' to 'published' when
-- the required fields are present. This migration applies the same rule ONCE to
-- rows that were completed before that code existed, so a learner who already
-- filled everything in does not have to open the form again to be found.
--
-- THE REQUIRED SET, and why it is not the "profile completeness" list. The
-- completion banner scores a profile out of thirteen fields including an avatar,
-- a biography and a gender. That is encouragement, not a gate. The columns below
-- are the ones onboarding actually enforces, plus one subject, because a learner
-- with no subject gives a teacher nothing to answer.
--
-- WHAT IT WILL NOT TOUCH:
--
--   * 'paused' — the learner turned discovery off. Their choice stands.
--   * 'published' — already visible; nothing to do.
--   * incomplete rows — they stay 'draft' until the missing fields are filled.
--   * suspended or deleted accounts — excluded, and excluded again at read time.
--   * any account holding a privileged or instructor role — this desk lists
--     learners, and a role that is not 'learner' is not published by it.
--
-- Idempotent: running it again matches nothing, because the rows it would match
-- are no longer 'draft'.

update public.learner_profiles lp
   set profile_status = 'published',
       updated_at = now()
  from public.profiles p
 where p.id = lp.user_id
   and lp.profile_status = 'draft'
   -- Required learner fields.
   and lp.learning_level is not null      and btrim(lp.learning_level) <> ''
   and coalesce(array_length(lp.learning_subjects, 1), 0) > 0
   -- Required person fields.
   and p.full_name is not null            and btrim(p.full_name) <> ''
   and p.display_name is not null         and btrim(p.display_name) <> ''
   and p.country is not null              and btrim(p.country) <> ''
   and p.timezone is not null             and btrim(p.timezone) <> ''
   and p.preferred_language is not null   and btrim(p.preferred_language) <> ''
   -- The account itself must be usable.
   and p.account_status = 'active'
   -- Learners only. An account holding any other role is not a learner listing.
   and exists (select 1 from public.user_roles r where r.user_id = lp.user_id and r.role = 'learner')
   and not exists (
     select 1 from public.user_roles r
      where r.user_id = lp.user_id
        and r.role in ('instructor', 'moderator', 'finance', 'advisory_board', 'admin', 'super_admin')
   );
