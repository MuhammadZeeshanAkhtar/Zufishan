import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const chrome = readFileSync(new URL("../client/src/components/DashboardChrome.tsx", import.meta.url), "utf8");
const overview = readFileSync(new URL("../client/src/components/DashboardOverview.tsx", import.meta.url), "utf8");
const bell = readFileSync(new URL("../client/src/components/NotificationBell.tsx", import.meta.url), "utf8");
const localeCtx = readFileSync(new URL("../client/src/contexts/LocaleContext.tsx", import.meta.url), "utf8");
const authCtx = readFileSync(new URL("../client/src/contexts/AuthContext.tsx", import.meta.url), "utf8");
const supabaseAuth = readFileSync(new URL("./supabase-auth.ts", import.meta.url), "utf8");
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
    expect(bell).toContain("rows.filter((row) => !row.read_at).length");
    expect(bell).toContain("trpc.scheduling.notifications.useQuery");
    // No placeholder or seeded notification content.
    expect(bell).not.toMatch(/mock|fake|sample|dummy/i);
  });
});

describe("role resolution after signup and login", () => {
  it("grants the requested public role server-side from auth metadata", () => {
    expect(supabaseAuth).toContain("export async function claimRequestedPublicRole");
    // Identity is the verified bearer identity, not anything the client sent.
    expect(supabaseAuth).toContain("admin.auth.admin.getUserById(identity.id)");
    expect(supabaseAuth).toContain("data.user.user_metadata?.requested_public_role");
    expect(routers).toContain("claimPublicRole: supabaseOnlyProcedure.mutation(({ ctx }) => claimRequestedPublicRole(ctx.supabaseIdentity))");
  });

  it("can only ever grant instructor, never a privileged role", () => {
    expect(supabaseAuth).toContain('if (requested !== "instructor")');
    expect(supabaseAuth).toContain('role: "instructor"');
    for (const privileged of ["admin", "moderator", "super_admin", "finance", "advisory_board"]) {
      const claim = supabaseAuth.slice(supabaseAuth.indexOf("claimRequestedPublicRole"));
      expect(claim).not.toContain(`role: "${privileged}"`);
    }
  });

  it("routes by the granted role rather than the role the form requested", () => {
    // signUp previously returned "/onboarding/" + role straight from the form input.
    expect(authCtx).not.toContain('return { ok: true, next: "/onboarding/" + role };');
    expect(authCtx).toContain('const grantedRole = publicRole(roleFromRoles(granted?.roles));');
    expect(authCtx).toContain('return { ok: true, next: "/onboarding/" + grantedRole };');
    // signIn resolves the destination from refetched server roles.
    expect(authCtx).toContain("const nextRole = publicRole(roleFromRoles(refreshed?.roles));");
    expect(authCtx).toContain("next: done ? `/dashboard/${nextRole}` : `/onboarding/${nextRole}`");
  });

  it("claims the role on both signup and login so existing accounts self-repair", () => {
    expect(authCtx.split("claimRoleMutation.mutateAsync()").length - 1).toBe(2);
  });
});
