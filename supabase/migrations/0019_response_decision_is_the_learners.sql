-- Accepting a response is the learner's decision, so an instructor must not be able to accept their
-- own.
--
-- The existing policy is:
--   requirement_responses_parties_update
--     using      (instructor_id = auth.uid()
--                 or exists (select 1 from learner_requirements r
--                            where r.id = requirement_id and r.learner_id = auth.uid())
--                 or is_moderator_user())
--     with check (same)
--
-- Both parties genuinely need to write this row — the instructor withdraws, the learner shortlists,
-- accepts or rejects — so the policy is right about who. It is silent about columns, and `status` is
-- the column that carries the decision. An instructor holding their own token can PATCH their own
-- response to status = 'accepted' and appear, to every screen that reads this table, to have been
-- chosen by a learner who never chose them.
--
-- Fifth of the same shape as 0015, 0016, 0017 and 0018: a policy correctly scoped to ownership and
-- blind to columns. Same remedy — a trigger that can compare old and new, with the policy untouched.
-- The message, the row itself, and every other column stay exactly as writable as they were.
--
-- The split enforced here is the one the product already assumes:
--   shortlisted / accepted / rejected  → the learner who posted the requirement
--   withdrawn                          → the instructor who wrote the response
--   pending                            → the initial value, written on insert
--
-- Additive only: one function and one trigger. No table, column, policy or row is altered.

create or replace function public.enforce_response_decision_is_the_learners()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requirement_owner uuid;
begin
  -- Only a change to the decision is restricted; editing the message is untouched.
  if new.status is distinct from old.status then
    -- The service role bypasses RLS and carries no auth.uid(); server procedures run there after
    -- doing their own check.
    if auth.uid() is null then
      return new;
    end if;

    if public.is_admin_user() or public.is_moderator_user() then
      return new;
    end if;

    -- Withdrawing is the instructor's own act, and the only status they may set.
    if new.status = 'withdrawn' then
      if auth.uid() is distinct from new.instructor_id then
        raise exception
          using errcode = '42501',
                message = 'only the responding instructor can withdraw a response';
      end if;
      return new;
    end if;

    select r.learner_id into requirement_owner
      from public.learner_requirements r
     where r.id = new.requirement_id;

    if auth.uid() is distinct from requirement_owner then
      raise exception
        using errcode = '42501',
              message = 'only the learner who posted this requirement can decide on a response',
              hint    = 'An instructor may write and withdraw a response; shortlisting, accepting and rejecting are the learner''s.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists requirement_responses_decision_guard on public.requirement_responses;
create trigger requirement_responses_decision_guard
  before update on public.requirement_responses
  for each row
  execute function public.enforce_response_decision_is_the_learners();

comment on function public.enforce_response_decision_is_the_learners() is
  'Blocks an instructor accepting their own response: requirement_responses.status is the learner''s decision, except withdrawal, which is the instructor''s.';
