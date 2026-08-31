-- Noor Ilm LMS Prompt 10: private Storage object policies.
-- Buckets are created separately through the Supabase Storage admin API.
-- No public read policy is created; all access is authenticated and relationship-scoped.

create policy instructor_credentials_private_select on storage.objects for select to authenticated using (bucket_id = 'instructor-credentials' and (owner_id::uuid = auth.uid() or public.is_admin_user()));
create policy instructor_credentials_private_insert on storage.objects for insert to authenticated with check (bucket_id = 'instructor-credentials' and (storage.foldername(name))[1] = auth.uid()::text and public.is_user_role('instructor'));
create policy instructor_credentials_private_update on storage.objects for update to authenticated using (bucket_id = 'instructor-credentials' and (owner_id::uuid = auth.uid() or public.is_admin_user())) with check (bucket_id = 'instructor-credentials' and (owner_id::uuid = auth.uid() or public.is_admin_user()));
create policy instructor_credentials_private_delete on storage.objects for delete to authenticated using (bucket_id = 'instructor-credentials' and (owner_id::uuid = auth.uid() or public.is_admin_user()));

create policy instructor_media_private_select on storage.objects for select to authenticated using (bucket_id = 'instructor-media' and (owner_id::uuid = auth.uid() or public.is_admin_user()));
create policy instructor_media_private_insert on storage.objects for insert to authenticated with check (bucket_id = 'instructor-media' and (storage.foldername(name))[1] = auth.uid()::text and public.is_user_role('instructor'));
create policy instructor_media_private_update on storage.objects for update to authenticated using (bucket_id = 'instructor-media' and (owner_id::uuid = auth.uid() or public.is_admin_user())) with check (bucket_id = 'instructor-media' and (owner_id::uuid = auth.uid() or public.is_admin_user()));
create policy instructor_media_private_delete on storage.objects for delete to authenticated using (bucket_id = 'instructor-media' and (owner_id::uuid = auth.uid() or public.is_admin_user()));

create policy course_media_private_select on storage.objects for select to authenticated using (bucket_id = 'course-media' and (owner_id::uuid = auth.uid() or public.is_admin_user() or exists (select 1 from public.courses c where c.id::text = (storage.foldername(name))[3] and c.instructor_id = auth.uid())));
create policy course_media_private_insert on storage.objects for insert to authenticated with check (bucket_id = 'course-media' and (storage.foldername(name))[1] = auth.uid()::text and public.is_user_role('instructor') and exists (select 1 from public.courses c where c.id::text = (storage.foldername(name))[3] and c.instructor_id = auth.uid()));
create policy course_media_private_update on storage.objects for update to authenticated using (bucket_id = 'course-media' and (owner_id::uuid = auth.uid() or public.is_admin_user() or exists (select 1 from public.courses c where c.id::text = (storage.foldername(name))[3] and c.instructor_id = auth.uid())));
create policy course_media_private_delete on storage.objects for delete to authenticated using (bucket_id = 'course-media' and (owner_id::uuid = auth.uid() or public.is_admin_user() or exists (select 1 from public.courses c where c.id::text = (storage.foldername(name))[3] and c.instructor_id = auth.uid())));

create policy classroom_resources_private_select on storage.objects for select to authenticated using (bucket_id = 'classroom-resources' and (owner_id::uuid = auth.uid() or public.is_moderator_user() or exists (select 1 from public.class_sessions s where s.id::text = (storage.foldername(name))[1] and (s.learner_id = auth.uid() or s.instructor_id = auth.uid()))));
create policy classroom_resources_private_insert on storage.objects for insert to authenticated with check (bucket_id = 'classroom-resources' and (storage.foldername(name))[2] = auth.uid()::text and exists (select 1 from public.class_sessions s where s.id::text = (storage.foldername(name))[1] and (s.learner_id = auth.uid() or s.instructor_id = auth.uid())));
create policy classroom_resources_private_update on storage.objects for update to authenticated using (bucket_id = 'classroom-resources' and (owner_id::uuid = auth.uid() or public.is_moderator_user()));
create policy classroom_resources_private_delete on storage.objects for delete to authenticated using (bucket_id = 'classroom-resources' and (owner_id::uuid = auth.uid() or public.is_moderator_user()));
