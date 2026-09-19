/**
 * Notifications, and the reader's own controls over them.
 *
 * The page this replaces read `scheduling.notifications`, which returns only the scheduling subset
 * of the table, so verification decisions, course decisions, new messages and session events were
 * written but never shown. It also did `const notes = persisted ?? []`, so a failed load rendered
 * as "nothing here" — the same conflation that made a broken tutor search look like an empty
 * marketplace. And `read_at` was never read or written, so nothing was ever unread and nothing
 * could be marked read.
 *
 * All three are fixed here by reading `scheduling.inbox` (the whole table for the caller), deriving
 * panel state through the shared helper, and calling `scheduling.markNotificationsRead`.
 *
 * Ownership is not enforced in this file and must not be: `listOwnNotifications`,
 * `countOwnUnread` and `markNotificationsRead` all run on the caller's own Supabase client, where
 * `notifications_own` and `notifications_own_update` scope every statement to `user_id = auth.uid()`.
 * There is deliberately no insert policy at all, so a notification can only be raised by the server
 * through the admin client — nobody can forge one for themselves or for anyone else.
 *
 * Email is a stored preference with no provider behind it. `emailDelivery()` reports that honestly
 * and the preferences screen says so, rather than letting someone switch on a channel that silently
 * does nothing.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Bell, Check, CheckCheck, Loader2, SlidersHorizontal } from "lucide-react";
import { trpc } from "../lib/trpc";
import { useAuth } from "../contexts/AuthContext";
import { useLocale } from "../contexts/LocaleContextState";
import ResultState from "./ResultState";
import { resultError, resultRows, resultState, type ResultState as State } from "../lib/result-state";
import { useOnlineStatus } from "../lib/use-online-status";

type Row = {
  id: string;
  type: string;
  title: string;
  body: string;
  related_entity_type: string | null;
  related_entity_id: string | null;
  read_at: string | null;
  created_at: string;
};

type Preferences = {
  email_enabled: boolean;
  class_reminders_enabled: boolean;
  message_notifications_enabled: boolean;
  course_updates_enabled: boolean;
  emailDelivery: { configured: boolean; missing: string[] };
};

/** The four switches, paired with the input field each one writes. */
const SWITCHES = [
  { column: "class_reminders_enabled", field: "classRemindersEnabled", label: "notifPrefs.classReminders", hint: "notifPrefs.classRemindersHint" },
  { column: "message_notifications_enabled", field: "messageNotificationsEnabled", label: "notifPrefs.messages", hint: "notifPrefs.messagesHint" },
  { column: "course_updates_enabled", field: "courseUpdatesEnabled", label: "notifPrefs.courseUpdates", hint: "notifPrefs.courseUpdatesHint" },
  { column: "email_enabled", field: "emailEnabled", label: "notifPrefs.email", hint: "notifPrefs.emailHint" },
] as const;

const panel = "rounded-[1.35rem] border border-[var(--ni-sage)] bg-[var(--ni-paper)] p-6";

