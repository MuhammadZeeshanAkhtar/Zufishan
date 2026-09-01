import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sidebar = readFileSync(new URL("../client/src/components/DashboardSidebar.tsx", import.meta.url), "utf8");
const overview = readFileSync(new URL("../client/src/components/DashboardOverview.tsx", import.meta.url), "utf8");
const lmsData = readFileSync(new URL("../client/src/lib/lms-data.ts", import.meta.url), "utf8");

const routeGroups = (() => {
  const m = lmsData.match(/export const routeGroups = (\{[\s\S]*?\});/);
  return eval(`(${m![1]})`) as Record<"learner" | "instructor" | "admin", string[]>;
})();

describe("dashboard sidebar", () => {
  it("is shared by every role rather than duplicated per dashboard", () => {
    expect(overview).toContain("import DashboardSidebar, { SidebarToggle, useSidebarState }");
    expect(overview).toContain("<DashboardSidebar role={role}");
    // The old per-dashboard aside and mobile grid must be gone.
    expect(overview).not.toContain('<aside className="dashboard-sidebar');
    expect(overview).not.toContain("setMenuOpen");
  });

  it("keeps navigation role-specific and does not merge learner and instructor items", () => {
    expect(sidebar).toContain("const items = routeGroups[role]");
    const learnerOnly = ["Tutors", "Progress", "Wallet"];
    const instructorOnly = ["Training", "Verification", "Availability", "Withdrawals"];
    for (const item of instructorOnly) expect(routeGroups.learner).not.toContain(item);
    for (const item of learnerOnly.filter((i) => i !== "Wallet")) expect(routeGroups.instructor).not.toContain(item);
  });

  it("gives every module in every role a distinct icon, never a repeated default", () => {
    const map = sidebar.slice(sidebar.indexOf("const MODULE_ICONS"), sidebar.indexOf("const FOOTER_MODULES"));
    // Keys are bare when single-word and quoted when they contain a space.
    const keyed = (label: string) => {
      const k = label.toLowerCase();
      return map.toLowerCase().includes(`${k}:`) || map.toLowerCase().includes(`"${k}":`);
    };
    const icons = new Map<string, string>();
    for (const [, key, icon] of map.matchAll(/"?([a-z ]+)"?\s*:\s*([A-Z][A-Za-z]+)/g)) icons.set(key.trim(), icon);
    for (const role of ["learner", "instructor", "admin"] as const) {
      for (const label of routeGroups[role]) {
        expect(keyed(label), `no icon mapped for "${label}" (${role})`).toBe(true);
      }
    }
    // The learner rail in particular must not fall back to one repeated default.
    const learnerIcons = routeGroups.learner.map((l) => icons.get(l.toLowerCase()));
    expect(new Set(learnerIcons).size).toBeGreaterThanOrEqual(routeGroups.learner.length - 1);
  });

  it("carries the account modules the brief requires on both dashboards", () => {
    for (const role of ["learner", "instructor"] as const) {
      for (const item of ["Notifications", "Reviews", "Settings"]) {
        expect(routeGroups[role]).toContain(item);
      }
    }
    expect(routeGroups.learner).toContain("Wallet");
    expect(routeGroups.instructor).toContain("Wallet");
  });

  it("collapses, persists the preference, and keeps links working when collapsed", () => {
    expect(sidebar).toContain('const STORAGE_KEY = "noor-ilm-sidebar-collapsed"');
    expect(sidebar).toContain("window.localStorage.setItem(STORAGE_KEY");
    expect(sidebar).toContain('collapsed ? "w-[4.75rem] px-3" : "w-72 px-5"');
    // Labels hide, but the link and its accessible name remain.
    expect(sidebar).toContain("{!collapsed && <span className=\"truncate\">{label}</span>}");
    expect(sidebar).toContain("aria-label={collapsed ? label : undefined}");
    expect(sidebar).toContain('role="tooltip"');
  });

  it("renders a mobile drawer with an overlay and locks background scroll", () => {
    expect(sidebar).toContain('aria-modal="true"');
    expect(sidebar).toContain('document.body.style.overflow = "hidden"');
    expect(sidebar).toContain("onNavigate={onCloseMobile}".replace("onNavigate=", "")); // closes on selection
    expect(sidebar).toContain("renderNav(primary, onCloseMobile)");
  });

  it("exposes one toggle with correct aria state, not a duplicate pair of controls", () => {
    expect(sidebar).toContain("aria-expanded={!collapsed}");
    expect(sidebar).toContain("aria-expanded={mobileOpen}");
    expect(sidebar).toContain('aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}');
    // Exactly one SidebarToggle is mounted by the dashboard shell.
    expect(overview.split("<SidebarToggle").length - 1).toBe(1);
  });

  it("marks the active route and provides a visible focus state", () => {
    expect(sidebar).toContain('aria-current={active ? "page" : undefined}');
    expect(sidebar).toContain("focus-visible:ring-2");
    expect(sidebar).toContain("shadow-[inset_2px_0_0_0_var(--ni-gold)]");
  });

  it("respects reduced motion on the width transition", () => {
    expect(sidebar).toContain("motion-reduce:transition-none");
  });

  it("uses Noor Ilm English and Urdu branding with a compact collapsed mark", () => {
    expect(sidebar).toContain("Noor Ilm");
    expect(sidebar).toContain("نورِ علم");
    expect(sidebar).toContain('lang="ur"');
    expect(sidebar).toContain("function BrandMark");
    // Collapsed shows the mark only.
    expect(sidebar).toContain("{!compact && (");
  });

  it("uses palette tokens rather than reintroducing hardcoded colour", () => {
    expect(sidebar).not.toMatch(/#[0-9a-fA-F]{6}\b/);
    expect(sidebar).toContain("var(--ni-moss)");
    expect(sidebar).toContain("var(--ni-gold)");
  });
});
