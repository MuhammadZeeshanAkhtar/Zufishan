/**
 * Admin bootstrap — the one way an `admin` role can come into existence.
 *
 * The problem this solves: `user_roles` is correctly locked so that only an
 * existing admin may grant a role. That is right, and it also means a system
 * with no admin can never gain one through the application. Something outside
 * that loop has to make the first grant, and that something must not be a
 * button anyone can press.
 *
 * The rule here is deliberately narrow:
 *
 *  - The identity is the verified bearer identity (`ctx.supabaseIdentity`), so
 *    the caller has already proved they hold the session.
 *  - The email is read from `auth.users` **server-side**, by user id. A client
 *    may not supply an email, and there is no code path where one is trusted.
 *  - It is compared against ADMIN_EMAIL, which exists only in the server
 *    environment. It is never sent to the browser, never logged, never returned
 *    in an error, and never written into a translation or a build artifact.
 *  - Only `admin` is ever granted. `super_admin` is unreachable from here, so
 *    this cannot produce an account that can rewrite the role system itself.
 *  - The refusal is identical whether the email did not match, the variable is
 *    unset, or the account has no email. Distinguishing those to the caller
 *    would turn this into an oracle for guessing the configured address.
 *
 * It is safe to call on every sign-in: granting is an upsert, so a second call
 * changes nothing and the audit entry is written only on the first real grant.
 */
import { getSupabaseAdminClient } from "./supabase-admin-client";
import type { SupabaseIdentity } from "./supabase-auth";

type Result = { ok: true; data: { admin: boolean } } | { ok: false; error: string; code?: "SETUP_NEEDED" };

/** The same answer for every unauthorised caller, whatever the underlying reason. */
const NOT_ADMIN: Result = { ok: true, data: { admin: false } };

/** Case- and whitespace-insensitive, because an email address is not case sensitive. */
const normalise = (value: string | null | undefined) => String(value ?? "").trim().toLowerCase();

export async function claimAdminRole(identity: SupabaseIdentity): Promise<Result> {
  const admin = getSupabaseAdminClient();
  if (!admin) return { ok: false, error: "Supabase administrative access is not configured.", code: "SETUP_NEEDED" };

  const configured = normalise(process.env.ADMIN_EMAIL);
  // No configured address means no bootstrap is possible. Reported as "not an
  // admin" rather than "not configured", so the absence is not observable.
  if (!configured || !configured.includes("@")) return NOT_ADMIN;

  const { data, error } = await admin.auth.admin.getUserById(identity.id);
  if (error || !data.user) return NOT_ADMIN;

  const actual = normalise(data.user.email);
  if (!actual || actual !== configured) return NOT_ADMIN;

  // Already an admin? Then this is a no-op and writes no second audit entry.
  const { data: existing } = await admin
    .from("user_roles").select("role").eq("user_id", identity.id).in("role", ["admin", "super_admin"]);
  if ((existing ?? []).length > 0) return { ok: true, data: { admin: true } };

  // `admin` only. `super_admin` is never granted here, by design.
  const { error: grantError } = await admin
    .from("user_roles").upsert({ user_id: identity.id, role: "admin" }, { onConflict: "user_id,role" });
  if (grantError) {
    console.error("[admin-bootstrap] grant failed:", { code: grantError.code, message: grantError.message });
    return { ok: false, error: "The administrator role could not be assigned." };
  }

  // The first grant is a security event and belongs in the permanent record.
  // `audit_logs` has a SELECT policy and no insert policy, so only the service
  // role can write here and nothing in any UI can edit or remove it.
  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_id: identity.id,
    action: "admin_role_bootstrapped",
    entity_type: "user_roles",
    entity_id: identity.id,
    // The configured address is NOT recorded. That the account matched is the
    // fact worth keeping; repeating the address would put it in a readable table.
    metadata: { granted_role: "admin", source: "ADMIN_EMAIL bootstrap" },
  });
  if (auditError) console.error("[admin-bootstrap] audit entry failed:", { code: auditError.code, message: auditError.message });

  return { ok: true, data: { admin: true } };
}

/**
 * Whether a bootstrap address is configured at all.
 *
 * Boolean only — this is for an operator-facing setup panel, and it must never
 * carry the address itself.
 */
export function adminBootstrapStatus(env: NodeJS.ProcessEnv = process.env): { configured: boolean } {
  const value = normalise(env.ADMIN_EMAIL);
  return { configured: Boolean(value && value.includes("@")) };
}
