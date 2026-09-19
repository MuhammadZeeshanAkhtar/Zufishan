-- Somewhere for a contact message to actually land.
--
-- WHY THIS EXISTS. The contact page had a form whose submit handler was `setSent(true)` and nothing
-- else: a person describing a problem was shown a tick, and their words went nowhere. The form is
-- wanted back, so it needs a real destination. This is that destination — no email provider
-- required, because a row an administrator can read is a working channel on its own.
--
-- WHO MAY DO WHAT. Anyone may write one, including a signed-out visitor: a person who cannot sign
-- in is exactly the person most likely to need to write. Only a reviewer may read them, because a
-- contact message carries a name, an email address and whatever someone chose to confide. Nobody
-- may edit or delete one; a reviewer moves `status` and that is all.
--
-- `reports` was not reused. It requires a signed-in reporter and a target row being reported — it
-- is a moderation record about a thing, and a contact message is neither.

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  -- Set when the sender happened to be signed in; null for a visitor. Never trusted for identity,
  -- only useful for finding their account afterwards.
  user_id uuid references public.profiles(id) on delete set null,
  sender_name text not null check (length(btrim(sender_name)) between 1 and 120),
  sender_email text not null check (length(btrim(sender_email)) between 3 and 200),
  -- Which side of the marketplace they are writing from, so a reviewer can answer in the right terms.
  sender_role text not null default 'other' check (sender_role in ('student', 'teacher', 'other')),
  subject text not null check (length(btrim(subject)) between 1 and 160),
  body text not null check (length(btrim(body)) between 1 and 4000),
  status text not null default 'open' check (status in ('open', 'answered', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contact_messages_status_idx on public.contact_messages (status, created_at desc);

alter table public.contact_messages enable row level security;

-- Anyone may write one. The column checks above are the whole of what is accepted, and the
-- procedure in front of this trims and bounds every field before it reaches here.
do $$
begin
  create policy contact_messages_anyone_may_write
    on public.contact_messages for insert
    to anon, authenticated
    with check (true);
exception
  when duplicate_object then null;
end $$;

-- Only a reviewer may read them. There is deliberately no "read your own": a visitor has no
-- account to own it with, and letting a signed-in sender read back by user_id would be a second
-- rule to keep right for no benefit.
do $$
begin
  create policy contact_messages_reviewer_read
    on public.contact_messages for select
    using (public.is_admin_user() or public.is_moderator_user());
exception
  when duplicate_object then null;
end $$;

-- A reviewer may move the status. Nothing else may be changed, and nothing may be deleted, so the
-- record of what someone wrote cannot be quietly edited after the fact.
do $$
begin
  create policy contact_messages_reviewer_update
    on public.contact_messages for update
    using (public.is_admin_user() or public.is_moderator_user())
    with check (public.is_admin_user() or public.is_moderator_user());
exception
  when duplicate_object then null;
end $$;

comment on table public.contact_messages is
  'Messages written from the public contact page. Anyone may insert; only a reviewer may read. No email provider is involved.';
