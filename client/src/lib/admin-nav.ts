/**
 * The admin desk's navigation model.
 *
 * Kept as data rather than JSX so the shell, the breadcrumb and the overview's
 * quick actions all read the same list — a destination cannot be named in one
 * place and missing from another.
 *
 * `built` is the honest part. The desk is being assembled one module at a time,
 * and a nav item that silently lands on the overview would tell an operator a
 * page exists when it does not. Unbuilt destinations render as disabled items
 * that say so, and every link elsewhere in the desk checks the same flag before
 * it becomes a link.
 */
import {
  BookOpen, FileClock, Gauge, LayoutList, MessagesSquare, ScrollText,
  Newspaper, ServerCog, Settings, ShieldCheck, Star, Users,
} from "lucide-react";
import type { TranslationKey } from "@/i18n/catalog";

export type AdminNavItem = {
  key: string;
  href: string;
  labelKey: TranslationKey;
  icon: typeof Gauge;
  /** False until that module's build step lands. Never a link while false. */
  built: boolean;
};

export const adminNav: readonly AdminNavItem[] = [
  { key: "overview",     href: "/admin",               labelKey: "adminDesk.nav.overview",     icon: Gauge,          built: true },
  { key: "instructors",  href: "/admin/instructors",   labelKey: "adminDesk.nav.instructors",  icon: ShieldCheck,    built: true },
  { key: "courses",      href: "/admin/courses",       labelKey: "adminDesk.nav.courses",      icon: BookOpen,       built: true },
  { key: "users",        href: "/admin/users",         labelKey: "adminDesk.nav.users",        icon: Users,          built: true },
  { key: "content",      href: "/admin/content",       labelKey: "adminDesk.nav.content",      icon: LayoutList,     built: true },
  { key: "reviews",      href: "/admin/reviews",       labelKey: "adminDesk.nav.reviews",      icon: Star,           built: true },
  { key: "blog",         href: "/admin/blog",         labelKey: "adminDesk.nav.blog",         icon: Newspaper,      built: true },
  { key: "bookings",     href: "/admin/bookings",      labelKey: "adminDesk.nav.bookings",     icon: MessagesSquare, built: true },
  { key: "auditLogs",    href: "/admin/audit-logs",    labelKey: "adminDesk.nav.auditLogs",    icon: ScrollText,     built: true },
  { key: "systemStatus", href: "/admin/system-status", labelKey: "adminDesk.nav.systemStatus", icon: ServerCog,      built: true },
  { key: "settings",     href: "/admin/settings",      labelKey: "adminDesk.nav.settings",     icon: Settings,       built: true },
];

/** Icon for the audit trail, reused by the overview's activity panel. */
export const auditIcon = FileClock;

export function adminNavItem(key: string): AdminNavItem | undefined {
  return adminNav.find((item) => item.key === key);
}

/** True only when that module's page has actually been built. */
export function isAdminPageBuilt(key: string): boolean {
  return adminNavItem(key)?.built === true;
}

/**
 * The nav entry a path belongs to.
 *
 * Longest match wins, so `/admin/instructors/:id` highlights Instructors rather
 * than Overview — `/admin` is a prefix of everything and would otherwise always win.
 */
export function activeAdminNavKey(path: string): string {
  const matches = adminNav
    .filter((item) => path === item.href || path.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length);
  return matches[0]?.key ?? "overview";
}
