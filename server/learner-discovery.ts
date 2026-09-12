/**
 * Find Students — learners who chose to be found.
 *
 * The rule here is deliberately NOT the instructor rule, and the difference
 * matters:
 *
 *   * An instructor reaches public discovery only after an administrator
 *     approves them. A learner is trusting them with teaching, so a third party
 *     checks first.
 *   * A learner reaches instructor discovery purely by their own choice. No
 *     approval, no queue, no moderator. `profile_status = 'published'` is the
 *     whole gate, the learner sets it themselves, and setting it back removes
 *     them immediately.
 *
 * **Read through the caller's own client, not the service role.** The published
 * rows come back under the caller's session, so migration 0025's policy —
 * `profile_status = 'published' and is_user_role('instructor')` — is what
 * actually admits them. The role check below is a second line that produces a
 * clear refusal; if it were ever wrong, RLS would still return nothing. That is
 * the opposite way round from the admin desk, where the service role is used
 * precisely because an operator must see rows RLS would hide.
 *
 * The service role is used for exactly one thing: attaching the display name and
 * avatar, which live on `profiles` and are unreadable to anyone but their owner.
 * That attachment respects the learner's own `profile_visibility` separately,
 * so a learner who published a *learning request* without publishing their
 * *person* appears under a safe label rather than their name.
 */
import { getSupabaseAdminClient } from "./supabase-admin-client";
import { getSupabaseUserClient } from "./supabase-user-client";
import type { SupabaseIdentity } from "./supabase-auth";
import { verifyHumanToken } from "./human-verification";
import { readOwnRoles } from "./supabase-admin-auth";

export const LEARNER_DISCOVERY_LIMIT = 48;

/**
 * How many published learner rows one request will look at before paginating.
 *
 * Country, timezone, gender and language all live on `profiles` and are resolved
 * after the read, so the rows have to exist before they can be filtered. This
 * bounds that work; beyond it the desk would need the filters pushed into SQL.
 */
export const LEARNER_DISCOVERY_SCAN = 200;

type Result<T> =
  | { ok: true; data: T }
  // NOT_FOUND is used by the detail read for both "no such learner" and "not
  // published" — deliberately the same answer, so neither confirms an account.
  | { ok: false; error: string; code?: "FORBIDDEN" | "SETUP_NEEDED" | "NOT_FOUND" };

export type DiscoverableLearner = {
  /** The learner's own id. Carried so an instructor can open the secure flows. */
  learnerId: string;
  displayName: string | null;
  avatarUrl: string | null;
  country: string | null;
  timezone: string | null;
  /**
   * The learner's own stated gender, when they made their person public.
   *
   * Published for a reason particular to this subject: matching a teacher to a
   * learner by gender is a normal request in Quran study, not an edge case. It
   * follows `profile_visibility` like every other person field.
   */
  gender: string | null;
  subjects: string[];
  level: string | null;
  goal: string | null;
  preferredClassFormat: string | null;
  availability: string | null;
  preferredLanguage: string | null;
  /** The learner's own introduction, when they made their person public. */
  bio: string | null;
  /** Languages the learner speaks. */
  supportedLanguages: string[];
  /** What the learner is looking for in a teacher — written by them, for teachers. */
  tutorPreference: string | null;
  /** True when the learner also made their person public, not just their request. */
  profilePublic: boolean;
};

export type LearnerFilters = {
  subjects?: string[];
  level?: string;
  language?: string;
  /** Matched against `profiles.gender`, which the check constraint limits to male/female. */
  gender?: string;
  country?: string;
  timezone?: string;
  query?: string;
  limit?: number;
  offset?: number;
  /**
   * A human-verification token from the widget in the browser.
   *
   * Optional in the type because this project has no provider configured, and a
   * required field would break the desk for a check nothing can perform. It is
   * not optional in effect: once a provider IS configured, a request without a
   * valid token is refused below.
   */
  humanToken?: string;
};

const forbidden = <T,>(): Result<T> => ({
  ok: false,
  error: "Only an instructor can open learner discovery.",
  code: "FORBIDDEN",
});

/**
 * Learners who have published their profile.
 *
 * `budget_range` is deliberately NOT read or returned. A learner's budget is
 * their financial position, it is not needed to judge whether you can teach
 * them, and the brief for this desk does not ask for it. (An earlier version of
 * this comment claimed the column was shown when the person was public; it never
 * was — the column was selected and then dropped. The select no longer asks for
 * it either, so the claim and the code now agree.)
 */
