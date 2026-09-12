/**
 * The admin desk chrome.
 *
 * Deliberately separate from `DashboardChrome`: that component keys off
 * `/dashboard/:role` and carries the learner/instructor quick links, and bending
 * it to also serve `/admin` would put the two surfaces' futures in one file. The
 * learner and instructor dashboards are untouched by anything here.
 *
 * Layout is flex, not a fixed-position sidebar, so Urdu and Arabic mirror for
 * free — every inset uses logical properties (`start`/`end`, `ms`/`me`) and
 * nothing is pinned to `left`. The header carries the same three global controls
 * as the learner desk, in the same order: language, theme, notifications.
 *
 * The visual language is the editorial one: warm ivory ground, near-white cards,
 * hairline rules, monospace micro-labels, small radii, gold as the primary
 * action and emerald as the active/verified voice. Every colour is a token, so
 * the dark theme follows without a second implementation.
 */
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { ChevronRight, LogOut, Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "../contexts/LocaleContextState";
import { useGsapReveal } from "../lib/use-gsap-reveal";
import { LocaleSelector } from "./LocaleSelector";
import ThemeToggle from "./ThemeToggle";
import NotificationBell from "./NotificationBell";
import OfflineBanner from "./OfflineBanner";
import { activeAdminNavKey, adminNav, type AdminNavItem } from "../lib/admin-nav";

const STORAGE_KEY = "noor-ilm-admin-sidebar";

function readCollapsed(): boolean {
  try { return window.localStorage.getItem(STORAGE_KEY) === "collapsed"; } catch { return false; }
}

/** One nav row. A link when the module exists, an announced disabled row when it does not. */
function NavRow({ item, active, collapsed, onNavigate }: {
  item: AdminNavItem; active: boolean; collapsed: boolean; onNavigate: () => void;
}) {
  const { t } = useLocale();
  const Icon = item.icon;
  const label = t(item.labelKey);

  const base = "group relative flex items-center gap-3 rounded-[7px] px-3 py-2.5 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]";

  if (!item.built) {
    return (
      <li>
        <span
          aria-disabled="true"
          title={t("adminDesk.inProgress")}
          className={`${base} cursor-not-allowed ni-t-muted-soft`}
        >
          <Icon size={17} aria-hidden="true" className="shrink-0" />
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 truncate">{label}</span>
              <span className="ni-label shrink-0 text-[.58rem] opacity-80">{t("adminDesk.inProgressShort")}</span>
            </>
          )}
          <span className="sr-only">{t("adminDesk.inProgress")}</span>
        </span>
      </li>
    );
  }

  return (
    <li>
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        title={collapsed ? label : undefined}
        className={`${base} ${
          active
            ? "bg-[var(--ni-sage-soft)] ni-t-moss-deep"
            : "ni-t-muted hover:bg-[var(--ni-sage-soft)] hover:text-[var(--ni-ink)]"
        }`}
      >
        {/* The active marker is an emerald hairline on the inline-start edge, which
            mirrors correctly in RTL because it is positioned with `start`. */}
        {active && <span aria-hidden="true" className="absolute inset-y-1.5 start-0 w-[2px] rounded-full bg-[var(--ni-moss)]" />}
        <Icon size={17} aria-hidden="true" className="shrink-0" />
        {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
      </Link>
    </li>
  );
}

