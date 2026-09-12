-- Payment status becomes a closed vocabulary, and stays the platform's own.
--
-- `session_ledger.payment_status` and `payment_references.status` are both plain `text` with a
-- default and no constraint. Every other status column in this schema is constrained — bookings,
-- class_sessions, enrolments, reviews, requirement_responses, withdrawal_requests — so these two are
-- the outliers, and they are the two that describe money.
--
-- Why it matters more here than elsewhere: an unconstrained status column accepts a typo. A row
-- written as 'suceeded' is not 'succeeded', so it will never match a query looking for paid rows,
-- and it will never appear in a reconciliation total. Nobody notices until the numbers disagree with
-- a bank statement. A check constraint turns that into a write that fails loudly at the moment the
-- mistake is made.
--
-- The vocabulary is deliberately the platform's, not a vendor's. Every payment provider spells these
-- differently, and adopting one provider's words would make the ledger unreadable the day the
-- provider changes. An adapter maps its vendor's language onto these values and nothing else, which
-- is what keeps this migration provider-neutral: whichever provider is eventually chosen, or none,
-- requires no change here.
--
--   not_configured   the row exists, nothing has been attempted (the default)
--   requires_action  the payer must do something — 3-D Secure, an app confirmation
--   pending          submitted, awaiting the provider
--   processing       the provider is working on it
--   succeeded        money moved
--   failed           the provider refused or the attempt errored
--   cancelled        abandoned before completion
--   refunded         reversed after succeeding (Refunds module builds on this)
--
-- Safe to apply: both tables are empty, so no existing row can violate the constraint. The
-- constraints are additive and named, and dropping either restores the previous behaviour exactly.
-- No column is altered, no default changes, no policy is created or touched — writes to both tables
-- remain service-role-only because neither has an insert or update policy.

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'session_ledger_payment_status_vocabulary') then
    alter table public.session_ledger
      add constraint session_ledger_payment_status_vocabulary
      check (payment_status in (
        'not_configured','requires_action','pending','processing','succeeded','failed','cancelled','refunded'
      ));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'payment_references_status_vocabulary') then
    alter table public.payment_references
      add constraint payment_references_status_vocabulary
      check (status in (
        'not_configured','requires_action','pending','processing','succeeded','failed','cancelled','refunded'
      ));
  end if;
end $$;

comment on column public.session_ledger.payment_status is
  'Platform payment vocabulary, not a provider''s. Adapters map their vendor''s status onto these values. Writable only by the service role: this table has no insert or update policy.';

comment on column public.payment_references.status is
  'Platform payment vocabulary, matching session_ledger.payment_status. One row per provider reference; unique(provider, provider_reference) is the webhook idempotency key.';
