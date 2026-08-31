import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only escape hatch for provider-generated rows. Callers must first
 * verify ownership/consent with the bearer-token client; this helper is never
 * imported by browser code.
 */
export function getSupabaseAdminClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
