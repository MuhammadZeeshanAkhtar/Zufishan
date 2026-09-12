import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const chrome = readFileSync(new URL("../client/src/components/DashboardChrome.tsx", import.meta.url), "utf8");
const overview = readFileSync(new URL("../client/src/components/DashboardOverview.tsx", import.meta.url), "utf8");
const bell = readFileSync(new URL("../client/src/components/NotificationBell.tsx", import.meta.url), "utf8");
const localeCtx = readFileSync(new URL("../client/src/contexts/LocaleContext.tsx", import.meta.url), "utf8");
const authCtx = readFileSync(new URL("../client/src/contexts/AuthContext.tsx", import.meta.url), "utf8");
const supabaseAuth = readFileSync(new URL("./supabase-auth.ts", import.meta.url), "utf8");
const roleIdentity = readFileSync(new URL("./role-identity.ts", import.meta.url), "utf8");
const trigger = readFileSync(new URL("../supabase/migrations/0023_signup_role_is_the_requested_one.sql", import.meta.url), "utf8");
const routers = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const lmsData = readFileSync(new URL("../client/src/lib/lms-data.ts", import.meta.url), "utf8");

const routeGroups = (() => {
  const m = lmsData.match(/export const routeGroups = (\{[\s\S]*?\});/);
  return eval(`(${m![1]})`) as Record<"learner" | "instructor" | "admin", string[]>;
})();

describe("dashboard language", () => {
  it("uses one persisted locale source, not a per-dashboard copy", () => {
    // The old bug: DashboardOverview held its own useState("EN") that reset on every navigation
    // and never synced with the header selector.
    expect(overview).not.toContain('useState<"EN" | "UR" | "AR">');
    expect(overview).not.toContain("setLanguage");
    expect(chrome).toContain("<LocaleSelector compact />");
  });

  it("persists the choice and applies direction globally", () => {
    expect(localeCtx).toContain("window.localStorage.setItem(STORAGE_KEY, locale)");
    expect(localeCtx).toContain("document.documentElement.lang");
    expect(localeCtx).toContain("document.documentElement.dir");
    expect(localeCtx).toContain('const rtlLocales: Locale[] = ["ur", "ar"]');
    // Also mirrored to the profile so the preference follows the account.
    expect(localeCtx).toContain('.update({ preferred_locale: nextLocale })');
  });

  it("offers exactly English, Urdu and Arabic", () => {
    const selector = readFileSync(new URL("../client/src/components/LocaleSelector.tsx", import.meta.url), "utf8");
    for (const value of ['value="en"', 'value="ur"', 'value="ar"']) expect(selector).toContain(value);
    expect(selector).toContain("useLocale()");
  });
});

describe("notification bell", () => {
  it("is not a sidebar module on either dashboard", () => {
    for (const role of ["learner", "instructor", "admin"] as const) {
      expect(routeGroups[role]).not.toContain("Notifications");
    }
  });

  it("opens a popover in the header instead of navigating", () => {
    expect(chrome).toContain("<NotificationBell role={role} />");
    expect(bell).toContain('role="dialog"');
    expect(bell).toContain("aria-haspopup=\"dialog\"");
    expect(bell).toContain("aria-expanded={open}");
  });

  it("closes on outside click and on Escape", () => {
    expect(bell).toContain('document.addEventListener("mousedown", onPointer)');
    expect(bell).toContain('event.key === "Escape"');
    expect(bell).toContain("containerRef.current?.contains");
    // Listeners are torn down so the popover cannot leak handlers.
    expect(bell).toContain('document.removeEventListener("mousedown", onPointer)');
  });

  it("shows an unread badge from real rows, never a fabricated count", () => {
    // The count used to be `rows.filter(...)` over a list gated on `enabled: open`, so the badge
    // read 0 until the popover was opened. It now comes from a server-side exact count that runs on
    // load, which is both real and actually visible — a stronger version of the same guarantee.
    expect(bell).toContain("trpc.scheduling.unreadNotifications.useQuery(undefined, { retry: false })");
    expect(bell).toContain("const unread = unreadQuery.data?.ok ? (unreadQuery.data.data as { unread: number }).unread : 0;");
    // The list itself reads the whole inbox, not the scheduling-only subset.
    expect(bell).toContain("trpc.scheduling.inbox.useQuery");
    // No placeholder or seeded notification content.
    expect(bell).not.toMatch(/mock|fake|sample|dummy/i);
  });
});

