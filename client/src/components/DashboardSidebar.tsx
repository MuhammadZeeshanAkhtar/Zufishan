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
import type { LucideIcon } from "lucide-react";
import {
  Archive, Award, BadgeCheck, Banknote, Bell, BookMarked, BookOpen, BookText, CalendarCheck, ShieldCheck, CalendarClock, CalendarDays, ClipboardCheck, CreditCard, FileBarChart, GraduationCap, LayoutDashboard, MessageSquare, MonitorPlay, PanelLeft, Receipt, ScrollText, Settings, Sparkles, Star, Timer, TrendingUp, User, UserPlus, UserSearch, Users, Video, Wallet, X
} from "lucide-react";
import { ChevronDown } from "lucide-react";
import { moduleGroups, routeGroups, type ModuleTone } from "../lib/lms-data";
import { useLocale } from "../contexts/LocaleContextState";
import type { TranslationKey } from "@/i18n/catalog";

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
  "find quran teacher": GraduationCap, progress: TrendingUp, hifz: BookOpen,
  // instructor
  "find students": UserSearch, training: BookMarked, verification: BadgeCheck, invites: UserPlus, students: Users,
  "trial requests": Timer, credentials: ScrollText,
  availability: CalendarClock, "classroom demo": Video, billing: CreditCard, withdrawals: Banknote,
  // admin
  users: Users, instructors: GraduationCap, classrooms: Video, "audit logs": ScrollText,
  // Learner modules that had real routes but no rail entry until now.
  "trial lessons": Timer, certificates: Award, archives: Archive, transactions: Receipt,
  // Two modules the reference marketplace carries for a learner; both wait on a provider.
  "parental watch": ShieldCheck, "quran revision": BookText,
};

/**
 * The rail, in the reader's language.
 *
 * The labels in `routeGroups` are identifiers as much as words — they key the icon map, the href
 * map and every test — so they stay English there and are translated on the way to the screen. A
 * module with no entry here falls back to its own label rather than rendering blank.
 */
const MODULE_LABEL_KEYS: Record<string, TranslationKey> = {
  "overview": "nav.module.overview", "lms overview": "nav.module.lmsOverview",
  "courses": "nav.module.courses", "hifz": "nav.module.hifz", "quran revision": "nav.module.quranRevision",
  "progress": "nav.module.progress", "certificates": "nav.module.certificates",
  "requirements": "nav.module.requirements", "trial lessons": "nav.module.trialLessons",
  "trial requests": "nav.module.trialRequests", "bookings": "nav.module.bookings",
  "schedule": "nav.module.schedule", "availability": "nav.module.availability",
  "classrooms": "nav.module.classrooms", "archives": "nav.module.archives",
  "parental watch": "nav.module.parentalWatch", "training": "nav.module.training",
  "verification": "nav.module.verification", "credentials": "nav.module.credentials",
  "billing": "nav.module.billing", "withdrawals": "nav.module.withdrawals",
  "transactions": "nav.module.transactions", "sessions": "nav.module.sessions",
  "wallet": "nav.module.wallet", "reviews": "nav.module.reviews", "reports": "nav.module.reports",
  "edit profile": "nav.module.editProfile", "users": "nav.module.users",
  "instructors": "nav.module.instructors", "ai tutor": "nav.module.aiTutor",
  "audit logs": "nav.module.auditLogs",
};

const GROUP_LABEL_KEYS: Record<string, TranslationKey> = {
  learning: "nav.group.learning", lessons: "nav.group.lessons", classroom: "nav.group.classroom",
  payments: "nav.group.payments", account: "nav.group.account", students: "nav.group.students",
  teaching: "nav.group.teaching", approval: "nav.group.approval", earnings: "nav.group.earnings",
  people: "nav.group.people", content: "nav.group.content", operations: "nav.group.operations",
  money: "nav.group.money", system: "nav.group.system",
};

/** Account-level modules sit below a divider, away from the day-to-day learning modules. */
/** Which rail groups this viewer left open. Per-browser only; nothing is sent anywhere. */

const iconFor = (label: string) => MODULE_ICONS[label.toLowerCase()] ?? LayoutDashboard;

function readCollapsed() {
  if (typeof window === "undefined") return false;
  try { return window.localStorage.getItem(STORAGE_KEY) === "1"; } catch { return false; }
}

/**
 * The Zufishan mark, in the rail.
 *
 * Drawn rather than loaded because this one takes its colour from the theme: `--ni-gold` is a
 * deeper gold on cream and a lighter one on espresso, so the same component reads correctly in
 * both without a second file. The public-facing copy of the mark lives at
 * `client/public/brand/zufishan-mark.svg`, where a static file is what an `<img>` needs.
 */
function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="shrink-0">
      <g fill="none" stroke="var(--ni-gold)" strokeLinejoin="round">
        <rect x="13" y="13" width="38" height="38" rx="4" strokeWidth="2" />
        <rect x="13" y="13" width="38" height="38" rx="4" strokeWidth="2" transform="rotate(45 32 32)" opacity=".55" />
      </g>
      <path
        d="M24.5 25.5h15l-15 13h15"
        fill="none"
        stroke="var(--ni-gold)"
        strokeWidth="3.4"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </svg>
  );
}

type NavItemProps = { label: string; href: string; active: boolean; collapsed: boolean; onNavigate?: () => void; tone: ModuleTone };

