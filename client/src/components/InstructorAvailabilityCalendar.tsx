/**
 * The week of open times on a teacher's public profile.
 *
 * Every cell is a slot the server said is open: inside the instructor's published availability,
 * past the minimum notice period, and not overlapping a session or booking once both buffers are
 * applied. Nothing here invents a time, and an empty week is rendered as an empty week rather than
 * as a grid of tempting green cells.
 *
 * Times are shown in the READER's timezone, because that is the only one they can act on, with the
 * zone named so there is no guessing. The instructor's own timezone travels with each slot and is
 * shown on the one the reader picks, so both sides of a booking are legible before it is sent.
 *
 * The range asked for is the displayed week plus a day either side: the server walks dates in the
 * instructor's timezone, so a slot that belongs to Monday for the reader can belong to Sunday or
 * Tuesday there. The extra days are bucketed by the reader's own dates and anything outside the
 * week is dropped.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "../contexts/LocaleContextState";

type Slot = { startAt: string; endAt: string; instructorTimezone: string; learnerTimezone: string; durationMinutes: number };

const DAY_MS = 86_400_000;
const DURATIONS = [30, 45, 60] as const;
/** Roughly the card's height: below this much room above a cell, it opens downwards instead. */
const CARD_CLEARANCE = 200;

/** YYYY-MM-DD as the calendar reads in this timezone, which is what the server's range expects. */
function dayKey(value: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}

/** HH:mm, 24-hour, so rows sort as strings and one row means one clock time. */
function timeKey(value: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false }).format(value);
}

/** A stored zone is only trusted once the runtime confirms it; anything else falls back to UTC. */
function validZone(value: string | null | undefined) {
  if (!value) return null;
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(); return value; } catch { return null; }
}

