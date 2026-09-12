import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { adminBootstrapStatus } from "./admin-bootstrap";

const boot = readFileSync(new URL("./admin-bootstrap.ts", import.meta.url), "utf8");
const routers = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const authCtx = readFileSync(new URL("../client/src/contexts/AuthContext.tsx", import.meta.url), "utf8");
const models = readFileSync(new URL("../client/src/lib/auth-models.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const rls = readFileSync(new URL("../supabase/migrations/0002_auth_and_rls.sql", import.meta.url), "utf8");
const catalog = readFileSync(new URL("../client/src/i18n/catalog.ts", import.meta.url), "utf8");

describe("the configured address never leaves the server", () => {
  it("reports only a boolean, never the value", () => {
    expect(adminBootstrapStatus({ ADMIN_EMAIL: "someone@example.com" } as NodeJS.ProcessEnv)).toEqual({ configured: true });
    expect(adminBootstrapStatus({} as NodeJS.ProcessEnv)).toEqual({ configured: false });
    // A value that is not an address is treated as unconfigured rather than trusted.
    expect(adminBootstrapStatus({ ADMIN_EMAIL: "not-an-email" } as NodeJS.ProcessEnv)).toEqual({ configured: false });
    expect(adminBootstrapStatus({ ADMIN_EMAIL: "   " } as NodeJS.ProcessEnv)).toEqual({ configured: false });
  });

  it("is never sent to the browser, logged, or written to the audit row", () => {
    // The procedure returns { admin: boolean } and nothing else.
    expect(boot).toContain("type Result = { ok: true; data: { admin: boolean } }");
    // No log line carries the address or the account's email.
    expect(boot).not.toMatch(/console\.(log|error|warn)\([^)]*(ADMIN_EMAIL|configured|actual)/);
    // The audit row records that a match happened, not what was matched. Scoped to
    // the insert call itself — the surrounding comment legitimately names the variable.
    const insert = boot.slice(boot.indexOf('from("audit_logs").insert('), boot.indexOf("});", boot.indexOf('from("audit_logs").insert(')));
    // No expression that could carry an address reaches the row. (The word
    // "configured" appears in the adjacent comment, so match on code, not prose.)
    expect(insert).not.toMatch(/data\.user\.email|process\.env|configured\b\s*[,;)]/);
    expect(insert).toContain('metadata: { granted_role: "admin", source: "ADMIN_EMAIL bootstrap" }');
    expect(insert).toContain('action: "admin_role_bootstrapped"');
  });

  it("keeps the address out of every client bundle input", () => {
    // A comment may name the variable; nothing may READ it. Vite only exposes
    // VITE_-prefixed values to the browser, so an unprefixed name is server-only
    // by construction — this asserts no code tries anyway.
    for (const [name, source] of [["AuthContext", authCtx], ["auth-models", models], ["App", app], ["catalog", catalog]] as const) {
      expect(source, `${name} must not read the value`).not.toMatch(/process\.env\.ADMIN_EMAIL|import\.meta\.env\.[A-Z_]*ADMIN/);
      expect(source, `${name} must not carry a VITE_-prefixed admin address`).not.toContain("VITE_ADMIN");
    }
  });
});

describe("the role is granted only on a server-verified email match", () => {
  it("reads the email from auth.users by verified id, never from the client", () => {
    expect(boot).toContain("admin.auth.admin.getUserById(identity.id)");
    expect(boot).toContain("const actual = normalise(data.user.email);");
    expect(boot).toContain("if (!actual || actual !== configured) return NOT_ADMIN;");
    // No input schema at all: there is nothing a caller could supply.
    expect(routers).toContain("claimAdminRole: supabaseOnlyProcedure.mutation(({ ctx }) => claimAdminRole(ctx.supabaseIdentity)),");
    expect(routers).not.toMatch(/claimAdminRole:[^\n]*\.input\(/);
  });

  it("compares case- and whitespace-insensitively, as an address should", () => {
    expect(boot).toContain('const normalise = (value: string | null | undefined) => String(value ?? "").trim().toLowerCase();');
  });

  it("grants admin and never super_admin", () => {
    expect(boot).toContain('.upsert({ user_id: identity.id, role: "admin" }, { onConflict: "user_id,role" })');
    expect(boot).not.toContain('role: "super_admin"');
  });

  it("refuses identically however it fails, so it cannot be used as an oracle", () => {
    // Unset variable, malformed value, unknown user and a wrong address all return
    // the same NOT_ADMIN answer — a caller learns nothing about the configuration.
    expect(boot).toContain("const NOT_ADMIN: Result = { ok: true, data: { admin: false } };");
    // Three paths: no configured address, no such user, address does not match.
    expect(boot.match(/return NOT_ADMIN;/g)?.length).toBe(3);
  });

  it("is idempotent, and audits only the first real grant", () => {
    expect(boot).toContain('.in("role", ["admin", "super_admin"]);');
    expect(boot).toContain("if ((existing ?? []).length > 0) return { ok: true, data: { admin: true } };");
  });
});

describe("the login form selects a destination, not a permission", () => {
  it("offers a Board/Admin context that is separate from the sign-up roles", () => {
    expect(models).toContain('export type LoginContext = "learner" | "instructor" | "admin";');
    expect(models).toContain('{ value: "admin", label: "Board / admin"');
    // Sign-up must never offer admin.
    const signup = models.slice(models.indexOf("export const publicRoles"), models.indexOf("export type LoginContext"));
    expect(signup).not.toContain('"admin"');
    expect(models).toContain('export function isPublicSignupRole(role: string): role is PublicRole { return role === "learner" || role === "instructor"; }');
  });

  it("resolves the destination on the server, not from the selection", () => {
    // Stronger than the previous version, which asserted a destination the CLIENT
    // computed. The client no longer computes one at all: it sends the selected
    // context and uses the `next` the server returns.
    const identity = readFileSync(new URL("./role-identity.ts", import.meta.url), "utf8");
    expect(authCtx).toContain("const resolved = await contextMutation.mutateAsync({ context })");
    expect(authCtx).toContain("const { decision, next, isAdmin } = resolved.data;");
    expect(authCtx).toContain('if (decision !== "ok" || !next) return { ok: false, decision, isAdmin, roles: nextRoles };');
    // And the destination itself is derived from the roles the account holds.
    expect(identity).toContain('if (admin_) return context === "admin" ? shape("ok", "/admin") : shape("admin_reserved");');
    expect(identity).toContain('return shape("ok", done ? `/dashboard/${holds}` : `/onboarding/${holds}`);');
    // The selected context reaches the server as data and is never a permission.
    expect(routers).toContain("loginContext: supabaseOnlyProcedure");
    expect(routers).toContain(".mutation(({ ctx, input }) => resolveLoginContext(ctx.supabaseIdentity, input)),");
  });

  it("refuses a Board/Admin selection on an account without the role", () => {
    const identity = readFileSync(new URL("./role-identity.ts", import.meta.url), "utf8");
    // The refusal is now the server's, not a client-side comparison.
    expect(identity).toContain('if (context === "admin") return shape("not_admin");');
    expect(app).toContain('const result = await signIn(email, password, loginAs);');
    expect(app).not.toContain('if (loginAs === "admin" && !result.isAdmin)');
    expect(catalog.match(/"auth\.decision\.not_admin":/g)?.length).toBe(3);
  });

  it("says plainly that the choice does not confer access", () => {
    expect(catalog.match(/"auth\.contextNote":/g)?.length).toBe(3);
    expect(catalog).toContain("Your access comes from your account.");
  });
});

describe("learner and instructor journeys are untouched", () => {
  it("still routes them to their own dashboards", () => {
    // The fallback to "learner" is gone: an account with no role now reads null,
    // and the routes themselves are unchanged.
    expect(authCtx).toContain('roles.includes("instructor") ? "instructor" : roles.includes("learner") ? "learner" : null;');
    expect(authCtx).not.toContain('roles.includes("instructor") ? "instructor" : "learner"');
    expect(app).toContain('<Route path="/dashboard/learner"><ProtectedRoute role="learner">');
    expect(app).toContain('<Route path="/dashboard/instructor"><ProtectedRoute role="instructor">');
  });

  it("leaves the public role claim exactly as it was", () => {
    expect(routers).toContain("claimPublicRole: supabaseOnlyProcedure.mutation(({ ctx }) => claimRequestedPublicRole(ctx.supabaseIdentity)),");
  });

  it("has no Vendor role anywhere", () => {
    const constraint = readFileSync(new URL("../supabase/migrations/0001_noor_ilm_lms_canonical.sql", import.meta.url), "utf8");
    expect(constraint).not.toMatch(/'vendor'/);
    for (const source of [app, models, authCtx]) expect(source.toLowerCase()).not.toContain("vendor");
  });
});

describe("the database is the boundary, not the browser", () => {
  it("permits role writes to admins only, with super_admin reserved", () => {
    expect(rls).toContain("create policy user_roles_admin_insert on public.user_roles for insert with check (public.is_admin_user() and (role <> 'super_admin' or public.is_super_admin_user()));");
    expect(rls).toContain("create policy user_roles_select_own_or_admin on public.user_roles for select using (auth.uid() = user_id or public.is_admin_user());");
  });

  it("makes audit logs readable by admins and writable by nobody through the API", () => {
    expect(rls).toContain("create policy audit_logs_admin_select on public.audit_logs for select using (public.is_admin_user());");
    // No insert/update/delete policy exists, so only the service role can write.
    expect(rls).not.toMatch(/create policy \w+ on public\.audit_logs for (insert|update|delete)/);
  });
});
