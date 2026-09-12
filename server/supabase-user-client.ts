import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * A Supabase client that acts as the caller, so RLS applies to every read.
 *
 * Returns null rather than throwing when it cannot build one. The token is
 * checked before `.trim()` because a caller reaching here without one is the
 * exact case this guard exists for — throwing a TypeError out of a helper turns
 * a missing session into an unhandled crash instead of the caller's own
 * setup-needed path.
 */
export function getSupabaseUserClient(accessToken: string | null | undefined): SupabaseClient | null {
  const url = process.env.SUPABASE_URL?.trim();
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey || !accessToken?.trim()) return null;
  return createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken.trim()}` } },
  });
}

export function getSupabasePublicClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL?.trim();
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey) return null;
  return createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
