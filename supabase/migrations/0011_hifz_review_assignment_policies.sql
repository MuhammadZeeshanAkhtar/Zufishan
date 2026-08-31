-- Noor Ilm LMS: allow assigned instructors to review submitted Hifz records.
-- No data mutation, table drops, or policy weakening.

drop policy if exists hifz_reviews_assigned_instructor_select on public.hifz_reviews;
create policy hifz_reviews_assigned_instructor_select on public.hifz_reviews for select using (
  exists (
    select 1 from public.hifz_records r
    where r.id = record_id and r.instructor_id = auth.uid() and public.is_user_role('instructor')
  )
);

drop policy if exists hifz_reviews_assigned_instructor_update on public.hifz_reviews;
create policy hifz_reviews_assigned_instructor_update on public.hifz_reviews for update using (
  exists (
    select 1 from public.hifz_records r
    where r.id = record_id and r.instructor_id = auth.uid() and public.is_user_role('instructor')
  )
) with check (
  instructor_id = auth.uid() and reviewed_by = auth.uid() and public.is_user_role('instructor')
);
