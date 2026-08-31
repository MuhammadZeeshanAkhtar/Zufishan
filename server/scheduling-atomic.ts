import pg from "pg";
import type { SupabaseIdentity } from "./supabase-auth";

export type AtomicErrorCode = "SETUP_NEEDED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "VALIDATION";
export type AtomicConfirmation = { ok: true; data: { request: Record<string, unknown>; booking: Record<string, unknown>; session: Record<string, unknown> } } | { ok: false; error: string; code?: AtomicErrorCode };

export async function atomicallyConfirmTrial(identity: SupabaseIdentity, requestId: string, actor: "learner" | "instructor"): Promise<AtomicConfirmation> {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) return { ok: false, error: "Scheduling persistence is not configured.", code: "SETUP_NEEDED" };
  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    await client.query("begin");
    const role = await client.query("select 1 from public.user_roles where user_id = $1 and role = any($2::text[]) limit 1", [identity.id, actor === "learner" ? ["learner"] : ["instructor", "admin", "super_admin"]]);
    if (role.rowCount !== 1) throw Object.assign(new Error("FORBIDDEN"), { code: "FORBIDDEN" });
    const request = await client.query("select * from public.trial_requests where id = $1 and (learner_id = $2 or instructor_id = $2) for update", [requestId, identity.id]);
    if (request.rowCount !== 1) throw Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND" });
    const row = request.rows[0];
    const allowed = actor === "learner" ? ["proposed", "proposed_new_time"] : ["requested", "pending", "proposed", "proposed_new_time"];
    if (!allowed.includes(row.status)) throw Object.assign(new Error("CONFLICT"), { code: "CONFLICT" });
    if (row.expires_at && new Date(row.expires_at) <= new Date()) throw Object.assign(new Error("CONFLICT"), { code: "CONFLICT" });
    const start = row.proposed_start_at ?? row.requested_start_at;
    const end = row.proposed_end_at ?? row.requested_end_at;
    const booking = await client.query(`insert into public.bookings (trial_request_id, learner_id, instructor_id, course_id, subject, scheduled_start_at, scheduled_end_at, learner_timezone, instructor_timezone, status, idempotency_key)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'confirmed',$10) returning *`, [row.id, row.learner_id, row.instructor_id, row.course_id, row.subject, start, end, row.learner_timezone, row.instructor_timezone, `trial:${row.id}:confirmed`]);
    const updated = await client.query("update public.trial_requests set status='scheduled', confirmed_at=now(), updated_at=now() where id=$1 and status=$2 returning *", [row.id, row.status]);
    if (updated.rowCount !== 1) throw Object.assign(new Error("CONFLICT"), { code: "CONFLICT" });
    const session = await client.query(`insert into public.class_sessions (booking_id, trial_request_id, course_id, learner_id, instructor_id, title, session_type, scheduled_start_at, scheduled_end_at, learner_timezone, instructor_timezone, status, recording_status)
      values ($1,$2,$3,$4,$5,$6,'trial',$7,$8,$9,$10,'scheduled','not_configured') returning *`, [booking.rows[0].id, row.id, row.course_id, row.learner_id, row.instructor_id, `${row.subject} · trial class`, start, end, row.learner_timezone, row.instructor_timezone]);
    await client.query("insert into public.class_participants (session_id,user_id,participant_role) values ($1,$2,'learner'),($1,$3,'instructor')", [session.rows[0].id, row.learner_id, row.instructor_id]);
    const recipient = actor === "learner" ? row.instructor_id : row.learner_id;
    await client.query(`insert into public.notifications (user_id,type,title,body,related_entity_type,related_entity_id,idempotency_key,locale)
      values ($1,$2,$3,$4,$5,$6,$7,'en') on conflict (user_id,idempotency_key) do nothing`, [recipient, actor === "learner" ? "time_accepted" : "trial_accepted", actor === "learner" ? "Trial time confirmed" : "Trial accepted", actor === "learner" ? "The learner confirmed your proposed trial time." : "Your instructor accepted the requested trial time.", "class_session", session.rows[0].id, `trial-confirmed:${row.id}`]);
    await client.query("insert into public.audit_logs (actor_id,action,entity_type,entity_id,metadata) values ($1,$2,$3,$4,$5)", [identity.id, actor === "learner" ? "trial_request.confirmed" : "trial_request.accepted", "trial_request", row.id, JSON.stringify({ bookingId: booking.rows[0].id, sessionId: session.rows[0].id })]);
    await client.query("commit");
    return { ok: true, data: { request: updated.rows[0], booking: booking.rows[0], session: session.rows[0] } };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    const code = error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code) : "";
    if (["FORBIDDEN", "NOT_FOUND", "CONFLICT"].includes(code)) return { ok: false, error: code === "FORBIDDEN" ? "You are not authorised to confirm this trial." : code === "NOT_FOUND" ? "Trial request not found." : "This trial time is no longer available or has already been confirmed.", code: code as AtomicErrorCode };
    if (code.startsWith("23")) return { ok: false, error: "This time is no longer available.", code: "CONFLICT" };
    return { ok: false, error: "Booking could not be confirmed.", code: "VALIDATION" };
  } finally { await client.end().catch(() => undefined); }
}