export async function listDiscoverableLearners(
  identity: SupabaseIdentity,
  filters: LearnerFilters = {},
): Promise<Result<{ learners: DiscoverableLearner[]; total: number; limit: number; offset: number }>> {
  const roles = await readOwnRoles(identity);
  if (!roles.ok) return { ok: false, error: roles.error, code: "SETUP_NEEDED" };
  // Learner discovery is for instructors. An administrator has the admin desk,
  // which is a different surface with a different justification.
  if (!roles.roles.includes("instructor")) return forbidden();

  // Human verification, when there is a provider to verify against.
  //
  // `not_configured` is the state on this project today and it does NOT pass the
  // check — there is simply no check to run, and the desk says so rather than
  // claiming a protection it lacks. Every other outcome is decided by the
  // provider, server-side, from a secret the browser never sees.
  const human = await verifyHumanToken(filters.humanToken);
  if (human.outcome === "failed") {
    return {
      ok: false,
      error: human.reason === "missing_token"
        ? "Please complete the human verification check to continue."
        : human.reason === "unreachable"
        ? "The human verification service could not be reached. Please try again."
        : "That human verification check did not pass. Please try again.",
      code: "FORBIDDEN",
    };
  }

  const db = getSupabaseUserClient(identity.accessToken);
  if (!db) return { ok: false, error: "Supabase persistence is not configured.", code: "SETUP_NEEDED" };

  const limit = Math.min(Math.max(filters.limit ?? 24, 1), LEARNER_DISCOVERY_LIMIT);
  const offset = Math.max(filters.offset ?? 0, 0);

  // No status filter is written here on purpose: policy 0025 admits published
  // rows and nothing else, so this cannot be widened by a mistake in this file.
  let request = db
    .from("learner_profiles")
    .select("user_id,learning_subjects,learning_level,learning_goal,preferred_class_format,preferred_days_times,tutor_preference,profile_status,updated_at", { count: "exact" })
    .eq("profile_status", "published");

  if (filters.subjects?.length) request = request.overlaps("learning_subjects", filters.subjects);
  if (filters.level) request = request.eq("learning_level", filters.level);

  const term = filters.query?.trim();
  if (term) {
    // Matched against what the learner wrote about their own learning, never
    // against a name or any column they did not publish.
    const escaped = term.replace(/[%,()]/g, " ").trim();
    if (escaped) request = request.or(`learning_goal.ilike.%${escaped}%,preferred_class_format.ilike.%${escaped}%`);
  }

  // Collected before slicing, because four of the filters below read `profiles`,
  // which this client cannot join. Filtering a page that had already been cut
  // would hide matches beyond it and report a count from before the filter.
  // LEARNER_DISCOVERY_SCAN bounds the work regardless of how the desk grows.
  const { data, error } = await request
    .order("updated_at", { ascending: false })
    .range(0, LEARNER_DISCOVERY_SCAN - 1);
  if (error) {
    console.error("[learner-discovery] read failed:", { code: error.code, message: error.message });
    return { ok: false, error: "Learner discovery could not be loaded." };
  }

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const presentation = await attachLearnerPresentation(rows.map((row) => String(row.user_id)));

  const learners: DiscoverableLearner[] = rows.map((row) => {
    const person = presentation.get(String(row.user_id)) ?? blankPerson;
    return {
      learnerId: String(row.user_id),
      displayName: person.displayName,
      avatarUrl: person.avatarUrl,
      country: person.country,
      timezone: person.timezone,
      gender: person.gender,
      subjects: (row.learning_subjects as string[]) ?? [],
      level: row.learning_level ? String(row.learning_level) : null,
      goal: row.learning_goal ? String(row.learning_goal) : null,
      preferredClassFormat: row.preferred_class_format ? String(row.preferred_class_format) : null,
      availability: row.preferred_days_times ? String(row.preferred_days_times) : null,
      preferredLanguage: person.preferredLanguage,
      bio: person.bio,
      supportedLanguages: person.supportedLanguages,
      tutorPreference: row.tutor_preference ? String(row.tutor_preference) : null,
      profilePublic: person.profilePublic,
    };
  });

  // Applied after presentation because these columns live on `profiles`, which the
  // caller's own client cannot filter on. A learner whose person is private matches
  // none of them, which is correct: those values were never published.
  const language = filters.language?.trim();
  const gender = filters.gender?.trim();
  const country = filters.country?.trim();
  const timezone = filters.timezone?.trim();
  const filtered = learners.filter((learner) =>
    (!language || learner.preferredLanguage === language || learner.supportedLanguages.includes(language))
    && (!gender || learner.gender === gender)
    && (!country || learner.country === country)
    && (!timezone || learner.timezone === timezone));

  const page = filtered.slice(offset, offset + limit);
  return { ok: true, data: { learners: page, total: filtered.length, limit, offset } };
}

