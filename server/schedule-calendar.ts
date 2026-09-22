/**
 * What is actually on somebody's calendar.
 *
 * The Schedule module rendered a flat list out of `class_sessions` and a pill reading "Calendar
 * view coming soon", and for most accounts it rendered nothing at all. That was not a display
 * fault. A lesson on this project exists in up to three tables, and the page was reading one:
 *
 *  - `trial_requests` — somebody asked, somebody proposed a time, somebody agreed. This is where a
 *    lesson lives for as long as it is still being arranged.
 *  - `bookings` — the agreement, once confirmed. Created from the trial request it settles.
 *  - `class_sessions` — the room, opened when the lesson is about to happen.
 *
 * A teacher who has accepted three invites has three rows in `trial_requests`, perhaps three in
 * `bookings`, and none in `class_sessions` until somebody opens a room. Reading the last table
 * alone is why an actively booked teacher saw an empty page.
 *
 * So this reads all three, which forces the one genuinely interesting decision here: **the same
 * lesson must not appear three times.** A booking carries the `trial_request_id` it settles and so
 * does a session, so the rows are joinable, and the most concrete one wins — a room beats a
 * confirmation, a confirmation beats a negotiation. Anything with no trial request behind it
 * stands on its own.
 *
 * TWO BOUNDARIES.
 *
 *  - Every read runs on the caller's own client. RLS is what limits each table to the caller's own
 *    rows; nothing here widens that, and the role argument only chooses which column to match.
 *  - Names are the exception, and it is the exception the invite desks already make:
 *    `profiles_select_own_or_admin` lets an account read exactly one profile, so a counterpart's
 *    name needs the elevated lookup in `invite-desk`, bounded by the ids the caller's own rows
 *    returned.
 *
 * Read-only, and range-bounded: a calendar asks for the weeks it is drawing, never for a history.
 */
import { getSupabaseUserClient } from "./supabase-user-client";
import { peopleByIds, type InvitePerson } from "./invite-desk";
import type { SupabaseIdentity } from "./supabase-auth";

type Result<T> = { ok: true; data: T } | { ok: false; error: string; code?: "SETUP_NEEDED" | "VALIDATION" };
const fail = (error: string, code: "SETUP_NEEDED" | "VALIDATION" = "VALIDATION"): Result<never> => ({ ok: false, error, code });

/** Which table an entry came from. The client colours and labels by this, and nothing else. */
export type ScheduleEntryKind = "session" | "booking" | "trial";

export type ScheduleEntry = {
  id: string;
  kind: ScheduleEntryKind;
  title: string;
  subject: string;
  status: string;
  startAt: string;
  endAt: string;
  learnerTimezone: string;
  instructorTimezone: string;
  counterpartId: string;
  person: InvitePerson | null;
  /** The ids the client needs to build a link. Routing stays in the client. */
  sessionId: string | null;
  bookingId: string | null;
  trialRequestId: string | null;
};

/** One weekly interval a teacher has published: local wall-clock times in their own zone. */
export type ScheduleAvailability = { weekday: number; startLocal: string; endLocal: string; timezone: string };

/** Statuses that describe something still on the calendar, per table. */
const LIVE_SESSION_STATUSES = ["scheduled", "waiting_room", "live", "completed", "no_show"];
const LIVE_BOOKING_STATUSES = ["confirmed", "completed", "no_show", "disputed"];
/* A trial is on the calendar while it is being arranged, and after it was agreed. A rejected or
   cancelled one is not a plan, and a draft was never sent. */
const LIVE_TRIAL_STATUSES = ["pending", "proposed", "accepted"];

/** A room beats a confirmation, and a confirmation beats a negotiation. */
const CONCRETENESS: Record<ScheduleEntryKind, number> = { session: 3, booking: 2, trial: 1 };

/** The widest window one call may ask for, so a calendar cannot pull a whole history. */
const MAX_RANGE_DAYS = 186;

