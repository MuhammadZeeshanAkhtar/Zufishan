/**
 * Booking lifecycle after confirmation.
 *
 * `bookings.status` allows confirmed | cancelled | expired | completed | no_show | disputed, but
 * only 'confirmed' was ever written. `cancelTrialOrBooking` cancels through the *trial request* and
 * lets the booking follow, so a booking could not be acted on by its own id, could not be moved, and
 * could never be closed out. Three transitions were missing: reschedule, cancel, and completion.
 *
 * Two rules shape all of them:
 *
 *   Overlap is enforced by the database, not by this file. `bookings_instructor_slot_excl` and
 *   `bookings_learner_slot_excl` are GiST exclusion constraints over the active statuses, so a
 *   double-booking raises 23P01 no matter which code path attempts it. Checking first and relying
 *   on the check would be a race; the constraint is the authority and 23P01 is translated into a
 *   readable conflict here.
 *
 *   The row policy already restricts writes to the two parties (`bookings_parties_update`), so
 *   these run on the caller's own client rather than the admin client. Nothing needs elevating,
 *   and using the user client keeps RLS in force for every statement.
 */
import { getSupabaseUserClient } from "./supabase-user-client";
import type { SupabaseIdentity } from "./supabase-auth";

/** Statuses the exclusion constraints treat as occupying the slot. */
const ACTIVE = ["confirmed", "completed", "no_show", "disputed"] as const;
/** Outcomes an instructor may record once the session time has passed. */
export const BOOKING_OUTCOMES = ["completed", "no_show"] as const;
export type BookingOutcome = (typeof BOOKING_OUTCOMES)[number];

type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "SETUP_NEEDED" | "VALIDATION" };

const isOverlap = (error: { code?: string } | null) => error?.code === "23P01";

type BookingRow = {
  id: string; learner_id: string; instructor_id: string; status: string;
  scheduled_start_at: string; scheduled_end_at: string;
};

/** Loads a booking the caller is party to. RLS already limits the read; this reports it clearly. */
async function loadOwnBooking(identity: SupabaseIdentity, bookingId: string) {
  const db = getSupabaseUserClient(identity.accessToken);
  if (!db) return { db: null, booking: null as BookingRow | null };
  const { data } = await db
    .from("bookings")
    .select("id,learner_id,instructor_id,status,scheduled_start_at,scheduled_end_at")
    .eq("id", bookingId)
    .maybeSingle();
  return { db, booking: (data as BookingRow | null) ?? null };
}

/**
 * Moves a confirmed booking to a new time.
 *
 * The row is updated in place rather than cancelled and recreated: the booking keeps its identity,
 * its link to the originating trial request, and anything referencing it. The move itself is
 * recorded in `audit_logs`, which is where the history belongs.
 */
