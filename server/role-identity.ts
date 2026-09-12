/**
 * Role identity — who an account is allowed to be, decided on the server.
 *
 * The signup form and the login page both show role cards. A card is an
 * *intent*: it says where the person means to go. It has never been, and must
 * never become, the thing that grants a role. Everything below therefore works
 * from one of two server-held facts:
 *
 *   - at signup, the address being registered, compared against what already
 *     exists in `auth.users` and against ADMIN_EMAIL;
 *   - at login, `ctx.supabaseIdentity` — the identity the bearer token proved —
 *     and the rows in `user_roles` that belong to it.
 *
 * Neither path trusts a role value sent by the browser.
 *
 * **Decisions are returned as codes, not sentences.** The exact wording each
 * code produces lives in the translation catalogue, so the same decision reads
 * correctly in English, Urdu and Arabic, and so no server response has to carry
 * a user-facing string that a client could mistake for data.
 *
 * **On the enumeration trade-off.** `checkSignupEligibility` answers before the
 * caller has authenticated, and its answers distinguish "this address is
 * registered as a learner" from "this address is free" and from "this address is
 * the administrator's". That is an account-enumeration oracle, and it exists
 * because the specified messages require it — a person typing a second account
 * for the same address has to be told which login to use instead. It is
 * deliberately the *only* pre-auth surface with this property, it reveals no
 * password state, and the grant itself still happens elsewhere and is still
 * gated on the verified identity.
 */
import pg from "pg";
import { getSupabaseAdminClient } from "./supabase-admin-client";
import type { SupabaseIdentity } from "./supabase-auth";

export const PUBLIC_ROLES = ["learner", "instructor"] as const;
export type PublicRole = (typeof PUBLIC_ROLES)[number];

export const LOGIN_CONTEXTS = ["learner", "instructor", "admin"] as const;
export type LoginContext = (typeof LOGIN_CONTEXTS)[number];

/**
 * Every answer this module can give.
 *
 * `already_learner` / `already_instructor` name the role the account ACTUALLY
 * holds, so one code serves both the signup refusal and the login mismatch —
 * the two phases render different sentences from the same fact.
 */
export const ROLE_DECISIONS = [
  "ok",
  "admin_reserved",
  "not_admin",
  "already_learner",
  "already_instructor",
  "duplicate_email",
  "role_not_assigned",
] as const;
export type RoleDecision = (typeof ROLE_DECISIONS)[number];

const normalise = (value: string | null | undefined) => String(value ?? "").trim().toLowerCase();

/** True when this address is the one configured for the board account. */
function isAdminAddress(email: string): boolean {
  const configured = normalise(process.env.ADMIN_EMAIL);
  if (!configured || !configured.includes("@")) return false;
  return normalise(email) === configured;
}

/**
 * One-shot SQL, because `auth.users` is not reachable through PostgREST.
 *
 * Mirrors the connection pattern already used for private-storage checks: a
 * short-lived client, closed in `finally`, and never a pooled global.
 */
async function sql<T extends pg.QueryResultRow>(text: string, values: unknown[]): Promise<T[]> {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) return [];
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 10000, query_timeout: 20000, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    const result = await client.query<T>(text, values);
    return result.rows;
  } catch (error) {
    console.error("[role-identity] lookup failed:", { message: (error as Error)?.message?.slice(0, 200) });
    return [];
  } finally {
    await client.end().catch(() => undefined);
  }
}

/** The public role an account holds, or null. Never guesses, never defaults. */
export function publicRoleOf(roles: readonly string[]): PublicRole | null {
  if (roles.includes("instructor")) return "instructor";
  if (roles.includes("learner")) return "learner";
  return null;
}

export const isAdminRole = (roles: readonly string[]) => roles.includes("admin") || roles.includes("super_admin");

/* ------------------------------------------------------------------ signup */

export type SignupEligibility = { decision: RoleDecision };

/**
 * Whether this address may be registered with this role.
 *
 * Runs before an account exists, so it takes the address as input — the one
 * place in this module that does. The address is never stored, never logged and
 * never echoed back.
 */
export async function checkSignupEligibility(input: { email: string; role: string }): Promise<{ ok: true; data: SignupEligibility }> {
  const email = normalise(input.email);
  const role = normalise(input.role);
  const answer = (decision: RoleDecision) => ({ ok: true as const, data: { decision } });

  // A role outside the public allow-list is never eligible, whatever it is.
  if (!(PUBLIC_ROLES as readonly string[]).includes(role)) return answer("not_admin");

  // The board address may only ever be used with the board context.
  if (isAdminAddress(email)) return answer("admin_reserved");

  const found = await sql<{ id: string }>("select id from auth.users where lower(email) = $1 limit 1", [email]);
  if (found.length === 0) return answer("ok");

  const held = await sql<{ role: string }>("select role::text as role from public.user_roles where user_id = $1::uuid", [found[0].id]);
  const roles = held.map((row) => row.role);

  // Naming the role the address already has is what lets the person go to the
  // right login instead of guessing.
  if (roles.includes("instructor") && role === "learner") return answer("already_instructor");
  if (roles.includes("learner") && role === "instructor") return answer("already_learner");
  return answer("duplicate_email");
}

