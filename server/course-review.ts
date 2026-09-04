/**
 * Course publishing — the reviewed decision that makes a course publicly discoverable.
 *
 * `submitOwnCourseForReview` moves draft/rejected → in_review, and public discovery reads
 * `status = 'published'`. Nothing wrote 'published', so a submitted course had nowhere to go and the
 * catalogue could never fill.
 *
 * Unlike instructor verification, the database already prevents self-publishing:
 *
 *   courses_instructor_update
 *     with check ((instructor_id = auth.uid() and is_user_role('instructor')
 *                  and (status <> 'published' or is_admin_user())) or is_admin_user())
 *
 * An instructor's own session therefore cannot set 'published' — the policy is column-aware here,
 * so no additional trigger is needed and none is added. What was missing is only the reviewed path.
 *
 * The write runs on the admin client because a reviewer edits another instructor's course, which the
 * row policy does not allow for an ordinary session. The role check below is what authorises it.
 */
import { getSupabaseAdminClient } from "./supabase-admin-client";
import type { SupabaseIdentity } from "./supabase-auth";
import { readOwnRoles } from "./supabase-admin-auth";

/** Decisions a reviewer may record. 'archived' is an operational state, not a review outcome. */
export const COURSE_REVIEW_DECISIONS = ["published", "rejected"] as const;
export type CourseReviewDecision = (typeof COURSE_REVIEW_DECISIONS)[number];

type Result<T> = { ok: true; data: T } | { ok: false; error: string; code?: "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "SETUP_NEEDED" };
const forbidden = <T,>(): Result<T> => ({ ok: false, error: "This action requires a reviewer role.", code: "FORBIDDEN" });

/** Courses awaiting a decision, oldest first so the queue is fair. */
export async function listCoursesForReview(identity: SupabaseIdentity): Promise<Result<unknown[]>> {
  const roles = await readOwnRoles(identity);
  if (!roles.ok) return { ok: false, error: roles.error, code: "SETUP_NEEDED" };
  if (!roles.isReviewer) return forbidden();

  const admin = getSupabaseAdminClient();
  if (!admin) return { ok: false, error: "Supabase administrative access is not configured.", code: "SETUP_NEEDED" };

  const { data, error } = await admin
    .from("courses")
    .select("id,slug,title,description,subject,level,language,status,instructor_id,created_at,updated_at")
    .eq("status", "in_review")
    .order("updated_at", { ascending: true });

  if (error) {
    console.error("[course-review] queue read failed:", { code: error.code, message: error.message });
    return { ok: false, error: "The review queue could not be loaded." };
  }
  return { ok: true, data: data ?? [] };
}

/**
 * Records a publish or reject decision on a submitted course.
 *
 * Only a course actually in review may be decided: publishing straight from draft would bypass the
 * instructor's own submission step, and re-deciding a settled course would silently overwrite an
 * earlier reviewer's decision.
 */
export async function setCourseReviewDecision(
  identity: SupabaseIdentity,
  input: { courseId: string; decision: CourseReviewDecision; note?: string },
): Promise<Result<{ courseId: string; status: CourseReviewDecision }>> {
  const roles = await readOwnRoles(identity);
  if (!roles.ok) return { ok: false, error: roles.error, code: "SETUP_NEEDED" };
  if (!roles.isReviewer) return forbidden();

  if (!(COURSE_REVIEW_DECISIONS as readonly string[]).includes(input.decision)) {
    return { ok: false, error: "Unknown review decision." };
  }

  const admin = getSupabaseAdminClient();
  if (!admin) return { ok: false, error: "Supabase administrative access is not configured.", code: "SETUP_NEEDED" };

  const { data: course, error: readError } = await admin
    .from("courses").select("id,status,instructor_id").eq("id", input.courseId).maybeSingle();
  if (readError) {
    console.error("[course-review] subject read failed:", { code: readError.code, message: readError.message });
    return { ok: false, error: "The course could not be read." };
  }
  if (!course) return { ok: false, error: "No course with that id.", code: "NOT_FOUND" };

  const current = String((course as { status: string }).status);
  if (current !== "in_review") {
    return { ok: false, error: `Only a course in review can be decided; this one is "${current}".`, code: "CONFLICT" };
  }
  // A reviewer must not decide on their own course.
  if (String((course as { instructor_id: string }).instructor_id) === identity.id) return forbidden();

  const { error: writeError } = await admin
    .from("courses")
    .update({ status: input.decision, updated_at: new Date().toISOString() })
    .eq("id", input.courseId)
    .eq("status", "in_review"); // guards against a concurrent decision between read and write
  if (writeError) {
    console.error("[course-review] decision write failed:", { code: writeError.code, message: writeError.message });
    return { ok: false, error: "The decision could not be saved." };
  }

  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_id: identity.id,
    action: "course.review.decide",
    entity_type: "courses",
    entity_id: input.courseId,
    metadata: { from: current, to: input.decision, ...(input.note?.trim() ? { note: input.note.trim().slice(0, 2000) } : {}) },
  });
  if (auditError) console.error("[course-review] audit write failed:", { code: auditError.code, message: auditError.message });

  return { ok: true, data: { courseId: input.courseId, status: input.decision } };
}
