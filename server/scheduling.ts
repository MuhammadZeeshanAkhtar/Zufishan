import { getSupabaseAdminClient } from "./supabase-admin-client";
import { getSupabasePublicClient, getSupabaseUserClient } from "./supabase-user-client";
import type { SupabaseIdentity } from "./supabase-auth";
import { atomicallyConfirmTrial } from "./scheduling-atomic";
import { attachInstructorStats, instructorIdsWithMinRating, ratingBucketCounts } from "./discovery-stats";

export type ScheduleErrorCode = "SETUP_NEEDED" | "VALIDATION" | "CONFLICT" | "FORBIDDEN" | "NOT_FOUND";
export type ScheduleResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: ScheduleErrorCode };
const ACTIVE_BOOKING_STATUSES = ["confirmed", "completed", "no_show", "disputed"] as const;

function fail(error: string, code: ScheduleErrorCode = "VALIDATION"): ScheduleResult<never> { return { ok: false, error, code }; }
function db(identity?: SupabaseIdentity) { return identity ? getSupabaseUserClient(identity.accessToken) : getSupabaseAdminClient(); }
function validTimezone(timezone: string) { try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(); return true; } catch { return false; } }
function validIso(value: string) { const date = new Date(value); return !Number.isNaN(date.getTime()); }
function activeRole(roles: unknown[], role: string) { return roles.some((row) => (row as { role?: string })?.role === role); }

async function hasRole(identity: SupabaseIdentity, roles: string[]) {
  const client = db(identity); if (!client) return false;
  const { data, error } = await client.from("user_roles").select("role").eq("user_id", identity.id);
  return !error && (data ?? []).some((row) => roles.includes(row.role));
}

async function notify(userId: string, type: string, title: string, body: string, relatedEntityType: string, relatedEntityId: string, idempotencyKey: string, locale = "en") {
  const client = db(); if (!client) return;
  await client.from("notifications").upsert({ user_id: userId, type, title, body, related_entity_type: relatedEntityType, related_entity_id: relatedEntityId, idempotency_key: idempotencyKey, locale }, { onConflict: "user_id,idempotency_key", ignoreDuplicates: true });
}

async function audit(actorId: string, action: string, entityType: string, entityId: string, metadata: Record<string, unknown> = {}) {
  const client = db(); if (!client) return;
  await client.from("audit_logs").insert({ actor_id: actorId, action, entity_type: entityType, entity_id: entityId, metadata });
}

function localDateTimeToUtc(date: string, time: string, timezone: string) {
  const [year, month, day] = date.split("-").map(Number); const [hour, minute] = time.split(":").map(Number);
  let guess = Date.UTC(year, month - 1, day, hour, minute);
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  for (let index = 0; index < 3; index += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
    const localAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour === 24 ? 0 : parts.hour, parts.minute);
    guess += Date.UTC(year, month - 1, day, hour, minute) - localAsUtc;
  }
  return new Date(guess);
}

function checkInterval(start: string, end: string, now = new Date()) {
  if (!validIso(start) || !validIso(end)) return fail("Choose a valid date and time.");
  const startDate = new Date(start); const endDate = new Date(end);
  if (startDate <= now) return fail("Choose a future date.");
  if (endDate <= startDate) return fail("End time must be after start time.");
  return { ok: true as const, startDate, endDate };
}

