/**
 * User management for the admin desk.
 *
 * Two rules shape what this module will and will not do.
 *
 * **It does not change roles.** `user_roles` is the permission system, and the
 * brief is explicit that no arbitrary escalation may happen from the ordinary
 * UI. There is therefore no procedure here that inserts, updates or deletes a
 * role — not a guarded one, not a super-admin-only one. The only path to `admin`
 * remains the ADMIN_EMAIL bootstrap, and anything beyond that is a deliberate
 * database operation, not a button.
 *
 * **It shows no secret and no unnecessary private data.** No password, no token,
 * no session, and no email address: an operator identifies an account by display
 * name and id. Learner goals, budgets and message bodies are not read here
 * either — support needs to know an account exists and what state it is in, not
 * what its owner wrote to their tutor.
 *
 * The one write is account status, which is genuinely an operator's job. It
 * requires a reason, refuses to act on the caller's own account or on another
 * administrator, and is audited.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SupabaseIdentity } from "./supabase-auth";
import {
  clampLimit, clampOffset, forbidden, invalid, likeTerm, logFailure,
  notFound, noteFor, recordAudit, requireAdmin, type AdminResult, type Page,
} from "./admin-guard";
import {
  effectiveRoleOf, sortRolesByPrecedence, PRIVILEGED_ROLES,
  type AccountRoleKey,
} from "@shared/account-roles";

export const USER_ROLE_FILTERS = ["all", "learner", "instructor", "admin", "staff", "unassigned"] as const;
export type UserRoleFilter = (typeof USER_ROLE_FILTERS)[number];

/**
 * A filter names an account's EFFECTIVE role, not a row it happens to hold.
 *
 * Filtering by "learner" used to mean "holds a learner row", which returned the
 * administrator: it still holds a stale `learner` row from the pre-0023 signup
 * trigger. These buckets are mutually exclusive, so an account appears under
 * exactly one filter and the filters together are the whole list.
 */
const FILTER_BUCKET: Record<Exclude<UserRoleFilter, "all">, AccountRoleKey> = {
  learner: "learners",
  instructor: "instructors",
  admin: "admins",
  staff: "staff",
  unassigned: "unassigned",
};

export const ACCOUNT_STATUSES = ["active", "pending", "suspended", "deleted"] as const;
export const USER_STATUS_FILTERS = ["all", ...ACCOUNT_STATUSES] as const;
export type UserStatusFilter = (typeof USER_STATUS_FILTERS)[number];

/** The only statuses an operator may set from this desk. `deleted` is not one of them. */
export const SETTABLE_ACCOUNT_STATUSES = ["active", "suspended"] as const;
export type SettableAccountStatus = (typeof SETTABLE_ACCOUNT_STATUSES)[number];

export type UserRow = {
  id: string;
  displayName: string | null;
  fullName: string | null;
  country: string | null;
  /** Every role held, highest privilege first. */
  roles: string[];
  /** The single bucket this account is counted in. Never inferred in the browser. */
  effectiveRole: AccountRoleKey;
  accountStatus: string;
  onboardingCompleted: boolean;
  preferredLocale: string | null;
  joinedAt: string;
};

/** Roles for the accounts on this page, in one query rather than one per row. */
async function rolesFor(admin: SupabaseClient, ids: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (ids.length === 0) return map;
  const { data, error } = await admin.from("user_roles").select("user_id,role").in("user_id", ids);
  logFailure("admin-users", error);
  for (const row of (data ?? []) as Array<{ user_id: string; role: string }>) {
    map.set(row.user_id, [...(map.get(row.user_id) ?? []), row.role]);
  }
  // Ordered here, once, so the account's real identity leads wherever it renders.
  // Alphabetical order put `admin` before `learner` by luck; it would have put
  // `finance` before `super_admin` just as readily.
  for (const [id, held] of Array.from(map.entries())) map.set(id, sortRolesByPrecedence(held));
  return map;
}

