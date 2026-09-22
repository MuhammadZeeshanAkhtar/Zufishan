/**
 * The Schedule module.
 *
 * What stood here was a flat list built from `class_sessions` and a pill reading "Calendar view ·
 * coming soon" — and for most accounts the list was empty, because a lesson lives in
 * `trial_requests` and `bookings` long before anybody opens a room. `listScheduleEntries` merges
 * the three tables; this draws them.
 *
 * Three decisions worth stating.
 *
 *  - **The grid is drawn in the reader's own timezone**, using plain local `Date` arithmetic,
 *    because the browser's local calendar *is* the reader's calendar. A lesson agreed for 21:30 in
 *    Karachi and read from London belongs on the London day the reader would look for it on. The
 *    other person's time is printed on the card underneath, so nobody has to do the subtraction.
 *  - **An empty month still draws a calendar.** A person opening Schedule wants to see their
 *    month, and a blank panel saying "nothing found" hides the one thing they came for. So the
 *    grid always renders; only the day panel says there is nothing on it.
 *  - **Colour carries the kind.** A class, a confirmed booking and an invite still being arranged
 *    are three different degrees of certainty, and they take the rail's blue, green and gold — the
 *    same five tones the sidebar uses, so one colour means one thing across the product.
 *
 * The teacher's published weekly hours are drawn as a hairline under the weekdays they cover. It
 * is a hint, not a claim: a published hour and a free hour are different facts, and this never
 * says a day is free.
 */
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Video } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useLocale } from "../contexts/LocaleContextState";
import LearnerAvatar from "./LearnerAvatar";
import ResultState from "./ResultState";
import { resultError, resultState } from "../lib/result-state";
import { useOnlineStatus } from "../lib/use-online-status";
import { trpc } from "../lib/trpc";
import { supabaseClient } from "../lib/supabase-client";
import type { TranslationKey } from "@/i18n/catalog";

type EntryKind = "session" | "booking" | "trial";

type Person = {
  id: string; displayName: string | null; avatarUrl: string | null;
  country: string | null; timezone: string | null; gender: string | null; preferredLanguage: string | null;
};

type Entry = {
  id: string; kind: EntryKind; title: string; subject: string; status: string;
  startAt: string; endAt: string; learnerTimezone: string; instructorTimezone: string;
  counterpartId: string; person: Person | null;
  sessionId: string | null; bookingId: string | null; trialRequestId: string | null;
};

type Availability = { weekday: number; startLocal: string; endLocal: string; timezone: string };

/** How each kind is named and tinted. One entry per kind, so none can be missed. */
const KIND: Record<EntryKind, { label: TranslationKey; tone: string }> = {
  session: { label: "schedule.kindSession", tone: "session" },
  booking: { label: "schedule.kindBooking", tone: "booking" },
  trial: { label: "schedule.kindTrial", tone: "trial" },
};

/** A day, identified by the reader's own local calendar rather than by a UTC instant. */
const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

/** The Monday on or before a date. `getDay()` is Sunday-first; the grid is not. */
function weekStart(date: Date) {
  return addDays(date, -((date.getDay() + 6) % 7));
}

/** The reader's own zone, for saying which zone the times are in. */
function viewerZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
}