export async function rescheduleBooking(
  identity: SupabaseIdentity,
  input: { bookingId: string; startAt: string; endAt: string; reason?: string },
): Promise<Result<BookingRow>> {
  const start = new Date(input.startAt);
  const end = new Date(input.endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return { ok: false, error: "That is not a valid time.", code: "VALIDATION" };
  if (end <= start) return { ok: false, error: "The end time must be after the start time.", code: "VALIDATION" };
  if (start.getTime() < Date.now()) return { ok: false, error: "A booking cannot be moved into the past.", code: "VALIDATION" };

  const { db, booking } = await loadOwnBooking(identity, input.bookingId);
  if (!db) return { ok: false, error: "Scheduling persistence is not configured.", code: "SETUP_NEEDED" };
  if (!booking) return { ok: false, error: "Booking not found.", code: "NOT_FOUND" };
  if (booking.learner_id !== identity.id && booking.instructor_id !== identity.id) {
    return { ok: false, error: "Only the learner or instructor on a booking can move it.", code: "FORBIDDEN" };
  }
  if (booking.status !== "confirmed") {
    return { ok: false, error: `Only a confirmed booking can be moved; this one is "${booking.status}".`, code: "CONFLICT" };
  }

  const { data, error } = await db
    .from("bookings")
    .update({ scheduled_start_at: start.toISOString(), scheduled_end_at: end.toISOString(), updated_at: new Date().toISOString() })
    .eq("id", input.bookingId)
    .eq("status", "confirmed") // repeat the guard so a concurrent change cannot be overwritten
    .select("id,learner_id,instructor_id,status,scheduled_start_at,scheduled_end_at")
    .maybeSingle();

  if (isOverlap(error)) return { ok: false, error: "That time overlaps another booking for one of you.", code: "CONFLICT" };
  if (error || !data) {
    if (error) console.error("[booking] reschedule failed:", { code: error.code, message: error.message });
    return { ok: false, error: "This booking changed and must be refreshed.", code: "CONFLICT" };
  }
  return { ok: true, data: data as BookingRow };
}

/** Cancels a booking by its own id, which the trial-request path could not do. */
export async function cancelBooking(
  identity: SupabaseIdentity,
  input: { bookingId: string; reason: string },
): Promise<Result<BookingRow>> {
  const reason = input.reason.trim();
  if (!reason || reason.length > 1000) return { ok: false, error: "A cancellation reason is required.", code: "VALIDATION" };

  const { db, booking } = await loadOwnBooking(identity, input.bookingId);
  if (!db) return { ok: false, error: "Scheduling persistence is not configured.", code: "SETUP_NEEDED" };
  if (!booking) return { ok: false, error: "Booking not found.", code: "NOT_FOUND" };
  if (booking.learner_id !== identity.id && booking.instructor_id !== identity.id) {
    return { ok: false, error: "Only the learner or instructor on a booking can cancel it.", code: "FORBIDDEN" };
  }
  if (booking.status !== "confirmed") {
    return { ok: false, error: `Only a confirmed booking can be cancelled; this one is "${booking.status}".`, code: "CONFLICT" };
  }

  const now = new Date().toISOString();
  const { data, error } = await db
    .from("bookings")
    .update({ status: "cancelled", cancelled_by: identity.id, cancelled_at: now, updated_at: now })
    .eq("id", input.bookingId)
    .eq("status", "confirmed")
    .select("id,learner_id,instructor_id,status,scheduled_start_at,scheduled_end_at")
    .maybeSingle();

  if (error || !data) {
    if (error) console.error("[booking] cancel failed:", { code: error.code, message: error.message });
    return { ok: false, error: "This booking changed and must be refreshed.", code: "CONFLICT" };
  }
  return { ok: true, data: data as BookingRow };
}

/**
 * Records how a session actually went.
 *
 * Only the instructor may close a booking out, and only after its end time: marking a session
 * complete before it has happened would make attendance and any future billing meaningless.
 */
export async function completeBooking(
  identity: SupabaseIdentity,
  input: { bookingId: string; outcome: BookingOutcome },
): Promise<Result<BookingRow>> {
  if (!(BOOKING_OUTCOMES as readonly string[]).includes(input.outcome)) {
    return { ok: false, error: "Unknown outcome.", code: "VALIDATION" };
  }

  const { db, booking } = await loadOwnBooking(identity, input.bookingId);
  if (!db) return { ok: false, error: "Scheduling persistence is not configured.", code: "SETUP_NEEDED" };
  if (!booking) return { ok: false, error: "Booking not found.", code: "NOT_FOUND" };
  if (booking.instructor_id !== identity.id) {
    return { ok: false, error: "Only the instructor can record how a session went.", code: "FORBIDDEN" };
  }
  if (booking.status !== "confirmed") {
    return { ok: false, error: `Only a confirmed booking can be closed; this one is "${booking.status}".`, code: "CONFLICT" };
  }
  if (new Date(booking.scheduled_end_at).getTime() > Date.now()) {
    return { ok: false, error: "This session has not finished yet.", code: "CONFLICT" };
  }

  const { data, error } = await db
    .from("bookings")
    .update({ status: input.outcome, updated_at: new Date().toISOString() })
    .eq("id", input.bookingId)
    .eq("status", "confirmed")
    .select("id,learner_id,instructor_id,status,scheduled_start_at,scheduled_end_at")
    .maybeSingle();

  // Both outcomes stay inside the active set, so the slot remains occupied and the exclusion
  // constraints keep protecting the history.
  if (isOverlap(error)) return { ok: false, error: "That slot conflicts with another booking.", code: "CONFLICT" };
  if (error || !data) {
    if (error) console.error("[booking] completion failed:", { code: error.code, message: error.message });
    return { ok: false, error: "This booking changed and must be refreshed.", code: "CONFLICT" };
  }
  return { ok: true, data: data as BookingRow };
}

export const BOOKING_ACTIVE_STATUSES = ACTIVE;
