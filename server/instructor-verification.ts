/**
 * Instructor verification — the reviewed decision that lets a tutor appear in public discovery.
 *
 * Discovery gates on (public_profile_status = 'published' AND verification_status = 'approved').
 * A tutor controls the first; a reviewer controls the second. Until now nothing wrote the second,
 * so the marketplace could never show anyone.
 *
 * Three guards, deliberately independent of one another:
 *   1. `isReviewer` on the server-verified identity, before any write is attempted.
 *   2. The `instructor_profiles_verification_guard` trigger (migration 0015), which rejects the
 *      write at the database if it ever arrives from a non-reviewer session.
 *   3. Every decision is written to `audit_logs` with the actor, so a change is always attributable.
 *
 * The write runs on the admin client because a reviewer is editing another user's row, which the
 * row policy does not permit for ordinary sessions. The role check above is what authorises it.
 */
import { getSupabaseAdminClient } from "./supabase-admin-client";
import type { SupabaseIdentity } from "./supabase-auth";
import { readOwnRoles } from "./supabase-admin-auth";

export const VERIFICATION_STATUSES = ["verification_pending", "process_coming_soon", "approved", "rejected"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

type Result<T> = { ok: true; data: T } | { ok: false; error: string; code?: "FORBIDDEN" | "NOT_FOUND" | "SETUP_NEEDED" };

const forbidden = <T,>(): Result<T> => ({ ok: false, error: "This action requires a reviewer role.", code: "FORBIDDEN" });

/** Tutors awaiting a decision, for the reviewer queue. */
export async function listInstructorsForReview(identity: SupabaseIdentity): Promise<Result<unknown[]>> {
  const roles = await readOwnRoles(identity);
  if (!roles.ok) return { ok: false, error: roles.error, code: "SETUP_NEEDED" };
  if (!roles.isReviewer) return forbidden();

  const admin = getSupabaseAdminClient();
  if (!admin) return { ok: false, error: "Supabase administrative access is not configured.", code: "SETUP_NEEDED" };

  // Joined to profiles for the reviewer's context; this is a privileged view by design.
  const { data, error } = await admin
    .from("instructor_profiles")
    .select("user_id,public_slug,subjects,teaching_languages,teaching_levels,years_experience,sect,has_ijazah,verification_status,public_profile_status,updated_at,profiles!inner(full_name,display_name,country,timezone)")
    .order("updated_at", { ascending: true });

  if (error) {
    console.error("[verification] queue read failed:", { code: error.code, message: error.message });
    return { ok: false, error: "The verification queue could not be loaded." };
  }
  return { ok: true, data: data ?? [] };
}

/**
 * Records a verification decision. `instructorId` names the row being reviewed — it is the subject
 * of the decision, not the identity making it; the actor always comes from the verified session.
 */
export async function setInstructorVerification(
  identity: SupabaseIdentity,
  input: { instructorId: string; status: VerificationStatus; note?: string },
): Promise<Result<{ instructorId: string; status: VerificationStatus }>> {
  const roles = await readOwnRoles(identity);
  if (!roles.ok) return { ok: false, error: roles.error, code: "SETUP_NEEDED" };
  if (!roles.isReviewer) return forbidden();

  if (!(VERIFICATION_STATUSES as readonly string[]).includes(input.status)) {
    return { ok: false, error: "Unknown verification status." };
  }
  // A reviewer must not decide on their own application.
  if (input.instructorId === identity.id) return forbidden();

  const admin = getSupabaseAdminClient();
  if (!admin) return { ok: false, error: "Supabase administrative access is not configured.", code: "SETUP_NEEDED" };

  const { data: existing, error: readError } = await admin
    .from("instructor_profiles").select("user_id,verification_status").eq("user_id", input.instructorId).maybeSingle();
  if (readError) {
    console.error("[verification] subject read failed:", { code: readError.code, message: readError.message });
    return { ok: false, error: "The instructor profile could not be read." };
  }
  if (!existing) return { ok: false, error: "No instructor profile for that account.", code: "NOT_FOUND" };

  const previous = String((existing as { verification_status: string }).verification_status);

  const { error: writeError } = await admin
    .from("instructor_profiles")
    .update({ verification_status: input.status })
    .eq("user_id", input.instructorId);
  if (writeError) {
    console.error("[verification] decision write failed:", { code: writeError.code, message: writeError.message });
    return { ok: false, error: "The decision could not be saved." };
  }

  // Attribution is part of the decision, not an optional extra: a verification change that cannot
  // be traced to a reviewer is not an auditable decision.
  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_id: identity.id,
    action: "instructor.verification.set",
    entity_type: "instructor_profiles",
    entity_id: input.instructorId,
    metadata: { from: previous, to: input.status, ...(input.note?.trim() ? { note: input.note.trim().slice(0, 2000) } : {}) },
  });
  if (auditError) console.error("[verification] audit write failed:", { code: auditError.code, message: auditError.message });

  return { ok: true, data: { instructorId: input.instructorId, status: input.status } };
}
