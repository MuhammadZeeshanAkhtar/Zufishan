/**
 * Booking and support review — read-only, deliberately.
 *
 * The brief says to use read-only states "unless an existing secure procedure
 * explicitly supports an Admin action". None does: `booking-lifecycle.ts` and
 * `class-session-lifecycle.ts` authorise the *participants* — the learner and
 * the instructor — and adding an administrative override would be new business
 * logic in a task that must not change the booking rules. So this module reads,
 * and the screen says plainly that it reads.
 *
 * **What it does not read.** `learner_message`, `instructor_response` and
 * `cancellation_reason` are free text written by one person to another. Support
 * triage needs to know that a request exists, who it is between, when it is and
 * what state it is in — not what they said to each other. Those columns are
 * therefore never selected, so they cannot reach the browser even by accident.
 */
import type { SupabaseIdentity } from "./supabase-auth";
import {
  clampLimit, clampOffset, displayNameOf, logFailure, requireAdmin,
  type AdminResult, type Page,
} from "./admin-guard";

export const TRIAL_STATUSES = [
  "draft", "pending", "requested", "proposed", "proposed_new_time", "accepted", "declined",
  "rejected", "cancelled", "scheduled", "waiting_room", "live", "completed", "no_show", "disputed",
] as const;
export const BOOKING_STATUSES = ["confirmed", "cancelled", "expired", "completed", "no_show", "disputed"] as const;
export const SESSION_STATUSES = ["scheduled", "waiting_room", "live", "completed", "cancelled", "no_show"] as const;

export const SUPPORT_SCOPES = ["trials", "bookings", "sessions"] as const;
export type SupportScope = (typeof SUPPORT_SCOPES)[number];

export type SupportRow = {
  id: string;
  scope: SupportScope;
  subject: string;
  status: string;
  learnerName: string | null;
  instructorName: string | null;
  startAt: string | null;
  endAt: string | null;
  learnerTimezone: string | null;
  instructorTimezone: string | null;
  createdAt: string;
  updatedAt: string | null;
  /** True when the two sides recorded different timezones — the usual support cause. */
  timezoneMismatch: boolean;
};

export async function listSupportRecords(
  identity: SupabaseIdentity,
  input: { scope?: SupportScope; status?: string; limit?: number; offset?: number },
): Promise<AdminResult<Page<SupportRow>>> {
  const gate = await requireAdmin(identity);
  if (!gate.ok) return gate.failure;
  const { admin } = gate;

  const limit = clampLimit(input.limit);
  const offset = clampOffset(input.offset);
  const scope: SupportScope = input.scope ?? "trials";

  const named = "learner:learner_id(display_name,full_name),instructor:instructor_id(display_name,full_name)";
  const table = scope === "trials" ? "trial_requests" : scope === "bookings" ? "bookings" : "class_sessions";
  // Typed as a plain string: the three literals below would otherwise be parsed
  // as a union of PostgREST select shapes, which the compiler cannot represent.
  const columns: string =
    scope === "trials"
      ? `id,subject,status,requested_start_at,requested_end_at,learner_timezone,instructor_timezone,created_at,updated_at,${named}`
      : scope === "bookings"
        ? `id,subject,status,scheduled_start_at,scheduled_end_at,learner_timezone,instructor_timezone,created_at,updated_at,${named}`
        : `id,title,session_type,status,scheduled_start_at,scheduled_end_at,learner_timezone,instructor_timezone,created_at,updated_at,${named}`;

  let query: any = admin.from(table).select(columns, { count: "exact" });
  if (input.status && input.status !== "all") query = query.eq("status", input.status);

  const orderColumn = scope === "trials" ? "requested_start_at" : "scheduled_start_at";
  const { data, error, count } = await query.order(orderColumn, { ascending: false }).range(offset, offset + limit - 1);
  if (error) {
    logFailure("admin-support", error);
    return { ok: false, error: "The support records could not be loaded." };
  }

  const rows: SupportRow[] = ((data ?? []) as unknown as Array<Record<string, unknown>>).map((row) => {
    const learnerTimezone = row.learner_timezone ? String(row.learner_timezone) : null;
    const instructorTimezone = row.instructor_timezone ? String(row.instructor_timezone) : null;
    return {
      id: String(row.id),
      scope,
      subject: String(row.subject ?? row.title ?? ""),
      status: String(row.status),
      learnerName: displayNameOf(row.learner),
      instructorName: displayNameOf(row.instructor),
      startAt: (row.requested_start_at ?? row.scheduled_start_at) ? String(row.requested_start_at ?? row.scheduled_start_at) : null,
      endAt: (row.requested_end_at ?? row.scheduled_end_at) ? String(row.requested_end_at ?? row.scheduled_end_at) : null,
      learnerTimezone,
      instructorTimezone,
      createdAt: String(row.created_at),
      updatedAt: row.updated_at ? String(row.updated_at) : null,
      timezoneMismatch: Boolean(learnerTimezone && instructorTimezone && learnerTimezone !== instructorTimezone),
    };
  });

  return { ok: true, data: { rows, total: count ?? rows.length, limit, offset } };
}

export type SupportSummary = {
  trials: Array<{ status: string; count: number }>;
  bookings: Array<{ status: string; count: number }>;
  sessions: Array<{ status: string; count: number }>;
  upcoming: number;
};

/** Counts per state, so the desk can show where the queue actually is. */
export async function getSupportSummary(identity: SupabaseIdentity): Promise<AdminResult<SupportSummary>> {
  const gate = await requireAdmin(identity);
  if (!gate.ok) return gate.failure;
  const { admin } = gate;

  const countOf = async (table: string, status?: string, extra?: (query: any) => any) => {
    let query: any = admin.from(table).select("*", { count: "exact", head: true });
    if (status) query = query.eq("status", status);
    if (extra) query = extra(query);
    const { count, error } = await query;
    logFailure("admin-support", error);
    return count ?? 0;
  };

  const bucket = (table: string, statuses: readonly string[]) =>
    Promise.all(statuses.map(async (status) => ({ status, count: await countOf(table, status) })));

  const nowIso = new Date().toISOString();
  const [trials, bookings, sessions, upcoming] = await Promise.all([
    bucket("trial_requests", TRIAL_STATUSES),
    bucket("bookings", BOOKING_STATUSES),
    bucket("class_sessions", SESSION_STATUSES),
    countOf("bookings", "confirmed", (query) => query.gte("scheduled_start_at", nowIso)),
  ]);

  return { ok: true, data: { trials, bookings, sessions, upcoming } };
}
