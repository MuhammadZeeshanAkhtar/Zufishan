/**
 * Shared dashboard navigation for every role.
 *
 * One component, one design system, role-specific items: the module list still comes from
 * `routeGroups[role]` in lms-data, so learner, instructor and admin keep their own navigation and
 * no role gains access to another's modules. Nothing here changes routing, permissions or data —
 * it renders the same links the dashboard already had, with a distinct icon per module, a
 * collapsible rail, and a mobile drawer.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  BadgeCheck, Banknote, Bell, BookMarked, BookOpen, CalendarCheck, CalendarClock, CalendarDays,
  ClipboardCheck, CreditCard, FileBarChart, GraduationCap, LayoutDashboard, MessageSquare, UserSearch,
  MonitorPlay, PanelLeft, ScrollText, Settings, Sparkles, Star, TrendingUp, User, UserPlus, Users,
  Video, Wallet, X, type LucideIcon,
} from "lucide-react";
import { routeGroups } from "../lib/lms-data";

export type DashboardRole = "learner" | "instructor" | "admin";

const STORAGE_KEY = "noor-ilm-sidebar-collapsed";

/** Every module label that can appear in any role's navigation gets its own mark. */
const MODULE_ICONS: Record<string, LucideIcon> = {
  // shared
  overview: LayoutDashboard, "lms overview": LayoutDashboard, "edit profile": User, profile: User,
  courses: BookOpen, requirements: ClipboardCheck, bookings: CalendarCheck,
  schedule: CalendarDays, sessions: MonitorPlay, "ai tutor": Sparkles,
  messages: MessageSquare, reports: FileBarChart, notifications: Bell,
  reviews: Star, wallet: Wallet, settings: Settings,
  // learner
  "find quran teacher": GraduationCap, progress: TrendingUp,
  // instructor
  "find students": UserSearch, training: BookMarked, verification: BadgeCheck, invites: UserPlus, students: Users,
  availability: CalendarClock, "classroom demo": Video, billing: CreditCard, withdrawals: Banknote,
  // admin
  users: Users, instructors: GraduationCap, classrooms: Video, "audit logs": ScrollText,
};

/** Account-level modules sit below a divider, away from the day-to-day learning modules. */
const FOOTER_MODULES = new Set(["notifications", "reviews", "wallet", "settings", "audit logs"]);

const iconFor = (label: string) => MODULE_ICONS[label.toLowerCase()] ?? LayoutDashboard;

function readCollapsed() {
  if (typeof window === "undefined") return false;
  try { return window.localStorage.getItem(STORAGE_KEY) === "1"; } catch { return false; }
}

/** Compact Noor Ilm mark: the eight-point star that carries the brand in the collapsed rail. */
function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="shrink-0">
      <g fill="none" stroke="var(--ni-moss)" strokeWidth="3" strokeLinejoin="round">
        <rect x="15" y="15" width="34" height="34" rx="3" />
        <rect x="15" y="15" width="34" height="34" rx="3" transform="rotate(45 32 32)" />
      </g>
      <path d="M32 41c-3.4-2.8-7.5-4.1-11.8-4.1V24.6c4.3 0 8.4 1.3 11.8 4.1z" fill="var(--ni-teal)" />
      <path d="M32 41c3.4-2.8 7.5-4.1 11.8-4.1V24.6c-4.3 0-8.4 1.3-11.8 4.1z" fill="var(--ni-moss-deep)" />
      <circle cx="32" cy="19" r="3.2" fill="var(--ni-gold)" />
    </svg>
  );
}

type NavItemProps = { label: string; href: string; active: boolean; collapsed: boolean; onNavigate?: () => void };