type LearnerPerson = {
  displayName: string | null;
  avatarUrl: string | null;
  country: string | null;
  timezone: string | null;
  gender: string | null;
  preferredLanguage: string | null;
  /** The learner's own introduction. Person data, so it follows profile_visibility. */
  bio: string | null;
  /** Languages they speak, which decides whether a teacher can actually teach them. */
  supportedLanguages: string[];
  profilePublic: boolean;
};

const blankPerson: LearnerPerson = {
  displayName: null, avatarUrl: null, country: null, timezone: null, gender: null, preferredLanguage: null,
  bio: null, supportedLanguages: [], profilePublic: false,
};

/**
 * Name, avatar and location for the learners on this page.
 *
 * Same two-consent shape as instructor discovery. `profile_status = 'published'`
 * is why the learning request is visible; `profiles.profile_visibility` is a
 * separate decision about the person, and a suspended or deleted account is
 * never presented whatever either flag says.
 *
 * The allow-list carries gender, and that is a deliberate reversal of an earlier
 * decision to withhold it. Quran teaching is a setting where matching teacher and
 * learner by gender is a stated, ordinary requirement, and instructors already
 * publish their own gender for exactly that reason — withholding only the
 * learner's made the two sides asymmetric without protecting anything the learner
 * had not already chosen to share. It stays governed by `profile_visibility`: a
 * learner who published their learning but not their person still shows nothing.
 */
async function attachLearnerPresentation(ids: string[]): Promise<Map<string, LearnerPerson>> {
  const found = new Map<string, LearnerPerson>();
  if (ids.length === 0) return found;

  const admin = getSupabaseAdminClient();
  // Without it the cards carry no personal detail. That is a degraded view, not
  // a failure — the learning requests themselves are still real and useful.
  if (!admin) return found;

  const { data, error } = await admin
    .from("profiles")
    .select("id,display_name,avatar_url,country,timezone,gender,preferred_language,bio,supported_languages,profile_visibility,account_status")
    .in("id", ids);
  if (error) {
    console.error("[learner-discovery] presentation lookup failed:", { code: error.code, message: error.message });
    return found;
  }

  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const active = String(row.account_status ?? "") === "active";
    const isPublic = String(row.profile_visibility ?? "") === "public" && active;
    found.set(String(row.id), isPublic
      ? {
          displayName: row.display_name ? String(row.display_name) : null,
          avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
          country: row.country ? String(row.country) : null,
          timezone: row.timezone ? String(row.timezone) : null,
          gender: row.gender ? String(row.gender) : null,
          preferredLanguage: row.preferred_language ? String(row.preferred_language) : null,
          bio: row.bio ? String(row.bio) : null,
          supportedLanguages: (row.supported_languages as string[]) ?? [],
          profilePublic: true,
        }
      : { ...blankPerson, preferredLanguage: row.preferred_language ? String(row.preferred_language) : null });
  }
  return found;
}

/**
 * Whether the caller's own learner profile is discoverable.
 *
 * Read for the learner's own control in their dashboard, so the switch reflects
 * the stored value rather than a guess.
 */
export async function getOwnDiscoverability(identity: SupabaseIdentity): Promise<Result<{ discoverable: boolean; status: string }>> {
  const db = getSupabaseUserClient(identity.accessToken);
  if (!db) return { ok: false, error: "Supabase persistence is not configured.", code: "SETUP_NEEDED" };

  const { data, error } = await db.from("learner_profiles").select("profile_status").eq("user_id", identity.id).maybeSingle();
  if (error) {
    console.error("[learner-discovery] own status read failed:", { code: error.code, message: error.message });
    return { ok: false, error: "Your discovery setting could not be read." };
  }
  const status = String((data as { profile_status?: string } | null)?.profile_status ?? "draft");
  return { ok: true, data: { discoverable: status === "published", status } };
}