export default function AdminShell({
  activeKey, eyebrow, title, copy, actions, children,
}: {
  /** Which nav entry this page belongs to; also drives the breadcrumb. */
  activeKey?: string;
  eyebrow: string;
  title: string;
  copy?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useLocale();
  const { user, logout } = useAuth();
  // One reveal for the whole desk: every admin page renders through this shell,
  // so the header and the page body fade in once rather than each of the twelve
  // pages carrying its own. Deliberately NOT applied per table row — animating
  // rows on an operations screen slows down scanning, which is the whole job.
  const reveal = useRef<HTMLDivElement | null>(null);
  useGsapReveal(reveal);
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerCloseRef = useRef<HTMLButtonElement | null>(null);

  const current = activeKey ?? activeAdminNavKey(location);

  // Choosing a destination closes the small-screen drawer; the desktop width is untouched.
  useEffect(() => { setDrawerOpen(false); }, [location]);

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, collapsed ? "collapsed" : "expanded"); } catch { /* preference is per-device and optional */ }
  }, [collapsed]);

  // Escape closes the drawer, and focus moves into it when it opens so keyboard
  // users are not left behind the overlay.
  useEffect(() => {
    if (!drawerOpen) return;
    drawerCloseRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setDrawerOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  const displayName = user?.name || user?.email?.split("@")[0] || t("adminDesk.administrator");
  const initials = displayName.slice(0, 2).toUpperCase();

  const navList = (mobile: boolean) => (
    <ul className="space-y-0.5">
      {adminNav.map((item) => (
        <NavRow
          key={item.key}
          item={item}
          active={item.key === current}
          collapsed={collapsed && !mobile}
          onNavigate={() => setDrawerOpen(false)}
        />
      ))}
    </ul>
  );

  const brand = (collapsedNow: boolean) => (
    <div className="flex items-center gap-2.5">
      <span aria-hidden="true" className="ni-mark ni-t-gold text-[1.5rem]"><i /><i /><i /><i /></span>
      {!collapsedNow && (
        <span className="min-w-0">
          <span className="block truncate font-display text-lg leading-tight ni-t-ink">{t("brand.name")}</span>
          <span className="ni-label block truncate">{t("adminDesk.brandLine")}</span>
        </span>
      )}
    </div>
  );

  return (
    <div className="admin-shell min-h-screen bg-[var(--ni-bg)]">
      {/* The colour is set on the element rather than through a `focus:` variant:
          `ni-t-ink` is a plain CSS class, not a Tailwind utility, so Tailwind
          cannot generate a focus variant for it and `focus:ni-t-ink` would be an
          inert class name. */}
      <a
        href="#admin-main"
        style={{ color: "var(--ni-ink)" }}
        className="sr-only focus:not-sr-only focus:absolute focus:start-3 focus:top-3 focus:z-50 focus:rounded-[7px] focus:bg-[var(--ni-paper)] focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:ring-2 focus:ring-[var(--ni-moss)]"
      >
        {t("adminDesk.skipToContent")}
      </a>

      <div className="flex min-h-screen">
        {/* ---- Desktop rail ---- */}
        <aside
          aria-label={t("adminDesk.navLabel")}
          className={`hidden shrink-0 border-e border-[var(--ni-sage)] bg-[var(--ni-field)] lg:flex lg:flex-col ${collapsed ? "w-[4.75rem]" : "w-[16.5rem]"}`}
        >
          <div className={`flex items-center gap-2 border-b border-[var(--ni-sage)] px-4 py-4 ${collapsed ? "justify-center" : "justify-between"}`}>
            <Link href="/admin" className="min-w-0 rounded-[7px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]">
              {brand(collapsed)}
            </Link>
            {!collapsed && (
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                aria-label={t("adminDesk.collapseNav")}
                className="rounded-[7px] p-1.5 ni-t-muted outline-none hover:bg-[var(--ni-sage-soft)] focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]"
              >
                <PanelLeftClose size={17} aria-hidden="true" className="rtl:-scale-x-100" />
              </button>
            )}
          </div>

          {collapsed && (
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              aria-label={t("adminDesk.expandNav")}
              className="mx-auto mt-3 rounded-[7px] p-1.5 ni-t-muted outline-none hover:bg-[var(--ni-sage-soft)] focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]"
            >
              <PanelLeftOpen size={17} aria-hidden="true" className="rtl:-scale-x-100" />
            </button>
          )}

          <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4">{navList(false)}</nav>

          {!collapsed && (
            <div className="border-t border-[var(--ni-sage)] p-3">
              <p className="rounded-[9px] bg-[var(--ni-sage-soft)] px-3 py-3 text-[11px] leading-5 ni-t-muted">
                {t("adminDesk.privacyNote")}
              </p>
            </div>
          )}
        </aside>

        {/* ---- Drawer (small screens) ---- */}
        {drawerOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            {/* --ni-overlay is a gradient, so it has to go through the background
                shorthand; background-color would silently drop it and leave the
                scrim invisible. */}
            <button
              type="button"
              aria-label={t("adminDesk.closeNav")}
              onClick={() => setDrawerOpen(false)}
              style={{ background: "var(--ni-overlay)" }}
              className="absolute inset-0"
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label={t("adminDesk.navLabel")}
              className="absolute inset-y-0 start-0 flex w-[17rem] max-w-[86vw] flex-col border-e border-[var(--ni-sage)] bg-[var(--ni-field)] shadow-xl"
            >
              <div className="flex items-center justify-between border-b border-[var(--ni-sage)] px-4 py-4">
                {brand(false)}
                <button
                  ref={drawerCloseRef}
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  aria-label={t("adminDesk.closeNav")}
                  className="rounded-[7px] p-1.5 ni-t-muted outline-none hover:bg-[var(--ni-sage-soft)] focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]"
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
              <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4">{navList(true)}</nav>
            </div>
          </div>
        )}

        {/* ---- Main column ---- */}
        <div className="flex min-w-0 flex-1 flex-col">
          <OfflineBanner />

          <header className="sticky top-0 z-30 border-b border-[var(--ni-sage)] bg-[var(--ni-field)] px-4 py-3 lg:px-8">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  onClick={() => setDrawerOpen(true)}
                  aria-label={t("adminDesk.openNav")}
                  aria-expanded={drawerOpen}
                  className="rounded-[7px] p-2 ni-t-muted outline-none hover:bg-[var(--ni-sage-soft)] focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)] lg:hidden"
                >
                  <Menu size={18} aria-hidden="true" />
                </button>
                <nav aria-label={t("adminDesk.breadcrumbLabel")} className="flex min-w-0 items-center gap-1.5">
                  <Link href="/admin" className="ni-label rounded outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]">
                    {t("adminDesk.breadcrumbRoot")}
                  </Link>
                  <ChevronRight size={13} aria-hidden="true" className="shrink-0 ni-t-muted-soft rtl:-scale-x-100" />
                  <span aria-current="page" className="ni-label min-w-0 truncate ni-t-moss-deep">{eyebrow}</span>
                </nav>
              </div>

              {/* Language, theme and notifications — the same trio, same order, as the
                  learner and instructor desks, so the controls do not move between surfaces. */}
              <div className="flex shrink-0 items-center gap-2">
                <span className="hidden sm:inline-flex"><LocaleSelector compact /></span>
                <ThemeToggle />
                {/* No admin notifications page exists yet, so the popover shows the
                    real inbox and offers no link to a page that is not there. */}
                <NotificationBell role="admin" viewAllHref={null} />
                <span className="hidden items-center gap-2 rounded-full bg-[var(--ni-sage-soft)] py-1.5 pe-3 ps-1.5 text-xs font-bold ni-t-moss-deep md:inline-flex">
                  <span aria-hidden="true" className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--ni-moss)] text-[10px] text-white">{initials}</span>
                  <span className="max-w-[9rem] truncate">{displayName}</span>
                </span>
                <button
                  type="button"
                  onClick={logout}
                  className="rounded-[7px] p-2 ni-t-muted outline-none hover:bg-[var(--ni-sage-soft)] focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]"
                  aria-label={t("dashboard.logOut")}
                  title={t("dashboard.logOut")}
                >
                  <LogOut size={17} aria-hidden="true" className="rtl:-scale-x-100" />
                </button>
              </div>
            </div>
          </header>

          <main id="admin-main" className="min-w-0 flex-1">
            {/* The striped band is the reference's signature divider, rebuilt as a
                repeating gradient so it scales to any width with no image. */}
            <div aria-hidden="true" className="ni-stripe" />

            <div ref={reveal} className="mx-auto w-full max-w-[86rem] px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
              <div data-anim="intro" className="flex flex-col gap-5 border-b border-[var(--ni-sage)] pb-7 lg:flex-row lg:items-end lg:justify-between">
                <div className="min-w-0">
                  <p className="ni-label">{eyebrow}</p>
                  <h1 className="mt-2.5 font-display text-[clamp(1.9rem,3.4vw,2.7rem)] leading-[1.08] tracking-[-0.015em] ni-t-ink">{title}</h1>
                  {copy && <p className="mt-3 max-w-[68ch] text-sm leading-6 ni-t-muted">{copy}</p>}
                </div>
                {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
              </div>

              <div data-anim="intro" className="mt-7">{children}</div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
