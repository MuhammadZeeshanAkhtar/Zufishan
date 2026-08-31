-- Noor Ilm Prompt 12: secure administration and operations schema
-- Documentation only. Apply through the project migration workflow after reviewing existing schemas.

create type admin_role as enum ('moderator', 'support', 'finance_operator', 'admin', 'super_admin');
create type admin_case_status as enum ('open', 'assigned', 'awaiting_information', 'resolved', 'rejected', 'escalated');
create type notification_status as enum ('queued', 'sent', 'failed', 'read');

create table user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role admin_role not null,
  granted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table moderation_cases (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('user','instructor','course','session','enrolment','review','report','notification','withdrawal')),
  entity_id uuid not null,
  case_type text not null,
  assigned_to uuid references auth.users(id),
  status admin_case_status not null default 'open',
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  reason text not null,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table moderation_actions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references moderation_cases(id),
  actor_id uuid not null references auth.users(id),
  action text not null,
  previous_status admin_case_status,
  new_status admin_case_status,
  reason text not null,
  created_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  title text not null check (length(title) between 1 and 180),
  body text not null check (length(body) between 1 and 4000),
  related_entity_type text,
  related_entity_id uuid,
  status notification_status not null default 'queued',
  idempotency_key text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create table notification_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  in_app_enabled boolean not null default true,
  email_enabled boolean not null default false,
  push_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, category)
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id),
  actor_role admin_role,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  previous_summary text,
  new_summary text,
  reason text,
  request_id text,
  created_at timestamptz not null default now()
);

create table admin_settings (
  key text primary key,
  value_json jsonb not null,
  sensitive boolean not null default false,
  updated_by uuid not null references auth.users(id),
  effective_at timestamptz,
  updated_at timestamptz not null default now()
);

create table support_issues (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  status text not null default 'open',
  priority text not null default 'normal',
  subject text not null,
  private_summary text,
  assigned_to uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index moderation_cases_status_priority_idx on moderation_cases(status, priority, updated_at desc);
create index moderation_cases_entity_idx on moderation_cases(entity_type, entity_id);
create index moderation_actions_case_created_idx on moderation_actions(case_id, created_at desc);
create index notifications_user_status_created_idx on notifications(user_id, status, created_at desc);
create index notifications_related_entity_idx on notifications(related_entity_type, related_entity_id);
create index audit_logs_entity_created_idx on audit_logs(entity_type, entity_id, created_at desc);
create index audit_logs_actor_created_idx on audit_logs(actor_id, created_at desc);
create index support_issues_status_priority_idx on support_issues(status, priority, updated_at desc);

-- RLS policy principles:
-- 1. Enable RLS on every table. Resolve admin roles from user_roles server-side.
-- 2. No user may insert/update their own user_roles row or grant a role to themselves.
-- 3. Moderators may read assigned/allowed moderation cases and create moderation_actions, but never finance/settings writes.
-- 4. Support may handle reports/support_issues and minimal user summaries, never raw financial details or private message bodies.
-- 5. Finance operators may read masked billing/withdrawal status, never user_roles or arbitrary private content.
-- 6. Admins may operate within their permission matrix; super_admin is required for role changes, finance adjustments, and sensitive settings.
-- 7. Audit logs are insert-only through a trusted server function. Ordinary clients cannot update/delete them.
-- 8. Notifications are readable by their recipient or authorised operations roles; message bodies and sensitive payloads are not copied into notifications.
-- 9. Analytics uses aggregate RPCs with pagination and suppression/minimum cohort rules where needed.
-- 10. Service-role keys and provider secrets stay server-side; no sensitive settings value is returned to the browser.
-- 11. All suspension, moderation, session adjustment, financial adjustment, retry, escalation, and settings mutations require actor, reason, previous/new state, timestamp, and request/correlation ID.
-- 12. Keep currency values separated by ISO currency code; FX conversion requires a dated, named source and must never be inferred in SQL.
