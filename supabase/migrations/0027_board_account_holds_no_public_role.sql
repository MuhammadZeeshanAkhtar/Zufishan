-- The board account holds no public role.
--
-- THE RECORD BEING CORRECTED. The administrator account carries two rows in
-- `user_roles`:
--
--     id 38  learner   created 2026-09-07 07:12:56
--     id 39  admin     created 2026-09-07 07:13:41
--
-- Forty-five seconds apart, and that gap is the whole story. The account was
-- created at 07:12:56, when `handle_new_auth_user` still inserted `'learner'`
-- unconditionally for every new auth user; the ADMIN_EMAIL bootstrap then
-- granted `admin` at 07:13:41. The learner row was never requested — the
-- account's `raw_user_meta_data->>'requested_public_role'` is NULL — and it was
-- never used: the account has never onboarded as a learner and holds no learner
-- enrolment, booking or requirement.
--
-- Migration 0023 fixed the trigger, so no account created after it can acquire a
-- role this way. This removes the one record the old trigger left behind.
--
-- WHY REMOVE IT RATHER THAN HIDE IT. `claimRequestedPublicRole` already treats
-- the board address as holding "admin and no public role, by design". The row
-- contradicted that design everywhere it was read: the desk listed the board
-- account as a learner, and every count had to reason around it. Correcting the
-- record is the smaller and more honest change than teaching each reader to
-- ignore it.
--
-- THE GUARD. The delete names one role and one class of account:
--
--   * only `learner` rows are considered — an instructor role is never touched;
--   * only for accounts that hold `admin` or `super_admin`;
--   * `super_admin` and `admin` rows themselves are untouched, so nobody loses
--     access.
--
-- An ordinary learner or instructor cannot match: they hold no admin row. The
-- statement is idempotent — running it again deletes nothing — and it is scoped
-- by role, never by address, so no email appears in this file or in any log.
--
-- Applied 2026-09-07 with the operator's explicit approval for this specific
-- correction, after the audit above confirmed the row was accidental. Rows
-- affected: 1.

delete from public.user_roles ur
 where ur.role = 'learner'
   and exists (
     select 1
       from public.user_roles admin_row
      where admin_row.user_id = ur.user_id
        and admin_row.role in ('admin', 'super_admin')
   );

-- The learner PROFILE row the same trigger created is deliberately left alone.
-- It is inert: `learner_profiles_discoverable_to_instructors` requires
-- `profile_status = 'published'`, and this row sits at its 'draft' default, so
-- it is visible to nobody. Deleting profile data is a larger act than removing a
-- role grant and is not part of the approved correction; it is reported instead.