export default function ScheduleCalendar({ role }: { role: "learner" | "instructor" }) {
  const { t, locale } = useLocale();
  const { currentSession } = useAuth();
  const online = useOnlineStatus();
  const realMode = Boolean(supabaseClient && currentSession);

  const today = useMemo(() => startOfDay(new Date()), []);
  const [anchor, setAnchor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState(() => dayKey(today));

  /* Six weeks from the Monday on or before the first of the month: the same 42 cells every month,
     so the grid never changes height as you page through it. */
  const grid = useMemo(() => {
    const first = weekStart(anchor);
    return Array.from({ length: 42 }, (_, index) => addDays(first, index));
  }, [anchor]);

  const range = useMemo(() => ({
    fromIso: grid[0].toISOString(),
    toIso: addDays(grid[41], 1).toISOString(),
  }), [grid]);

  const query = trpc.scheduling.scheduleCalendar.useQuery(
    { role, fromIso: range.fromIso, toIso: range.toIso },
    { enabled: realMode },
  );

  const payload = query.data?.ok ? query.data.data : null;
  const entries = (payload?.entries ?? []) as Entry[];
  const availability = (payload?.availability ?? []) as Availability[];

  /* `resultState` reports "empty" for an empty list, and an empty month is not an empty state —
     it is a calendar with nothing on it, which is worth drawing. Only a genuine failure, a missing
     configuration or a refusal replaces the grid. */
  const state = resultState(query as never, online);
  const broken = state === "loading" || state === "error" || state === "offline" || state === "setup" || state === "forbidden";

  /** Entries bucketed by the local day they fall on, so a cell is one map lookup. */
  const byDay = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const entry of entries) {
      const start = new Date(entry.startAt);
      if (Number.isNaN(start.getTime())) continue;
      const key = dayKey(start);
      const held = map.get(key);
      if (held) held.push(entry); else map.set(key, [entry]);
    }
    return map;
  }, [entries]);

  /** The weekdays the teacher has published hours on, as `getDay()` numbers. */
  const openWeekdays = useMemo(() => new Set(availability.map((slot) => slot.weekday)), [availability]);

  const time = (value: string, zone?: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    try {
      return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: zone }).format(date);
    } catch {
      // An unknown zone name on a row must not blank the card it is printed on.
      return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
    }
  };

  const weekdayNames = useMemo(() => {
    const format = new Intl.DateTimeFormat(locale, { weekday: "short" });
    // Any known Monday; only the weekday is read off it.
    const monday = new Date(2024, 0, 1);
    return Array.from({ length: 7 }, (_, index) => format.format(addDays(monday, index)));
  }, [locale]);

  const selectedDate = useMemo(() => grid.find((day) => dayKey(day) === selected) ?? today, [grid, selected, today]);
  const selectedEntries = byDay.get(selected) ?? [];

  const goMonth = (step: number) => {
    const next = new Date(anchor.getFullYear(), anchor.getMonth() + step, 1);
    setAnchor(next);
    // The selection follows the month, so the panel below never describes a day off the grid.
    setSelected(dayKey(next.getFullYear() === today.getFullYear() && next.getMonth() === today.getMonth() ? today : next));
  };

  /** Where "open" leads, from most concrete to least. */
  const hrefFor = (entry: Entry) => {
    if (entry.sessionId) return `/classroom/${entry.sessionId}/waiting-room`;
    if (entry.bookingId) return `/dashboard/${role}/bookings`;
    if (entry.trialRequestId) {
      return role === "instructor"
        ? `/dashboard/instructor/trial-requests/${entry.trialRequestId}`
        : `/dashboard/learner/trial-lessons/${entry.trialRequestId}`;
    }
    return `/dashboard/${role}/sessions`;
  };
  const openLabel = (entry: Entry): TranslationKey => {
    if (entry.sessionId) return "schedule.openRoom";
    if (entry.bookingId) return "booking.openBooking";
    return "schedule.openInvite";
  };

  return (
    <main className="mx-auto max-w-6xl px-5 py-10 lg:px-8 lg:py-14">
      <h1 className="sr-only">{t(role === "instructor" ? "schedule.titleInstructor" : "schedule.titleLearner")}</h1>

      {/* ---- Month header: where you are, and the two ways out of it ---- */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => goMonth(-1)}
            aria-label={t("schedule.prevMonth")}
            className="ni-btn ni-btn--outline h-9 w-9 justify-center p-0"
          >
            <ChevronLeft size={16} aria-hidden="true" className="rtl:-scale-x-100" />
          </button>
          <p className="min-w-[10rem] text-center font-display text-2xl ni-t-ink">
            {new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(anchor)}
          </p>
          <button
            type="button"
            onClick={() => goMonth(1)}
            aria-label={t("schedule.nextMonth")}
            className="ni-btn ni-btn--outline h-9 w-9 justify-center p-0"
          >
            <ChevronRight size={16} aria-hidden="true" className="rtl:-scale-x-100" />
          </button>
          <button
            type="button"
            onClick={() => { setAnchor(new Date(today.getFullYear(), today.getMonth(), 1)); setSelected(dayKey(today)); }}
            className="ni-btn ni-btn--outline ms-1 text-sm"
          >
            {t("schedule.today")}
          </button>
        </div>

        {/* The legend is the whole key to the grid, so it sits beside it, not in a tooltip. */}
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold ni-t-muted">
          {(Object.keys(KIND) as EntryKind[]).map((kind) => (
            <li key={kind} className="flex items-center gap-1.5">
              <span className={`ni-cal-swatch ni-cal-swatch--${KIND[kind].tone}`} aria-hidden="true" />
              {t(KIND[kind].label)}
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-2 text-xs ni-t-muted">
        {t("schedule.inYourZone")} <span className="ltr-embed font-semibold">{viewerZone()}</span>
      </p>

      {broken ? (
        <div className="mt-8">
          <ResultState
            state={state === "loading" ? "loading" : (state as "error" | "offline" | "setup" | "forbidden")}
            message={resultError(query as never)}
            onRetry={() => query.refetch()}
            retrying={query.isFetching}
          />
        </div>
      ) : (
        <>
          {/* ---- The grid ---- */}
          <div className="mt-6">
            <div className="ni-cal-grid mb-1.5">
              {weekdayNames.map((name) => (
                <p key={name} className="text-center text-[10px] font-bold uppercase tracking-[.1em] ni-t-muted">{name}</p>
              ))}
            </div>
            <div className="ni-cal-grid">
              {grid.map((day) => {
                const key = dayKey(day);
                const items = byDay.get(key) ?? [];
                const outside = day.getMonth() !== anchor.getMonth();
                const classes = [
                  "ni-cal-cell",
                  outside ? "ni-cal-cell--outside" : "",
                  key === dayKey(today) ? "ni-cal-cell--today" : "",
                  key === selected ? "ni-cal-cell--selected" : "",
                ].filter(Boolean).join(" ");
                return (
                  <button type="button" key={key} onClick={() => setSelected(key)} className={classes} aria-pressed={key === selected}>
                    <span className="ni-cal-daynum">{new Intl.NumberFormat(locale).format(day.getDate())}</span>
                    {/* Published hours on this weekday: a hairline, and only for a teacher. */}
                    {role === "instructor" && openWeekdays.has(day.getDay()) && items.length === 0 && (
                      <span className="ni-cal-free" aria-hidden="true" />
                    )}
                    {items.slice(0, 2).map((entry) => (
                      <span key={entry.id} className={`ni-cal-chip ni-cal-chip--${KIND[entry.kind].tone}`}>
                        <span className="ltr-embed">{time(entry.startAt)}</span> {entry.subject}
                      </span>
                    ))}
                    {items.length > 2 && (
                      <span className="text-[10px] font-bold ni-t-muted">
                        {t("schedule.more", { count: items.length - 2 })}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ---- The selected day ---- */}
          <section className="mt-8">
            <h2 className="font-display text-xl ni-t-ink">
              {new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(selectedDate)}
            </h2>

            {selectedEntries.length === 0 ? (
              <div className="ni-ed-card mt-3 p-5">
                <CalendarDays size={20} aria-hidden="true" className="ni-t-muted" />
                <p className="mt-3 text-sm ni-t-muted">{t("schedule.nothingOnDay")}</p>
                <Link
                  href={role === "instructor" ? "/dashboard/instructor/availability" : "/dashboard/learner/teachers"}
                  className="ni-btn ni-btn--outline mt-4 text-sm"
                >
                  {t(role === "instructor" ? "schedule.setHours" : "schedule.findTeacher")}
                </Link>
              </div>
            ) : (
              <ul className="mt-3 grid gap-3 md:grid-cols-2">
                {selectedEntries.map((entry) => {
                  const theirZone = role === "learner" ? entry.instructorTimezone : entry.learnerTimezone;
                  const ownZone = role === "learner" ? entry.learnerTimezone : entry.instructorTimezone;
                  return (
                    <li key={entry.id} className={`ni-ed-card ni-cal-edge--${KIND[entry.kind].tone} p-4`}>
                      <div className="flex items-start gap-3">
                        <LearnerAvatar
                          avatarUrl={entry.person?.avatarUrl ?? null}
                          gender={entry.person?.gender ?? null}
                          /* This account is already part of the lesson, so the other person's
                             name is theirs to read here. */
                          profilePublic
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-display text-lg ni-t-moss">
                            {entry.person?.displayName || t("findStudents.anonymousLearner")}
                          </p>
                          <p className="truncate text-sm ni-t-muted">{entry.subject || entry.title}</p>
                        </div>
                        <span className="ni-verify shrink-0">{t(KIND[entry.kind].label)}</span>
                      </div>

                      <dl className="mt-3 space-y-1 border-t border-[var(--ni-sage-line)] pt-3 text-xs">
                        <div>
                          <dt className="inline font-semibold ni-t-ink">{t("booking.yourTime")}: </dt>
                          <dd className="inline ni-t-muted ltr-embed">
                            <Clock3 size={11} aria-hidden="true" className="me-1 inline" />
                            {time(entry.startAt)} – {time(entry.endAt)}
                          </dd>
                        </div>
                        {theirZone && theirZone !== ownZone && (
                          <div>
                            <dt className="inline font-semibold ni-t-ink">{t("schedule.theirTime")}: </dt>
                            <dd className="inline ni-t-muted ltr-embed">
                              {time(entry.startAt, theirZone)} · {theirZone}
                            </dd>
                          </div>
                        )}
                        <div>
                          <dt className="inline font-semibold ni-t-ink">{t("schedule.status")}: </dt>
                          <dd className="inline ni-t-muted">{entry.status.replaceAll("_", " ")}</dd>
                        </div>
                      </dl>

                      {/* The camera glyph points somewhere, so it mirrors in Arabic and Urdu. */}
                      <Link href={hrefFor(entry)} className="ni-btn ni-btn--outline mt-3.5 text-sm">
                        {entry.sessionId && <Video size={13} aria-hidden="true" className="icon-directional"/>}
                        {t(openLabel(entry))}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* ---- A teacher's published week, beside the month it shapes ---- */}
          {role === "instructor" && (
            <section className="mt-9">
              <h2 className="font-display text-xl ni-t-ink">{t("schedule.weeklyHours")}</h2>
              {availability.length === 0 ? (
                <div className="ni-ed-card mt-3 p-5">
                  <p className="text-sm ni-t-muted">{t("schedule.noWeeklyHours")}</p>
                  <Link href="/dashboard/instructor/availability" className="ni-btn ni-btn--primary mt-4 text-sm">
                    {t("schedule.setHours")}
                  </Link>
                </div>
              ) : (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {availability.map((slot) => (
                    <li key={`${slot.weekday}-${slot.startLocal}-${slot.endLocal}`} className="ni-verify">
                      {weekdayNames[(slot.weekday + 6) % 7]}{" "}
                      <span className="ltr-embed">{slot.startLocal.slice(0, 5)}–{slot.endLocal.slice(0, 5)}</span>{" "}
                      <span className="ltr-embed opacity-70">{slot.timezone}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}
    </main>
  );
}
