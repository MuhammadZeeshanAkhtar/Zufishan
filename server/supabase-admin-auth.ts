/**
 * Privileged-role resolution for Supabase identities.
 *
 * The existing `adminProcedure` in `_core/trpc.ts` gates on `ctx.user.role`, which belongs to the
 * OAuth scaffold. That scaffold is unconfigured, so `ctx.user` is always null and the procedure can
 * never admit anyone. Supabase-authenticated admins need their own check.
 *
 * Roles live in `public.user_roles`, and the read runs on the admin client on purpose: the caller's
 * own token cannot be trusted to report the caller's privileges, and `user_roles` is not readable
 * across users under RLS. The identity itself is still the server-verified one from the bearer
 * token — never a client-supplied id.
 */
import { getSupabaseAdminClient } from "./supabase-admin-client";
import type { SupabaseIdentity } from "./supabase-auth";

/** Roles permitted to make reviewed decisions. Mirrors the SQL helpers used by RLS. */
export const REVIEWER_ROLES = ["admin", "super_admin", "moderator"] as const;
export type ReviewerRole = (typeof REVIEWER_ROLES)[number];

export type RoleCheck =
  | { ok: true; roles: string[]; isAdmin: boolean; isReviewer: boolean }
  | { ok: false; error: string };

/** Reads every role granted to this identity. Never trusts anything sent by the client. */
export async function readOwnRoles(identity: SupabaseIdentity): Promise<RoleCheck> {
  const admin = getSupabaseAdminClient();
  if (!admin) return { ok: false, error: "Supabase administrative access is not configured." };

  const { data, error } = await admin.from("user_roles").select("role").eq("user_id", identity.id);
  if (error) {
    console.error("[admin-auth] role lookup failed:", { code: error.code, message: error.message });
    return { ok: false, error: "Roles could not be read." };
  }

  const roles = (data ?? []).map((row) => String((row as { role: string }).role));
  return {
    ok: true,
    roles,
    isAdmin: roles.includes("admin") || roles.includes("super_admin"),
    isReviewer: roles.some((role) => (REVIEWER_ROLES as readonly string[]).includes(role)),
  };
}

/** True only for a caller who may approve or reject a tutor. */
export async function isReviewer(identity: SupabaseIdentity): Promise<boolean> {
  const result = await readOwnRoles(identity);
  return result.ok && result.isReviewer;
}
