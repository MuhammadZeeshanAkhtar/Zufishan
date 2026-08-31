import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type SupabaseEnv = Record<string, string | undefined> & {
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

export type SupabaseConfigStatus = {
  configured: boolean;
  missing: Array<"SUPABASE_URL" | "SUPABASE_PUBLISHABLE_KEY" | "SUPABASE_SERVICE_ROLE_KEY">;
};

export type SupabaseHealth = SupabaseConfigStatus & {
  reachable: boolean;
  serverKeyConfigured: boolean;
  statusCode: number | null;
  error?: "Supabase connection unavailable.";
};

const requiredKeys = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"] as const;

function clean(value: string | undefined) {
  return value?.trim() || "";
}

export function getSupabaseConfigStatus(env: SupabaseEnv = process.env) : SupabaseConfigStatus {
  const missing = requiredKeys.filter((key) => !clean(env[key]));
  return { configured: missing.length === 0, missing: [...missing] };
}

export function isServerOnlySupabaseKey(key: string) {
  return key === "SUPABASE_SERVICE_ROLE_KEY";
}

export function getSupabaseServerClient(env: SupabaseEnv = process.env): SupabaseClient | null {
  const url = clean(env.SUPABASE_URL);
  const serviceRoleKey = clean(env.SUPABASE_SERVICE_ROLE_KEY);
  return url && serviceRoleKey ? createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}

export async function getSupabaseHealth(env: SupabaseEnv = process.env, options: { timeoutMs?: number } = {}): Promise<SupabaseHealth> {
  const status = getSupabaseConfigStatus(env);
  const url = clean(env.SUPABASE_URL).replace(/\/+$/, "");
  const key = clean(env.SUPABASE_SERVICE_ROLE_KEY) || clean(env.SUPABASE_PUBLISHABLE_KEY);
  const timeoutMs = options.timeoutMs ?? 2500;

  if (!status.configured || !url || !key) {
    return { ...status, reachable: false, serverKeyConfigured: Boolean(clean(env.SUPABASE_SERVICE_ROLE_KEY)), statusCode: null, error: "Supabase connection unavailable." };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${url}/auth/v1/health`, {
      method: "GET",
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: controller.signal,
    });
    return { ...status, reachable: response.ok, serverKeyConfigured: true, statusCode: response.status, ...(response.ok ? {} : { error: "Supabase connection unavailable." as const }) };
  } catch {
    return { ...status, reachable: false, serverKeyConfigured: true, statusCode: null, error: "Supabase connection unavailable." };
  } finally {
    clearTimeout(timer);
  }
}
