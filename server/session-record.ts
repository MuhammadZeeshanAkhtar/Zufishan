/**
 * Sessions — what actually happened, for the person it happened to.
 *
 * The page this serves was a "session ledger" built from `createSessionLedgerEntry("session-101")`:
 * one fixture id, hardcoded, the same for every account. A learner who had taken nine classes saw
 * a demonstration of a ledger rather than their own; a learner who had taken none saw the same
 * demonstration. Neither was their record.
 *
 * What a session record can honestly say here is: which classes were scheduled, whether each side
 * turned up, and how each one ended. All of that is on `class_sessions` already — `status`,
 * `learner_joined_at`, `instructor_joined_at`, `ended_at` — and none of it needs a provider.
 *
 * WHAT IT DELIBERATELY DOES NOT SAY. No amount, fee, payout or balance. There is no payment
 * provider connected to this project, so any figure here would be invented, and an invented figure
 * in something called a ledger is the worst possible place to put one. The page says that plainly
 * instead of printing a zero, which would read as "you earned nothing".
 *
 * Read-only. The caller's own client, so RLS decides which sessions are theirs; the counterpart's
 * name comes from the same bounded lookup the invite desks use, because `class_sessions` carries
 * an id and no name.
 */
import { getSupabaseUserClient } from "./supabase-user-client";
import { peopleByIds, type InvitePerson } from "./invite-desk";
import type { SupabaseIdentity } from "./supabase-auth";

type Result<T> = { ok: true; data: T } | { ok: false; error: string; code?: "SETUP_NEEDED" | "VALIDATION" };
const fail = (error: string, code: "SETUP_NEEDED" | "VALIDATION" = "VALIDATION"): Result<never> => ({ ok: false, error, code });

export type SessionRecordEntry = {
  id: string;
  title: string;
  subject: string;
  sessionType: string;
  status: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  endedAt: string | null;
  learnerTimezone: string;
  instructorTimezone: string;
  /** Whether each side actually joined. Null means they did not. */
  ownJoinedAt: string | null;
  counterpartJoinedAt: string | null;
  person: InvitePerson | null;
  /** `not_configured` until a provider exists. Never presented as "a recording is coming". */
  recordingStatus: string;
};

/** How many a single page asks for. A record is read, not scrolled forever. */
const PAGE = 100;

/**
 * The caller's own sessions, most recent first.
 *
 * `role` only chooses which column identifies the caller and which side's join time is "theirs".
 * It grants nothing: RLS has already limited `class_sessions` to rows this account is part of, so
 * a learner passing "instructor" matches their own id against `instructor_id` and gets nothing.
 */
export async function listSessionRecord(
  identity: SupabaseIdentity,
  role: "learner" | "instructor",
): Promise<Result<SessionRecordEntry[]>> {
  const client = getSupabaseUserClient(identity.accessToken);
  if (!client) return fail("Scheduling persistence is not configured.", "SETUP_NEEDED");

  const own = role === "learner" ? "learner_id" : "instructor_id";
  const other = role === "learner" ? "instructor_id" : "learner_id";

  const { data, error } = await client
    .from("class_sessions")
    .select("id,title,session_type,status,scheduled_start_at,scheduled_end_at,ended_at,learner_timezone,instructor_timezone,learner_joined_at,instructor_joined_at,recording_status,learner_id,instructor_id")
    .eq(own, identity.id)
    .order("scheduled_start_at", { ascending: false })
    .limit(PAGE);

  if (error) {
    console.error("[session-record] read failed:", { code: error.code, message: error.message });
    return fail("Your sessions could not be loaded.");
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  const people = await peopleByIds(rows.map((row) => String(row[other] ?? "")));

  return {
    ok: true,
    data: rows.map((row) => {
      const ownJoin = role === "learner" ? row.learner_joined_at : row.instructor_joined_at;
      const otherJoin = role === "learner" ? row.instructor_joined_at : row.learner_joined_at;
      return {
        id: String(row.id),
        title: String(row.title ?? ""),
        subject: String(row.title ?? "").split(" · ")[0],
        sessionType: String(row.session_type ?? ""),
        status: String(row.status ?? ""),
        scheduledStartAt: String(row.scheduled_start_at ?? ""),
        scheduledEndAt: String(row.scheduled_end_at ?? ""),
        endedAt: (row.ended_at as string | null) ?? null,
        learnerTimezone: String(row.learner_timezone ?? ""),
        instructorTimezone: String(row.instructor_timezone ?? ""),
        ownJoinedAt: (ownJoin as string | null) ?? null,
        counterpartJoinedAt: (otherJoin as string | null) ?? null,
        person: people.get(String(row[other] ?? "")) ?? null,
        recordingStatus: String(row.recording_status ?? "not_configured"),
      };
    }),
  };
}