describe("role resolution after signup and login", () => {
  it("grants the requested public role server-side from auth metadata", () => {
    // The implementation moved to role-identity.ts, which is where the signup and
    // login checks that share its vocabulary now live. supabase-auth re-exports it.
    expect(supabaseAuth).toContain('export { claimRequestedPublicRole } from "./role-identity";');
    // Identity is the verified bearer identity, not anything the client sent.
    expect(roleIdentity).toContain("admin.auth.admin.getUserById(identity.id)");
    expect(roleIdentity).toContain("data.user.user_metadata?.requested_public_role");
    expect(routers).toContain("claimPublicRole: supabaseOnlyProcedure.mutation(({ ctx }) => claimRequestedPublicRole(ctx.supabaseIdentity))");
  });

  it("can only ever grant a public role, never a privileged one", () => {
    expect(roleIdentity).toContain('export const PUBLIC_ROLES = ["learner", "instructor"] as const;');
    expect(roleIdentity).toContain("if (!(PUBLIC_ROLES as readonly string[]).includes(requested)) {");
    const claim = roleIdentity.slice(roleIdentity.indexOf("export async function claimRequestedPublicRole"));
    for (const privileged of ["admin", "moderator", "super_admin", "finance", "advisory_board"]) {
      expect(claim).not.toContain(`role: "${privileged}"`);
    }
    // The database enforces the same allow-list at the moment the account is made.
    expect(trigger).toContain("case when requested in ('learner', 'instructor') then requested else null end");
  });

  it("never grants a second public role, and never switches one", () => {
    // An instructor signup used to receive `learner` from the trigger and then
    // `instructor` from this claim, leaving both. Exactly one, or none.
    expect(roleIdentity).toContain('if (held) return { ok: true, data: { granted: false, role: held, decision: "ok" } };');
    // Scoped to the statement, not the file: the migration's own commentary quotes
    // the offending line while explaining it.
    const statement = trigger.slice(trigger.indexOf("create or replace function"));
    expect(statement).not.toContain("values (new.id, 'learner')");
    expect(statement).toContain("values (new.id, granted)");
  });

  it("routes by the granted role rather than the role the form requested", () => {
    // signUp previously returned "/onboarding/" + role straight from the form input.
    expect(authCtx).not.toContain('return { ok: true, next: "/onboarding/" + role };');
    expect(authCtx).toContain('const grantedRole = publicRole(roleFromRoles(granted?.roles));');
    expect(authCtx).toContain('return { ok: true, next: "/onboarding/" + grantedRole, roles: roleFromRoles(granted?.roles) };');
    // A grant that did not land is refused rather than routed to a guessed home.
    expect(authCtx).toContain('if (!grantedRole) return { ok: false, decision: "role_not_assigned" };');
    // signIn no longer computes a destination at all: the server returns it.
    expect(authCtx).toContain("const resolved = await contextMutation.mutateAsync({ context })");
    expect(authCtx).toContain("const { decision, next, isAdmin } = resolved.data;");
    expect(authCtx).not.toContain('const next = isAdmin ? "/admin" : done ?');
  });

  it("claims the role on every way in, so existing accounts self-repair", () => {
    // This used to pin the count at exactly two, when signup and login were the
    // only doors. Google sign-in added a third, and the invariant that matters is
    // not the number — it is that no authentication path skips the claim and
    // leaves an account without the role it asked for.
    for (const entry of ["const signUp =", "const signIn =", "const resolveAfterOAuth ="]) {
      const start = authCtx.indexOf(entry);
      expect(start, `${entry} not found`).toBeGreaterThan(-1);
      const body = authCtx.slice(start, authCtx.indexOf("\n  const ", start + entry.length));
      expect(body).toContain("claimRoleMutation.mutateAsync()");
    }
  });
});
