/**
 * Class sessions — the record of a meeting that is scheduled, happens, and ends.
 *
 * The schema draws a deliberate line that is worth keeping: a `booking` is an agreement to meet, a
 * `class_session` is the meeting itself. Attendance hangs off the session, and so do reviews, whose
 * insert policy requires a session with status 'completed'. Nothing wrote `class_sessions`, so that
 * whole branch — attendance, reviews, the classroom — had no foundation. This file is that
 * foundation, and it deliberately stops short of any video provider.
 *
 * Provider boundary, stated explicitly because the rest of the classroom depends on it:
 *   `live_provider`, `external_session_id` and `recording_status` are left at their defaults here.
 *   A session can be scheduled, opened, attended and closed with no provider configured at all —
 *   what is missing in that case is the video call, not the record. `recording_status` therefore
 *   stays 'not_configured' rather than pretending a recording exists, and the UI reads that as a
 *   setup-needed state.
 *
 * There is no `booking_id` on `class_sessions`; the link is `trial_request_id`, which bookings also
 * carry. That is what makes "one session per booking" expressible without a schema change.
 */
import { getSupabaseAdminClient } from "./supabase-admin-client";
import { getSupabaseUserClient } from "./supabase-user-client";
import type { SupabaseIdentity } from "./supabase-auth";
import { resolveClassroomProvider, type JoinGrant, type RecordingStatus } from "./classroom-provider";