/**
 * One lesson, one entry.
 *
 * A booking carries the trial request it settles, and a session carries it too, so the same hour
 * arrives here up to three times under three different ids. Keyed on that shared id, the most
 * concrete row wins — and it inherits the ids of the rows it displaced, so "open the room" and
 * "open the invite" both still lead somewhere from the single card the reader sees.
 *
 * Rows with no trial request behind them — a course session scheduled directly, say — are keyed on
 * their own id and are never merged with anything.
 *
 * Pure, and exported for that reason: this is the only real decision in the file.
 */
export function mergeScheduleRows(rows: ScheduleEntry[]): ScheduleEntry[] {
  const merged = new Map<string, ScheduleEntry>();
  for (const entry of rows) {
    const key = entry.trialRequestId ? `trial:${entry.trialRequestId}` : `${entry.kind}:${entry.id}`;
    const held = merged.get(key);
    if (!held) { merged.set(key, entry); continue; }
    const winner = CONCRETENESS[entry.kind] > CONCRETENESS[held.kind] ? entry : held;
    const loser = winner === entry ? held : entry;
    merged.set(key, {
      ...winner,
      sessionId: winner.sessionId ?? loser.sessionId,
      bookingId: winner.bookingId ?? loser.bookingId,
      trialRequestId: winner.trialRequestId ?? loser.trialRequestId,
    });
  }
  return Array.from(merged.values());
}

function parseRange(fromIso: string, toIso: string): { from: Date; to: Date } | null {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  if (to <= from) return null;
  if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * 86_400_000) return null;
  return { from, to };
}

/**
 * The entries, merged and de-duplicated, with the weekly pattern behind them.
 *
 * `role` chooses which column identifies the caller. It grants nothing: a learner passing
 * "instructor" matches `instructor_id = their own id`, which is no rows, because RLS has already
 * limited every one of these tables to rows they are part of.
 */
