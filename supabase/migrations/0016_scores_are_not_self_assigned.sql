-- A learner may answer, but must not mark their own work.
--
-- Two policies grant a learner full write over their own rows:
--
--   quiz_attempts_own       for all using (learner_id = auth.uid()) with check (learner_id = auth.uid())
--   submissions_learner_write for all using (learner_id = auth.uid()) with check (learner_id = auth.uid())
--
-- Both are correct about ownership and silent about columns, so the same row that legitimately
-- carries the learner's `answers` or `body` also carries `score`. Nothing stops a learner writing
-- `score = 100` on their own attempt, and a grade anyone can set is not a grade.
--
-- Grading therefore belongs to the server: quiz attempts are marked against the stored questions,
-- and an assignment is scored by the course's instructor. Both run through the service role, which
-- carries no auth.uid() and is allowed through below.
--
-- As with 0015, the policies are left untouched — this adds a column-level rule they cannot express,
-- and every write that was legitimate before remains legitimate.
--
-- Additive only: two functions, two triggers. No table, column, policy or row is altered.

create or replace function public.enforce_score_is_not_self_assigned()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_score numeric;
  old_score numeric;
begin
  -- Both guarded tables carry `score`; read it generically so one function serves both.
  new_score := (to_jsonb(new) ->> 'score')::numeric;
  old_score := case when tg_op = 'UPDATE' then (to_jsonb(old) ->> 'score')::numeric else null end;

  if new_score is distinct from old_score then
    -- The service role is how the server grades; it has no auth.uid().
    if auth.uid() is null then
      return new;
    end if;

    -- An instructor or a reviewer may grade; the person being graded may not.
    if public.is_admin_user() or public.is_moderator_user() then
      return new;
    end if;

    if new.learner_id = auth.uid() then
      raise exception
        using errcode = '42501',
              message = 'score cannot be set by the learner it belongs to',
              hint    = 'Submit the work; grading is done by the instructor or the marking service.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists quiz_attempts_score_guard on public.quiz_attempts;
create trigger quiz_attempts_score_guard
  before insert or update on public.quiz_attempts
  for each row
  execute function public.enforce_score_is_not_self_assigned();

drop trigger if exists submissions_score_guard on public.submissions;
create trigger submissions_score_guard
  before insert or update on public.submissions
  for each row
  execute function public.enforce_score_is_not_self_assigned();

comment on function public.enforce_score_is_not_self_assigned() is
  'Blocks self-grading: score on quiz_attempts and submissions is writable by the marking service, an instructor or a moderator, never by the learner the row belongs to.';
