/**
 * Telling a reviewer that something was published, and recording their decision about a course.
 *
 * A teacher publishes to say they are ready; a reviewer's approval is what makes the profile live
 * (migration 0036). That only works if the reviewer is actually told, so publishing raises a notice
 * to every reviewer — and a teacher who publishes without the answers a learner cannot do without
 * is told which ones are missing, rather than being left with a profile that never appears.
 *
 * Two boundaries worth naming:
 *
 *  - `notifications` has no insert policy at all, deliberately, so no account can forge a row
 *    addressed to someone else. The notice is therefore written on the admin client, after the
 *    calling procedure has already established that the publication genuinely happened — the same
 *    shape `supabase-core` and `scheduling-atomic` already use.
 *  - `setCourseVerification` refuses any caller who is not a reviewer *and* the database refuses
 *    them a second time: `courses_verification_is_admin_only` raises on a non-reviewer write. The
 *    check here produces a readable error; the trigger is what makes it true.
 */
import { getSupabaseAdminClient } from "./supabase-admin-client";
import type { SupabaseIdentity } from "./supabase-auth";

export type ReviewResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: "SETUP_NEEDED" | "FORBIDDEN" | "VALIDATION" | "NOT_FOUND" };
const fail = (error: string, code: "SETUP_NEEDED" | "FORBIDDEN" | "VALIDATION" | "NOT_FOUND" = "VALIDATION"): ReviewResult<never> => ({ ok: false, error, code });

/** Roles that may decide a verification. Matches `is_admin_user() or is_moderator_user()`. */
const REVIEWER_ROLES = ["admin", "super_admin", "moderator"];

export const COURSE_VERIFICATION_STATUSES = ["verification_pending", "approved", "rejected"] as const;
export type CourseVerificationStatus = (typeof COURSE_VERIFICATION_STATUSES)[number];

/** Every reviewer's user id, read on the admin client because `user_roles` is not public. */
async function reviewerIds(): Promise<string[]> {
  const admin = getSupabaseAdminClient();
  if (!admin) return [];
  const { data, error } = await admin.from("user_roles").select("user_id,role").in("role", REVIEWER_ROLES);
  if (error) {
    console.error("[review-queue] reviewer lookup failed:", { code: error.code, message: error.message });
    return [];
  }
  return Array.from(new Set((data ?? []).map((row) => String((row as { user_id: string }).user_id))));
}

/**
 * Raises one notice per reviewer that something is waiting to be looked at.
 *
 * Idempotent on `(user_id, idempotency_key)`, so a teacher who publishes, unpublishes and publishes
 * again does not fill the queue with the same row — the key is the thing being reviewed, not the
 * moment. Failure is logged and swallowed: a notice that could not be written must never be the
 * reason a teacher's publish fails.
 */
export async function notifyReviewersOfPublication(input: {
  kind: "instructor_profile" | "course";
  subjectId: string;
  title: string;
  byName?: string | null;
}): Promise<{ notified: number }> {
  const admin = getSupabaseAdminClient();
  const ids = await reviewerIds();
  if (!admin || ids.length === 0) return { notified: 0 };

  const isProfile = input.kind === "instructor_profile";
  const heading = isProfile ? "A teacher published their profile" : "A course was published";
  const who = input.byName?.trim();
  const body = isProfile
    ? `${input.title} is now listed and can be booked. Review the profile and verify it if it is in order.`
    : `${input.title}${who ? ` by ${who}` : ""} is now listed. Review the course and verify it if it is in order.`;

  const rows = ids.map((userId) => ({
    user_id: userId,
    type: isProfile ? "instructor_published" : "course_published",
    title: heading,
    body,
    related_entity_type: isProfile ? "instructor_profile" : "course",
    related_entity_id: input.subjectId,
    idempotency_key: `review-${input.kind}-${input.subjectId}`,
    locale: "en",
  }));

  const { error } = await admin.from("notifications").upsert(rows, {
    onConflict: "user_id,idempotency_key",
    ignoreDuplicates: true,
  });
  if (error) {
    console.error("[review-queue] notice failed:", { kind: input.kind, code: error.code, message: error.message });
    return { notified: 0 };
  }
  return { notified: rows.length };
}

/**
 * A reviewer's decision about one course.
 *
 * Only the mark changes. The course's `status` is the teacher's to set and is not touched here, so
 * rejecting a course records the judgement without silently pulling a published course down — that
 * is a separate, deliberate act with its own audit trail.
 */
