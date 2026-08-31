-- Noor Ilm LMS Prompt 9 focused RLS recursion fix.
-- Replaces self-referential conversation membership policies with a security-definer helper.

create or replace function public.is_conversation_member(target_conversation_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.conversation_members where conversation_id = target_conversation_id and user_id = auth.uid()); $$;

drop policy if exists conversations_member_select on public.conversations;
create policy conversations_member_select on public.conversations for select using (public.is_conversation_member(id) or public.is_moderator_user());

drop policy if exists conversation_members_member_select on public.conversation_members;
create policy conversation_members_member_select on public.conversation_members for select using (user_id = auth.uid() or public.is_conversation_member(conversation_id) or public.is_moderator_user());

drop policy if exists messages_member_select on public.messages;
create policy messages_member_select on public.messages for select using (public.is_conversation_member(conversation_id) or public.is_moderator_user());

drop policy if exists messages_member_insert on public.messages;
create policy messages_member_insert on public.messages for insert with check (sender_id = auth.uid() and public.is_conversation_member(conversation_id));