function NavItem({ label, href, active, collapsed, onNavigate }: NavItemProps) {
  const Icon = iconFor(label);
  return (
    <li className="relative group/nav">
      <Link
        href={href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        aria-label={collapsed ? label : undefined}
        title={collapsed ? label : undefined}
        className={[
          "flex items-center rounded-xl text-sm font-semibold outline-none transition-colors duration-150",
          collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5",
          active
            ? "bg-[var(--ni-sage-soft)] text-[var(--ni-moss-deep)] shadow-[inset_2px_0_0_0_var(--ni-gold)]"
            : "text-[var(--ni-muted)] hover:bg-[var(--ni-sage-soft)] hover:text-[var(--ni-moss-deep)]",
          "focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ni-field)]",
        ].join(" ")}
      >
        <Icon size={18} strokeWidth={active ? 2.2 : 1.8} className={active ? "text-[var(--ni-moss)]" : ""} />
        {!collapsed && <span className="truncate">{label}</span>}
      </Link>
      {/* Collapsed rail needs the module name on hover; hidden from AT since the link is already labelled. */}
      {collapsed && (
        <span
          role="tooltip"
          aria-hidden="true"
          className="pointer-events-none absolute start-full top-1/2 z-50 ms-2 -translate-y-1/2 whitespace-nowrap rounded-lg bg-[var(--ni-teal)] px-2.5 py-1.5 text-xs font-semibold text-[var(--ni-bg)] opacity-0 shadow-lg transition-opacity duration-150 group-hover/nav:opacity-100"
        >
          {label}
        </span>
      )}
    </li>
  );
}

export function useSidebarState() {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const toggleCollapsed = useCallback(() => {
    setCollapsed((value) => {
      const next = !value;
      try { window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0"); } catch { /* storage unavailable */ }
      return next;
    });
  }, []);
  // The drawer sits over the page, so the page behind it must not scroll.
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [mobileOpen]);
  return { collapsed, toggleCollapsed, mobileOpen, setMobileOpen };
}

type SidebarProps = {
  role: DashboardRole;
  hrefFor: (item: string) => string;
  collapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  deskLabel: string;
};

export default function DashboardSidebar({ role, hrefFor, collapsed, mobileOpen, onCloseMobile, deskLabel }: SidebarProps) {
  const [location] = useLocation();
  const items = routeGroups[role];

  const { primary, footer } = useMemo(() => ({
    primary: items.filter((item) => !FOOTER_MODULES.has(item.toLowerCase())),
    footer: items.filter((item) => FOOTER_MODULES.has(item.toLowerCase())),
  }), [items]);

  // Longest matching href wins, so /courses does not stay active on /courses/new.
  const activeHref = useMemo(() => {
    const matches = items
      .map(hrefFor)
      .filter((href) => location === href || (href !== `/dashboard/${role}/` && location.startsWith(href)));
    return matches.sort((a, b) => b.length - a.length)[0] ?? "";
  }, [items, hrefFor, location, role]);

  const renderNav = (list: string[], onNavigate?: () => void) =>
    list.map((item) => (
      <NavItem
        key={item}
        label={item}
        href={hrefFor(item)}
        active={hrefFor(item) === activeHref}
        collapsed={collapsed}
        onNavigate={onNavigate}
      />
    ));

  const brand = (compact: boolean) => (
    <Link
      href="/"
      className="flex items-center gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]"
      aria-label="Noor Ilm home"
    >
      <BrandMark />
      {!compact && (
        <span className="min-w-0">
          <span className="block truncate font-display text-xl leading-none text-[var(--ni-ink)]">Noor Ilm</span>
          <span lang="ur" dir="rtl" className="mt-1 block truncate text-sm leading-none text-[var(--ni-gold-ink)]">نورِ علم</span>
        </span>
      )}
    </Link>
  );

  const sectionLabel = !collapsed && (
    <p className="mb-2 mt-8 px-3 text-[10px] font-bold uppercase tracking-[.2em] text-[var(--ni-gold-ink)]">{deskLabel}</p>
  );

  return (
    <>
      {/* Desktop rail */}
      <aside
        className={[
          "dashboard-sidebar hidden shrink-0 flex-col border-e border-[var(--ni-sage)] bg-[var(--ni-field)] py-6 lg:flex",
          "transition-[width] duration-200 ease-out motion-reduce:transition-none",
          collapsed ? "w-[4.5rem] px-2.5" : "w-64 px-4",
        ].join(" ")}
      >
        <div className={collapsed ? "flex justify-center" : ""}>{brand(collapsed)}</div>
        {collapsed ? <div className="mt-8" /> : sectionLabel}
        <nav aria-label={`${deskLabel} navigation`} className="min-h-0 flex-1 overflow-y-auto">
          <ul className="space-y-1">{renderNav(primary)}</ul>
          {footer.length > 0 && (
            <>
              <hr className="my-3 border-t border-[var(--ni-sage)]" />
              <ul className="space-y-1">{renderNav(footer)}</ul>
            </>
          )}
        </nav>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={onCloseMobile}
            className="absolute inset-0 h-full w-full bg-[var(--ni-teal)]/40 backdrop-blur-[2px]"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label={`${deskLabel} navigation`}
            className="relative flex h-full w-[17rem] max-w-[85vw] flex-col border-e border-[var(--ni-sage)] bg-[var(--ni-field)] px-5 py-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              {brand(false)}
              <button
                type="button"
                onClick={onCloseMobile}
                aria-label="Close navigation"
                className="rounded-full bg-[var(--ni-sage-soft)] p-2 text-[var(--ni-sage-ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]"
              >
                <X size={18} />
              </button>
            </div>
            <p className="mb-2 mt-7 px-3 text-[10px] font-bold uppercase tracking-[.2em] text-[var(--ni-gold-ink)]">{deskLabel}</p>
            <nav aria-label={`${deskLabel} navigation`} className="min-h-0 flex-1 overflow-y-auto">
              <ul className="space-y-1">{renderNav(primary, onCloseMobile)}</ul>
              {footer.length > 0 && (
                <>
                  <hr className="my-3 border-t border-[var(--ni-sage)]" />
                  <ul className="space-y-1">{renderNav(footer, onCloseMobile)}</ul>
                </>
              )}
            </nav>
          </aside>
        </div>
      )}
    </>
  );
}

/** Single toggle: collapses the desktop rail, opens the drawer on small screens. */
export function SidebarToggle({ collapsed, mobileOpen, onToggleCollapsed, onToggleMobile }: {
  collapsed: boolean; mobileOpen: boolean; onToggleCollapsed: () => void; onToggleMobile: () => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onToggleCollapsed}
        aria-expanded={!collapsed}
        aria-controls="dashboard-sidebar"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="hidden rounded-full bg-[var(--ni-sage-soft)] p-2 text-[var(--ni-sage-ink)] outline-none transition-colors hover:bg-[var(--ni-sage)] focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)] lg:inline-flex"
      >
        <PanelLeft size={18} className={collapsed ? "" : "icon-directional"} />
      </button>
      <button
        type="button"
        onClick={onToggleMobile}
        aria-expanded={mobileOpen}
        aria-controls="dashboard-sidebar"
        aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
        className="rounded-full bg-[var(--ni-sage-soft)] p-2 text-[var(--ni-sage-ink)] outline-none transition-colors hover:bg-[var(--ni-sage)] focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)] lg:hidden"
      >
        <PanelLeft size={18} />
      </button>
    </>
  );
}
