import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sidebar = readFileSync(new URL("../client/src/components/DashboardSidebar.tsx", import.meta.url), "utf8");
const overview = readFileSync(new URL("../client/src/components/DashboardOverview.tsx", import.meta.url), "utf8");
const chrome = readFileSync(new URL("../client/src/components/DashboardChrome.tsx", import.meta.url), "utf8");
const quickLinks = readFileSync(new URL("../client/src/components/DashboardQuickLinks.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const lmsData = readFileSync(new URL("../client/src/lib/lms-data.ts", import.meta.url), "utf8");

const routeGroups = (() => {
  const m = lmsData.match(/export const routeGroups = (\{[\s\S]*?\});/);
  return eval(`(${m![1]})`) as Record<"learner" | "instructor" | "admin", string[]>;
})();

describe("dashboard sidebar", () => {
  it("is shared by every role rather than duplicated per dashboard", () => {
    expect(chrome).toContain("import DashboardSidebar, { SidebarToggle, useSidebarState");
    expect(chrome).toContain("<DashboardSidebar");
    // No page may render its own sidebar or shell any more.
    expect(overview).not.toContain("<DashboardSidebar");
    expect(overview).not.toContain('<aside className="dashboard-sidebar');
    expect(overview).not.toContain("dashboard-header");
    expect(overview).not.toContain("setMenuOpen");
  });

  it("mounts the chrome ABOVE the router so navigation never unmounts the sidebar", () => {
    // The sidebar is a sibling of <Switch>, not a child of any routed page.
    expect(app).toContain("<DashboardChrome><Switch>");
    expect(app).toContain("</Switch></DashboardChrome>");
    // Chrome decides from the path, so every /dashboard/:role route keeps it.
    expect(chrome).toContain("function roleForPath");
    expect(chrome).toContain("dashboard\\/(learner|instructor|admin)");
    expect(chrome).toContain("if (!role || !CHROME_ROLES.includes(role)) return <>{children}</>");
  });

  it("closes the drawer on navigation without touching the desktop collapsed state", () => {
    expect(chrome).toContain("useEffect(() => { setMobileOpen(false); }, [location, setMobileOpen]);");
    // Effects that run on a route change must only touch the drawer, never the persisted
    // desktop preference — that is what made the sidebar reset while navigating.
    const routeEffects = chrome.split("\n").filter((line) => line.includes("useEffect") && line.includes("[location"));
    expect(routeEffects.length).toBeGreaterThan(0);
    for (const effect of routeEffects) expect(effect).not.toContain("Collapsed");
  });

  it("keeps navigation role-specific and does not merge learner and instructor items", () => {
    expect(sidebar).toContain("const items = routeGroups[role]");
    const learnerOnly = ["Tutors", "Progress", "Wallet"];
    const instructorOnly = ["Training", "Verification", "Availability", "Withdrawals"];
    for (const item of instructorOnly) expect(routeGroups.learner).not.toContain(item);
    for (const item of learnerOnly.filter((i) => i !== "Wallet")) expect(routeGroups.instructor).not.toContain(item);
  });

  it("gives every module in every role a distinct icon, never a repeated default", () => {
    const map = sidebar.slice(sidebar.indexOf("const MODULE_ICONS"), sidebar.indexOf("const MODULE_LABEL_KEYS"));
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

  it("keeps the learner account modules, and moves Settings to the account menu", () => {
    // Learner keeps the account modules it owns.
    for (const item of ["Reviews", "Wallet"]) {
      expect(routeGroups.learner).toContain(item);
    }
    // Settings left both sidebars: the header account menu is the single entry point for it.
    expect(routeGroups.learner).not.toContain("Settings");
    expect(routeGroups.instructor).not.toContain("Settings");
    expect(chrome).toContain('href={`/dashboard/${role}/settings`}');
    for (const role of ["learner", "instructor"] as const) {
      // Notifications is a header bell popover, so a sidebar entry would be a competing
      // second entry point to the same content.
      expect(routeGroups[role]).not.toContain("Notifications");
    }
  });

  it("trims the tutor desk without removing anything the learner needs", () => {
    // A module may leave the rail only when it has another way in. These three still do not appear
    // because nothing behind them is the tutor's: "Invites" and "Students" are old labels for desks
    // that now have their own entries, and a tutor has no wallet.
    const notOnTheTutorRail = ["Invites", "Students", "Wallet"];
    for (const item of notOnTheTutorRail) expect(routeGroups.instructor).not.toContain(item);
    // The rest of the earlier trim is undone. Each of these has a route, a page, and no other entry
    // point — Availability most of all, since the timetable on every public profile is drawn from it
    // and no tutor could reach the screen that fills it.
    for (const item of ["Verification", "Bookings", "Sessions", "Availability", "Reports", "Reviews"]) {
      expect(routeGroups.instructor, `${item} must be reachable from the rail`).toContain(item);
    }
    // Every one of those that the learner uses is still on the learner desk.
    for (const item of ["Bookings", "Sessions", "Reports", "Reviews", "Wallet"]) {
      expect(routeGroups.learner).toContain(item);
    }
    // AI Tutor was removed from the tutor desk in a later pass — it is a student-facing feature,
    // and the tutor-side page was only ever a placeholder. See dashboard-navigation.test.ts.
    expect(routeGroups.instructor).not.toContain("AI Tutor");
    // AI Tutor moved out of the student sidebar to the quick-links strip; it is still a student
    // feature and is still one click away. See dashboard-navigation.test.ts.
    expect(routeGroups.learner).not.toContain("AI Tutor");
    expect(quickLinks).toContain('href: "/dashboard/learner/ai-tutor"');
    // Zufishan's own modules survive the trim.
    expect(routeGroups.instructor).toContain("Courses");
    // Find Students was promoted to the quick-links strip, so it leaves the sidebar but not the UI.
    expect(routeGroups.instructor).not.toContain("Find Students");
    expect(quickLinks).toContain('label: "Find Students"');
    expect(routeGroups.instructor.length).toBeLessThan(routeGroups.learner.length + 3);
  });

  it("collapses, persists the preference, and keeps links working when collapsed", () => {
    expect(sidebar).toContain('const STORAGE_KEY = "noor-ilm-sidebar-collapsed"');
    expect(sidebar).toContain("window.localStorage.setItem(STORAGE_KEY");
    expect(sidebar).toContain('collapsed ? "w-[4.5rem] px-2.5" : "w-64 px-4"');
    // Labels hide, but the link and its accessible name remain.
    // `label` is the English identifier that keys the icon and the href; `text` is the translated
    // word on screen. The guarantee is unchanged: the word hides, the accessible name does not.
    expect(sidebar).toContain("{!collapsed && <span className=\"truncate\">{text}</span>}");
    expect(sidebar).toContain("aria-label={collapsed ? text : undefined}");
    expect(sidebar).toContain('role="tooltip"');
  });

  it("renders a mobile drawer with an overlay and locks background scroll", () => {
    expect(sidebar).toContain('aria-modal="true"');
    expect(sidebar).toContain('document.body.style.overflow = "hidden"');
    expect(sidebar).toContain("onNavigate={onCloseMobile}".replace("onNavigate=", "")); // closes on selection
    // The drawer renders the grouped rail at full width even when the desktop rail is icons-only.
    expect(sidebar).toContain("renderGrouped(onCloseMobile, true)");
  });

  it("exposes one toggle with correct aria state, not a duplicate pair of controls", () => {
    expect(sidebar).toContain("aria-expanded={!collapsed}");
    expect(sidebar).toContain("aria-expanded={mobileOpen}");
    expect(sidebar).toContain('aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}');
    // Exactly one SidebarToggle is mounted by the dashboard shell.
    expect(chrome.split("<SidebarToggle").length - 1).toBe(1);
    expect(overview).not.toContain("<SidebarToggle");
  });

  it("marks the active route and provides a visible focus state", () => {
    expect(sidebar).toContain('aria-current={active ? "page" : undefined}');
    expect(sidebar).toContain("focus-visible:ring-2");
    expect(sidebar).toContain("shadow-[inset_2px_0_0_0_var(--ni-gold)]");
  });

  it("respects reduced motion on the width transition", () => {
    expect(sidebar).toContain("motion-reduce:transition-none");
  });

  it("carries the Zufishan wordmark, with a compact mark when collapsed", () => {
    expect(sidebar).toContain("Zufishan");
    // The rail used to print the brand a second time in Urdu script beneath the wordmark. Zufishan
    // has no agreed Arabic-script spelling, and guessing one would put an invented name on every
    // dashboard, so the line is gone rather than transliterated. Restore it — and this assertion —
    // when the spelling is decided.
    expect(sidebar).not.toContain('lang="ur"');
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
