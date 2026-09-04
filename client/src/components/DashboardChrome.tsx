/**
 * Persistent dashboard chrome.
 *
 * This wraps the router's <Switch> rather than sitting inside any one page, so the sidebar and
 * header are the same React elements across every /dashboard/:role route. Navigating from Overview
 * to Bookings swaps only the routed children — the sidebar is never unmounted, so its
 * collapsed/expanded state, scroll position and focus survive navigation.
 *
 * Public routes render their children untouched.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { ChevronDown } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "../contexts/LocaleContextState";
import DashboardQuickLinks from "./DashboardQuickLinks";
import DashboardSidebar, { SidebarToggle, useSidebarState, type DashboardRole } from "./DashboardSidebar";
import NotificationBell from "./NotificationBell";
import { LocaleSelector } from "./LocaleSelector";

const CHROME_ROLES: DashboardRole[] = ["learner", "instructor", "admin"];

/** Which dashboard, if any, the current path belongs to. */
function roleForPath(path: string): DashboardRole | null {
  const match = path.match(/^\/dashboard\/(learner|instructor|admin)(\/|$)/);
  if (match) return match[1] as DashboardRole;
  return null;
}

/** Mirrors the link mapping the dashboard already used, so no route changes. */
export function hrefForModule(role: DashboardRole, item: string) {
  const slug = item.toLowerCase().replaceAll(" ", "-");
  const mapped: Record<string, string> = {
    messages: `/dashboard/${role}/messages`,
    reports: `/dashboard/${role}/reports`,
    reviews: `/dashboard/${role}/reviews`,
    sessions: `/dashboard/${role}/sessions`,
    billing: `/dashboard/${role}/billing`,
    withdrawals: `/dashboard/${role}/withdrawals`,
    wallet: `/dashboard/${role}/wallet`,
    "find-students": `/dashboard/${role}/requirements`,
    // Teacher discovery inside the dashboard, not the public marketplace page: the public route
    // renders the site header and reads as the logged-out experience.
    "find-quran-teacher": `/dashboard/${role}/teachers`,
    // Renamed in the sidebar only — the route and the page behind it are unchanged.
    "edit-profile": `/dashboard/${role}/profile`,
    "ai-tutor": role === "admin" ? "/admin/ai-tutor" : `/dashboard/${role}/ai-tutor`,
  };
  return mapped[slug] || `/dashboard/${role}/${slug === "overview" ? "" : slug}`;
}

export default function DashboardChrome({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const role = roleForPath(location);
  const { collapsed, toggleCollapsed, mobileOpen, setMobileOpen } = useSidebarState();
  const { user, logout } = useAuth();
  const { t } = useLocale();
  const [profileOpen, setProfileOpen] = useState(false);

  // Selecting a module closes the drawer on small screens only; desktop state is untouched.
  useEffect(() => { setMobileOpen(false); }, [location, setMobileOpen]);
  useEffect(() => { setProfileOpen(false); }, [location]);

  if (!role || !CHROME_ROLES.includes(role)) return <>{children}</>;

  const displayName = user?.name || user?.email?.split("@")[0] || "";
  const initials = displayName.slice(0, 2).toUpperCase() || "NI";

  return (
    <div className="dashboard-shell min-h-screen bg-[var(--ni-bg)]">
      <div className="flex min-h-screen">
        <DashboardSidebar
          role={role}
          hrefFor={(item) => hrefForModule(role, item)}
          collapsed={collapsed}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
          deskLabel={`${role} desk`}
        />
        <div className="dashboard-main flex min-w-0 flex-1 flex-col">
          <header className="dashboard-header sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-[var(--ni-sage)] bg-[var(--ni-field)] px-5 py-3 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <SidebarToggle
                collapsed={collapsed}
                mobileOpen={mobileOpen}
                onToggleCollapsed={toggleCollapsed}
                onToggleMobile={() => setMobileOpen(!mobileOpen)}
              />
              {/* The role's few most-used destinations sit inline beside the toggle. Admin has no
                  promoted set, so it keeps the plain dashboard label. */}
              {role === "admin" ? (
                <p className="truncate text-xs font-bold uppercase tracking-[.18em] text-[var(--ni-gold-ink)]">
                  {role} dashboard
                </p>
              ) : (
                <DashboardQuickLinks role={role} />
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* Language is the shared, persisted LocaleContext selector, so both dashboards stay in sync. */}
              <LocaleSelector compact />
              <NotificationBell role={role} />
              <div className="relative">
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={profileOpen}
                  onClick={() => setProfileOpen((open) => !open)}
                  className="flex items-center gap-2 rounded-full bg-[var(--ni-sage-soft)] px-3 py-2 text-xs font-bold text-[var(--ni-moss-deep)] outline-none transition-colors hover:bg-[var(--ni-sage)] focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--ni-moss)] text-white">{initials}</span>
                  <span className="hidden max-w-[10rem] truncate sm:inline">{displayName}</span>
                  <ChevronDown size={14} />
                </button>
                {profileOpen && (
                  <div role="menu" className="absolute end-0 top-12 z-40 w-48 rounded-2xl border border-[var(--ni-sage)] bg-[var(--ni-paper)] p-2 shadow-lg">
                    <Link role="menuitem" href={`/dashboard/${role}/profile`} className="block rounded-xl px-3 py-2 text-sm text-[var(--ni-moss-deep)] hover:bg-[var(--ni-sage-soft)]">
                      {t("dashboard.viewProfile")}
                    </Link>
                    <Link role="menuitem" href={`/dashboard/${role}/settings`} className="block rounded-xl px-3 py-2 text-sm text-[var(--ni-moss-deep)] hover:bg-[var(--ni-sage-soft)]">
                      {t("dashboard.settings")}
                    </Link>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={logout}
                      className="w-full rounded-xl px-3 py-2 text-start text-sm font-bold text-[var(--ni-clay-ink)] hover:bg-[var(--ni-clay-soft)]"
                    >
                      {t("dashboard.logOut")}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </div>
    </div>
  );
}