export async function listScheduleEntries(
  identity: SupabaseIdentity,
  role: "learner" | "instructor",
  range: { fromIso: string; toIso: string },
): Promise<Result<{ entries: ScheduleEntry[]; availability: ScheduleAvailability[] }>> {
  const client = getSupabaseUserClient(identity.accessToken);
  if (!client) return fail("Scheduling persistence is not configured.", "SETUP_NEEDED");

  const window = parseRange(range.fromIso, range.toIso);
  if (!window) return fail("Choose a valid date range.");
  const fromIso = window.from.toISOString();
  const toIso = window.to.toISOString();

  const own = role === "learner" ? "learner_id" : "instructor_id";
  const other = role === "learner" ? "instructor_id" : "learner_id";

  const [sessions, bookings, trials, availability] = await Promise.all([
    client
      .from("class_sessions")
      .select("id,trial_request_id,title,status,scheduled_start_at,scheduled_end_at,learner_timezone,instructor_timezone,learner_id,instructor_id")
      .eq(own, identity.id)
      .gte("scheduled_start_at", fromIso)
      .lt("scheduled_start_at", toIso)
      .order("scheduled_start_at"),
    client
      .from("bookings")
      .select("id,trial_request_id,subject,status,scheduled_start_at,scheduled_end_at,learner_timezone,instructor_timezone,learner_id,instructor_id")
      .eq(own, identity.id)
      .gte("scheduled_start_at", fromIso)
      .lt("scheduled_start_at", toIso)
      .order("scheduled_start_at"),
    /*
     * Not date-filtered in the query.
     *
     * A trial's effective start is `proposed_start_at` when a time was offered and
     * `requested_start_at` otherwise, and PostgREST cannot range-filter a coalesce of two columns
     * without an `or` that reads worse than the check below. The set is small by nature — these
     * are the invites still being arranged, not a history — so it is bounded by a limit here and
     * narrowed once the effective start is known.
     */
    client
      .from("trial_requests")
      .select("id,subject,status,requested_start_at,requested_end_at,proposed_start_at,proposed_end_at,learner_timezone,instructor_timezone,learner_id,instructor_id")
      .eq(own, identity.id)
      .in("status", LIVE_TRIAL_STATUSES)
      .order("created_at", { ascending: false })
      .limit(200),
    /*
     * Only a teacher has one, and only their own. `instructor_availability_public_or_own` permits
     * this read; a learner is not asked, because their calendar has no weekly pattern of its own.
     */
    role === "instructor"
      ? client.from("instructor_availability").select("weekday,start_local,end_local,timezone").eq("instructor_id", identity.id).eq("active", true).order("weekday").order("start_local")
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
  ]);

  /*
   * A calendar that silently dropped a table would be worse than the empty page it replaces: the
   * teacher would read a clear week and believe it. So a failure is reported, never coalesced.
   */
  for (const [label, result] of [["sessions", sessions], ["bookings", bookings], ["trials", trials]] as const) {
    if (result.error) {
      console.error(`[schedule] ${label} failed:`, { code: result.error.code, message: result.error.message });
      return fail("Your schedule could not be loaded.");
    }
  }
  if (availability.error) {
    // The pattern is context beside the entries, not the entries. Losing it must not lose the week.
    console.error("[schedule] availability failed:", { code: availability.error.code, message: availability.error.message });
  }

  const rows: ScheduleEntry[] = [];

  for (const value of (sessions.data ?? []) as Record<string, unknown>[]) {
    if (!LIVE_SESSION_STATUSES.includes(String(value.status))) continue;
    rows.push({
      id: String(value.id),
      kind: "session",
      title: String(value.title ?? ""),
      subject: String(value.title ?? "").split(" · ")[0],
      status: String(value.status ?? ""),
      startAt: String(value.scheduled_start_at ?? ""),
      endAt: String(value.scheduled_end_at ?? ""),
      learnerTimezone: String(value.learner_timezone ?? ""),
      instructorTimezone: String(value.instructor_timezone ?? ""),
      counterpartId: String(value[other] ?? ""),
      person: null,
      sessionId: String(value.id),
      bookingId: null,
      trialRequestId: value.trial_request_id ? String(value.trial_request_id) : null,
    });
  }

  for (const value of (bookings.data ?? []) as Record<string, unknown>[]) {
    if (!LIVE_BOOKING_STATUSES.includes(String(value.status))) continue;
    rows.push({
      id: String(value.id),
      kind: "booking",
      title: String(value.subject ?? ""),
      subject: String(value.subject ?? ""),
      status: String(value.status ?? ""),
      startAt: String(value.scheduled_start_at ?? ""),
      endAt: String(value.scheduled_end_at ?? ""),
      learnerTimezone: String(value.learner_timezone ?? ""),
      instructorTimezone: String(value.instructor_timezone ?? ""),
      counterpartId: String(value[other] ?? ""),
      person: null,
      sessionId: null,
      bookingId: String(value.id),
      trialRequestId: value.trial_request_id ? String(value.trial_request_id) : null,
    });
  }

  for (const value of (trials.data ?? []) as Record<string, unknown>[]) {
    // The offered time once one was proposed; the asked-for time until then.
    const startAt = String(value.proposed_start_at ?? value.requested_start_at ?? "");
    const endAt = String(value.proposed_end_at ?? value.requested_end_at ?? "");
    const start = new Date(startAt);
    if (Number.isNaN(start.getTime()) || start < window.from || start >= window.to) continue;
    rows.push({
      id: String(value.id),
      kind: "trial",
      title: String(value.subject ?? ""),
      subject: String(value.subject ?? ""),
      status: String(value.status ?? ""),
      startAt,
      endAt,
      learnerTimezone: String(value.learner_timezone ?? ""),
      instructorTimezone: String(value.instructor_timezone ?? ""),
      counterpartId: String(value[other] ?? ""),
      person: null,
      sessionId: null,
      bookingId: null,
      trialRequestId: String(value.id),
    });
  }

  const entries = mergeScheduleRows(rows);
  const people = await peopleByIds(entries.map((entry) => entry.counterpartId));

  return {
    ok: true,
    data: {
      entries: entries
        .map((entry) => ({ ...entry, person: people.get(entry.counterpartId) ?? null }))
        .sort((left, right) => left.startAt.localeCompare(right.startAt)),
      availability: ((availability.data ?? []) as Record<string, unknown>[]).map((value) => ({
        weekday: Number(value.weekday ?? 0),
        startLocal: String(value.start_local ?? ""),
        endLocal: String(value.end_local ?? ""),
        timezone: String(value.timezone ?? ""),
      })),
    },
  };
}