export async function setCourseVerification(
  identity: SupabaseIdentity,
  input: { courseId: string; status: CourseVerificationStatus },
): Promise<ReviewResult<{ courseId: string; verificationStatus: CourseVerificationStatus }>> {
  const admin = getSupabaseAdminClient();
  if (!admin) return fail("Administrative access is not configured.", "SETUP_NEEDED");
  if (!(COURSE_VERIFICATION_STATUSES as readonly string[]).includes(input.status)) return fail("Unknown verification status.");

  const { data: roles, error: roleError } = await admin
    .from("user_roles").select("role").eq("user_id", identity.id).in("role", REVIEWER_ROLES);
  if (roleError) {
    console.error("[review-queue] role check failed:", { code: roleError.code, message: roleError.message });
    return fail("That decision could not be recorded.");
  }
  if (!roles || roles.length === 0) return fail("Only a reviewer may verify a course.", "FORBIDDEN");

  const { data, error } = await admin
    .from("courses")
    .update({ verification_status: input.status, updated_at: new Date().toISOString() })
    .eq("id", input.courseId)
    .select("id,verification_status")
    .maybeSingle();
  if (error) {
    console.error("[review-queue] course verification failed:", { code: error.code, message: error.message });
    return fail("That decision could not be recorded.");
  }
  if (!data) return fail("Course not found.", "NOT_FOUND");

  const row = data as { id: string; verification_status: string };
  return { ok: true, data: { courseId: String(row.id), verificationStatus: row.verification_status as CourseVerificationStatus } };
}

/**
 * Tells a teacher their profile did not go up, and exactly which answers are missing.
 *
 * The owner named seven a learner cannot do without — a name, what they can teach, the language,
 * gender, the rate, the credits it works out to, and the timezone. A teacher who publishes without
 * them gets this rather than silence and a profile that mysteriously never appears.
 *
 * Written on the admin client for the same reason every other notice is: `notifications` has no
 * insert policy, so nobody can address a row to anybody. Idempotent on the teacher and the exact
 * set of fields, so re-saving the same incomplete profile does not stack up duplicates — but
 * filling one field in and trying again does produce a fresh, shorter notice.
 */
export async function notifyTeacherOfMissingFields(input: {
  instructorId: string;
  missing: string[];
  labels: string[];
}): Promise<{ notified: boolean }> {
  const admin = getSupabaseAdminClient();
  if (!admin || input.missing.length === 0) return { notified: false };

  const { error } = await admin.from("notifications").upsert({
    user_id: input.instructorId,
    type: "profile_incomplete",
    title: "Your profile is not published yet",
    body: `Add these before it can be published: ${input.labels.join(", ")}.`,
    related_entity_type: "instructor_profile",
    related_entity_id: input.instructorId,
    idempotency_key: `profile-incomplete-${[...input.missing].sort().join("-")}`,
    locale: "en",
  }, { onConflict: "user_id,idempotency_key", ignoreDuplicates: true });

  if (error) {
    console.error("[review-queue] incomplete-profile notice failed:", { code: error.code, message: error.message });
    return { notified: false };
  }
  return { notified: true };
}

/**
 * Tells every reviewer that somebody wrote in from the contact page.
 *
 * Without this a message lands in a table and waits for an administrator to think of opening
 * `/admin/support`. No email is sent and none is needed: the notification bell the admin desk
 * already has is the channel, and it reaches whoever currently holds a reviewing role rather than
 * one configured address.
 *
 * Keyed on the message id, so every message raises its own notice — unlike the publication notices,
 * where the point is that republishing the same profile does not queue it twice.
 */
export async function notifyReviewersOfContactMessage(input: {
  messageId: string;
  subject: string;
  senderName: string;
  senderRole: string;
}): Promise<{ notified: number }> {
  const admin = getSupabaseAdminClient();
  const ids = await reviewerIds();
  if (!admin || ids.length === 0) return { notified: 0 };

  const rows = ids.map((userId) => ({
    user_id: userId,
    type: "contact_message",
    title: "A new contact message",
    body: `${input.senderName} (${input.senderRole}) wrote: ${input.subject}`,
    related_entity_type: "contact_message",
    related_entity_id: input.messageId,
    idempotency_key: `contact-${input.messageId}`,
    locale: "en",
  }));

  const { error } = await admin.from("notifications").upsert(rows, {
    onConflict: "user_id,idempotency_key",
    ignoreDuplicates: true,
  });
  if (error) {
    console.error("[review-queue] contact notice failed:", { code: error.code, message: error.message });
    return { notified: 0 };
  }
  return { notified: rows.length };
}
