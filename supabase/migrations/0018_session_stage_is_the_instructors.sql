-- Moving a session through its stages is the instructor's, so the database should say so too.
--
-- The existing policy is:
--   class_sessions_parties_update
--     using      (learner_id = auth.uid() or instructor_id = auth.uid() or is_moderator_user())
--     with check (learner_id = auth.uid() or instructor_id = auth.uid() or is_moderator_user())
--
-- Both parties need to update the row — that is how a session gets opened and closed — so the
-- policy is right about who. It is silent about columns, and `status` is the one column that must
-- not be either party's to set. `setSessionStatus` already refuses anyone but the instructor, but
-- a learner holding their own token can PATCH the row directly and set status = 'completed'.
--
-- That is not merely untidy. `reviews_eligible_insert` requires a session whose status is
-- 'completed', so self-completing a session is also how a learner becomes eligible to review a
-- class that never happened, and it corrupts the attendance and session record that the ledger and
-- the classroom both read.
--
-- Fourth of the same shape as 0015, 0016 and 0017: a policy correctly scoped to ownership and blind
-- to columns. Same remedy — a trigger that can compare old and new, with the policy left untouched.
-- Cancelling, no-show and every other column stay exactly as permissive as they were; only `status`
-- is constrained, and only to the session's own instructor.
--
-- Additive only: one function and one trigger. No table, column, policy or row is altered.

create or replace function public.enforce_session_status_is_instructors()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only a change to the stage is restricted; opening, attendance and the rest are untouched.
  if new.status is distinct from old.status then
    -- The service role bypasses RLS and carries no auth.uid(); server procedures run there after
    -- doing their own check.
    if auth.uid() is null then
      return new;
    end if;

    if public.is_admin_user() or public.is_moderator_user() then
      return new;
    end if;

    if auth.uid() is distinct from new.instructor_id then
      raise exception
        using errcode = '42501',
              message = 'only the session instructor can change its status',
              hint    = 'A learner records their own attendance; the stage is moved by the instructor.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists class_sessions_status_guard on public.class_sessions;
create trigger class_sessions_status_guard
  before update on public.class_sessions
  for each row
  execute function public.enforce_session_status_is_instructors();

comment on function public.enforce_session_status_is_instructors() is
  'Blocks a learner advancing or completing their own session: class_sessions.status is writable only by the session instructor, a moderator, or the service role.';
