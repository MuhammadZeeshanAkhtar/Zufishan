-- Noor Ilm Prompt 11 relationship operations schema reference
-- Documentation only. Review with the product owner before applying to Supabase.
-- Money is integer minor units; raw card, CVV, password, and bank credentials are never stored.

create type conversation_type as enum ('requirement', 'trial', 'booking', 'course_enrollment', 'support');
create type conversation_status as enum ('active', 'archived', 'reported');
create type message_status as enum ('draft', 'pending', 'confirmed', 'failed');
create type review_status as enum ('draft', 'submitted', 'published', 'hidden', 'reported', 'rejected', 'archived');
create type report_status as enum ('submitted', 'under_review', 'resolved', 'dismissed', 'escalated');
create type session_ledger_status as enum ('scheduled', 'attended', 'completed', 'cancelled', 'no_show', 'disputed', 'under_review');
create type payment_status as enum ('not_required', 'pending', 'provider_pending', 'confirmed', 'failed', 'refunded', 'disputed');
create type withdrawal_status as enum ('not_available', 'requested', 'under_review', 'approved', 'processing', 'paid', 'failed', 'cancelled');

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  conversation_type conversation_type not null,
  related_requirement_id uuid null references requirements(id) on delete set null,
  related_booking_id uuid null references bookings(id) on delete set null,
  related_course_id uuid null references courses(id) on delete set null,
  status conversation_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists conversations_updated_at_idx on conversations(updated_at desc);

create table if not exists conversation_members (
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null check (role in ('learner', 'instructor', 'admin')),
  joined_at timestamptz not null default now(),
  last_read_at timestamptz null,
  primary key (conversation_id, user_id)
);
create index if not exists conversation_members_user_idx on conversation_members(user_id, conversation_id);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid not null references profiles(id) on delete restrict,
  body text not null check (char_length(body) between 1 and 2000),
  attachment_path text null,
  sent_at timestamptz not null default now(),
  read_at timestamptz null,
  status message_status not null default 'pending'
);
create index if not exists messages_conversation_sent_idx on messages(conversation_id, sent_at desc);

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references profiles(id) on delete restrict,
  target_type text not null check (target_type in ('message', 'conversation', 'review')),
  target_id uuid not null,
  reason text not null,
  description text not null check (char_length(description) between 1 and 3000),
  status report_status not null default 'submitted',
  decision_note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists reports_status_created_idx on reports(status, created_at desc);

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  reviewer_id uuid not null references profiles(id) on delete restrict,
  instructor_id uuid null references profiles(id) on delete restrict,
  course_id uuid null references courses(id) on delete set null,
  session_id uuid null references class_sessions(id) on delete set null,
  rating smallint not null check (rating between 1 and 5),
  review_text text not null check (char_length(review_text) between 1 and 3000),
  private_feedback text null,
  public_consent boolean not null default false,
  status review_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (instructor_id is not null or course_id is not null or session_id is not null)
);
create unique index if not exists reviews_one_per_session_idx on reviews(reviewer_id, session_id) where session_id is not null;
create index if not exists reviews_public_idx on reviews(status, public_consent, updated_at desc);

create table if not exists review_reports (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references reviews(id) on delete cascade,
  reporter_id uuid not null references profiles(id) on delete restrict,
  reason text not null,
  description text not null,
  status report_status not null default 'submitted',
  decision_note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists session_ledger (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references class_sessions(id) on delete restrict,
  learner_id uuid not null references profiles(id) on delete restrict,
  instructor_id uuid not null references profiles(id) on delete restrict,
  course_id uuid null references courses(id) on delete set null,
  scheduled_duration_seconds integer not null check (scheduled_duration_seconds >= 0),
  actual_duration_seconds integer null check (actual_duration_seconds is null or actual_duration_seconds >= 0),
  attendance_status text not null check (attendance_status in ('present', 'absent', 'not_recorded')),
  session_status session_ledger_status not null default 'scheduled',
  rate_per_hour_minor integer null check (rate_per_hour_minor is null or rate_per_hour_minor >= 0),
  currency text null,
  gross_amount_minor integer null check (gross_amount_minor is null or gross_amount_minor >= 0),
  platform_fee_minor integer null check (platform_fee_minor is null or platform_fee_minor >= 0),
  instructor_net_minor integer null check (instructor_net_minor is null or instructor_net_minor >= 0),
  payment_status payment_status not null default 'not_required',
  review_status text not null default 'not_eligible',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists session_ledger_instructor_idx on session_ledger(instructor_id, created_at desc);
create index if not exists session_ledger_learner_idx on session_ledger(learner_id, created_at desc);

create table if not exists payment_references (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references profiles(id) on delete set null,
  session_ledger_id uuid null references session_ledger(id) on delete set null,
  provider text not null,
  external_reference text not null,
  amount_minor integer null check (amount_minor is null or amount_minor >= 0),
  currency text null,
  status payment_status not null default 'pending',
  provider_metadata jsonb null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Provider metadata must be encrypted/restricted or reduced to non-sensitive references. Never store raw payment data.

create table if not exists withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  instructor_id uuid not null references profiles(id) on delete restrict,
  amount_minor integer not null check (amount_minor > 0),
  currency text not null,
  status withdrawal_status not null default 'requested',
  provider_reference text null,
  decision_note text null,
  failure_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists withdrawal_instructor_idx on withdrawal_requests(instructor_id, created_at desc);

create table if not exists operations_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references profiles(id) on delete restrict,
  action text not null,
  target_type text not null,
  target_id uuid null,
  reason text null,
  created_at timestamptz not null default now()
);
create index if not exists operations_audit_log_target_idx on operations_audit_log(target_type, target_id, created_at desc);

-- Recommended RLS shape:
-- 1. conversation_members: members can select their own memberships; admins/moderators are role-gated.
-- 2. conversations/messages: select and insert only when auth.uid() is a member and sender matches auth.uid().
-- 3. messages: users may update only their own read state; bodies are immutable after confirmation.
-- 4. reports/review_reports: reporter can create/read own records; moderators can review through audited role claims.
-- 5. reviews: learner can insert only when an RPC verifies completed + attended eligibility; unique index blocks duplicate session reviews.
-- 6. public reviews: anonymous select only where status = 'published' and public_consent = true.
-- 7. instructors can read their own ledger and withdrawals; learners can read only their own ledger/payment references.
-- 8. Admin billing, moderation, and withdrawal transitions require server-side role claims and operations_audit_log entries.
-- 9. No frontend route parameter, redirect, or provider callback is proof of payment or payout.

-- Private Storage buckets:
-- conversation-attachments (private): member-authorized signed URLs only; MIME/size scanning and retention required.
-- compliance-private (private): never exposed in conversations or public profiles.
-- Public avatars/course art remain separate from financial and message attachments.

-- Mobile contract notes:
-- Mirror the web service functions with typed DTOs; keep pagination cursors, UTC timestamps, enum strings, and idempotency keys stable.
-- Realtime may subscribe to conversation/message changes only after membership is server-confirmed; de-dupe by message id on reconnect.
-- Provider interfaces remain server-side: createCheckoutSession, verifyCheckoutResult, handlePaymentWebhook, createRefund, createPayoutRequest, verifyPayoutStatus.
-- Credit/wallet tables are intentionally omitted until the product owner confirms the model.
