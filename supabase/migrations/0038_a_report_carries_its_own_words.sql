-- A report has to carry the words the person actually wrote.
--
-- WHY THIS EXISTS. The Reports module on both dashboards asks for a reason and then for a
-- description — "what happened?" — and handed both to an in-memory `submitReport` that stored
-- nothing. A person raising a safety concern was shown a confirmation and their account of it was
-- discarded. Making that form real means writing to `public.reports`, and `public.reports` has
-- nowhere to put the description: it carries `reason` and no free text at all.
--
-- Storing the two joined together in `reason` was the alternative and is worse than this column:
-- it would make the structured reason unreadable to any query that groups by it, which is the one
-- thing a moderation queue needs to do.
--
-- WHAT THIS DOES NOT CHANGE. No policy on `reports` is touched. The three that exist are already
-- exactly right for this and are restated here only as a record of what is being relied on:
--
--   reports_own_insert        -- reporter_id = auth.uid(): anyone may file their own, nobody else's
--   reports_own_or_moderator  -- you read your own; a moderator reads all
--   reports_moderator_update  -- only a moderator moves `status`
--
-- The column is nullable with no default, so every row that already exists stays valid and nothing
-- is backfilled with invented text.

alter table public.reports
  add column if not exists description text;

-- A report is read by a person deciding what to do about it, so an empty string is not a
-- description and 8000 characters is not one either. Null stays allowed: a reason on its own is a
-- legitimate report, and the rows written before this column existed have nothing to say here.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.reports'::regclass and conname = 'reports_description_length'
  ) then
    alter table public.reports
      add constraint reports_description_length
      check (description is null or length(btrim(description)) between 1 and 8000);
  end if;
end $$;

comment on column public.reports.description is
  'What the reporter wrote in their own words. Null for a report filed with only a structured reason.';