export async function listUsers(
  identity: SupabaseIdentity,
  input: { search?: string; role?: UserRoleFilter; status?: UserStatusFilter; limit?: number; offset?: number },
): Promise<AdminResult<Page<UserRow>>> {
  const gate = await requireAdmin(identity);
  if (!gate.ok) return gate.failure;
  const { admin } = gate;

  const limit = clampLimit(input.limit);
  const offset = clampOffset(input.offset);
  const search = input.search?.trim() ?? "";

  // Read through `account_effective_role`, not `profiles`.
  //
  // The view carries each account's resolved role ALONGSIDE its profile columns,
  // which is what makes role a first-class part of this query: it can be
  // filtered on, ordered by and counted in one statement. Reading `profiles` and
  // resolving roles afterwards is what forced the old code into a capped id list
  // for the filter and left it unable to sort by role at all.
  let query = admin
    .from("account_effective_role")
    .select(
      "user_id,display_name,full_name,country,account_status,onboarding_completed,preferred_locale,created_at,effective_role,role_rank",
      { count: "exact" },
    );

  if (input.status && input.status !== "all") query = query.eq("account_status", input.status);
  if (search) query = query.or(`display_name.ilike.${likeTerm(search)},full_name.ilike.${likeTerm(search)}`);

  if (input.role && input.role !== "all") {
    // "learner" now means an account that IS a learner, not one that merely holds
    // a learner row. That single distinction is why an administrator no longer
    // appears under Learners: nothing is excluded by address, and nothing is
    // subtracted from a total.
    query = query.eq("effective_role", FILTER_BUCKET[input.role]);
  }

  // Administrators first, then staff, instructors, learners, and accounts with no
  // role last — the privilege ladder, applied by the database, so it holds across
  // every page rather than only within the one being looked at. Newest first
  // inside each rank keeps the previous ordering meaningful.
  const { data, error, count } = await query
    .order("role_rank", { ascending: true })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) {
    logFailure("admin-users", error);
    return { ok: false, error: "The user list could not be loaded." };
  }

  const raw = (data ?? []) as Array<Record<string, unknown>>;
  const roles = await rolesFor(admin, raw.map((row) => String(row.user_id)));

  const rows: UserRow[] = raw.map((row) => {
    const id = String(row.user_id);
    const held = roles.get(id) ?? [];
    return {
      id,
      displayName: row.display_name ? String(row.display_name) : null,
      fullName: row.full_name ? String(row.full_name) : null,
      country: row.country ? String(row.country) : null,
      // Every role the account holds, for the chips, and the one bucket it counts
      // in, for its label. The bucket comes from the database column the ordering
      // and filtering already used, so a row cannot be labelled one thing and
      // sorted as another.
      roles: held,
      effectiveRole: String(row.effective_role) as AccountRoleKey,
      accountStatus: String(row.account_status),
      onboardingCompleted: row.onboarding_completed === true,
      preferredLocale: row.preferred_locale ? String(row.preferred_locale) : null,
      joinedAt: String(row.created_at),
    };
  });

  return { ok: true, data: { rows, total: count ?? rows.length, limit, offset } };
}

export type UserDetail = {
  id: string;
  displayName: string | null;
  fullName: string | null;
  country: string | null;
  city: string | null;
  timezone: string | null;
  preferredLocale: string | null;
  accountStatus: string;
  profileVisibility: string;
  onboardingCompleted: boolean;
  joinedAt: string;
  /** Every role held, highest privilege first. */
  roles: string[];
  /** The single bucket this account is counted in. Never inferred in the browser. */
  effectiveRole: AccountRoleKey;
  /** Present only when the account has the matching profile row. */
  learner: { profileStatus: string; subjects: string[]; level: string | null } | null;
  instructor: { slug: string; verificationStatus: string; publicProfileStatus: string; subjects: string[] } | null;
  activity: { enrolments: number; bookings: number; reviewsWritten: number; requirements: number };
  history: Array<{ id: string; action: string; from: string | null; to: string | null; note: string | null; createdAt: string }>;
};

