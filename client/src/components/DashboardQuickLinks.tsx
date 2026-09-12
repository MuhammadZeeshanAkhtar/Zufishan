/**
 * Prominent role-specific actions, pinned directly under the dashboard header.
 *
 * These are the few things each role reaches for constantly, so they sit above the fold on every
 * dashboard page rather than being buried in the sidebar. The sidebar keeps the full module list;
 * this strip is deliberately short — adding to it dilutes it.
 *
 * Nothing here is a new destination: every link points at a route that already exists and is
 * already guarded for that role. The AI Tutor moved here from the student sidebar, which changes
 * where students click, not what the feature is.
 */
import { Link, useLocation } from "wouter";
import { CalendarDays, GraduationCap, MessageSquare, Sparkles, UserSearch, type LucideIcon } from "lucide-react";
import type { DashboardRole } from "./DashboardSidebar";

type QuickLink = { label: string; href: string; icon: LucideIcon };

const QUICK_LINKS: Partial<Record<DashboardRole, QuickLink[]>> = {
  learner: [
    { label: "Find Quran Teacher", href: "/dashboard/learner/teachers", icon: GraduationCap },
    { label: "Messages", href: "/dashboard/learner/messages", icon: MessageSquare },
    { label: "AI Tutor", href: "/dashboard/learner/ai-tutor", icon: Sparkles },
  ],
  instructor: [
    { label: "Find Students", href: "/dashboard/instructor/students", icon: UserSearch },
    { label: "Schedule", href: "/dashboard/instructor/schedule", icon: CalendarDays },
    { label: "Messages", href: "/dashboard/instructor/messages", icon: MessageSquare },
  ],
};

export default function DashboardQuickLinks({ role }: { role: DashboardRole }) {
  const [location] = useLocation();
  const links = QUICK_LINKS[role];
  if (!links?.length) return null;

  return (
    <nav
      aria-label="Primary"
      className="flex min-w-0 items-center gap-1.5 overflow-x-auto"
    >
      {links.map(({ label, href, icon: Icon }) => {
        const active = location === href || location.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={[
              "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold",
              "outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]",
              active
                ? "bg-[var(--ni-moss)] text-[var(--ni-paper)]"
                : "ni-t-moss-deep hover:bg-[var(--ni-sage-soft)]",
            ].join(" ")}
          >
            <Icon size={15} strokeWidth={1.9} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