function shiftDays(isoDate: string, days: number) {
  return new Date(new Date(`${isoDate}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

export default function InstructorAvailabilityCalendar({ slug, instructorName, instructorTimezone }: { slug: string; instructorName: string; instructorTimezone: string }) {
  const { t, formatDate, formatNumber } = useLocale();
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [weekOffset, setWeekOffset] = useState(0);
  const [duration, setDuration] = useState<number>(30);
  const [picked, setPicked] = useState<{ slot: Slot; top: number; left: number; above: boolean } | null>(null);
  // A card opened by hovering has to close again when the pointer leaves; one opened by clicking is
  // meant to stay. `pinned` is that difference, and it is also what keeps the card from vanishing
  // under a finger on a touch screen, where there is no hover to hold it open.
  const [pinned, setPinned] = useState(false);
  const frame = useRef<HTMLDivElement | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const closing = useRef<number | null>(null);

  // The grid is drawn on the teacher's clock — the one already printed on this profile — so the
  // timetable and the TIME ZONE line above it can never disagree. Asking the reader to choose put a
  // control on the page for a decision nobody has to make; the reader's own clock still appears,
  // on the slot they pick, where it is the thing they actually need.
  const timezone = validZone(instructorTimezone) ?? "UTC";
  const ownTimezone = useMemo(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
  }, []);

  // The seven dates on show, as the teacher's calendar reads them. Monday first.
  const days = useMemo(() => {
    const today = dayKey(new Date(), timezone);
    const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
    const monday = shiftDays(today, -((weekday + 6) % 7) + weekOffset * 7);
    return Array.from({ length: 7 }, (_, index) => shiftDays(monday, index));
  }, [timezone, weekOffset]);

  const schedule = trpc.schedulingPublic.instructorSchedule.useQuery(
    { slug, startDate: shiftDays(days[0], -1), endDate: shiftDays(days[6], 1), learnerTimezone: timezone, durationMinutes: duration },
    { retry: false, staleTime: 60_000 },
  );

  const slots: Slot[] = schedule.data?.ok ? (schedule.data.data as Slot[]) : [];

  // The whole day is drawn, half hour by half hour, so the week reads as a timetable rather than as
  // a list of the few times that happened to be free. Any start that does not sit on a half hour —
  // a 45-minute lesson runs 18:00, 18:45, 19:30 — is merged in, so no open slot is left without a
  // row to sit on.
  const { byCell, rows } = useMemo(() => {
    const visible = new Set(days);
    const cells = new Map<string, Slot>();
    const extra = new Set<string>();
    for (const slot of slots) {
      const when = new Date(slot.startAt);
      const day = dayKey(when, timezone);
      if (!visible.has(day)) continue;
      const time = timeKey(when, timezone);
      if (Number(time.slice(3)) % 30 !== 0) extra.add(time);
      cells.set(`${day}|${time}`, slot);
    }
    const grid = Array.from({ length: 48 }, (_, index) => `${String(Math.floor(index / 2)).padStart(2, "0")}:${index % 2 ? "30" : "00"}`);
    return { byCell: cells, rows: [...grid, ...Array.from(extra)].sort() };
  }, [slots, days, timezone]);

  /** The grace period between leaving a cell and the card going: long enough to cross the 6px gap
      into the card itself, short enough that sweeping across the week does not leave a trail. */
  const CLOSE_DELAY = 160;
  const cancelClose = () => { if (closing.current !== null) { window.clearTimeout(closing.current); closing.current = null; } };
  const closeSoon = () => { cancelClose(); closing.current = window.setTimeout(() => { setPicked(null); setPinned(false); }, CLOSE_DELAY); };
  const closeNow = () => { cancelClose(); setPicked(null); setPinned(false); };

  /** Places the card against a cell, above it where the week has room, clamped to the frame. */
  const openAt = (slot: Slot, cell: HTMLElement) => {
    cancelClose();
    const box = frame.current?.getBoundingClientRect();
    if (!box) return;
    const rect = cell.getBoundingClientRect();
    const centre = rect.left - box.left + rect.width / 2;
    // Above is where a reader looks for it, but the first rows of the week have nothing above them
    // to open into, so those flip below rather than being cut off by the top of the table.
    const above = rect.top - box.top > CARD_CLEARANCE;
    setPicked({
      slot,
      above,
      top: above ? rect.top - box.top - 6 : rect.bottom - box.top + 6,
      left: Math.min(Math.max(centre, 132), Math.max(box.width - 132, 132)),
    });
  };

  // A card anchored to a cell is wrong the moment either moves, so it closes rather than drifts.
  useEffect(() => {
    if (!picked) return;
    const close = () => { setPicked(null); setPinned(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    const node = scroller.current;
    node?.addEventListener("scroll", close, { passive: true });
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      node?.removeEventListener("scroll", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [picked]);

  useEffect(() => () => { if (closing.current !== null) window.clearTimeout(closing.current); }, []);

  const book = () => {
    if (!picked) return;
    // The invite is the learner's, so it is prepared on the learner's own clock. The instant is the
    // same one they clicked; only the way it is written down differs.
    const params = new URLSearchParams({ instructorSlug: slug, startAt: picked.slot.startAt, durationMinutes: String(picked.slot.durationMinutes), tz: ownTimezone });
    const target = `/trial/request?${params.toString()}`;
    setLocation(isAuthenticated ? target : `/login?returnTo=${encodeURIComponent(target)}`);
  };

  const failed = schedule.data && schedule.data.ok === false;

  return (
    <section className="mt-10" aria-labelledby="tutor-schedule-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="tutor-schedule-title" className="font-display text-2xl ni-t-ink">{t("tutorSchedule.title")}</h2>
          <p className="mt-1 text-xs ni-t-muted">{t("tutorSchedule.timezoneNote", { timezone })}{timezone === ownTimezone ? ` · ${t("tutorSchedule.yourTimezone")}` : ""}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs font-semibold ni-t-muted">
            {t("tutorSchedule.duration")}
            <select
              value={duration}
              onChange={(event) => { setDuration(Number(event.target.value)); setPicked(null); }}
              className="rounded-full border border-[var(--ni-sage-line)] bg-[var(--ni-field)] px-3 py-1.5 text-xs ni-t-ink outline-none focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]"
            >
              {DURATIONS.map((minutes) => (
                <option key={minutes} value={minutes}>{t("tutorSchedule.minutes", { count: formatNumber(minutes) })}</option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => { setWeekOffset((value) => value - 1); setPicked(null); }}
              disabled={weekOffset <= 0}
              aria-label={t("tutorSchedule.previousWeek")}
              className="rounded-full border border-[var(--ni-sage-line)] p-1.5 ni-t-moss-deep disabled:opacity-40 hover:bg-[var(--ni-sage-soft)]"
            >
              <ChevronLeft size={15} aria-hidden="true" className="rtl:rotate-180" />
            </button>
            <button
              type="button"
              onClick={() => { setWeekOffset((value) => value + 1); setPicked(null); }}
              disabled={weekOffset >= 3}
              aria-label={t("tutorSchedule.nextWeek")}
              className="rounded-full border border-[var(--ni-sage-line)] p-1.5 ni-t-moss-deep disabled:opacity-40 hover:bg-[var(--ni-sage-soft)]"
            >
              <ChevronRight size={15} aria-hidden="true" className="rtl:rotate-180" />
            </button>
          </div>
        </div>
      </div>

      {schedule.isLoading ? (
        <p className="mt-5 flex items-center gap-2 rounded-2xl border border-[var(--ni-sage)] bg-[var(--ni-paper)] px-5 py-4 text-sm ni-t-muted" aria-live="polite">
          <Loader2 size={15} className="animate-spin" aria-hidden="true" /> {t("common.loading")}
        </p>
      ) : failed || schedule.isError ? (
        <p role="status" className="mt-5 rounded-2xl border border-[var(--ni-gold-mid)] bg-[var(--ni-gold-soft)] px-5 py-4 text-sm ni-t-gold">
          {t("tutorSchedule.unavailable")}
        </p>
      ) : byCell.size === 0 ? (
        <p className="mt-5 rounded-2xl border border-dashed border-[var(--ni-sage-mid)] bg-[var(--ni-sage-soft)] px-5 py-6 text-center text-sm ni-t-muted">
          {t("tutorSchedule.none")}
        </p>
      ) : (
        <div ref={frame} className="relative">
          {/* The table runs its full height down the page. A teacher who opens 06:00 and 21:00 has
              both on screen without a second scrollbar to find them in; only the seven columns
              scroll sideways, and only when the screen is narrower than they are. */}
          <div ref={scroller} className="mt-5 overflow-x-auto rounded-2xl border border-[var(--ni-sage)]">
            <table className="ni-timetable min-w-[720px] text-center">
              <caption className="sr-only">{t("tutorSchedule.title")}</caption>
              <thead>
                <tr>
                  <th scope="col" className="w-[4.75rem] !text-start ni-label">{t("tutorSchedule.time")}</th>
                  {days.map((day) => (
                    <th key={day} scope="col">
                      {formatDate(`${day}T12:00:00Z`, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((time) => (
                  <tr key={time}>
                    <th scope="row" className="ltr-embed">{time}</th>
                    {days.map((day) => {
                      const slot = byCell.get(`${day}|${time}`);
                      const chosen = slot && picked?.slot.startAt === slot.startAt;
                      return (
                        <td key={day}>
                          {slot ? (
                            <button
                              type="button"
                              className="ni-slot"
                              aria-expanded={Boolean(chosen)}
                              // Resting on an hour is enough to see what it is; a click is only
                              // needed to hold the card still. Touch has no hover, so the click
                              // path stays and pins, and a keyboard reaches it through focus.
                              onPointerEnter={(event) => { if (event.pointerType === "mouse") openAt(slot, event.currentTarget); }}
                              onPointerLeave={(event) => { if (event.pointerType === "mouse" && !pinned) closeSoon(); }}
                              onFocus={(event) => openAt(slot, event.currentTarget)}
                              onClick={(event) => { openAt(slot, event.currentTarget); setPinned(true); }}
                            >
                              {t("tutorSchedule.available")}
                            </button>
                          ) : (
                            <span aria-hidden="true" className="ni-slot-empty" />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* The card opens on the cell that was clicked, so the time it names and the cell it came
              from are never two separate things to hold in mind. It sits outside the sideways
              scroller, which would otherwise clip it. */}
          {picked && (
            <div
              role="dialog"
              aria-label={t("tutorSchedule.title")}
              style={{ top: picked.top, insetInlineStart: picked.left }}
              // The card is part of what the pointer is "on": entering it cancels the pending close,
              // so the few pixels between an hour and its card are not a trap.
              onPointerEnter={cancelClose}
              onPointerLeave={(event) => { if (event.pointerType === "mouse" && !pinned) closeSoon(); }}
              className={`absolute z-20 w-64 -translate-x-1/2 rounded-xl border border-[var(--ni-sage)] bg-[var(--ni-paper)] p-4 shadow-xl rtl:translate-x-1/2 ${picked.above ? "-translate-y-full" : ""}`}
            >
              <button
                type="button"
                onClick={closeNow}
                aria-label={t("common.close")}
                className="absolute end-1.5 top-1.5 rounded-full p-1 ni-t-muted hover:bg-[var(--ni-sage-soft)]"
              >
                <X size={14} aria-hidden="true" />
              </button>
              <p className="pe-5 font-display text-base leading-tight ni-t-ink">{instructorName}</p>
              <dl className="mt-3 space-y-1.5 text-xs">
                <div className="flex gap-2">
                  <dt className="ni-label shrink-0">{t("tutorSchedule.date")}</dt>
                  <dd className="ni-t-ink">{formatDate(picked.slot.startAt, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: timezone })}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="ni-label shrink-0">{t("tutorSchedule.time")}</dt>
                  <dd className="ni-t-ink ltr-embed">
                    {timeKey(new Date(picked.slot.startAt), timezone)} – {timeKey(new Date(picked.slot.endAt), timezone)}
                  </dd>
                </div>
              </dl>
              {/* The grid is on the teacher's clock, so the line that matters here is the reader's.
                  Skipped when both sides share a zone, where it would only repeat the row above. */}
              {ownTimezone !== timezone && (
                <p className="mt-2 text-[11px] font-semibold leading-5 ni-t-moss-deep ltr-embed">
                  {t("tutorSchedule.yourClock", {
                    time: `${timeKey(new Date(picked.slot.startAt), ownTimezone)} – ${timeKey(new Date(picked.slot.endAt), ownTimezone)}`,
                    timezone: ownTimezone,
                  })}
                </p>
              )}
              <button type="button" onClick={book} className="ni-btn ni-btn--primary mt-3.5 w-full text-xs">
                <CalendarDays size={14} aria-hidden="true" />
                {isAuthenticated ? t("tutorSchedule.book") : t("tutorSchedule.signInToBook")}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