/* ------------------------------------------------------------------- login */

export type LoginResolution = {
  decision: RoleDecision;
  /** Where this account belongs, once the decision is `ok`. Server-decided. */
  next: string | null;
  isAdmin: boolean;
  publicRole: PublicRole | null;
};

/**
 * Reconciles the context a person selected with the roles their account holds.
 *
 * The identity is the verified one. The selected context never widens access —
 * it can only be refused, and the destination is computed from the roles.
 */
export async function resolveLoginContext(
  identity: SupabaseIdentity,
  input: { context: string },
): Promise<{ ok: true; data: LoginResolution } | { ok: false; error: string; code: "SETUP_NEEDED" }> {
  const admin = getSupabaseAdminClient();
  if (!admin) return { ok: false, error: "Supabase administrative access is not configured.", code: "SETUP_NEEDED" };

  const { data, error } = await admin.from("user_roles").select("role").eq("user_id", identity.id);
  if (error) {
    console.error("[role-identity] role read failed:", { code: error.code, message: error.message });
    return { ok: false, error: "Roles could not be read.", code: "SETUP_NEEDED" };
  }

  const roles = (data ?? []).map((row) => String((row as { role: string }).role));
  const admin_ = isAdminRole(roles);
  const holds = publicRoleOf(roles);
  const context = (LOGIN_CONTEXTS as readonly string[]).includes(normalise(input.context))
    ? (normalise(input.context) as LoginContext)
    : "learner";

  const shape = (decision: RoleDecision, next: string | null = null): { ok: true; data: LoginResolution } =>
    ({ ok: true, data: { decision, next, isAdmin: admin_, publicRole: holds } });

  // An administrator belongs in operations, and nowhere else. Checked first so
  // an admin who picked the wrong card is told why rather than being redirected.
  if (admin_) return context === "admin" ? shape("ok", "/admin") : shape("admin_reserved");
  if (context === "admin") return shape("not_admin");

  // No public role is a data problem, not a reason to guess one.
  if (!holds) return shape("role_not_assigned");
  if (holds !== context) return shape(holds === "instructor" ? "already_instructor" : "already_learner");

  const { data: profile } = await admin.from("profiles").select("onboarding_completed").eq("id", identity.id).maybeSingle();
  const done = (profile as { onboarding_completed?: boolean } | null)?.onboarding_completed === true;
  return shape("ok", done ? `/dashboard/${holds}` : `/onboarding/${holds}`);
}

/* ------------------------------------------------------ role persistence */

export type ClaimResult = { granted: boolean; role: PublicRole | null; decision: RoleDecision };

/**
 * Grants the public role the account asked for at signup, once.
 *
 * Migration 0023 makes the database trigger do this at the moment the auth user
 * is created, so in the ordinary path there is nothing left to do and this
 * returns the existing role untouched. It stays as the repair path for accounts
 * created before that migration, and as the second place the allow-list is
 * enforced.
 *
 * Three rules it will not break:
 *
 *   - It never switches a role. An account that already holds a public role
 *     keeps it; changing roles is not something a signup form gets to do.
 *   - It never grants both. Exactly one public role, or none.
 *   - It never grants anything to the board address, which must not hold a
 *     public role at all.
 */
export async function claimRequestedPublicRole(identity: SupabaseIdentity): Promise<{ ok: true; data: ClaimResult } | { ok: false; error: string }> {
  const admin = getSupabaseAdminClient();
  if (!admin) return { ok: false, error: "Supabase administrative access is not configured." };

  const { data, error } = await admin.auth.admin.getUserById(identity.id);
  if (error || !data.user) return { ok: false, error: "The account could not be verified." };

  const existing = await admin.from("user_roles").select("role").eq("user_id", identity.id);
  const roles = (existing.data ?? []).map((row) => String((row as { role: string }).role));

  // The board account holds `admin` and no public role, by design.
  if (isAdminAddress(data.user.email ?? "")) {
    return { ok: true, data: { granted: false, role: null, decision: isAdminRole(roles) ? "ok" : "admin_reserved" } };
  }

  const held = publicRoleOf(roles);
  if (held) return { ok: true, data: { granted: false, role: held, decision: "ok" } };

  const requested = normalise(data.user.user_metadata?.requested_public_role);
  if (!(PUBLIC_ROLES as readonly string[]).includes(requested)) {
    // Nothing valid was requested, so nothing is granted. A missing role has to
    // stay missing and be reported, not be quietly filled in with "learner".
    return { ok: true, data: { granted: false, role: null, decision: "role_not_assigned" } };
  }

  const { error: insertError } = await admin
    .from("user_roles").upsert({ user_id: identity.id, role: requested }, { onConflict: "user_id,role" });
  if (insertError) {
    console.error("[role-identity] grant failed:", { code: insertError.code, message: insertError.message });
    return { ok: false, error: "The requested role could not be assigned." };
  }

  // The learner record follows the role, matching what the trigger now does.
  if (requested === "learner") {
    await admin.from("learner_profiles").upsert({ user_id: identity.id }, { onConflict: "user_id" });
  }
  return { ok: true, data: { granted: true, role: requested as PublicRole, decision: "ok" } };
}