export async function getUserDetail(
  identity: SupabaseIdentity,
  input: { userId: string },
): Promise<AdminResult<UserDetail>> {
  const gate = await requireAdmin(identity);
  if (!gate.ok) return gate.failure;
  const { admin } = gate;

  const { data: profile, error } = await admin
    .from("profiles")
    .select("id,display_name,full_name,country,city,timezone,preferred_locale,account_status,profile_visibility,onboarding_completed,created_at")
    .eq("id", input.userId).maybeSingle();
  if (error) {
    logFailure("admin-users", error);
    return { ok: false, error: "The account could not be read." };
  }
  if (!profile) return notFound("account");

  const [roles, learner, instructor, enrolments, bookings, reviews, requirements, history] = await Promise.all([
    admin.from("user_roles").select("role").eq("user_id", input.userId),
    admin.from("learner_profiles").select("profile_status,learning_subjects,learning_level").eq("user_id", input.userId).maybeSingle(),
    admin.from("instructor_profiles").select("public_slug,verification_status,public_profile_status,subjects").eq("user_id", input.userId).maybeSingle(),
    admin.from("enrolments").select("*", { count: "exact", head: true }).eq("learner_id", input.userId),
    admin.from("bookings").select("*", { count: "exact", head: true }).or(`learner_id.eq.${input.userId},instructor_id.eq.${input.userId}`),
    admin.from("reviews").select("*", { count: "exact", head: true }).eq("reviewer_id", input.userId),
    admin.from("learner_requirements").select("*", { count: "exact", head: true }).eq("learner_id", input.userId),
    admin.from("audit_logs").select("id,action,metadata,created_at")
      .in("entity_type", ["profiles", "user_roles"]).eq("entity_id", input.userId)
      .order("created_at", { ascending: false }).limit(50),
  ]);

  const row = profile as Record<string, unknown>;
  const learnerRow = learner.data as Record<string, unknown> | null;
  const instructorRow = instructor.data as Record<string, unknown> | null;
  const heldRoles = sortRolesByPrecedence(((roles.data ?? []) as Array<{ role: string }>).map((entry) => entry.role));

  return {
    ok: true,
    data: {
      id: String(row.id),
      displayName: row.display_name ? String(row.display_name) : null,
      fullName: row.full_name ? String(row.full_name) : null,
      country: row.country ? String(row.country) : null,
      city: row.city ? String(row.city) : null,
      timezone: row.timezone ? String(row.timezone) : null,
      preferredLocale: row.preferred_locale ? String(row.preferred_locale) : null,
      accountStatus: String(row.account_status),
      profileVisibility: String(row.profile_visibility),
      onboardingCompleted: row.onboarding_completed === true,
      joinedAt: String(row.created_at),
      roles: heldRoles,
      // Resolved from the same ladder the list and the counts use, so the detail
      // page cannot label an account differently from the row that opened it.
      effectiveRole: effectiveRoleOf(heldRoles),
      learner: learnerRow
        ? {
            profileStatus: String(learnerRow.profile_status),
            subjects: (learnerRow.learning_subjects as string[]) ?? [],
            level: learnerRow.learning_level ? String(learnerRow.learning_level) : null,
          }
        : null,
      instructor: instructorRow
        ? {
            slug: String(instructorRow.public_slug),
            verificationStatus: String(instructorRow.verification_status),
            publicProfileStatus: String(instructorRow.public_profile_status),
            subjects: (instructorRow.subjects as string[]) ?? [],
          }
        : null,
      activity: {
        enrolments: enrolments.count ?? 0,
        bookings: bookings.count ?? 0,
        reviewsWritten: reviews.count ?? 0,
        requirements: requirements.count ?? 0,
      },
      history: ((history.data ?? []) as Array<Record<string, unknown>>).map((entry) => {
        const metadata = (entry.metadata ?? {}) as Record<string, unknown>;
        return {
          id: String(entry.id),
          action: String(entry.action),
          from: typeof metadata.from === "string" ? metadata.from : null,
          to: typeof metadata.to === "string" ? metadata.to : null,
          note: typeof metadata.note === "string" ? metadata.note : null,
          createdAt: String(entry.created_at),
        };
      }),
    },
  };
}

/**
 * Suspends or reactivates an account.
 *
 * Three refusals, each for a different reason: you cannot act on your own
 * account (an operator locking themselves out is an outage), you cannot act on
 * another privileged account from this screen (that is a deliberate database
 * operation, not a UI click), and you cannot act without a reason (a status
 * change nobody can explain later is not an operational record).
 */
export async function setAccountStatus(
  identity: SupabaseIdentity,
  input: { userId: string; status: SettableAccountStatus; reason: string },
): Promise<AdminResult<{ userId: string; status: SettableAccountStatus }>> {
  const gate = await requireAdmin(identity);
  if (!gate.ok) return gate.failure;
  const { admin } = gate;

  if (!(SETTABLE_ACCOUNT_STATUSES as readonly string[]).includes(input.status)) return invalid("Unknown account status.");
  if (!input.reason?.trim()) return invalid("A reason is required to change an account status.");
  if (input.userId === identity.id) return invalid("You cannot change your own account status.");

  const { data: targetRoles, error: roleError } = await admin.from("user_roles").select("role").eq("user_id", input.userId);
  if (roleError) {
    logFailure("admin-users", roleError);
    return { ok: false, error: "The account roles could not be read." };
  }
  const held = ((targetRoles ?? []) as Array<{ role: string }>).map((row) => row.role);
  if (held.some((role) => PRIVILEGED_ROLES.includes(role))) return forbidden();

  const { data: existing, error: readError } = await admin
    .from("profiles").select("id,account_status").eq("id", input.userId).maybeSingle();
  if (readError) {
    logFailure("admin-users", readError);
    return { ok: false, error: "The account could not be read." };
  }
  if (!existing) return notFound("account");

  const previous = String((existing as { account_status: string }).account_status);
  if (previous === input.status) {
    return { ok: false, code: "CONFLICT", error: `That account is already "${previous}".` };
  }

  const { error: writeError } = await admin
    .from("profiles").update({ account_status: input.status, updated_at: new Date().toISOString() }).eq("id", input.userId);
  if (writeError) {
    logFailure("admin-users", writeError);
    return { ok: false, error: "The account status could not be saved." };
  }

  await recordAudit(admin, {
    actorId: identity.id,
    action: "user.account_status.set",
    entityType: "profiles",
    entityId: input.userId,
    metadata: { from: previous, to: input.status, ...noteFor(input.reason) },
  });

  return { ok: true, data: { userId: input.userId, status: input.status } };
}
