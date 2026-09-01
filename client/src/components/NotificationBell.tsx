/**
 * Header notification bell with an inline popover.
 *
 * Replaces the sidebar Notifications module: recent items open in place rather than navigating to
 * a separate page. Reads the same protected `scheduling.notifications` query the notifications page
 * uses, so nothing about persistence, RLS or ownership changes — only where the results surface.
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

export default function NotificationBell({ role }: { role: "learner" | "instructor" | "admin" }) {
  const { t, locale } = useLocale();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const query = trpc.scheduling.notifications.useQuery(undefined, { enabled: open, retry: false });
  const rows = query.data?.ok && isRows(query.data.data) ? query.data.data : [];
  const unread = rows.filter((row) => !row.read_at).length;

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
        className="relative rounded-full bg-[var(--ni-sage-soft)] p-2 text-[var(--ni-sage-ink)] outline-none transition-colors hover:bg-[var(--ni-sage)] focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]"
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
            <p className="text-xs font-bold uppercase tracking-[.16em] text-[var(--ni-gold-ink)]">{t("dashboard.notifications")}</p>
            {unread > 0 && <span className="text-[11px] font-bold text-[var(--ni-clay-ink)]">{unread}</span>}
          </div>

          <div className="max-h-[19rem] overflow-y-auto">
            {query.isLoading && <p className="px-4 py-6 text-sm text-[var(--ni-muted)]" aria-live="polite">{t("dashboard.loading")}</p>}
            {!query.isLoading && query.isError && (
              <p role="alert" className="px-4 py-6 text-sm text-[var(--ni-clay)]">{t("common.error")}</p>
            )}
            {!query.isLoading && !query.isError && rows.length === 0 && (
              <p className="px-4 py-6 text-sm leading-6 text-[var(--ni-muted)]">{t("dashboard.noNotifications")}</p>
            )}
            <ul>
              {rows.slice(0, 8).map((row) => (
                <li key={row.id} className={`border-b border-[var(--ni-sage)] last:border-b-0 ${row.read_at ? "" : "bg-[var(--ni-gold-tint)]"}`}>
                  <div className="px-4 py-3">
                    <p className="text-sm font-semibold text-[var(--ni-ink)]">{row.title}</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--ni-muted)]">{row.body}</p>
                    <p className="mt-1 text-[11px] text-[var(--ni-muted-soft)] ltr-embed">{formatted(row.created_at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="border-t border-[var(--ni-sage)] px-4 py-2.5">
            <Link
              href={`/dashboard/${role}/notifications`}
              onClick={() => setOpen(false)}
              className="text-xs font-bold text-[var(--ni-moss)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]"
            >
              {t("dashboard.viewAllNotifications")}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
