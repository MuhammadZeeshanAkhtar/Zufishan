-- Role totals are per ACCOUNT, not per role row.
--
-- THE BUG. The admin overview counted rows in `user_roles`:
--
--     count("user_roles", q => q.eq("role", "learner"))
--
-- `user_roles` is a many-to-one table — `unique (user_id, role)` permits an
-- account to hold several roles at once, and accounts legitimately do. Every
-- account created before migration 0023 was given a `learner` row by the old
-- `handle_new_auth_user` trigger regardless of what it signed up as, so the
-- administrator account holds both `admin` and `learner`. Counting rows made
-- the administrator a learner, and made the totals overlap: an account could
-- be counted twice, and "Total learners + Total instructors" meant nothing.
--
-- THE RULE. An account has exactly one EFFECTIVE role: the highest-privilege
-- role it holds. The ladder below is the whole definition, and it is written
-- once, here, so the overview counts, the user-list filter and the role chips
-- can never disagree:
--
--     super_admin > admin > moderator > finance > advisory_board
--                 > instructor > learner
--
-- Privilege wins because that is what the account actually is. An account that
-- can approve instructors and suspend users is an administrator, whatever
-- historical rows sit beneath it. So `admins` and `learners` are disjoint by
-- construction — not by subtracting one, not by hiding a card, and not by
-- knowing any particular address.
--
-- Every account appears exactly once. An account with no role row at all is
-- 'unassigned' and is visible as such, because silently calling it a learner is
-- the defect this replaces.
--
-- READ-ONLY AND ADDITIVE. This migration creates a view and grants nothing to
-- an end-user role. It does not read, write, move, merge or delete a single
-- row of `user_roles`: the stale `admin`+`learner` pairing is reported by the
-- desk, not rewritten here. No policy is added, altered or dropped.
--
-- RLS IS NOT WEAKENED. `security_invoker = on` makes the view execute with the
-- caller's privileges, so the row policies on `profiles` and `user_roles` apply
-- exactly as they would to a direct query — without it a view runs as its owner
-- and would hand every caller a platform-wide roster. Execution is then
-- narrowed further: `anon` and `authenticated` are revoked outright, so the
-- only client that can read it is the server's service role, which is only
-- handed out after `requireAdmin`.

drop view if exists public.account_effective_role;

create view public.account_effective_role
  with (security_invoker = on)
  as
select
  p.id as user_id,
  coalesce(top.role, 'unassigned') as top_role,
  case
    when top.role in ('admin', 'super_admin')                    then 'admins'
    when top.role in ('moderator', 'finance', 'advisory_board')  then 'staff'
    when top.role = 'instructor'                                 then 'instructors'
    when top.role = 'learner'                                    then 'learners'
    else 'unassigned'
  end as effective_role,
  -- Sortable privilege order, so "administrators first" is true across the whole
  -- list rather than only within whichever page happened to be fetched. An
  -- account with no role sorts last but is never hidden.
  coalesce(
    array_position(
      array['super_admin','admin','moderator','finance','advisory_board','instructor','learner']::text[],
      top.role
    ),
    8
  ) as role_rank,
  -- The account columns the user desk lists. Carrying them here is what lets the
  -- list be filtered, searched, counted and ORDERED BY ROLE in one query. The
  -- previous code could not order by role at all: it read `profiles`, then
  -- resolved roles separately, so role was not available to the database at sort
  -- time and a capped id list stood in for the filter.
  --
  -- Nothing sensitive is added. There is no email, no password, no token and no
  -- session here — exactly the columns the desk already selected from `profiles`.
  p.display_name,
  p.full_name,
  p.country,
  p.account_status,
  p.onboarding_completed,
  p.preferred_locale,
  p.created_at
from public.profiles p
left join lateral (
  -- The single highest-privilege role this account holds. `array_position`
  -- returns NULL for anything outside the ladder, and `nulls last` keeps such a
  -- row from outranking a real one; the CASE above then reports it as
  -- 'unassigned' rather than inventing a bucket for it.
  select r.role
    from public.user_roles r
   where r.user_id = p.id
   order by array_position(
     array['super_admin','admin','moderator','finance','advisory_board','instructor','learner']::text[],
     r.role
   ) nulls last
   limit 1
) top on true;

comment on view public.account_effective_role is
  'One row per account with its single highest-privilege role, plus the account columns the admin user desk lists. Mutually exclusive buckets for counting, ordering and filtering; service_role only.';

-- Least privilege, stated positively: strip everything Supabase's default
-- privileges hand out on a new object in `public`, then grant back the single
-- verb this view exists for. It is never written through, so nothing but
-- SELECT is granted to anyone.
revoke all on public.account_effective_role from public, anon, authenticated, service_role;
grant select on public.account_effective_role to service_role;