function localParts(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  const parts = Object.fromEntries(formatter.formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(String(parts.weekday));
  return { weekday, date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}` };
}

async function slotWithinAvailability(client: ReturnType<typeof getSupabaseUserClient>, instructorId: string, start: Date, end: Date) {
  if (!client) return { ok: false as const, error: "Scheduling persistence is not configured.", code: "SETUP_NEEDED" as const };
  const { data: intervals, error } = await client.from("instructor_availability").select("*").eq("instructor_id", instructorId).eq("active", true);
  if (error) return { ok: false as const, error: "Availability could not be checked.", code: "VALIDATION" as const };
  const now = new Date();
  const matching = (intervals ?? []).filter((interval) => {
    if (interval.is_break) return false;
    const parts = localParts(start, interval.timezone);
    const endParts = localParts(end, interval.timezone);
    const matchesDay = interval.exception_type === "weekly" ? interval.weekday === parts.weekday : interval.available_on === parts.date;
    const startLocal = String(interval.start_local).slice(0, 5);
    const endLocal = String(interval.end_local).slice(0, 5);
    const within = parts.time >= startLocal && endParts.time <= endLocal;
    const notice = start.getTime() - now.getTime() >= Number(interval.minimum_notice_minutes ?? 60) * 60_000;
    return matchesDay && within && notice;
  });
  if (!matching.length) return { ok: false as const, error: "The requested time is outside the instructor availability or minimum notice period.", code: "VALIDATION" as const };
  const bufferedStart = new Date(start.getTime() - Math.max(...matching.map((row) => Number(row.buffer_minutes ?? 0))) * 60_000);
  const bufferedEnd = new Date(end.getTime() + Math.max(...matching.map((row) => Number(row.buffer_minutes ?? 0))) * 60_000);
  const { data: conflicts, error: conflictError } = await client.from("bookings").select("id").eq("instructor_id", instructorId).in("status", ["confirmed", "completed", "no_show", "disputed"]).lt("scheduled_start_at", bufferedEnd.toISOString()).gt("scheduled_end_at", bufferedStart.toISOString()).limit(1);
  if (conflictError) return { ok: false as const, error: "The requested time could not be checked.", code: "VALIDATION" as const };
  if ((conflicts ?? []).length) return { ok: false as const, error: "The requested time overlaps an existing booking.", code: "CONFLICT" as const };
  return { ok: true as const };
}

export async function listInstructorAvailability(identity: SupabaseIdentity) {
  const client = db(identity); if (!client) return fail("Scheduling persistence is not configured.", "SETUP_NEEDED");
  if (!(await hasRole(identity, ["instructor", "admin", "super_admin"]))) return fail("Only an authorised instructor can manage availability.", "FORBIDDEN");
  const { data, error } = await client.from("instructor_availability").select("*").eq("instructor_id", identity.id).order("weekday").order("start_local");
  return error ? fail("Availability could not be loaded.") : { ok: true as const, data };
}

export async function createAvailabilityInterval(identity: SupabaseIdentity, input: { weekday: number; startLocal: string; endLocal: string; timezone: string; active?: boolean; bufferMinutes?: number; minimumNoticeMinutes?: number; availableOn?: string; exceptionType?: "weekly" | "date_exception" | "break"; isBreak?: boolean; courseId?: string }) {
  const client = db(identity); if (!client) return fail("Scheduling persistence is not configured.", "SETUP_NEEDED");
  if (!(await hasRole(identity, ["instructor", "admin", "super_admin"]))) return fail("Only an authorised instructor can manage availability.", "FORBIDDEN");
  if (!Number.isInteger(input.weekday) || input.weekday < 0 || input.weekday > 6 || input.startLocal >= input.endLocal) return fail("Choose a valid interval with a start time before its end time.");
  if (!validTimezone(input.timezone)) return fail("Choose a valid instructor timezone.");
  if (input.exceptionType !== "weekly" && !input.availableOn) return fail("A date is required for an exception or break interval.");
  if (input.availableOn && new Date(`${input.availableOn}T23:59:59Z`) < new Date()) return fail("Past date-specific availability cannot be created.");
  const { data, error } = await client.from("instructor_availability").insert({ instructor_id: identity.id, weekday: input.weekday, start_local: input.startLocal, end_local: input.endLocal, timezone: input.timezone, active: input.active ?? true, buffer_minutes: input.bufferMinutes ?? 0, minimum_notice_minutes: input.minimumNoticeMinutes ?? 60, available_on: input.availableOn ?? null, exception_type: input.exceptionType ?? "weekly", is_break: input.isBreak ?? input.exceptionType === "break", course_id: input.courseId ?? null }).select("*").single();
  if (error) return fail(error.code === "23505" ? "This availability interval already exists." : "Availability could not be saved.", error.code === "23505" ? "CONFLICT" : "VALIDATION");
  await audit(identity.id, "availability.created", "instructor_availability", data.id);
  return { ok: true as const, data };
}

export async function updateAvailabilityInterval(identity: SupabaseIdentity, id: string, input: Partial<{ weekday: number; startLocal: string; endLocal: string; timezone: string; active: boolean; bufferMinutes: number; minimumNoticeMinutes: number; availableOn: string | null; exceptionType: "weekly" | "date_exception" | "break"; isBreak: boolean; courseId: string | null }>) {
  const client = db(identity); if (!client) return fail("Scheduling persistence is not configured.", "SETUP_NEEDED");
  const { data: existing } = await client.from("instructor_availability").select("*").eq("id", id).eq("instructor_id", identity.id).maybeSingle();
  if (!existing) return fail("Availability interval not found.", "NOT_FOUND");
  const next = { ...existing, ...input };
  if (next.start_local >= next.end_local || !validTimezone(next.timezone)) return fail("Choose a valid interval and timezone.");
  const { data, error } = await client.from("instructor_availability").update({ weekday: next.weekday, start_local: next.start_local, end_local: next.end_local, timezone: next.timezone, active: next.active, buffer_minutes: next.buffer_minutes, minimum_notice_minutes: next.minimum_notice_minutes, available_on: next.available_on, exception_type: next.exception_type, is_break: next.is_break, course_id: next.course_id, updated_at: new Date().toISOString() }).eq("id", id).eq("instructor_id", identity.id).select("*").single();
  if (error) return fail("Availability could not be updated.");
  await audit(identity.id, "availability.updated", "instructor_availability", id);
  return { ok: true as const, data };
}

export async function deleteAvailabilityInterval(identity: SupabaseIdentity, id: string) {
  const client = db(identity); if (!client) return fail("Scheduling persistence is not configured.", "SETUP_NEEDED");
  const { error } = await client.from("instructor_availability").delete().eq("id", id).eq("instructor_id", identity.id);
  if (error) return fail("Availability could not be deleted.");
  await audit(identity.id, "availability.deleted", "instructor_availability", id);
  return { ok: true as const, data: { id } };
}

export async function getAvailableSlots(identity: SupabaseIdentity, input: { instructorId: string; startDate: string; endDate: string; learnerTimezone: string; durationMinutes?: number }) {
  const client = db(identity); if (!client) return fail("Scheduling persistence is not configured.", "SETUP_NEEDED");
  if (!validTimezone(input.learnerTimezone)) return fail("Choose a valid learner timezone.");
  const start = new Date(`${input.startDate}T00:00:00Z`); const end = new Date(`${input.endDate}T23:59:59Z`); if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return fail("Choose a valid date range.");
  const [{ data: instructorProfile }, { data: profile }, { data: availability }, { data: sessions }, { data: bookings }] = await Promise.all([
    client.from("instructor_profiles").select("user_id,public_slug,public_profile_status,verification_status").eq("user_id", input.instructorId).maybeSingle(),
    client.from("profiles").select("timezone").eq("id", input.instructorId).maybeSingle(),
    client.from("instructor_availability").select("*").eq("instructor_id", input.instructorId).eq("active", true),
    client.from("class_sessions").select("scheduled_start_at,scheduled_end_at,status").eq("instructor_id", input.instructorId).in("status", ["scheduled", "waiting_room", "live", "completed", "no_show"]),
    client.from("bookings").select("scheduled_start_at,scheduled_end_at,status").eq("instructor_id", input.instructorId).in("status", [...ACTIVE_BOOKING_STATUSES]),
  ]);
  if (!instructorProfile || instructorProfile.public_profile_status !== "published" || instructorProfile.verification_status !== "approved") return fail("This instructor's availability is not public.", "FORBIDDEN");
  const slots: Array<{ startAt: string; endAt: string; instructorTimezone: string; learnerTimezone: string; durationMinutes: number }> = [];
  const duration = input.durationMinutes ?? 30;
  for (let cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const date = cursor.toISOString().slice(0, 10); const weekday = cursor.getUTCDay();
    for (const interval of (availability ?? []).filter((row) => (row.exception_type === "weekly" ? row.weekday === weekday : row.available_on === date) && !row.is_break)) {
      const slotStart = localDateTimeToUtc(date, String(interval.start_local).slice(0, 5), interval.timezone); const slotEnd = new Date(slotStart.getTime() + duration * 60_000);
      if (slotEnd > localDateTimeToUtc(date, String(interval.end_local).slice(0, 5), interval.timezone)) continue;
      if (slotStart <= new Date(Date.now() + Number(interval.minimum_notice_minutes ?? 60) * 60_000)) continue;
      const buffer = Number(interval.buffer_minutes ?? 0) * 60_000;
      const bufferedStart = new Date(slotStart.getTime() - buffer);
      const bufferedEnd = new Date(slotEnd.getTime() + buffer);
      const overlaps = [...(sessions ?? []), ...(bookings ?? [])].some((session) => new Date(session.scheduled_start_at) < bufferedEnd && new Date(session.scheduled_end_at) > bufferedStart && !["cancelled", "expired"].includes(session.status));
      if (!overlaps) slots.push({ startAt: slotStart.toISOString(), endAt: slotEnd.toISOString(), instructorTimezone: interval.timezone, learnerTimezone: input.learnerTimezone, durationMinutes: duration });
    }
  }
  return { ok: true as const, data: slots };
}

export async function createTrialRequest(identity: SupabaseIdentity, input: { instructorId: string; courseId?: string; requirementId?: string; subject: string; learnerTimezone: string; instructorTimezone: string; requestedStartAt: string; requestedEndAt: string; learnerMessage: string; idempotencyKey: string; learnerLocale?: "en" | "ur" | "ar" }) {
  const client = db(identity); if (!client) return fail("Scheduling persistence is not configured.", "SETUP_NEEDED");
  if (!(await hasRole(identity, ["learner"]))) return fail("Only an authorised learner can request a trial.", "FORBIDDEN");
  const interval = checkInterval(input.requestedStartAt, input.requestedEndAt); if (!interval.ok) return interval;
  if (!validTimezone(input.learnerTimezone) || !validTimezone(input.instructorTimezone)) return fail("Choose valid learner and instructor timezones.");
  if (!input.learnerMessage.trim() || input.learnerMessage.length > 5000 || !input.idempotencyKey.trim()) return fail("Add a message and retry key before submitting.");
  const [{ data: instructor }, { data: instructorProfile }] = await Promise.all([
    client.from("profiles").select("timezone").eq("id", input.instructorId).maybeSingle(),
    client.from("instructor_profiles").select("user_id,public_profile_status,verification_status").eq("user_id", input.instructorId).maybeSingle(),
  ]);
  if (!instructorProfile || instructorProfile.public_profile_status !== "published" || instructorProfile.verification_status !== "approved") return fail("This instructor is not available for trial requests.", "FORBIDDEN");
  const resolvedInstructorTimezone = instructor?.timezone || input.instructorTimezone;
  if (!validTimezone(resolvedInstructorTimezone)) return fail("The instructor timezone is not configured.");
  if (!("startDate" in interval) || !("endDate" in interval)) return interval;
  const slotCheck = await slotWithinAvailability(client, input.instructorId, interval.startDate, interval.endDate);
  if (!slotCheck.ok) return slotCheck;
  const { data, error } = await client.from("trial_requests").insert({ learner_id: identity.id, instructor_id: input.instructorId, course_id: input.courseId ?? null, requirement_id: input.requirementId ?? null, subject: input.subject.trim(), learner_timezone: input.learnerTimezone, instructor_timezone: resolvedInstructorTimezone, requested_start_at: input.requestedStartAt, requested_end_at: input.requestedEndAt, learner_message: input.learnerMessage.trim(), status: "requested", idempotency_key: input.idempotencyKey, expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString() }).select("*").single();
  if (error) return fail(error.code === "23505" ? "This trial request was already submitted." : "Trial request could not be submitted.", error.code === "23505" ? "CONFLICT" : "VALIDATION");
  await notify(input.instructorId, "trial_requested", "New trial request", "A learner has requested a trial time.", "trial_request", data.id, `trial-request:${data.id}:instructor`, input.learnerLocale ?? "en");
  await audit(identity.id, "trial_request.created", "trial_request", data.id, { instructorId: input.instructorId });
  return { ok: true as const, data };
}

export async function acceptTrialRequest(identity: SupabaseIdentity, requestId: string) {
  return atomicallyConfirmTrial(identity, requestId, "instructor");
}

export async function declineTrialRequest(identity: SupabaseIdentity, requestId: string, reason: string) {
  const client = db(identity); if (!client) return fail("Scheduling persistence is not configured.", "SETUP_NEEDED");
  if (!reason.trim() || reason.length > 1000) return fail("A decline reason is required.");
  const { data: request } = await client.from("trial_requests").select("*").eq("id", requestId).eq("instructor_id", identity.id).maybeSingle();
  if (!request) return fail("Trial request not found.", "NOT_FOUND");
  const { data, error } = await client.from("trial_requests").update({ status: "declined", instructor_response: reason.trim(), updated_at: new Date().toISOString() }).eq("id", requestId).eq("instructor_id", identity.id).in("status", ["requested", "pending", "proposed_new_time", "proposed"]).select("*").maybeSingle();
  if (error || !data) return fail("This trial request changed and must be refreshed.", "CONFLICT");
  await notify(request.learner_id, "trial_declined", "Trial request declined", "Your instructor declined this trial request.", "trial_request", request.id, `trial-declined:${request.id}`);
  await audit(identity.id, "trial_request.declined", "trial_request", request.id, { reason: reason.trim() });
  return { ok: true as const, data };
}

export async function proposeNewTrialTime(identity: SupabaseIdentity, requestId: string, input: { startAt: string; endAt: string; instructorTimezone: string }) {
  const client = db(identity); if (!client) return fail("Scheduling persistence is not configured.", "SETUP_NEEDED");
  if (!validTimezone(input.instructorTimezone)) return fail("Choose a valid instructor timezone.");
  const interval = checkInterval(input.startAt, input.endAt); if (!interval.ok) return interval;
  const { data: request } = await client.from("trial_requests").select("*").eq("id", requestId).eq("instructor_id", identity.id).maybeSingle();
  if (!request) return fail("Trial request not found.", "NOT_FOUND");
  const { data, error } = await client.from("trial_requests").update({ proposed_start_at: input.startAt, proposed_end_at: input.endAt, instructor_timezone: input.instructorTimezone, status: "proposed_new_time", updated_at: new Date().toISOString() }).eq("id", requestId).eq("instructor_id", identity.id).in("status", ["requested", "pending", "proposed_new_time", "proposed"]).select("*").maybeSingle();
  if (error || !data) return fail("This trial request changed and must be refreshed.", "CONFLICT");
  await notify(request.learner_id, "time_proposed", "New time proposed", "Your instructor proposed a new trial time.", "trial_request", request.id, `trial-proposed:${request.id}:${input.startAt}`);
  await audit(identity.id, "trial_request.time_proposed", "trial_request", request.id, { startAt: input.startAt, endAt: input.endAt });
  return { ok: true as const, data };
}

export async function confirmProposedTime(identity: SupabaseIdentity, requestId: string) {
  return atomicallyConfirmTrial(identity, requestId, "learner");
}

export async function cancelTrialOrBooking(identity: SupabaseIdentity, id: string, reason: string) {
  const client = db(identity); if (!client) return fail("Scheduling persistence is not configured.", "SETUP_NEEDED");
  if (!reason.trim() || reason.length > 1000) return fail("A cancellation reason is required.");
  const { data: request } = await client.from("trial_requests").select("*").eq("id", id).or(`learner_id.eq.${identity.id},instructor_id.eq.${identity.id}`).maybeSingle();
  if (!request) return fail("Trial or booking not found.", "NOT_FOUND");
  const { data, error } = await client.from("trial_requests").update({ status: "cancelled", cancellation_reason: reason.trim(), cancelled_by: identity.id, cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id).in("status", ["requested", "pending", "proposed", "proposed_new_time", "accepted", "scheduled"]).select("*").maybeSingle();
  if (error || !data) return fail("This trial or booking changed and must be refreshed.", "CONFLICT");
  await client.from("bookings").update({ status: "cancelled", cancelled_by: identity.id, cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("trial_request_id", id).in("status", ACTIVE_BOOKING_STATUSES);
  const recipient = request.learner_id === identity.id ? request.instructor_id : request.learner_id;
  await notify(recipient, "class_cancelled", "Class cancelled", "A trial or booking was cancelled with a recorded reason.", "trial_request", id, `trial-cancelled:${id}:${identity.id}`);
  await audit(identity.id, "trial_request.cancelled", "trial_request", id, { reason: reason.trim() });
  return { ok: true as const, data };
}

export async function listBookings(identity: SupabaseIdentity, role: "learner" | "instructor") {
  const client = db(identity); if (!client) return fail("Scheduling persistence is not configured.", "SETUP_NEEDED");
  const column = role === "learner" ? "learner_id" : "instructor_id";
  const { data, error } = await client.from("bookings").select("*").eq(column, identity.id).order("scheduled_start_at");
  return error ? fail("Bookings could not be loaded.") : { ok: true as const, data };
}

export async function listSchedulingNotifications(identity: SupabaseIdentity) {
  const client = db(identity); if (!client) return fail("Scheduling persistence is not configured.", "SETUP_NEEDED");
  const { data, error } = await client.from("notifications").select("*").eq("user_id", identity.id).order("created_at", { ascending: false });
  return error ? fail("Notifications could not be loaded.") : { ok: true as const, data };
}

/**
 * Filters for public instructor discovery.
 *
 * Every field narrows the database query, so results reflect the filter rather than the UI merely
 * hiding rows it already fetched. The published/approved gate is applied unconditionally and is not
 * expressible through this input, so discovery can never surface an unpublished or unverified
 * profile no matter what a caller sends.
 */
export type PublicInstructorFilters = {
  query?: string;
  subjects?: string[];
  languages?: string[];
  levels?: string[];
  minRateMinor?: number;
  maxRateMinor?: number;
  minYearsExperience?: number;
  currency?: string;
  gender?: "male" | "female";
  country?: string;
  timezone?: string;
  sect?: string;
  hasIjazah?: boolean;
  /** Mean published rating floor, e.g. 4 for "4.0 and above". Unrated instructors never match. */
  minRating?: number;
  sort?: "relevance" | "rate_asc" | "rate_desc" | "experience_desc";
  limit?: number;
  offset?: number;
};

/**
 * Gender lives on `profiles`, whose RLS policy is own-row-only — the anonymous client used for
 * discovery cannot read it, and loosening that policy would expose every other profile column too.
 *
 * So the lookup runs on the admin client, narrowed to instructors who have already published an
 * approved profile, and returns nothing but their ids. Discovery then filters on those ids through
 * the anonymous client, which keeps RLS as the authority on who is visible at all. Gender is used
 * to select rows and is never returned to the caller.
 */
/**
 * Instructor accounts that must not be discoverable whatever their listing says.
 *
 * Anything other than `active` — suspended, pending or deleted — is excluded.
 * Returns null on a read failure so the caller can report an error rather than
 * quietly showing a suspended account.
 */
async function suspendedInstructorIds(): Promise<string[] | null> {
  const admin = getSupabaseAdminClient();
  // Without the admin client this cannot be checked, and discovery must not
  // guess that everyone is in good standing.
  if (!admin) return null;
  const { data, error } = await admin
    .from("profiles")
    .select("id")
    .neq("account_status", "active")
    .limit(GENDER_MATCH_CAP);
  if (error) {
    console.error("[discovery] standing lookup failed:", { code: error.code, message: error.message });
    return null;
  }
  return (data ?? []).map((row) => String((row as { id: string }).id));
}

async function publishedInstructorIdsByProfile(match: { gender?: string; country?: string; timezone?: string }): Promise<string[] | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) return null;
  let request = admin
    .from("instructor_profiles")
    .select("user_id,profiles!inner(gender,country,timezone)")
    .eq("public_profile_status", "published")
    .eq("verification_status", "approved");
  // One lookup covers every profile-side filter, so a learner combining gender and country still
  // costs a single query rather than one per attribute.
  if (match.gender) request = request.eq("profiles.gender", match.gender);
  if (match.country) request = request.eq("profiles.country", match.country);
  if (match.timezone) request = request.eq("profiles.timezone", match.timezone);
  const { data, error } = await request.limit(GENDER_MATCH_CAP);
  if (error) return null;
  return (data ?? []).map((row) => String((row as { user_id: string }).user_id));
}

/**
 * Ids of published instructors whose display or full name matches the search term.
 *
 * Names live on `profiles`, which the anonymous client cannot read, so a name search is
 * impossible from the browser side alone — searching only the slug meant typing a teacher's
 * actual name returned nothing. This resolves the term to ids through the admin client, the
 * same way the gender and country filters already do, and returns ids only: no name, avatar
 * or any other profile column leaves this function.
 *
 * The published-and-approved gate is applied here too, so an unpublished listing can never be
 * discovered by guessing at a name.
 */
async function publishedInstructorIdsByName(term: string): Promise<string[]> {
  const admin = getSupabaseAdminClient();
  if (!admin) return [];
  const escaped = term.replace(/[%,()]/g, " ").trim();
  if (!escaped) return [];
  const { data, error } = await admin
    .from("instructor_profiles")
    .select("user_id,profiles!inner(display_name,full_name,profile_visibility)")
    .eq("public_profile_status", "published")
    .eq("verification_status", "approved")
    // Only a person who made their profile public can be found by their name.
    .eq("profiles.profile_visibility", "public")
    .or(`display_name.ilike.%${escaped}%,full_name.ilike.%${escaped}%`, { referencedTable: "profiles" })
    .limit(GENDER_MATCH_CAP);
  if (error) {
    console.error("[discovery] name lookup failed:", { code: error.code, message: error.message });
    return [];
  }
  return (data ?? []).map((row) => String((row as { user_id: string }).user_id));
}

const MAX_DISCOVERY_PAGE = 48;
// Upper bound on the id set handed to the gender filter. Well above the current published roster;
// if the marketplace ever outgrows it, the id lookup should become a database view instead.
const GENDER_MATCH_CAP = 2_000;

export async function listPublicInstructors(filters: PublicInstructorFilters = {}) {
  const client = getSupabasePublicClient(); if (!client) return fail("Scheduling persistence is not configured.", "SETUP_NEEDED");

  const limit = Math.min(Math.max(filters.limit ?? 24, 1), MAX_DISCOVERY_PAGE);
  const offset = Math.max(filters.offset ?? 0, 0);

  let request = client
    .from("instructor_profiles")
    .select("user_id,public_slug,subjects,teaching_levels,teaching_languages,years_experience,teaching_approach,hourly_rate_minor,currency,availability_summary,public_profile_status,verification_status,sect,has_ijazah", { count: "exact" })
    // Not negotiable, and deliberately applied before any caller-supplied filter.
    .eq("public_profile_status", "published")
    .eq("verification_status", "approved");

  // A published listing is not enough on its own: an account that has been
  // suspended or deleted must leave discovery entirely, not merely appear
  // without its name. `account_status` lives on `profiles`, which this anonymous
  // client cannot read, so the ids are resolved through the admin client and
  // excluded here — before the count and the page, so the total stays honest.
  const barred = await suspendedInstructorIds();
  if (barred === null) return fail("Instructor discovery could not be loaded.");
  if (barred.length > 0) request = request.not("user_id", "in", `(${barred.join(",")})`);

  // Gender, country and timezone live on `profiles`, which this anonymous client cannot read, so
  // they are resolved to ids through the admin client first — see publishedInstructorIdsByProfile.
  if (filters.gender || filters.country || filters.timezone) {
    const ids = await publishedInstructorIdsByProfile({ gender: filters.gender, country: filters.country, timezone: filters.timezone });
    if (ids === null) return fail("Instructor discovery could not be loaded.");
    if (!ids.length) return { ok: true as const, data: { instructors: [], total: 0, limit, offset } };
    request = request.in("user_id", ids);
  }

  // Rating lives in `reviews`, not on the listing, so it resolves to ids the same way the
  // profile-side filters do. Applied before the page and the count, so the total stays honest.
  if (typeof filters.minRating === "number") {
    const rated = await instructorIdsWithMinRating(filters.minRating);
    if (rated === null) return fail("Instructor discovery could not be loaded.");
    if (!rated.length) return { ok: true as const, data: { instructors: [], total: 0, limit, offset } };
    request = request.in("user_id", rated);
  }

  // Sect and ijazah are on the listing itself, so they filter directly under the published policy.
  if (filters.sect) request = request.eq("sect", filters.sect);
  if (filters.hasIjazah) request = request.eq("has_ijazah", true);

  // Array columns: "overlaps" means "teaches any of the selected subjects".
  if (filters.subjects?.length) request = request.overlaps("subjects", filters.subjects);
  if (filters.languages?.length) request = request.overlaps("teaching_languages", filters.languages);
  if (filters.levels?.length) request = request.overlaps("teaching_levels", filters.levels);

  if (typeof filters.minRateMinor === "number") request = request.gte("hourly_rate_minor", filters.minRateMinor);
  if (typeof filters.maxRateMinor === "number") request = request.lte("hourly_rate_minor", filters.maxRateMinor);
  if (typeof filters.minYearsExperience === "number") request = request.gte("years_experience", filters.minYearsExperience);
  if (filters.currency) request = request.eq("currency", filters.currency);

  // Free-text search stays on public profile fields only — never on private profile data.
  const term = filters.query?.trim();
  if (term) {
    const escaped = term.replace(/[%,()]/g, " ").trim();
    if (escaped) {
      // A name match and a listing match are alternatives, so they belong in one `or` — two
      // separate filters would AND and return only instructors matching both.
      const named = await publishedInstructorIdsByName(escaped);
      const clauses = [`public_slug.ilike.%${escaped}%`, `teaching_approach.ilike.%${escaped}%`, `availability_summary.ilike.%${escaped}%`];
      if (named.length) clauses.push(`user_id.in.(${named.join(",")})`);
      request = request.or(clauses.join(","));
    }
  }

  switch (filters.sort) {
    case "rate_asc": request = request.order("hourly_rate_minor", { ascending: true, nullsFirst: false }); break;
    case "rate_desc": request = request.order("hourly_rate_minor", { ascending: false, nullsFirst: false }); break;
    case "experience_desc": request = request.order("years_experience", { ascending: false, nullsFirst: false }); break;
    default: request = request.order("public_slug", { ascending: true });
  }

  const { data, error, count } = await request.range(offset, offset + limit - 1);
  if (error) return fail("Instructor discovery could not be loaded.");

  // Presentation first (who they are), then the aggregates (what they have taught). Both run
  // over this page only, and neither can widen the rows the published+approved gate allowed.
  const instructors = await attachInstructorStats(await attachPublicPresentation(data ?? []));
  return { ok: true as const, data: { instructors, total: count ?? 0, limit, offset } };
}

/**
 * Attaches the person-level fields a discovery card needs, for the rows on this
 * page only.
 *
 * `profiles` is `select own or admin` under RLS, so neither the anonymous client
 * nor another signed-in learner can read a name or an avatar from it. Without
 * this the card had nothing to identify an instructor by and printed the URL
 * slug as the heading.
 *
 * Two consents are required, and they are different things:
 *
 *   - `instructor_profiles.public_profile_status = 'published'` and
 *     `verification_status = 'approved'` decide whether the LISTING appears.
 *     Those are already applied by the caller, before any user-supplied filter.
 *   - `profiles.profile_visibility = 'public'` decides whether the PERSON's
 *     details may be shown. A published listing whose profile is private still
 *     appears, but as its slug and a fallback avatar — the listing was consented
 *     to, the personal detail was not.
 *
 * The selected columns are an allow-list. `city` is deliberately absent: country
 * and timezone are the agreed granularity. Nothing here reads an email, a phone
 * number, a credential, or any private column, and this runs on the admin client
 * only after the published-and-approved filter has already narrowed the rows.
 */
type PublicPresentation = {
  displayName: string | null;
  avatarUrl: string | null;
  country: string | null;
  timezone: string | null;
  gender: string | null;
  bio: string | null;
  /** False when the person kept their profile private; the card then shows no personal detail. */
  profilePublic: boolean;
};

async function attachPublicPresentation<T extends { user_id?: string }>(rows: T[]): Promise<Array<T & PublicPresentation>> {
  const blank: PublicPresentation = {
    displayName: null, avatarUrl: null, country: null, timezone: null, gender: null, bio: null, profilePublic: false,
  };
  const ids = rows.map((row) => row.user_id).filter((id): id is string => typeof id === "string");
  if (ids.length === 0) return rows.map((row) => ({ ...row, ...blank }));

  const admin = getSupabaseAdminClient();
  // No admin client is not a reason to fail discovery: the listings are real and
  // still useful. The cards simply carry no personal detail.
  if (!admin) return rows.map((row) => ({ ...row, ...blank }));

  const { data, error } = await admin
    .from("profiles")
    .select("id,display_name,full_name,avatar_url,country,timezone,gender,bio,profile_visibility,account_status")
    .in("id", ids);
  if (error) {
    console.error("[discovery] presentation lookup failed:", { code: error.code, message: error.message });
    return rows.map((row) => ({ ...row, ...blank }));
  }

  const byId = new Map<string, PublicPresentation>();
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    // A suspended or deleted account is never presented, whatever its listing says.
    const active = String(row.account_status ?? "") === "active";
    const isPublic = String(row.profile_visibility ?? "") === "public" && active;
    byId.set(String(row.id), isPublic
      ? {
          displayName: (row.display_name ? String(row.display_name) : null) || (row.full_name ? String(row.full_name) : null),
          avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
          country: row.country ? String(row.country) : null,
          timezone: row.timezone ? String(row.timezone) : null,
          gender: row.gender ? String(row.gender) : null,
          bio: row.bio ? String(row.bio) : null,
          profilePublic: true,
        }
      : blank);
  }

  return rows.map((row) => ({ ...row, ...(byId.get(String(row.user_id)) ?? blank) }));
}

/** Distinct values actually present on published profiles, so the UI never offers a dead filter. */
export async function listInstructorFilterFacets() {
  const client = getSupabasePublicClient(); if (!client) return fail("Scheduling persistence is not configured.", "SETUP_NEEDED");
  const { data, error } = await client
    .from("instructor_profiles")
    .select("subjects,teaching_languages,teaching_levels,hourly_rate_minor,currency")
    .eq("public_profile_status", "published")
    .eq("verification_status", "approved");
  if (error) return fail("Discovery filters could not be loaded.");
  const rows = data ?? [];
  const collect = (key: "subjects" | "teaching_languages" | "teaching_levels") =>
    Array.from(new Set(rows.flatMap((row) => (row[key] as string[] | null) ?? []))).filter(Boolean).sort();
  const rates = rows.map((row) => row.hourly_rate_minor as number | null).filter((value): value is number => typeof value === "number");
  // Counts of instructors, not of reviews, so the figure beside a threshold is exactly how many
  // listings that filter would return. Null when the lookup failed: the sidebar then offers no
  // rating filter at all rather than showing a count it could not verify.
  const ratingBuckets = await ratingBucketCounts();
  return {
    ok: true as const,
    data: {
      subjects: collect("subjects"),
      languages: collect("teaching_languages"),
      levels: collect("teaching_levels"),
      ratingBuckets,
      currencies: Array.from(new Set(rows.map((row) => row.currency as string | null).filter(Boolean))).sort() as string[],
      rateRangeMinor: rates.length ? { min: Math.min(...rates), max: Math.max(...rates) } : null,
    },
  };
}

export async function getPublicInstructorBySlug(slug: string) {
  const client = db(); if (!client) return fail("Scheduling persistence is not configured.", "SETUP_NEEDED");
  // The same columns the discovery card reads, so a listing and its profile page can never
  // disagree about what the instructor teaches or charges.
  const { data, error } = await client.from("instructor_profiles").select("user_id,public_slug,subjects,teaching_levels,teaching_languages,years_experience,teaching_approach,hourly_rate_minor,currency,availability_summary,public_profile_status,verification_status,sect,has_ijazah").eq("public_slug", slug).eq("public_profile_status", "published").eq("verification_status", "approved").maybeSingle();
  if (error) return fail("Instructor availability could not be loaded.");
  if (!data) return fail("Instructor profile not found.", "NOT_FOUND");
  // Presentation and aggregates come from the same two helpers the listing uses, so the
  // privacy rules and the counting rules are stated once rather than twice.
  const [presented] = await attachInstructorStats(await attachPublicPresentation([data]));
  // `timezone` and `display_name` keep their original contract: scheduling reads the timezone
  // as the instructor's booking zone and must never receive null, and the trial form names the
  // instructor from `display_name`. A private profile still falls back to the public slug.
  return {
    ok: true as const,
    data: { ...presented, timezone: presented.timezone || "UTC", display_name: presented.displayName || data.public_slug },
  };
}

export async function listTrialRequests(identity: SupabaseIdentity, role: "learner" | "instructor") {
  const client = db(identity); if (!client) return fail("Scheduling persistence is not configured.", "SETUP_NEEDED");
  const column = role === "learner" ? "learner_id" : "instructor_id";
  const { data, error } = await client.from("trial_requests").select("*").eq(column, identity.id).order("created_at", { ascending: false });
  return error ? fail("Trial requests could not be loaded.") : { ok: true as const, data };
}

export async function getOwnTrialRequest(identity: SupabaseIdentity, requestId: string) {
  const client = db(identity); if (!client) return fail("Scheduling persistence is not configured.", "SETUP_NEEDED");
  const { data, error } = await client.from("trial_requests").select("*").eq("id", requestId).or(`learner_id.eq.${identity.id},instructor_id.eq.${identity.id}`).maybeSingle();
  if (error) return fail("Trial request could not be loaded.");
  if (!data) return fail("Trial request not found.", "NOT_FOUND");
  return { ok: true as const, data };
}

export async function listClassSessions(identity: SupabaseIdentity, role: "learner" | "instructor") {
  const client = db(identity); if (!client) return fail("Scheduling persistence is not configured.", "SETUP_NEEDED");
  const column = role === "learner" ? "learner_id" : "instructor_id";
  const { data, error } = await client.from("class_sessions").select("*").eq(column, identity.id).order("scheduled_start_at");
  return error ? fail("Class sessions could not be loaded.") : { ok: true as const, data };
}
