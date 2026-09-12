/**
 * Whether two accounts may message each other, and if not, why not.
 *
 * THE DEFECT THIS REPLACES. The previous check asked only whether a row existed:
 *
 *     .from("trial_requests").select("id").in("learner_id", pair).in("instructor_id", pair)
 *
 * with no status filter at all. Every one of these tables has statuses that mean
 * the opposite of connected — a trial can be `declined`, `rejected` or
 * `cancelled`; a booking `cancelled` or `expired`; a requirement response
 * `rejected` or `withdrawn`; an enrolment `pending` or `cancelled`. A learner
 * whose trial request had been refused could still message that instructor, and
 * so could one whose request was merely sitting unanswered. The rule was stated
 * correctly in prose and not implemented.
 *
 * WHAT COUNTS NOW. Only a connection that actually happened, or was actually
 * agreed:
 *
 *   * a trial the instructor ACCEPTED (and everything downstream of that);
 *   * a booking that is confirmed or was held;
 *   * a requirement response the learner ACCEPTED;
 *   * an enrolment that is active or completed.
 *
 * A pending request is not a connection — it is a request. It is reported as
 * `pending` so the screen can say "your request is waiting" instead of the same
 * flat refusal a stranger gets, but it does not open a thread.
 *
 * IDS. Every one of these tables names its participants with a `profiles.id`,
 * and `profiles.id` IS the Supabase Auth user id — the table is keyed
 * `references auth.users(id)`. So there is no profile-id/user-id translation
 * anywhere in this file, and none is needed; a mismatch here would be a bug, not
 * a mapping.
 */
import type { getSupabaseAdminClient } from "./supabase-admin-client";

/** A trial the instructor agreed to, and every state that follows from it. */
export const CONNECTED_TRIAL_STATUSES = ["accepted", "scheduled", "waiting_room", "live", "completed"] as const;
/** Matches the definition scheduling.ts already uses for a booking that stands. */
export const CONNECTED_BOOKING_STATUSES = ["confirmed", "completed", "no_show", "disputed"] as const;
/** The learner picked this instructor. `shortlisted` is interest, not agreement. */
export const CONNECTED_RESPONSE_STATUSES = ["accepted"] as const;
/** A place on the course, taken. `pending` is a checkout that has not finished. */
export const CONNECTED_ENROLMENT_STATUSES = ["active", "completed"] as const;

/** Statuses that mean "asked, not yet answered" — blocked, but worth naming. */
export const PENDING_TRIAL_STATUSES = ["pending", "requested", "proposed", "proposed_new_time"] as const;
export const PENDING_RESPONSE_STATUSES = ["pending", "shortlisted"] as const;
export const PENDING_ENROLMENT_STATUSES = ["pending"] as const;

export type ConnectionSource = "trial" | "booking" | "requirement_response" | "enrolment";

export type ConnectionVerdict =
  | { connected: true; via: ConnectionSource }
  /** Something was asked for and has not been answered. Still blocked. */
  | { connected: false; pending: ConnectionSource }
  | { connected: false; pending: null };

type Admin = NonNullable<ReturnType<typeof getSupabaseAdminClient>>;

/**
 * Looks for a connection between two accounts, in both directions.
 *
 * `.in(column, pair)` on both participant columns is what makes this
 * direction-agnostic: it matches a row whose learner is either account and whose
 * instructor is the other, so the same call answers "may this learner message
 * this instructor" and "may this instructor message this learner". The explicit
 * `learner !== instructor` guard on the joined tables stops a row that names the
 * same account twice from being read as a connection with itself.
 */
