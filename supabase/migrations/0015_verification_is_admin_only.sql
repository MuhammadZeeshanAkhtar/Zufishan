-- Verification is a reviewed decision, so a tutor must not be able to make it about themselves.
--
-- The existing policy is:
--   instructor_profiles_own_update
--     using      (auth.uid() = user_id or is_admin_user())
--     with check ((auth.uid() = user_id and is_user_role('instructor')) or is_admin_user())
--
-- That constrains WHO may update the row, not WHICH columns they may change. An instructor holding
-- their own token can therefore set verification_status = 'approved' directly through PostgREST and
-- appear in public discovery, because discovery gates on (published and approved). Today only the
-- absence of a code path hides that; the database itself permits it.
--
-- A column-level guard cannot be expressed in a row policy, so the rule lives in a trigger, which
-- sees both the old and the new row. The policy is left exactly as it is: this is an additional
-- constraint, not a replacement, and every existing permitted write still succeeds.
--
-- Additive only: one function and one trigger. No table, column, policy or row is altered.

create or replace function public.enforce_verification_status_is_admin_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only a change to the column is restricted; ordinary profile edits are untouched.
  if new.verification_status is distinct from old.verification_status then
    -- The service role bypasses RLS and carries no auth.uid(); server-side administrative
    -- procedures run there deliberately, and they do their own role check before writing.
    if auth.uid() is null then
      return new;
    end if;

    if not (public.is_admin_user() or public.is_moderator_user()) then
      raise exception
        using errcode = '42501',
              message = 'verification_status may only be changed by an administrator or moderator',
              hint    = 'Instructors submit for review; the decision is made by a reviewer.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists instructor_profiles_verification_guard on public.instructor_profiles;
create trigger instructor_profiles_verification_guard
  before update on public.instructor_profiles
  for each row
  execute function public.enforce_verification_status_is_admin_only();

comment on function public.enforce_verification_status_is_admin_only() is
  'Blocks self-approval: verification_status is writable only by admin/moderator, or by the service role used by reviewed server procedures.';
