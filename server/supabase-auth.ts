import type { Request } from "express";
import { getSupabaseAdminClient } from "./supabase-admin-client";
import { createClient } from "@supabase/supabase-js";

export type SupabaseIdentity = {
  id: string;
  email: string | null;
  accessToken: string;
};

function clean(value: string | undefined) { return value?.trim() || ""; }

type HeaderRequest = { header(name: string): string | undefined };

function bearerToken(req: HeaderRequest) {
  const header = req.header("authorization")?.trim() ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice(7).trim();
  return token || null;
}

export async function getSupabaseBearerIdentity(req: Request): Promise<SupabaseIdentity | null> {
  const token = bearerToken(req);
  const url = clean(process.env.SUPABASE_URL);
  const publishableKey = clean(process.env.SUPABASE_PUBLISHABLE_KEY);
  if (!token || !url || !publishableKey) return null;
  const client = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null, accessToken: token };
}

export function getBearerTokenForTest(req: HeaderRequest) {
  return bearerToken(req);
}

/**
 * Grants the public instructor role to the caller when their own signup metadata asked for it.
 *
 * The signup trigger always grants 'learner', ignoring raw_user_meta_data — correct, because a
 * client must never be able to name its own role. That left tutors sitting on a learner account
 * and being routed to the learner dashboard.
 *
 * This closes the gap without weakening that rule:
 *  - identity comes from the verified bearer token (ctx.supabaseIdentity), never from the client;
 *  - the requested role is read server-side from auth.users metadata, not from the request body;
 *  - only "instructor" can be granted. Privileged roles (admin, moderator, super_admin, finance)
 *    are never reachable here, so this is role selection, not privilege escalation. Instructors
 *    still require verification before any public listing.
 */
export async function claimRequestedPublicRole(identity: SupabaseIdentity) {
  const admin = getSupabaseAdminClient();
  if (!admin) return { ok: false as const, error: "Supabase administrative access is not configured." };

  const { data, error } = await admin.auth.admin.getUserById(identity.id);
  if (error || !data.user) return { ok: false as const, error: "The account could not be verified." };

  const requested = String(data.user.user_metadata?.requested_public_role ?? "").trim().toLowerCase();
  if (requested !== "instructor") return { ok: true as const, data: { granted: false, role: "learner" as const } };

  const { error: insertError } = await admin
    .from("user_roles")
    .upsert({ user_id: identity.id, role: "instructor" }, { onConflict: "user_id,role" });
  if (insertError) return { ok: false as const, error: "The instructor role could not be assigned." };

  return { ok: true as const, data: { granted: true, role: "instructor" as const } };
}
