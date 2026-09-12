/**
 * Header notification bell with an inline popover.
 *
 * Replaces the sidebar Notifications module: recent items open in place rather than navigating to
 * a separate page.
 *
 * Two things were wrong. It read `scheduling.notifications`, the scheduling-only subset, so a new
 * message or a verification decision never reached the bell. And the badge counted unread rows
 * inside a query gated on `enabled: open`, so the count was always zero until the popover was
 * opened — a bell that could only tell you about unread items after you had already looked. The
 * count is now its own cheap `head: true` query that runs on load; the list still waits for a click.
 *
 * Both run on the caller's own client, where `notifications_own` scopes them to their own rows.
 */
import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Bell } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLocale } from "../contexts/LocaleContextState";

type NotificationRow = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

const isRows = (value: unknown): value is NotificationRow[] => Array.isArray(value);

export default function NotificationBell({ role, viewAllHref }: {
  role: "learner" | "instructor" | "admin";
  /**
   * Where "view all" goes. Defaults to that role's dashboard notifications page.
   * Pass `null` when no such page exists yet — an admin desk that is still being
   * assembled should show no link rather than one that lands on a placeholder.
   */
  viewAllHref?: string | null;
}) {
  const { t, locale } = useLocale();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const query = trpc.scheduling.inbox.useQuery(undefined, { enabled: open, retry: false });
  const unreadQuery = trpc.scheduling.unreadNotifications.useQuery(undefined, { retry: false });
  const rows = query.data?.ok && isRows(query.data.data) ? query.data.data : [];
  const unread = unreadQuery.data?.ok ? (unreadQuery.data.data as { unread: number }).unread : 0;

  // Close on outside click and on Escape; Escape returns focus to the trigger.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); buttonRef.current?.focus(); }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onPointer); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const formatted = (value: string) => {
    try { return new Date(value).toLocaleString(locale === "en" ? "en-GB" : locale === "ur" ? "ur-PK" : "ar", { dateStyle: "medium", timeStyle: "short" }); }
    catch { return value; }
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={unread > 0 ? `${t("dashboard.notifications")} (${unread})` : t("dashboard.notifications")}
        className="relative rounded-full bg-[var(--ni-sage-soft)] p-2 ni-t-sage-ink outline-none transition-colors hover:bg-[var(--ni-sage)] focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--ni-clay)] px-1 text-[10px] font-bold leading-none text-white"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t("dashboard.notifications")}
          className="absolute end-0 top-12 z-50 w-[20rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-[var(--ni-sage)] bg-[var(--ni-paper)] shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-[var(--ni-sage)] px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-[.16em] ni-t-gold">{t("dashboard.notifications")}</p>
            {unread > 0 && <span className="text-[11px] font-bold ni-t-clay-ink">{unread}</span>}
          </div>

          <div className="max-h-[19rem] overflow-y-auto">
            {query.isLoading && <p className="px-4 py-6 text-sm ni-t-muted" aria-live="polite">{t("dashboard.loading")}</p>}
            {!query.isLoading && query.isError && (
              <p role="alert" className="px-4 py-6 text-sm ni-t-clay">{t("common.error")}</p>
            )}
            {!query.isLoading && !query.isError && rows.length === 0 && (
              <p className="px-4 py-6 text-sm leading-6 ni-t-muted">{t("dashboard.noNotifications")}</p>
            )}
            <ul>
              {rows.slice(0, 8).map((row) => (
                <li key={row.id} className={`border-b border-[var(--ni-sage)] last:border-b-0 ${row.read_at ? "" : "bg-[var(--ni-gold-tint)]"}`}>
                  <div className="px-4 py-3">
                    <p className="text-sm font-semibold ni-t-ink">{row.title}</p>
                    <p className="mt-1 text-xs leading-5 ni-t-muted">{row.body}</p>
                    <p className="mt-1 text-[11px] ni-t-muted-soft ltr-embed">{formatted(row.created_at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {viewAllHref !== null && <div className="border-t border-[var(--ni-sage)] px-4 py-2.5">
            <Link
              href={viewAllHref ?? `/dashboard/${role}/notifications`}
              onClick={() => setOpen(false)}
              className="text-xs font-bold ni-t-moss outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]"
            >
              {t("dashboard.viewAllNotifications")}
            </Link>
          </div>}
        </div>
      )}
    </div>
  );
}