/**
 * The learner's own switch.
 *
 * Written through the caller's client, so `learner_profiles_own` is what
 * authorises it — a learner can only ever change their own row, and no
 * instructor or administrator path leads here.
 */
export async function setOwnDiscoverability(
  identity: SupabaseIdentity,
  input: { discoverable: boolean },
): Promise<Result<{ discoverable: boolean; status: string }>> {
  const db = getSupabaseUserClient(identity.accessToken);
  if (!db) return { ok: false, error: "Supabase persistence is not configured.", code: "SETUP_NEEDED" };

  // `paused`, not `draft`: the two used to be the same value, which made an
  // explicit hide indistinguishable from "never published" — and a later
  // profile save would then silently re-publish someone who had just turned
  // themselves off. `paused` was already in the check constraint for exactly
  // this meaning, so no migration is involved.
  const status = input.discoverable ? "published" : "paused";
  const { error } = await db
    .from("learner_profiles")
    .upsert({ user_id: identity.id, profile_status: status }, { onConflict: "user_id" });
  if (error) {
    console.error("[learner-discovery] own status write failed:", { code: error.code, message: error.message });
    return { ok: false, error: "Your discovery setting could not be saved." };
  }
  return { ok: true, data: { discoverable: input.discoverable, status } };
}

/**
 * One published learner, for the detail view behind a Find Students card.
 *
 * The mirror of opening a teacher's profile from Find Quran Teacher, and it
 * repeats every boundary the list applies rather than assuming the caller
 * already passed them — a detail route is reachable by typing a URL, so it
 * cannot lean on the list having been rendered first:
 *
 *   * the caller must hold the instructor role;
 *   * the human check runs again, on the same terms;
 *   * the read goes through the caller's own client, so policy 0025 decides —
 *     an unpublished learner is not "hidden" here, they are not returned at all;
 *   * a learner whose account is suspended, or who kept their person private,
 *     yields the same reduced presentation the card shows.
 *
 * Returns the same shape as one row of the list, so the card and the detail page
 * cannot disagree about what a learner's profile contains.
 */
export async function getDiscoverableLearner(
  identity: SupabaseIdentity,
  input: { learnerId: string; humanToken?: string },
): Promise<Result<DiscoverableLearner>> {
  const roles = await readOwnRoles(identity);
  if (!roles.ok) return { ok: false, error: roles.error, code: "SETUP_NEEDED" };
  if (!roles.roles.includes("instructor")) return forbidden();

  const human = await verifyHumanToken(input.humanToken);
  if (human.outcome === "failed") {
    return { ok: false, error: "Please complete the human verification check to continue.", code: "FORBIDDEN" };
  }

  const db = getSupabaseUserClient(identity.accessToken);
  if (!db) return { ok: false, error: "Supabase persistence is not configured.", code: "SETUP_NEEDED" };

  const { data, error } = await db
    .from("learner_profiles")
    .select("user_id,learning_subjects,learning_level,learning_goal,preferred_class_format,preferred_days_times,tutor_preference,profile_status")
    .eq("user_id", input.learnerId)
    .eq("profile_status", "published")
    .maybeSingle();
  if (error) {
    console.error("[learner-discovery] detail read failed:", { code: error.code, message: error.message });
    return { ok: false, error: "That learner profile could not be loaded." };
  }
  // Not found and not published are the same answer on purpose: neither confirms
  // that an account exists.
  if (!data) return { ok: false, error: "That learner profile is not available.", code: "NOT_FOUND" };

  const row = data as Record<string, unknown>;
  const person = (await attachLearnerPresentation([String(row.user_id)])).get(String(row.user_id)) ?? blankPerson;

  return {
    ok: true,
    data: {
      learnerId: String(row.user_id),
      displayName: person.displayName,
      avatarUrl: person.avatarUrl,
      country: person.country,
      timezone: person.timezone,
      gender: person.gender,
      subjects: (row.learning_subjects as string[]) ?? [],
      level: row.learning_level ? String(row.learning_level) : null,
      goal: row.learning_goal ? String(row.learning_goal) : null,
      preferredClassFormat: row.preferred_class_format ? String(row.preferred_class_format) : null,
      availability: row.preferred_days_times ? String(row.preferred_days_times) : null,
      preferredLanguage: person.preferredLanguage,
      bio: person.bio,
      supportedLanguages: person.supportedLanguages,
      tutorPreference: row.tutor_preference ? String(row.tutor_preference) : null,
      profilePublic: person.profilePublic,
    },
  };
}
