-- A review is published by moderation, so its author must not be able to publish it themselves.
--
-- The existing policies are:
--   reviews_public_or_participant
--     for select using (status = 'published' or reviewer_id = auth.uid()
--                       or instructor_id = auth.uid() or is_moderator_user())
--   reviews_owner_or_moderator_update
--     using      (reviewer_id = auth.uid() or is_moderator_user())
--     with check (reviewer_id = auth.uid() or is_moderator_user())
--
-- Reviews are inserted with status 'pending' by default, and the select policy shows a row to an
-- unrelated reader only once status = 'published'. That gate is the whole moderation boundary for
-- public reputation. But the update policy constrains WHO may write the row, not WHICH columns they
-- may change, so a reviewer holding their own token can set status = 'published' on their own review
-- through PostgREST and place it on an instructor's public profile with no moderation at all. The
-- same token could equally set 'rejected' or 'hidden'.
--
-- This is the same shape as the verification and score holes closed in 0015 and 0016: a policy that
-- is correctly ownership-aware and entirely column-blind. The fix is the same, and for the same
-- reason — a column-level rule cannot be written as a row policy, so it lives in a trigger that can
-- see both the old and the new row. Editing your own rating and words stays permitted; only the
-- moderation column is constrained.
--
-- Additive only: one function and one trigger. No table, column, policy or row is altered.

create or replace function public.enforce_review_status_is_moderated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only a change to the moderation column is restricted; editing the rating or body is untouched.
  if new.status is distinct from old.status then
    -- The service role bypasses RLS and carries no auth.uid(); server-side moderation procedures
    -- run there deliberately, and they do their own role check before writing.
    if auth.uid() is null then
      return new;
    end if;

    if not (public.is_admin_user() or public.is_moderator_user()) then
      raise exception
        using errcode = '42501',
              message = 'review status may only be changed by a moderator',
              hint    = 'Authors may edit their own rating and words; publishing is a moderation decision.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists reviews_status_guard on public.reviews;
create trigger reviews_status_guard
  before update on public.reviews
  for each row
  execute function public.enforce_review_status_is_moderated();

comment on function public.enforce_review_status_is_moderated() is
  'Blocks self-publishing: reviews.status is writable only by admin/moderator, or by the service role used by moderation procedures.';
