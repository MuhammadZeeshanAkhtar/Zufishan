import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  getSupabaseConfigStatus,
  getSupabaseHealth,
  isServerOnlySupabaseKey,
  type SupabaseEnv,
} from "./supabase-connection";

describe("Supabase connection foundation", () => {
  it("reports missing configuration without exposing secrets", () => {
    const result = getSupabaseConfigStatus({});
    expect(result.configured).toBe(false);
    expect(result.missing).toEqual(["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"]);
    expect(JSON.stringify(result)).not.toContain("placeholder");
  });

  it("accepts a valid configuration shape and keeps the service key server-only", () => {
    const env: SupabaseEnv = {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "publishable-key-placeholder",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key-placeholder",
    };
    expect(getSupabaseConfigStatus(env)).toMatchObject({ configured: true, missing: [] });
    expect(isServerOnlySupabaseKey("SUPABASE_SERVICE_ROLE_KEY")).toBe(true);
    expect(isServerOnlySupabaseKey("SUPABASE_PUBLISHABLE_KEY")).toBe(false);
  });

  it("keeps the service-role key out of the browser client source", () => {
    const browserSource = readFileSync(new URL("../client/src/lib/supabase-client.ts", import.meta.url), "utf8");
    expect(browserSource).not.toContain("SERVICE_ROLE");
    expect(browserSource).not.toContain("service_role");
  });

  it("checks the configured environment through the lightweight server health endpoint", async () => {
    const result = await getSupabaseHealth();
    if (process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      expect(result.serverKeyConfigured).toBe(true);
      expect(result.reachable).toBe(true);
    } else {
      expect(result.configured).toBe(false);
      expect(result.reachable).toBe(false);
    }
    expect(JSON.stringify(result)).not.toContain(process.env.SUPABASE_SERVICE_ROLE_KEY || "__missing__");
  });

  it("validates the configured browser-safe Supabase endpoint without exposing the key", async () => {
    const url = process.env.VITE_SUPABASE_URL?.trim();
    const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
    expect(url).toBeTruthy();
    expect(key).toBeTruthy();
    const response = await fetch(`${url!.replace(/\/+$/, "")}/auth/v1/health`, {
      headers: { apikey: key!, Authorization: `Bearer ${key!}` },
    });
    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
  });

  it("returns a safe unavailable health state when Supabase cannot be reached", async () => {
    const result = await getSupabaseHealth({
      SUPABASE_URL: "https://invalid.invalid",
      SUPABASE_PUBLISHABLE_KEY: "publishable-key-placeholder",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key-placeholder",
    }, { timeoutMs: 50 });
    expect(result).toMatchObject({ configured: true, reachable: false });
    expect(result.error).toBe("Supabase connection unavailable.");
    expect(JSON.stringify(result)).not.toContain("service-role-key-placeholder");
  });
});
