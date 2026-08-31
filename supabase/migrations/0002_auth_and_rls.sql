-- Noor Ilm LMS Prompt 9: Supabase Auth profile bootstrap and RLS.
-- This migration intentionally changes Auth-trigger/profile bootstrap and table RLS only.
-- It does not create Storage buckets, alter Realtime, or delete data.

create or replace function public.is_user_role(target_role text)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.user_roles where user_id = auth.uid() and role = target_role); $$;

create or replace function public.is_admin_user()
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_user_role('admin') or public.is_user_role('super_admin'); $$;

create or replace function public.is_super_admin_user()
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_user_role('super_admin'); $$;

create or replace function public.is_moderator_user()
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_user_role('moderator') or public.is_admin_user(); $$;

create or replace function public.is_finance_user()
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_user_role('finance') or public.is_user_role('admin') or public.is_user_role('super_admin'); $$;

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, display_name, preferred_language)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'full_name',''), nullif(split_part(coalesce(new.email, 'Learner'), '@', 1), ''), 'Learner'),
    coalesce(nullif(new.raw_user_meta_data->>'display_name',''), nullif(split_part(coalesce(new.email, 'Learner'), '@', 1), ''), 'Learner'),
    coalesce(nullif(new.raw_user_meta_data->>'preferred_language',''), 'English')
  ) on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values (new.id, 'learner') on conflict (user_id, role) do nothing;
  insert into public.learner_profiles (user_id) values (new.id) on conflict (user_id) do nothing;
  insert into public.notification_preferences (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_noor_ilm on auth.users;
create trigger on_auth_user_created_noor_ilm
after insert on auth.users for each row execute function public.handle_new_auth_user();

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.learner_profiles enable row level security;
alter table public.instructor_profiles enable row level security;
alter table public.instructor_credentials enable row level security;
alter table public.instructor_media enable row level security;
alter table public.learner_requirements enable row level security;
alter table public.requirement_responses enable row level security;
alter table public.learner_shortlists enable row level security;
alter table public.instructor_availability enable row level security;
alter table public.trial_requests enable row level security;
alter table public.courses enable row level security;
alter table public.course_modules enable row level security;
alter table public.lessons enable row level security;
alter table public.class_sessions enable row level security;
alter table public.class_participants enable row level security;
alter table public.class_attendance enable row level security;
alter table public.enrolments enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.assignments enable row level security;
alter table public.submissions enable row level security;
alter table public.quizzes enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.certificates enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.reviews enable row level security;
alter table public.review_reports enable row level security;
alter table public.reports enable row level security;
alter table public.session_ledger enable row level security;
alter table public.payment_references enable row level security;
alter table public.withdrawal_requests enable row level security;
alter table public.moderation_cases enable row level security;
alter table public.moderation_actions enable row level security;
alter table public.audit_logs enable row level security;
alter table public.admin_settings enable row level security;

create policy profiles_select_own_or_admin on public.profiles for select using (auth.uid() = id or public.is_admin_user());
create policy profiles_insert_own on public.profiles for insert with check (auth.uid() = id);
create policy profiles_update_own_or_admin on public.profiles for update using (auth.uid() = id or public.is_admin_user()) with check (auth.uid() = id or public.is_admin_user());

create policy user_roles_select_own_or_admin on public.user_roles for select using (auth.uid() = user_id or public.is_admin_user());
create policy user_roles_admin_insert on public.user_roles for insert with check (public.is_admin_user() and (role <> 'super_admin' or public.is_super_admin_user()));
create policy user_roles_admin_update on public.user_roles for update using (public.is_admin_user() and (role <> 'super_admin' or public.is_super_admin_user())) with check (public.is_admin_user() and (role <> 'super_admin' or public.is_super_admin_user()));
create policy user_roles_admin_delete on public.user_roles for delete using (public.is_admin_user() and (role <> 'super_admin' or public.is_super_admin_user()));

create policy learner_profiles_own on public.learner_profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy instructor_profiles_public_or_own on public.instructor_profiles for select using ((public_profile_status = 'published' and verification_status = 'approved') or auth.uid() = user_id or public.is_admin_user());
create policy instructor_profiles_own_insert on public.instructor_profiles for insert with check (auth.uid() = user_id and public.is_user_role('instructor'));
create policy instructor_profiles_own_update on public.instructor_profiles for update using (auth.uid() = user_id or public.is_admin_user()) with check ((auth.uid() = user_id and public.is_user_role('instructor')) or public.is_admin_user());
create policy instructor_profiles_admin_delete on public.instructor_profiles for delete using (public.is_admin_user());

create policy instructor_credentials_own_or_admin on public.instructor_credentials for all using (instructor_id = auth.uid() or public.is_admin_user()) with check (instructor_id = auth.uid() or public.is_admin_user());
create policy instructor_media_public_or_own on public.instructor_media for select using ((visibility = 'public' and exists (select 1 from public.instructor_profiles p where p.user_id = instructor_id and p.public_profile_status = 'published' and p.verification_status = 'approved')) or instructor_id = auth.uid() or public.is_admin_user());
create policy instructor_media_own_write on public.instructor_media for insert with check (instructor_id = auth.uid() and public.is_user_role('instructor'));
create policy instructor_media_own_update on public.instructor_media for update using (instructor_id = auth.uid() or public.is_admin_user()) with check (instructor_id = auth.uid() or public.is_admin_user());
create policy instructor_media_own_delete on public.instructor_media for delete using (instructor_id = auth.uid() or public.is_admin_user());

create policy learner_requirements_own_or_moderator on public.learner_requirements for select using (learner_id = auth.uid() or public.is_moderator_user());
create policy learner_requirements_own_write on public.learner_requirements for insert with check (learner_id = auth.uid());
create policy learner_requirements_own_update on public.learner_requirements for update using (learner_id = auth.uid() or public.is_moderator_user()) with check (learner_id = auth.uid() or public.is_moderator_user());
create policy learner_requirements_own_delete on public.learner_requirements for delete using (learner_id = auth.uid() or public.is_moderator_user());

create policy requirement_responses_parties_or_moderator on public.requirement_responses for select using (instructor_id = auth.uid() or exists (select 1 from public.learner_requirements r where r.id = requirement_id and r.learner_id = auth.uid()) or public.is_moderator_user());
create policy requirement_responses_instructor_insert on public.requirement_responses for insert with check (instructor_id = auth.uid() and public.is_user_role('instructor'));
create policy requirement_responses_parties_update on public.requirement_responses for update using (instructor_id = auth.uid() or exists (select 1 from public.learner_requirements r where r.id = requirement_id and r.learner_id = auth.uid()) or public.is_moderator_user()) with check (instructor_id = auth.uid() or public.is_moderator_user());
create policy requirement_responses_instructor_delete on public.requirement_responses for delete using (instructor_id = auth.uid() or public.is_moderator_user());

create policy learner_shortlists_own on public.learner_shortlists for all using (learner_id = auth.uid()) with check (learner_id = auth.uid());
create policy instructor_availability_public_or_own on public.instructor_availability for select using (instructor_id = auth.uid() or public.is_admin_user() or exists (select 1 from public.instructor_profiles p where p.user_id = instructor_id and p.public_profile_status = 'published' and p.verification_status = 'approved'));
create policy instructor_availability_own_write on public.instructor_availability for all using (instructor_id = auth.uid() and public.is_user_role('instructor')) with check (instructor_id = auth.uid() and public.is_user_role('instructor'));

create policy trial_requests_parties_or_moderator on public.trial_requests for select using (learner_id = auth.uid() or instructor_id = auth.uid() or public.is_moderator_user());
create policy trial_requests_learner_insert on public.trial_requests for insert with check (learner_id = auth.uid());
create policy trial_requests_parties_update on public.trial_requests for update using (learner_id = auth.uid() or instructor_id = auth.uid() or public.is_moderator_user()) with check (learner_id = auth.uid() or instructor_id = auth.uid() or public.is_moderator_user());
create policy trial_requests_parties_delete on public.trial_requests for delete using (learner_id = auth.uid() or instructor_id = auth.uid() or public.is_moderator_user());

create policy courses_published_or_owner on public.courses for select using (status = 'published' or instructor_id = auth.uid() or public.is_admin_user());
create policy courses_instructor_insert on public.courses for insert with check (instructor_id = auth.uid() and public.is_user_role('instructor') and status <> 'published');
create policy courses_instructor_update on public.courses for update using (instructor_id = auth.uid() or public.is_admin_user()) with check ((instructor_id = auth.uid() and public.is_user_role('instructor') and (status <> 'published' or public.is_admin_user())) or public.is_admin_user());
create policy courses_admin_delete on public.courses for delete using (public.is_admin_user());

create policy course_modules_published_or_owner on public.course_modules for select using (exists (select 1 from public.courses c where c.id = course_id and (c.status = 'published' or c.instructor_id = auth.uid() or public.is_admin_user())));
create policy course_modules_owner_write on public.course_modules for all using (exists (select 1 from public.courses c where c.id = course_id and c.instructor_id = auth.uid() and public.is_user_role('instructor')) or public.is_admin_user()) with check (exists (select 1 from public.courses c where c.id = course_id and c.instructor_id = auth.uid() and public.is_user_role('instructor')) or public.is_admin_user());
create policy lessons_public_preview_or_enrolled on public.lessons for select using (exists (select 1 from public.course_modules m join public.courses c on c.id = m.course_id where m.id = module_id and c.status = 'published' and ((public.lessons.status = 'published' and public.lessons.is_preview) or exists (select 1 from public.enrolments e where e.course_id = c.id and e.learner_id = auth.uid() and e.status in ('active','completed')))) or exists (select 1 from public.course_modules m join public.courses c on c.id = m.course_id where m.id = module_id and c.instructor_id = auth.uid()) or public.is_admin_user());
create policy lessons_owner_write on public.lessons for all using (exists (select 1 from public.course_modules m join public.courses c on c.id = m.course_id where m.id = module_id and c.instructor_id = auth.uid() and public.is_user_role('instructor')) or public.is_admin_user()) with check (exists (select 1 from public.course_modules m join public.courses c on c.id = m.course_id where m.id = module_id and c.instructor_id = auth.uid() and public.is_user_role('instructor')) or public.is_admin_user());

create policy class_sessions_participant_or_moderator on public.class_sessions for select using (learner_id = auth.uid() or instructor_id = auth.uid() or public.is_moderator_user());
create policy class_sessions_parties_insert on public.class_sessions for insert with check ((learner_id = auth.uid() or instructor_id = auth.uid()) and (public.is_user_role('learner') or public.is_user_role('instructor') or public.is_moderator_user()));
create policy class_sessions_parties_update on public.class_sessions for update using (learner_id = auth.uid() or instructor_id = auth.uid() or public.is_moderator_user()) with check (learner_id = auth.uid() or instructor_id = auth.uid() or public.is_moderator_user());
create policy class_sessions_moderator_delete on public.class_sessions for delete using (public.is_moderator_user());
create policy class_participants_session_member on public.class_participants for select using (exists (select 1 from public.class_sessions s where s.id = session_id and (s.learner_id = auth.uid() or s.instructor_id = auth.uid() or public.is_moderator_user())));
create policy class_participants_moderator_write on public.class_participants for all using (public.is_moderator_user()) with check (public.is_moderator_user());
create policy class_attendance_session_member on public.class_attendance for select using (exists (select 1 from public.class_sessions s where s.id = session_id and (s.learner_id = auth.uid() or s.instructor_id = auth.uid() or public.is_moderator_user())));
create policy class_attendance_own_write on public.class_attendance for insert with check (user_id = auth.uid() and exists (select 1 from public.class_sessions s where s.id = session_id and (s.learner_id = auth.uid() or s.instructor_id = auth.uid())));
create policy class_attendance_own_update on public.class_attendance for update using (user_id = auth.uid() or public.is_moderator_user()) with check (user_id = auth.uid() or public.is_moderator_user());

create policy enrolments_own_or_course_owner on public.enrolments for select using (learner_id = auth.uid() or exists (select 1 from public.courses c where c.id = course_id and c.instructor_id = auth.uid()) or public.is_moderator_user());
create policy enrolments_learner_insert on public.enrolments for insert with check (learner_id = auth.uid());
create policy enrolments_own_update on public.enrolments for update using (learner_id = auth.uid() or public.is_moderator_user()) with check (learner_id = auth.uid() or public.is_moderator_user());
create policy lesson_progress_own_or_course_owner on public.lesson_progress for select using (learner_id = auth.uid() or exists (select 1 from public.lessons l join public.course_modules m on m.id = l.module_id join public.courses c on c.id = m.course_id where l.id = lesson_id and c.instructor_id = auth.uid()) or public.is_moderator_user());
create policy lesson_progress_own_write on public.lesson_progress for all using (learner_id = auth.uid()) with check (learner_id = auth.uid());
create policy assignments_course_access on public.assignments for select using (exists (select 1 from public.courses c where c.id = course_id and (c.status = 'published' or c.instructor_id = auth.uid() or public.is_admin_user())));
create policy assignments_owner_write on public.assignments for all using (exists (select 1 from public.courses c where c.id = course_id and c.instructor_id = auth.uid() and public.is_user_role('instructor')) or public.is_admin_user()) with check (exists (select 1 from public.courses c where c.id = course_id and c.instructor_id = auth.uid() and public.is_user_role('instructor')) or public.is_admin_user());
create policy submissions_own_or_course_owner on public.submissions for select using (learner_id = auth.uid() or exists (select 1 from public.assignments a join public.courses c on c.id = a.course_id where a.id = assignment_id and c.instructor_id = auth.uid()) or public.is_moderator_user());
create policy submissions_learner_write on public.submissions for all using (learner_id = auth.uid()) with check (learner_id = auth.uid());
create policy quizzes_course_access on public.quizzes for select using (exists (select 1 from public.courses c where c.id = course_id and (c.status = 'published' or c.instructor_id = auth.uid() or public.is_admin_user())));
create policy quizzes_owner_write on public.quizzes for all using (exists (select 1 from public.courses c where c.id = course_id and c.instructor_id = auth.uid() and public.is_user_role('instructor')) or public.is_admin_user()) with check (exists (select 1 from public.courses c where c.id = course_id and c.instructor_id = auth.uid() and public.is_user_role('instructor')) or public.is_admin_user());
create policy quiz_attempts_own on public.quiz_attempts for all using (learner_id = auth.uid()) with check (learner_id = auth.uid());
create policy certificates_own_or_public on public.certificates for select using (learner_id = auth.uid() or public.is_moderator_user());
create policy certificates_admin_write on public.certificates for all using (public.is_admin_user()) with check (public.is_admin_user());

create policy conversations_member_select on public.conversations for select using (exists (select 1 from public.conversation_members cm where cm.conversation_id = id and cm.user_id = auth.uid()) or public.is_moderator_user());
create policy conversations_moderator_insert on public.conversations for insert with check (public.is_moderator_user());
create policy conversations_member_update on public.conversations for update using (exists (select 1 from public.conversation_members cm where cm.conversation_id = id and cm.user_id = auth.uid()) or public.is_moderator_user()) with check (exists (select 1 from public.conversation_members cm where cm.conversation_id = id and cm.user_id = auth.uid()) or public.is_moderator_user());
create policy conversation_members_member_select on public.conversation_members for select using (user_id = auth.uid() or exists (select 1 from public.conversation_members cm where cm.conversation_id = conversation_id and cm.user_id = auth.uid()) or public.is_moderator_user());
create policy conversation_members_moderator_write on public.conversation_members for all using (public.is_moderator_user()) with check (public.is_moderator_user());
create policy messages_member_select on public.messages for select using (exists (select 1 from public.conversation_members cm where cm.conversation_id = conversation_id and cm.user_id = auth.uid()) or public.is_moderator_user());
create policy messages_member_insert on public.messages for insert with check (sender_id = auth.uid() and exists (select 1 from public.conversation_members cm where cm.conversation_id = conversation_id and cm.user_id = auth.uid()));
create policy messages_member_update on public.messages for update using (sender_id = auth.uid() or public.is_moderator_user()) with check (sender_id = auth.uid() or public.is_moderator_user());

create policy notifications_own on public.notifications for select using (user_id = auth.uid());
create policy notifications_own_update on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notification_preferences_own on public.notification_preferences for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy reviews_public_or_participant on public.reviews for select using ((status = 'published') or reviewer_id = auth.uid() or instructor_id = auth.uid() or public.is_moderator_user());
create policy reviews_eligible_insert on public.reviews for insert with check (reviewer_id = auth.uid() and exists (select 1 from public.class_sessions s where s.id = session_id and s.learner_id = auth.uid() and s.status = 'completed'));
create policy reviews_owner_or_moderator_update on public.reviews for update using (reviewer_id = auth.uid() or public.is_moderator_user()) with check (reviewer_id = auth.uid() or public.is_moderator_user());
create policy review_reports_own_or_moderator on public.review_reports for all using (reporter_id = auth.uid() or public.is_moderator_user()) with check (reporter_id = auth.uid() or public.is_moderator_user());
create policy reports_own_or_moderator on public.reports for select using (reporter_id = auth.uid() or public.is_moderator_user());
create policy reports_own_insert on public.reports for insert with check (reporter_id = auth.uid());
create policy reports_moderator_update on public.reports for update using (public.is_moderator_user()) with check (public.is_moderator_user());

create policy session_ledger_parties_or_finance on public.session_ledger for select using (learner_id = auth.uid() or instructor_id = auth.uid() or public.is_finance_user());
create policy payment_references_finance on public.payment_references for select using (public.is_finance_user());
create policy withdrawal_own_or_finance on public.withdrawal_requests for select using (instructor_id = auth.uid() or public.is_finance_user());
create policy withdrawal_instructor_insert on public.withdrawal_requests for insert with check (instructor_id = auth.uid() and public.is_user_role('instructor'));
create policy withdrawal_finance_update on public.withdrawal_requests for update using (public.is_finance_user()) with check (public.is_finance_user());

create policy moderation_cases_moderator on public.moderation_cases for select using (public.is_moderator_user());
create policy moderation_cases_moderator_write on public.moderation_cases for insert with check (public.is_moderator_user());
create policy moderation_cases_moderator_update on public.moderation_cases for update using (public.is_moderator_user()) with check (public.is_moderator_user());
create policy moderation_actions_moderator on public.moderation_actions for select using (public.is_moderator_user());
create policy moderation_actions_moderator_insert on public.moderation_actions for insert with check (public.is_moderator_user() and actor_id = auth.uid());
create policy audit_logs_admin_select on public.audit_logs for select using (public.is_admin_user());
create policy admin_settings_admin on public.admin_settings for select using (public.is_admin_user());
create policy admin_settings_super_admin_write on public.admin_settings for all using (public.is_super_admin_user()) with check (public.is_super_admin_user());

comment on function public.handle_new_auth_user() is 'Creates a learner-scoped profile and role bootstrap for new Supabase Auth users; privileged roles require protected server/admin assignment.';
