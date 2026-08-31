import type { Request } from "express";
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
