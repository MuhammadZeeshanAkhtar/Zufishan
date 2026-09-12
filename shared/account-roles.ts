/**
 * What role an account actually is.
 *
 * `user_roles` is a many-to-one table: `unique (user_id, role)` lets one account
 * hold several roles, and accounts genuinely do. Every account created before
 * migration 0023 was handed a `learner` row by the old signup trigger whatever
 * it signed up as, so the administrator account holds `admin` AND `learner` to
 * this day.
 *
 * That is why counting rows in `user_roles` was wrong. "How many learners are
 * there" is a question about accounts, and an account is not several things at
 * once from an operator's point of view — it is the most privileged thing it can
 * do. The ladder below is that definition, and it is deliberately the same
 * ladder as `public.account_effective_role` in migration 0026: the database
 * counts with it, this module orders and labels with it, and the two cannot
 * drift because both are written from the same list.
 *
 * Nothing here reads a session, an address or an environment value. It maps role
 * strings to role strings, so it is safe to use on either side of the wire.
 */

/** Highest privilege first. This order is the whole definition of "effective role". */
export const ROLE_PRECEDENCE = [
  "super_admin",
  "admin",
  "moderator",
  "finance",
  "advisory_board",
  "instructor",
  "learner",
] as const;
export type KnownRole = (typeof ROLE_PRECEDENCE)[number];

/**
 * The buckets an account can fall into, in display order.
 *
 * They are exhaustive and mutually exclusive: every account lands in exactly
 * one, so the totals add up to the number of accounts. `unassigned` exists
 * because an account with no role row is a data problem worth seeing — rendering
 * it as a learner is the defect this replaces.
 */
export const ACCOUNT_ROLE_KEYS = ["learners", "instructors", "admins", "staff", "unassigned"] as const;
export type AccountRoleKey = (typeof ACCOUNT_ROLE_KEYS)[number];

const BUCKET_OF: Record<KnownRole, AccountRoleKey> = {
  super_admin: "admins",
  admin: "admins",
  moderator: "staff",
  finance: "staff",
  advisory_board: "staff",
  instructor: "instructors",
  learner: "learners",
};

/** Where a role sits on the ladder. Anything unrecognised sorts after everything known. */
function rank(role: string): number {
  const index = (ROLE_PRECEDENCE as readonly string[]).indexOf(role);
  return index === -1 ? ROLE_PRECEDENCE.length : index;
}

/** The single highest-privilege role an account holds, or null when it holds none. */
export function topRoleOf(roles: readonly string[]): KnownRole | null {
  let best: KnownRole | null = null;
  for (const role of roles) {
    if (!(ROLE_PRECEDENCE as readonly string[]).includes(role)) continue;
    if (best === null || rank(role) < rank(best)) best = role as KnownRole;
  }
  return best;
}

/**
 * The bucket this account is counted in.
 *
 * An account holding `admin` is an administrator even if a stale `learner` row
 * sits beneath it, so admins and learners can never overlap.
 */
export function effectiveRoleOf(roles: readonly string[]): AccountRoleKey {
  const top = topRoleOf(roles);
  return top === null ? "unassigned" : BUCKET_OF[top];
}

/**
 * Roles ordered so the account's real identity reads first.
 *
 * Alphabetical order put `admin` before `learner` by luck; `finance` before
 * `super_admin` would have been the same luck running out. Unknown roles keep a
 * stable alphabetical order at the end rather than being dropped — a role this
 * build does not recognise is still something an operator should see.
 */
export function sortRolesByPrecedence(roles: readonly string[]): string[] {
  return [...roles].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/** The roles that make an account an operator rather than a member of the public. */
export const PRIVILEGED_ROLES: readonly string[] = ROLE_PRECEDENCE.filter(
  (role) => BUCKET_OF[role] === "admins" || BUCKET_OF[role] === "staff",
);
