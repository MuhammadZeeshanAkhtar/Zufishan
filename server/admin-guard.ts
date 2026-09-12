/**
 * The one place the admin desk decides who is allowed in.
 *
 * Every admin procedure begins with `requireAdmin`. Repeating that check by hand
 * in each module is how one of them eventually ends up missing it, so the check,
 * the refusal wording and the admin client all come from here.
 *
 * Two things are deliberately true of this module:
 *
 *  - **The identity is never client-supplied.** It is `ctx.supabaseIdentity`,
 *    which the tRPC middleware derived from a verified bearer token. Roles are
 *    then read from `user_roles` on the service client, because a caller's own
 *    token cannot be trusted to report the caller's privileges.
 *  - **The service client is handed out only after the check passes.** It
 *    bypasses RLS, so the role check above is what authorises every read and
 *    write that follows. RLS remains the second line: the policies in migration
 *    0002 already restrict these tables to `is_admin_user()` /
 *    `is_moderator_user()`, so an ordinary session reaching them directly gets
 *    nothing.
 *
 * `recordAudit` exists for the same reason. `audit_logs` has a SELECT policy for
 * admins and *no* write policy, so only the service role can append to it and
 * nothing in any UI can edit or delete a row. A decision that cannot be
 * attributed is not an auditable decision, so every state change goes through it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "./supabase-admin-client";
import type { SupabaseIdentity } from "./supabase-auth";
import { readOwnRoles } from "./supabase-admin-auth";

export type AdminErrorCode = "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "SETUP_NEEDED" | "INVALID";

export type AdminResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: AdminErrorCode };

export const forbidden = <T,>(): AdminResult<T> => ({
  ok: false, error: "This desk requires an administrator role.", code: "FORBIDDEN",
});

export const notFound = <T,>(what: string): AdminResult<T> => ({
  ok: false, error: `No ${what} with that id.`, code: "NOT_FOUND",
});

export const invalid = <T,>(why: string): AdminResult<T> => ({ ok: false, error: why, code: "INVALID" });

type Gate =
  | { ok: true; admin: SupabaseClient; roles: string[]; isSuperAdmin: boolean }
  | { ok: false; failure: AdminResult<never> };

/**
 * Admin or super_admin only.
 *
 * A moderator is a reviewer of submissions, not an operator of this desk. That
 * is the same line `is_admin_user()` draws in the policies that protect
 * `profiles` and `audit_logs`, so admitting moderators here would let them see
 * rows the database would refuse them anyway.
 */
export async function requireAdmin(identity: SupabaseIdentity): Promise<Gate> {
  const roles = await readOwnRoles(identity);
  if (!roles.ok) return { ok: false, failure: { ok: false, error: roles.error, code: "SETUP_NEEDED" } };
  if (!roles.isAdmin) return { ok: false, failure: forbidden() };

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return { ok: false, failure: { ok: false, error: "Supabase administrative access is not configured.", code: "SETUP_NEEDED" } };
  }
  return { ok: true, admin, roles: roles.roles, isSuperAdmin: roles.roles.includes("super_admin") };
}

/**
 * Appends one row to the permanent record.
 *
 * Never throws and never fails the caller: a decision that succeeded must not be
 * reported as failed because its audit row did not land. The failure is logged
 * with its code and message only.
 */
export async function recordAudit(
  admin: SupabaseClient,
  entry: { actorId: string; action: string; entityType: string; entityId: string | null; metadata?: Record<string, unknown> },
): Promise<void> {
  const { error } = await admin.from("audit_logs").insert({
    actor_id: entry.actorId,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId,
    metadata: entry.metadata ?? {},
  });
  if (error) console.error("[admin-audit] append failed:", { action: entry.action, code: error.code, message: error.message });
}

/** Trims a reviewer note to something an audit row can hold, or drops it entirely. */
export function noteFor(note?: string): Record<string, string> {
  const text = note?.trim();
  return text ? { note: text.slice(0, 2000) } : {};
}

/** The shape every admin list returns, so one table component can render them all. */
export type Page<T> = { rows: T[]; total: number; limit: number; offset: number };

export const MAX_PAGE = 50;
export const clampLimit = (limit?: number) => Math.min(Math.max(limit ?? 25, 1), MAX_PAGE);
export const clampOffset = (offset?: number) => Math.max(offset ?? 0, 0);

/**
 * Escapes a search term for PostgREST's `ilike`.
 *
 * `%` and `_` are wildcards there, so an unescaped term lets a search string
 * change the shape of the query rather than filter it.
 */
export function likeTerm(search: string): string {
  return `%${search.trim().replace(/([\\%_])/g, "\\$1")}%`;
}

/** A display name for a profile row, never an email address. */
export function displayNameOf(profile: unknown): string | null {
  const row = (profile ?? null) as { display_name?: string | null; full_name?: string | null } | null;
  return row?.display_name || row?.full_name || null;
}

/** Logs a query failure without the rows, the connection or any secret. */
export function logFailure(scope: string, error: { code?: string; message?: string } | null): void {
  if (error) console.error(`[${scope}] query failed:`, { code: error.code, message: error.message });
}
