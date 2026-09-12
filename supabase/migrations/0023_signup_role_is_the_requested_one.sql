-- Signup grants the role the account asked for, not "learner" for everyone.
--
-- THE BUG. `handle_new_auth_user` fires on every insert into `auth.users` and
-- contained, unconditionally:
--
--     insert into public.user_roles (user_id, role) values (new.id, 'learner') ...
--     insert into public.learner_profiles (user_id) values (new.id) ...
--
-- The requested role sits in `raw_user_meta_data->>'requested_public_role'`,
-- written by the signup form, and the trigger never looked at it. So every
-- account ever created — instructor signups, and the administrator — received a
-- `learner` row at the instant the auth user was created.
--
-- That single line explains all three reported symptoms:
--
--   * an instructor signup is stored as a learner (the trigger wins the race;
--     `claimRequestedPublicRole` then ADDS instructor, leaving both roles, or
--     leaves only learner if that call never lands);
--   * the administrator account holds `admin` *and* `learner`;
--   * the admin desk shows everybody as a learner, because everybody genuinely
--     is one in `user_roles`.
--
-- THE FIX. Read the requested role, allow-list it to the two public roles, and
-- insert exactly that. Three properties matter:
--
--   1. **No default.** An account whose metadata carries no valid public role
--      gets no role row at all. Guessing "learner" is what caused this, and a
--      missing role must surface as missing — the admin desk reports "Role not
--      assigned" rather than inventing one.
--   2. **`learner_profiles` follows the role.** It is created only for a
--      learner. `instructor_profiles` is not created here at all: it requires a
--      unique `public_slug`, which only onboarding can supply, and that is
--      already where it is written.
--   3. **Privileged roles remain unreachable.** The allow-list is exactly
--      ('learner','instructor'), so metadata — which the client controls at
--      signup — can never name `admin`, `moderator` or `super_admin`. The
--      administrator role still comes only from the ADMIN_EMAIL bootstrap,
--      compared server-side against the verified account.
--
-- Existing rows are NOT touched. This changes what happens next, and the
-- accounts already carrying a wrong role are reported for a separate, approved
-- correction.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  requested text := lower(trim(coalesce(new.raw_user_meta_data->>'requested_public_role', '')));
  granted text := case when requested in ('learner', 'instructor') then requested else null end;
begin
  insert into public.profiles (id, full_name, display_name, preferred_language)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'full_name',''), nullif(split_part(coalesce(new.email, 'Member'), '@', 1), ''), 'Member'),
    coalesce(nullif(new.raw_user_meta_data->>'display_name',''), nullif(split_part(coalesce(new.email, 'Member'), '@', 1), ''), 'Member'),
    coalesce(nullif(new.raw_user_meta_data->>'preferred_language',''), 'English')
  ) on conflict (id) do nothing;

  -- Exactly the requested public role, or none. Never a default.
  if granted is not null then
    insert into public.user_roles (user_id, role)
    values (new.id, granted)
    on conflict (user_id, role) do nothing;
  end if;

  -- The learner record belongs to a learner. An instructor's profile row needs a
  -- public_slug and is written by onboarding.
  if granted = 'learner' then
    insert into public.learner_profiles (user_id) values (new.id) on conflict (user_id) do nothing;
  end if;

  insert into public.notification_preferences (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$function$;