export async function findConnection(admin: Admin | null, a: string, b: string): Promise<ConnectionVerdict> {
  if (!admin || a === b) return { connected: false, pending: null };
  const pair = [a, b];
  let pending: ConnectionSource | null = null;

  const trials = await admin
    .from("trial_requests").select("status").in("learner_id", pair).in("instructor_id", pair).limit(50);
  for (const row of (trials.data ?? []) as Array<{ status: string }>) {
    if ((CONNECTED_TRIAL_STATUSES as readonly string[]).includes(row.status)) return { connected: true, via: "trial" };
    if ((PENDING_TRIAL_STATUSES as readonly string[]).includes(row.status)) pending ??= "trial";
  }

  const bookings = await admin
    .from("bookings").select("status").in("learner_id", pair).in("instructor_id", pair).limit(50);
  for (const row of (bookings.data ?? []) as Array<{ status: string }>) {
    if ((CONNECTED_BOOKING_STATUSES as readonly string[]).includes(row.status)) return { connected: true, via: "booking" };
  }

  // An instructor who answered this learner's requirement, and was chosen.
  const responses = await admin
    .from("requirement_responses")
    .select("status, instructor_id, learner_requirements!inner(learner_id)")
    .in("instructor_id", pair)
    .limit(100);
  for (const row of (responses.data ?? []) as Array<Record<string, unknown>>) {
    const learner = String((row.learner_requirements as Record<string, unknown> | undefined)?.learner_id ?? "");
    const instructor = String(row.instructor_id);
    if (!pair.includes(learner) || !pair.includes(instructor) || learner === instructor) continue;
    const status = String(row.status);
    if ((CONNECTED_RESPONSE_STATUSES as readonly string[]).includes(status)) return { connected: true, via: "requirement_response" };
    if ((PENDING_RESPONSE_STATUSES as readonly string[]).includes(status)) pending ??= "requirement_response";
  }

  // A learner holding a place on a course this instructor owns.
  const enrolments = await admin
    .from("enrolments")
    .select("status, learner_id, courses!inner(instructor_id)")
    .in("learner_id", pair)
    .limit(100);
  for (const row of (enrolments.data ?? []) as Array<Record<string, unknown>>) {
    const learner = String(row.learner_id);
    const instructor = String((row.courses as Record<string, unknown> | undefined)?.instructor_id ?? "");
    if (!pair.includes(learner) || !pair.includes(instructor) || learner === instructor) continue;
    const status = String(row.status);
    if ((CONNECTED_ENROLMENT_STATUSES as readonly string[]).includes(status)) return { connected: true, via: "enrolment" };
    if ((PENDING_ENROLMENT_STATUSES as readonly string[]).includes(status)) pending ??= "enrolment";
  }

  return pending ? { connected: false, pending } : { connected: false, pending: null };
}

/** The yes/no the conversation writer needs. */
export async function relationshipExists(admin: Admin | null, a: string, b: string): Promise<boolean> {
  return (await findConnection(admin, a, b)).connected;
}

/**
 * The answer a profile screen needs before it draws its buttons.
 *
 * Deliberately a SERVER query, not a flag the browser sets for itself: the same
 * `findConnection` that authorises the write decides what the screen shows, so a
 * Message button can never appear for a pair the write would refuse — and hiding
 * the button is never what enforces the rule. `startConversation` re-checks
 * regardless, so a screen that got this wrong would still be refused.
 *
 * It returns no profile data, no name and no id beyond the one the caller
 * already supplied.
 */
export type MessagingEligibility = {
  eligible: boolean;
  /** Which connection permits it, when one does. */
  via: ConnectionSource | null;
  /** Which request is waiting, when one is. Blocked, but worth saying. */
  pending: ConnectionSource | null;
};

export async function getMessagingEligibility(
  identity: { id: string },
  input: { counterpartId: string },
): Promise<{ ok: true; data: MessagingEligibility } | { ok: false; error: string; code?: "SETUP_NEEDED" }> {
  const admin = (await import("./supabase-admin-client")).getSupabaseAdminClient();
  if (!admin) return { ok: false, error: "Supabase administrative access is not configured.", code: "SETUP_NEEDED" };

  const verdict = await findConnection(admin, identity.id, input.counterpartId);
  return {
    ok: true,
    data: verdict.connected
      ? { eligible: true, via: verdict.via, pending: null }
      : { eligible: false, via: null, pending: verdict.pending },
  };
}
