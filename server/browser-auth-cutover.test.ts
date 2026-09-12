import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const app = readFileSync(join(root, "client/src/App.tsx"), "utf8");
const auth = readFileSync(join(root, "client/src/contexts/AuthContext.tsx"), "utf8");
const core = readFileSync(join(root, "server/supabase-core.ts"), "utf8");
const client = readFileSync(join(root, "client/src/lib/supabase-client.ts"), "utf8");

describe("browser Supabase Auth cutover", () => {
  it("mounts the real provider and uses real auth guards", () => {
    expect(app).toContain("SupabaseAuthProvider");
    expect(app).toContain("useAuth()");
    expect(app).toContain("Restoring your secure learning session");
    expect(app).toContain("currentRoles.some((role) => isAdminRole(role))");
    expect(app).not.toContain("<DemoAuthProvider>");
    expect(app).not.toContain("useDemoAuth()");
  });

  it("restores sessions and connects the complete browser auth surface", () => {
    expect(auth).toContain("supabaseClient.auth.getSession()");
    expect(auth).toContain("supabaseClient.auth.onAuthStateChange");
    // Both password calls are now made on a locally bound non-null client, so
    // that a failure can be caught and classified. What matters is unchanged:
    // they are Supabase browser-auth calls, not a second auth system.
    expect(auth).toMatch(/\bclient\.auth\.signUp\(/);
    expect(auth).toMatch(/\bclient\.auth\.signInWithPassword\(/);
    expect(auth).toContain('from "../lib/supabase-client"');
    expect(auth).toContain("supabaseClient.auth.signOut");
    expect(auth).toContain("resetPasswordForEmail");
    expect(auth).toContain("supabaseClient.auth.updateUser");
    expect(auth).not.toContain("localStorage.setItem(\"noor-ilm-demo-session\"");
    expect(auth).not.toContain("persistDemo");
  });

  it("resolves role and onboarding state from server-owned records and fresh refetch data", () => {
    expect(auth).toContain("trpc.supabaseCore.profiles.useQuery");
    expect(auth).toContain("bootstrappedProfiles?.roles");
    expect(auth).toContain("onboarding_completed");
    expect(auth).toContain("const refreshedResult = await profilesQuery.refetch()");
    expect(auth).toContain("refreshedResult.data?.ok");
    expect(core).toContain('db.from("user_roles").select("role")');
    expect(core).toContain("onboarding_completed: true");
  });

  it("keeps service-role credentials out of browser source and built assets", () => {
    expect(client).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    const dist = join(root, "dist/public/assets");
    if (!readdirSync(dist, { withFileTypes: true }).length) return;
    const built = readdirSync(dist).filter((name) => name.endsWith(".js")).map((name) => readFileSync(join(dist, name), "utf8")).join("\n");
    expect(built).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(built).not.toContain("SUPABASE_DB_URL");
  });
});