/** The ordered life of a session. A session may also be cancelled or marked no_show. */
export const SESSION_FLOW = ["scheduled", "waiting_room", "live", "completed"] as const;
export const SESSION_STATUSES = [...SESSION_FLOW, "cancelled", "no_show"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

type Result<T> =
  | { ok: true; data: T }
  // PROVIDER_FAILED is its own code: a provider that was asked and failed is a different problem
  // from one that was never configured, and the two must not collapse into one message.
  | { ok: false; error: string; code?: "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "SETUP_NEEDED" | "VALIDATION" | "PROVIDER_FAILED" };

type SessionRow = {
  id: string; learner_id: string; instructor_id: string; status: string;
  scheduled_start_at: string; scheduled_end_at: string; session_type: string;
  live_provider: string | null; external_session_id: string | null; recording_status: string;
};

const SESSION_COLUMNS = "id,learner_id,instructor_id,status,scheduled_start_at,scheduled_end_at,session_type,live_provider,external_session_id,recording_status";

/**
 * Creates the session for a confirmed booking, or returns the one that already exists.
 *
 * Idempotent on purpose: both parties opening the classroom at once must not produce two sessions
 * for one meeting, which would split attendance between them and leave neither reviewable.
 */
export async function openSessionForBooking(
  identity: SupabaseIdentity,
  input: { bookingId: string },
): Promise<Result<{ sessionId: string; created: boolean }>> {
  const db = getSupabaseUserClient(identity.accessToken);
  const admin = getSupabaseAdminClient();
  if (!db || !admin) return { ok: false, error: "Scheduling persistence is not configured.", code: "SETUP_NEEDED" };

  // RLS already limits this read to the booking's two parties.
  const { data: booking } = await db
    .from("bookings")
    .select("id,trial_request_id,learner_id,instructor_id,course_id,subject,scheduled_start_at,scheduled_end_at,learner_timezone,instructor_timezone,status")
    .eq("id", input.bookingId)
    .maybeSingle();
  if (!booking) return { ok: false, error: "Booking not found.", code: "NOT_FOUND" };

  const row = booking as Record<string, string | null>;
  if (row.learner_id !== identity.id && row.instructor_id !== identity.id) {
    return { ok: false, error: "Only the learner or instructor on a booking can open its session.", code: "FORBIDDEN" };
  }
  if (row.status !== "confirmed") {
    return { ok: false, error: `Only a confirmed booking has a session; this one is "${row.status}".`, code: "CONFLICT" };
  }

  const trialRequestId = row.trial_request_id;
  if (trialRequestId) {
    const { data: existing } = await admin
      .from("class_sessions").select("id").eq("trial_request_id", trialRequestId).maybeSingle();
    if (existing) return { ok: true, data: { sessionId: String((existing as { id: string }).id), created: false } };
  }

  const { data: created, error: createError } = await admin
    .from("class_sessions")
    .insert({
      trial_request_id: trialRequestId,
      course_id: row.course_id,
      learner_id: row.learner_id,
      instructor_id: row.instructor_id,
      title: row.subject ?? "Session",
      session_type: row.course_id ? "course" : "trial",
      scheduled_start_at: row.scheduled_start_at,
      scheduled_end_at: row.scheduled_end_at,
      learner_timezone: row.learner_timezone,
      instructor_timezone: row.instructor_timezone,
      // No provider is configured here on purpose — see the note at the top of this file.
    })
    .select("id")
    .single();

  if (createError || !created) {
    console.error("[class-session] create failed:", { code: createError?.code, message: createError?.message });
    return { ok: false, error: "The session could not be created." };
  }

  const sessionId = String((created as { id: string }).id);
  // class_participants is moderator-write under RLS, so the roster is seeded server-side.
  const { error: rosterError } = await admin.from("class_participants").insert([
    { session_id: sessionId, user_id: row.learner_id, participant_role: "learner" },
    { session_id: sessionId, user_id: row.instructor_id, participant_role: "instructor" },
  ]);
  if (rosterError) {
    await admin.from("class_sessions").delete().eq("id", sessionId);
    console.error("[class-session] roster failed, session removed:", { code: rosterError.code, message: rosterError.message });
    return { ok: false, error: "The session could not be created." };
  }

  return { ok: true, data: { sessionId, created: true } };
}

/**
 * Advances a session through its life.
 *
 * Transitions are ordered — a session cannot go straight from scheduled to completed, because
 * attendance and reviews both read a session that genuinely ran. Only the instructor opens or ends
 * a session; a learner joining is attendance, which is separate.
 */
export async function setSessionStatus(
  identity: SupabaseIdentity,
  input: { sessionId: string; status: SessionStatus },
): Promise<Result<SessionRow>> {
  if (!(SESSION_STATUSES as readonly string[]).includes(input.status)) {
    return { ok: false, error: "Unknown session status.", code: "VALIDATION" };
  }

  const db = getSupabaseUserClient(identity.accessToken);
  if (!db) return { ok: false, error: "Scheduling persistence is not configured.", code: "SETUP_NEEDED" };

  const { data } = await db.from("class_sessions").select(SESSION_COLUMNS).eq("id", input.sessionId).maybeSingle();
  const session = data as SessionRow | null;
  if (!session) return { ok: false, error: "Session not found.", code: "NOT_FOUND" };
  if (session.instructor_id !== identity.id) {
    return { ok: false, error: "Only the instructor can move a session through its stages.", code: "FORBIDDEN" };
  }

  const from = session.status as SessionStatus;
  if (from === "completed" || from === "cancelled" || from === "no_show") {
    return { ok: false, error: `This session is already "${from}".`, code: "CONFLICT" };
  }
  // Cancelling or marking no_show is allowed from any open state; otherwise the flow is in order.
  if (input.status !== "cancelled" && input.status !== "no_show") {
    const current = SESSION_FLOW.indexOf(from as (typeof SESSION_FLOW)[number]);
    const next = SESSION_FLOW.indexOf(input.status as (typeof SESSION_FLOW)[number]);
    if (next !== current + 1) {
      return { ok: false, error: `A session moves ${SESSION_FLOW.join(" → ")}; it cannot jump from "${from}" to "${input.status}".`, code: "CONFLICT" };
    }
  }

  const patch: Record<string, unknown> = { status: input.status, updated_at: new Date().toISOString() };
  if (input.status === "completed") patch.ended_at = new Date().toISOString();

  const { data: updated, error } = await db
    .from("class_sessions").update(patch).eq("id", input.sessionId).eq("status", from).select(SESSION_COLUMNS).maybeSingle();
  if (error || !updated) {
    if (error) console.error("[class-session] status write failed:", { code: error.code, message: error.message });
    return { ok: false, error: "This session changed and must be refreshed.", code: "CONFLICT" };
  }
  return { ok: true, data: updated as SessionRow };
}

/**
 * Records that the caller joined or left. Each person writes only their own attendance — that is
 * what `class_attendance_own_write` enforces, and it is why this runs on the user client.
 */
export async function recordOwnAttendance(
  identity: SupabaseIdentity,
  input: { sessionId: string; action: "join" | "leave" },
): Promise<Result<{ sessionId: string; action: "join" | "leave" }>> {
  const db = getSupabaseUserClient(identity.accessToken);
  if (!db) return { ok: false, error: "Scheduling persistence is not configured.", code: "SETUP_NEEDED" };

  const { data } = await db.from("class_sessions").select("id,status").eq("id", input.sessionId).maybeSingle();
  if (!data) return { ok: false, error: "Session not found.", code: "NOT_FOUND" };
  const status = String((data as { status: string }).status);
  if (status !== "waiting_room" && status !== "live") {
    return { ok: false, error: "This session is not open to join.", code: "CONFLICT" };
  }

  const now = new Date().toISOString();
  const { error } = input.action === "join"
    ? await db.from("class_attendance").upsert(
        { session_id: input.sessionId, user_id: identity.id, joined_at: now, status: "present" },
        { onConflict: "session_id,user_id" })
    : await db.from("class_attendance").update({ left_at: now }).eq("session_id", input.sessionId).eq("user_id", identity.id);

  if (error) {
    console.error("[class-session] attendance failed:", { code: error.code, message: error.message });
    return { ok: false, error: "Attendance could not be recorded." };
  }
  return { ok: true, data: { sessionId: input.sessionId, action: input.action } };
}

/**
 * One session, if the caller is party to it.
 *
 * `class_sessions_participant_or_moderator` means a stranger's read returns nothing rather than a
 * row, so "not found" and "not yours" are genuinely the same answer here — and reporting it as
 * NOT_FOUND avoids confirming that a session with that id exists to someone who cannot see it.
 */
export async function getOwnSession(identity: SupabaseIdentity, input: { sessionId: string }): Promise<Result<SessionRow>> {
  const db = getSupabaseUserClient(identity.accessToken);
  if (!db) return { ok: false, error: "Scheduling persistence is not configured.", code: "SETUP_NEEDED" };
  const { data, error } = await db.from("class_sessions").select(SESSION_COLUMNS).eq("id", input.sessionId).maybeSingle();
  if (error) {
    console.error("[class-session] read failed:", { code: error.code, message: error.message });
    return { ok: false, error: "The session could not be loaded." };
  }
  if (!data) return { ok: false, error: "This session is not available to your account.", code: "NOT_FOUND" };
  return { ok: true, data: data as SessionRow };
}

/**
 * Who has joined this session.
 *
 * `class_attendance_session_member` lets either party read the whole session's attendance, so both
 * sides can see whether the other has arrived. Only the user id, timestamps and status are
 * returned — the caller already knows which id is the instructor's and which is theirs from the
 * session row, so the screen can label each side by role without reading anybody's profile.
 */
export async function listSessionAttendance(identity: SupabaseIdentity, input: { sessionId: string }): Promise<Result<unknown[]>> {
  const db = getSupabaseUserClient(identity.accessToken);
  if (!db) return { ok: false, error: "Scheduling persistence is not configured.", code: "SETUP_NEEDED" };
  const { data, error } = await db
    .from("class_attendance").select("id,session_id,user_id,joined_at,left_at,status").eq("session_id", input.sessionId);
  if (error) {
    console.error("[class-session] attendance list failed:", { code: error.code, message: error.message });
    return { ok: false, error: "Attendance could not be loaded." };
  }
  return { ok: true, data: data ?? [] };
}

/**
 * Asks the provider for this person's join credential.
 *
 * Three refusals, kept apart because they are three different problems: the caller is not party to
 * the session, no provider is configured, or the provider was asked and failed. None of them
 * produces a link — a fabricated join URL is worse than no link, because it fails in front of a
 * learner at the moment a class was due to start.
 *
 * The grant is issued per person and short-lived, and the room is created on first ask so a session
 * that nobody opens never reaches the provider at all.
 */
export async function requestJoinGrant(
  identity: SupabaseIdentity,
  input: { sessionId: string },
): Promise<Result<JoinGrant>> {
  const session = await getOwnSession(identity, { sessionId: input.sessionId });
  if (!session.ok) return session;

  const row = session.data;
  if (row.status !== "waiting_room" && row.status !== "live") {
    return { ok: false, error: "This session is not open to join.", code: "CONFLICT" };
  }

  const resolved = resolveClassroomProvider();
  if (resolved.status !== "ready") {
    return { ok: false, error: "No live classroom provider is connected, so there is no call to join.", code: "SETUP_NEEDED" };
  }

  const db = getSupabaseUserClient(identity.accessToken);
  if (!db) return { ok: false, error: "Scheduling persistence is not configured.", code: "SETUP_NEEDED" };

  // Create the room once, and record which provider owns it, so a later provider change is visible
  // in the record rather than silently reinterpreted.
  let externalSessionId = row.external_session_id;
  if (!externalSessionId) {
    const created = await resolved.provider.createRoom({
      sessionId: row.id, scheduledStartAt: row.scheduled_start_at, scheduledEndAt: row.scheduled_end_at,
    });
    if (!created.ok) return created;
    externalSessionId = created.data.externalSessionId;
    const { error } = await db
      .from("class_sessions")
      .update({ live_provider: resolved.provider.name, external_session_id: externalSessionId, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (error) {
      console.error("[class-session] room record failed:", { code: error.code, message: error.message });
      return { ok: false, error: "The classroom was created but could not be recorded.", code: "PROVIDER_FAILED" };
    }
  }

  return resolved.provider.issueJoinGrant({
    externalSessionId,
    userId: identity.id,
    role: row.instructor_id === identity.id ? "host" : "guest",
    displayName: "",
  });
}

/**
 * What the provider currently holds for this session's recording.
 *
 * `recording_status` on the row is the platform's own record and defaults to 'not_configured'. It is
 * never advanced by guesswork: with no provider there is nothing to ask, so the stored value stands.
 */
export async function readSessionRecordingStatus(
  identity: SupabaseIdentity,
  input: { sessionId: string },
): Promise<Result<{ status: RecordingStatus; fromProvider: boolean }>> {
  const session = await getOwnSession(identity, { sessionId: input.sessionId });
  if (!session.ok) return session;

  const resolved = resolveClassroomProvider();
  const stored = session.data.recording_status as RecordingStatus;
  if (resolved.status !== "ready" || !session.data.external_session_id) {
    return { ok: true, data: { status: stored, fromProvider: false } };
  }

  const live = await resolved.provider.readRecordingStatus({ externalSessionId: session.data.external_session_id });
  if (!live.ok) return { ok: true, data: { status: stored, fromProvider: false } };
  return { ok: true, data: { status: live.data, fromProvider: true } };
}

/** The sessions the caller is party to. RLS scopes this to their own. */
export async function listOwnSessions(identity: SupabaseIdentity): Promise<Result<unknown[]>> {
  const db = getSupabaseUserClient(identity.accessToken);
  if (!db) return { ok: false, error: "Scheduling persistence is not configured.", code: "SETUP_NEEDED" };
  const { data, error } = await db
    .from("class_sessions").select(SESSION_COLUMNS).order("scheduled_start_at", { ascending: false }).limit(100);
  if (error) {
    console.error("[class-session] list failed:", { code: error.code, message: error.message });
    return { ok: false, error: "Sessions could not be loaded." };
  }
  return { ok: true, data: data ?? [] };
}