function Shell({ role, eyebrow, title, copy, action, children }: {
  role: "learner" | "instructor";
  eyebrow: string; title: string; copy: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { t } = useLocale();
  return (
    <div className="min-h-screen bg-[var(--ni-bg)] ni-t-ink">
      <header className="border-b border-[var(--ni-sage)] bg-[var(--ni-paper)]">
        <div className="mx-auto flex min-w-0 max-w-4xl flex-wrap items-center gap-4 px-5 py-4 lg:px-8">
          <Link href={`/dashboard/${role}`} className="inline-flex items-center gap-2 text-sm font-bold ni-t-moss">
            <ArrowLeft size={15} className="rtl:rotate-180" aria-hidden="true" /> {t("dashboard.back")}
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full min-w-0 max-w-4xl px-5 py-12 lg:px-8 lg:py-16">
        <div className="flex flex-wrap items-start justify-end gap-4">{action}</div>
        {/* Modules open on their own content. `eyebrow` and `copy` are still accepted so no
            caller had to change, but nothing prints them; the heading stays for screen
            readers, since the sidebar names the module visually. */}
        <h1 className="sr-only">{title}</h1>
        {children}
      </main>
    </div>
  );
}

function useWhen() {
  const { locale } = useLocale();
  return (value: string) => {
    try {
      return new Date(value).toLocaleString(locale === "ur" ? "ur-PK" : locale === "ar" ? "ar" : "en-GB", { dateStyle: "medium", timeStyle: "short" });
    } catch {
      return value;
    }
  };
}

/* --------------------------------------------------------------------- list */

export function NotificationsPage({ instructor = false }: { instructor?: boolean }) {
  const { t } = useLocale();
  const { currentSession } = useAuth();
  const online = useOnlineStatus();
  const when = useWhen();
  const role = instructor ? "instructor" : "learner";
  const signedIn = Boolean(currentSession);

  const query = trpc.scheduling.inbox.useQuery(undefined, { enabled: signedIn, retry: false });
  const unreadQuery = trpc.scheduling.unreadNotifications.useQuery(undefined, { enabled: signedIn, retry: false });
  const markRead = trpc.scheduling.markNotificationsRead.useMutation();

  const [unreadOnly, setUnreadOnly] = useState(false);
  const [failure, setFailure] = useState("");
  const [busyId, setBusyId] = useState("");

  const all = resultRows<Row>(query as never);
  const unread = useMemo(() => all.filter((row) => !row.read_at).length, [all]);
  const rows = unreadOnly ? all.filter((row) => !row.read_at) : all;

  const base = resultState(query as never, online);
  // Filtering to unread can empty a list that loaded perfectly well; that is still an empty panel,
  // but the copy has to explain the filter rather than claim there is nothing at all.
  const state: State = base === "ready" && !rows.length ? "empty" : base;

  /**
   * Opening the module marks what it shows as read.
   *
   * The badge counts `read_at is null`, so reading the list had to write that column
   * or the count would survive the visit and the bell would keep claiming unread items
   * the reader had already seen. `markNotificationsRead` is the existing procedure and
   * runs on the caller's own client, so a reader can only ever clear their OWN rows.
   *
   * `done` guards it to once per visit: the mutation refetches the list, which would
   * otherwise re-trigger this effect. Rows stay in the history — being read is a column
   * on them, not a deletion — and the `unreadOnly` filter still works afterwards.
   */
  const done = useRef(false);
  useEffect(() => {
    if (done.current || !signedIn || base !== "ready" || unread === 0) return;
    done.current = true;
    void mark();
    // `mark` is stable enough for this one-shot: re-running on its identity would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, base, unread]);

  const mark = async (notificationId?: string) => {
    setFailure("");
    setBusyId(notificationId ?? "all");
    try {
      const result = await markRead.mutateAsync(notificationId ? { notificationId } : {});
      if (!result.ok) { setFailure(result.error); return; }
      await Promise.all([query.refetch(), unreadQuery.refetch()]);
    } catch {
      setFailure(t("notifications.markFailed"));
    } finally {
      setBusyId("");
    }
  };

  if (!signedIn) {
    return (
      <Shell role={role} eyebrow={t("dashboard.notifications")} title={t("notifications.title")} copy={t("notifications.copy")}>
        <div className="mt-8"><ResultState state="forbidden" message={t("messaging.unauthorized")} /></div>
      </Shell>
    );
  }

  return (
    <Shell
      role={role}
      eyebrow={t("dashboard.notifications")}
      title={t("notifications.title")}
      copy={t("notifications.copy")}
      action={
        <Link
          href={`/dashboard/${role}/notifications/preferences`}
          className="inline-flex items-center gap-2 rounded-full border border-[var(--ni-sage-mid)] px-4 py-2.5 text-sm font-bold ni-t-moss"
        >
          <SlidersHorizontal size={15} aria-hidden="true" /> {t("notifPrefs.title")}
        </Link>
      }
    >
      <div className="mt-8 space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          {/* A pressed toggle, not a link, because it filters the list in place. */}
          <button
            type="button"
            onClick={() => setUnreadOnly((value) => !value)}
            aria-pressed={unreadOnly}
            className={`rounded-full px-4 py-2 text-xs font-bold ${unreadOnly ? "bg-[var(--ni-moss)] text-white" : "border border-[var(--ni-sage-mid)] ni-t-moss"}`}
          >
            {t("notifications.unreadOnly")}{unread > 0 ? ` (${unread})` : ""}
          </button>

          <button
            type="button"
            onClick={() => mark()}
            disabled={unread === 0 || markRead.isPending}
            aria-busy={busyId === "all"}
            className="inline-flex items-center gap-2 rounded-full border border-[var(--ni-sage-mid)] px-4 py-2 text-xs font-bold ni-t-moss disabled:opacity-50"
          >
            {busyId === "all" ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <CheckCheck size={14} aria-hidden="true" />}
            {t("notifications.markAllRead")}
          </button>
        </div>

        {failure && (
          <p role="alert" className="flex flex-wrap items-center gap-2 rounded-xl bg-[var(--ni-clay-soft)] px-4 py-3 text-sm ni-t-clay">
            {failure}
            <button type="button" onClick={() => mark()} className="font-bold underline">{t("common.retry")}</button>
          </p>
        )}

        {state !== "ready" && (
          <ResultState
            state={state}
            message={state === "empty" ? t(unreadOnly ? "notifications.noneUnread" : "dashboard.noNotifications") : resultError(query as never)}
            onRetry={() => query.refetch()}
            retrying={query.isFetching}
          />
        )}

        {state === "ready" && (
          <ul className="space-y-3">
            {rows.map((row) => (
              <li key={row.id}>
                <article className={`${panel} ${row.read_at ? "" : "border-s-4 border-s-[var(--ni-moss)]"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 gap-3">
                      <Bell size={17} className={row.read_at ? "mt-1 shrink-0 ni-t-muted-soft" : "mt-1 shrink-0 ni-t-moss"} aria-hidden="true" />
                      <div className="min-w-0">
                        <h2 className={`text-base ${row.read_at ? "font-semibold ni-t-muted" : "font-bold ni-t-ink"}`}>
                          {row.title}
                          {/* The unread state is carried in text too, not by weight and colour alone. */}
                          {!row.read_at && <span className="sr-only"> — {t("notifications.unreadLabel")}</span>}
                        </h2>
                        <p className="mt-1 text-sm leading-6 ni-t-muted">{row.body}</p>
                        <p className="mt-2 text-[11px] ni-t-muted-soft ltr-embed">{when(row.created_at)}</p>
                      </div>
                    </div>

                    {!row.read_at && (
                      <button
                        type="button"
                        onClick={() => mark(row.id)}
                        disabled={markRead.isPending}
                        aria-busy={busyId === row.id}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--ni-sage-line)] px-3 py-1.5 text-[11px] font-bold ni-t-moss-deep disabled:opacity-50"
                      >
                        {busyId === row.id ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : <Check size={12} aria-hidden="true" />}
                        {t("notifications.markRead")}
                      </button>
                    )}
                  </div>
                </article>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Shell>
  );
}

/* -------------------------------------------------------------- preferences */

export function NotificationPreferencesPage({ instructor = false }: { instructor?: boolean }) {
  const { t } = useLocale();
  const { currentSession } = useAuth();
  const online = useOnlineStatus();
  const role = instructor ? "instructor" : "learner";
  const signedIn = Boolean(currentSession);

  const query = trpc.scheduling.notificationPreferences.useQuery(undefined, { enabled: signedIn, retry: false });
  const save = trpc.scheduling.updateNotificationPreferences.useMutation();

  const [pending, setPending] = useState("");
  const [failure, setFailure] = useState("");
  const [saved, setSaved] = useState("");

  const preferences = query.data?.ok ? (query.data.data as unknown as Preferences) : null;
  const state = resultState(query as never, online);

  const toggle = async (field: string, column: string, next: boolean) => {
    setFailure(""); setSaved(""); setPending(column);
    try {
      const result = await save.mutateAsync({ [field]: next } as never);
      if (!result.ok) { setFailure(result.error); return; }
      // Refetch rather than assume: the row that comes back is what was actually stored.
      await query.refetch();
      setSaved(column);
    } catch {
      setFailure(t("notifPrefs.saveFailed"));
    } finally {
      setPending("");
    }
  };

  if (!signedIn) {
    return (
      <Shell role={role} eyebrow={t("dashboard.notifications")} title={t("notifPrefs.title")} copy={t("notifPrefs.copy")}>
        <div className="mt-8"><ResultState state="forbidden" message={t("messaging.unauthorized")} /></div>
      </Shell>
    );
  }

  return (
    <Shell role={role} eyebrow={t("dashboard.notifications")} title={t("notifPrefs.title")} copy={t("notifPrefs.copy")}>
      <div className="mt-8 space-y-5">
        {state !== "ready" && (
          <ResultState
            state={state}
            message={resultError(query as never)}
            onRetry={() => query.refetch()}
            retrying={query.isFetching}
          />
        )}

        {failure && (
          <p role="alert" className="rounded-xl bg-[var(--ni-clay-soft)] px-4 py-3 text-sm ni-t-clay">{failure}</p>
        )}

        {state === "ready" && preferences && (
          <>
            {/* The switch is stored either way; what is not true is that an email would be sent. */}
            {!preferences.emailDelivery.configured && (
              <ResultState state="setup" message={t("notifPrefs.emailNotConnected")} />
            )}

            <div className={`${panel} divide-y divide-[var(--ni-sage)]`}>
              {SWITCHES.map(({ column, field, label, hint }) => {
                const value = Boolean(preferences[column as keyof Preferences]);
                const busy = pending === column;
                return (
                  <div key={column} className="flex flex-wrap items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
                    <div className="min-w-0 max-w-[46ch]">
                      <p className="text-sm font-bold ni-t-moss-deep">{t(label)}</p>
                      <p className="mt-1 text-xs leading-5 ni-t-muted">{t(hint)}</p>
                      {saved === column && <p role="status" className="mt-1 text-xs font-bold ni-t-moss">{t("common.saved")}</p>}
                    </div>

                    {/* A real checkbox with a switch role, so it is operable by keyboard and announced. */}
                    <label className="inline-flex shrink-0 cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        role="switch"
                        checked={value}
                        disabled={busy || save.isPending}
                        aria-busy={busy}
                        onChange={(event) => toggle(field, column, event.target.checked)}
                        className="h-5 w-5 accent-[var(--ni-moss)]"
                      />
                      <span className="text-xs font-bold ni-t-muted">
                        {busy ? t("notifPrefs.saving") : value ? t("notifPrefs.on") : t("notifPrefs.off")}
                      </span>
                    </label>
                  </div>
                );
              })}
            </div>

            <p className="text-xs leading-5 ni-t-muted-soft">{t("notifPrefs.alwaysOnCopy")}</p>
          </>
        )}
      </div>
    </Shell>
  );
}