function NavItem({ label, href, active, collapsed, onNavigate, tone }: NavItemProps) {
  const { t } = useLocale();
  const Icon = iconFor(label);
  // `label` stays the English identifier — it keys the icon and the href; `text` is what is read.
  const key = MODULE_LABEL_KEYS[label.toLowerCase()];
  const text = key ? t(key) : label;

  return (
    <li className="relative group/nav">
      <Link
        href={href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        aria-label={collapsed ? text : undefined}
        className={[
          "ni-rail-item flex items-center rounded-xl text-sm font-semibold outline-none transition",
          active ? "ni-rail-item--active" : "",
          collapsed ? "justify-center px-0 py-1.5" : "gap-3 px-3 py-1.5",
          active
            ? "bg-[var(--ni-sage-soft)] ni-t-ink shadow-[inset_2px_0_0_0_var(--ni-gold)]"
            : "ni-t-muted hover:bg-[var(--ni-sage-soft)] hover:text-[var(--ni-ink)]",
          "focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ni-field)]",
        ].join(" ")}
      >
        {/* The colour is the grouping. A reader finds Billing by looking for the terracotta tile,
            not by remembering which heading to open. */}
        <span aria-hidden="true" className={`ni-rail-tile ni-rail-tile--${tone}`}>
          <Icon size={16} strokeWidth={active ? 2.3 : 1.9} />
        </span>
        {!collapsed && <span className="truncate">{text}</span>}
      </Link>
      {/* Collapsed rail needs the module name on hover; hidden from AT since the link is already labelled. */}
      {collapsed && (
        <span
          role="tooltip"
          aria-hidden="true"
          className="pointer-events-none absolute start-full top-1/2 z-50 ms-2 -translate-y-1/2 whitespace-nowrap rounded-lg bg-[var(--ni-teal)] px-2.5 py-1.5 text-xs font-semibold text-[var(--ni-on-dark)] opacity-0 shadow-lg transition group-hover/nav:opacity-100"
        >
          {text}
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

  const { t } = useLocale();
  const layout = moduleGroups[role];

  // Longest matching href wins, so /courses does not stay active on /courses/new.
  const activeHref = useMemo(() => {
    const matches = items
      .map(hrefFor)
      .filter((href) => location === href || (href !== `/dashboard/${role}/` && location.startsWith(href)));
    return matches.sort((a, b) => b.length - a.length)[0] ?? "";
  }, [items, hrefFor, location, role]);

  const renderNav = (list: string[], tone: ModuleTone, onNavigate?: () => void, forceExpanded = false) =>
    list.map((item) => (
      <NavItem
        key={item}
        label={item}
        href={hrefFor(item)}
        active={hrefFor(item) === activeHref}
        collapsed={collapsed && !forceExpanded}
        onNavigate={onNavigate}
        tone={tone}
      />
    ));

  /**
   * The rail.
   *
   * Every module is visible at once. It used to be a set of collapsible sections, which meant a
   * reader had to remember which heading hid the page they wanted and click to find out — the rail
   * answered a question by asking one. The grouping is still there and still comes from
   * `moduleGroups`; it is now carried by colour and a quiet heading rather than by hiding things.
   *
   * `expanded` is passed by the mobile drawer, which is full width even when the desktop rail is
   * collapsed to icons.
   */
  const renderGrouped = (onNavigate?: () => void, expanded = false) => (
    <>
      <ul className="space-y-0.5">{renderNav(layout.solo, "account", onNavigate, expanded)}</ul>
      {layout.groups.map((group) => {
        const labelKey = GROUP_LABEL_KEYS[group.key];
        return (
          <div key={group.key}>
            {/* A label, not a control: nothing here opens or closes. Hidden on the icon rail,
                where there is no room for it and the colours carry the grouping alone. */}
            {(!collapsed || expanded) && (
              <p className="ni-rail-heading">{labelKey ? t(labelKey) : group.key}</p>
            )}
            <ul className="space-y-0.5">{renderNav(group.modules, group.tone, onNavigate, expanded)}</ul>
          </div>
        );
      })}
    </>
  );

  const brand = (compact: boolean) => (
    <Link
      href="/"
      className="flex items-center gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]"
      aria-label="Zufishan home"
    >
      <BrandMark />
      {!compact && (
        <span className="min-w-0">
          <span className="block truncate font-display text-xl leading-none ni-t-ink">Zufishan</span>
        </span>
      )}
    </Link>
  );

  const sectionLabel = !collapsed && (
    <p className="mb-2 mt-8 px-3 text-[10px] font-bold uppercase tracking-[.2em] ni-t-gold">{deskLabel}</p>
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
          {/* Collapsed to icons there is no room for a heading, so the rail falls back to one flat
              list — every module, in registry order, exactly as it was before grouping. */}
          {/* Collapsed, the headings have no room — the coloured tiles are the grouping. */}
          {renderGrouped()}
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
                className="rounded-full bg-[var(--ni-sage-soft)] p-2 ni-t-sage-ink outline-none focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]"
              >
                <X size={18} />
              </button>
            </div>
            <p className="mb-2 mt-7 px-3 text-[10px] font-bold uppercase tracking-[.2em] ni-t-gold">{deskLabel}</p>
            <nav aria-label={`${deskLabel} navigation`} className="min-h-0 flex-1 overflow-y-auto">
              {/* The drawer is full width even when the desktop rail is collapsed. */}
              {renderGrouped(onCloseMobile, true)}
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
        className="hidden rounded-full bg-[var(--ni-sage-soft)] p-2 ni-t-sage-ink outline-none transition-colors hover:bg-[var(--ni-sage)] focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)] lg:inline-flex"
      >
        <PanelLeft size={18} className={collapsed ? "" : "icon-directional"} />
      </button>
      <button
        type="button"
        onClick={onToggleMobile}
        aria-expanded={mobileOpen}
        aria-controls="dashboard-sidebar"
        aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
        className="rounded-full bg-[var(--ni-sage-soft)] p-2 ni-t-sage-ink outline-none transition-colors hover:bg-[var(--ni-sage)] focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)] lg:hidden"
      >
        <PanelLeft size={18} />
      </button>
    </>
  );
}
