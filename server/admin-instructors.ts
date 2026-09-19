/**
 * Instructor verification for the admin desk.
 *
 * The decision this module records is the one that gates public discovery:
 * search shows a tutor only when `public_profile_status = 'published'` AND
 * `verification_status = 'approved'`. The tutor controls the first; a reviewer
 * controls the second.
 *
 * **On "request changes".** The brief asks for a needs-changes state, and the
 * obvious move would be a fifth value in the `verification_status` check
 * constraint. That is the wrong trade here: the column is read by the tutor's
 * own verification page and by discovery, and adding a value those surfaces do
 * not understand would break the instructor dashboard this task must preserve.
 * So "request changes" returns the profile to `verification_pending`, writes its
 * own audit action, and notifies the tutor with the reviewer's note. The state is
 * still real and still tracked — it is derived from the audit record rather than
 * invented in a column, and `lastDecision` on each row is what the badge reads.
 *
 * Approve and reject deliberately delegate to `setInstructorVerification`, the
 * procedure the existing reviewer queue already uses. One write path for the
 * same decision means the guard, the audit action and the notification cannot
 * drift apart between two screens.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SupabaseIdentity } from "./supabase-auth";
import { setInstructorVerification } from "./instructor-verification";
import { notify } from "./notifications";
import {
  clampLimit, clampOffset, displayNameOf, invalid, likeTerm, logFailure,
  notFound, noteFor, recordAudit, requireAdmin, type AdminResult, type Page,
} from "./admin-guard";
import { missingRequired, scoreInstructorProfile } from "@shared/instructor-publication";

export const INSTRUCTOR_FILTERS = ["all", "verification_pending", "approved", "rejected", "process_coming_soon"] as const;
export type InstructorFilter = (typeof INSTRUCTOR_FILTERS)[number];

export const INSTRUCTOR_DECISIONS = ["approved", "rejected", "request_changes"] as const;
export type InstructorDecision = (typeof INSTRUCTOR_DECISIONS)[number];

export const CREDENTIAL_DECISIONS = ["approved", "rejected", "pending"] as const;
export type CredentialDecision = (typeof CREDENTIAL_DECISIONS)[number];

/** The audit actions this module writes, so the UI can label them without guessing. */
export const CHANGES_REQUESTED_ACTION = "instructor.verification.changes_requested";
const CREDENTIAL_ACTION = "instructor.credential.reviewed";

/**
 * Refusal for reviewing your own application or your own document.
 *
 * Deliberately not the generic FORBIDDEN copy: telling an operator they need an
 * administrator role, when they hold one and the real objection is the conflict
 * of interest, sends them to debug the wrong thing.
 */
const selfReview = <T,>(): AdminResult<T> => ({
  ok: false, code: "FORBIDDEN",
  error: "You cannot record a decision on your own application.",
});

export type InstructorRow = {
  id: string;
  displayName: string | null;
  slug: string;
  subjects: string[];
  languages: string[];
  yearsExperience: number | null;
  sect: string | null;
  hasIjazah: boolean;
  verificationStatus: string;
  publicProfileStatus: string;
  updatedAt: string;
  /** Latest recorded decision on this profile, or null when none exists yet. */
  lastDecision: { action: string; at: string } | null;
};

/**
 * Attaches the most recent audit entry for each profile on the page.
 *
 * Scoped to the ids actually being shown, so this never scans the whole audit
 * table however large it grows.
 */
async function attachLastDecision(admin: SupabaseClient, ids: string[]): Promise<Map<string, { action: string; at: string }>> {
  const found = new Map<string, { action: string; at: string }>();
  if (ids.length === 0) return found;
  const { data, error } = await admin
    .from("audit_logs")
    .select("action,entity_id,created_at")
    .eq("entity_type", "instructor_profiles")
    .in("entity_id", ids)
    .order("created_at", { ascending: false });
  logFailure("admin-instructors", error);
  for (const row of (data ?? []) as Array<{ action: string; entity_id: string; created_at: string }>) {
    if (!found.has(row.entity_id)) found.set(row.entity_id, { action: row.action, at: row.created_at });
  }
  return found;
}

export async function listInstructors(
  identity: SupabaseIdentity,
  input: { search?: string; status?: InstructorFilter; limit?: number; offset?: number },
): Promise<AdminResult<Page<InstructorRow>>> {
  const gate = await requireAdmin(identity);
  if (!gate.ok) return gate.failure;
  const { admin } = gate;

  const limit = clampLimit(input.limit);
  const offset = clampOffset(input.offset);
  const search = input.search?.trim() ?? "";

  let query = admin
    .from("instructor_profiles")
    .select(
      "user_id,public_slug,subjects,teaching_languages,years_experience,sect,has_ijazah,verification_status,public_profile_status,updated_at,profiles!inner(display_name,full_name)",
      { count: "exact" },
    );

  if (input.status && input.status !== "all") query = query.eq("verification_status", input.status);

  if (search) {
    // Names live on `profiles`, so they are resolved to ids first and folded into
    // one `or` with the slug. Filtering an embedded table in place would filter
    // the embed rather than the parent rows.
    const { data: named } = await admin
      .from("profiles").select("id").or(`display_name.ilike.${likeTerm(search)},full_name.ilike.${likeTerm(search)}`).limit(200);
    const ids = (named ?? []).map((row) => String((row as { id: string }).id));
    const clauses = [`public_slug.ilike.${likeTerm(search)}`];
    if (ids.length > 0) clauses.push(`user_id.in.(${ids.join(",")})`);
    query = query.or(clauses.join(","));
  }

  const { data, error, count } = await query.order("updated_at", { ascending: false }).range(offset, offset + limit - 1);
  if (error) {
    logFailure("admin-instructors", error);
    return { ok: false, error: "The instructor list could not be loaded." };
  }

  const raw = (data ?? []) as Array<Record<string, unknown>>;
  const decisions = await attachLastDecision(admin, raw.map((row) => String(row.user_id)));

  const rows: InstructorRow[] = raw.map((row) => ({
    id: String(row.user_id),
    displayName: displayNameOf(row.profiles),
    slug: String(row.public_slug ?? ""),
    subjects: (row.subjects as string[]) ?? [],
    languages: (row.teaching_languages as string[]) ?? [],
    yearsExperience: row.years_experience === null || row.years_experience === undefined ? null : Number(row.years_experience),
    sect: row.sect ? String(row.sect) : null,
    hasIjazah: row.has_ijazah === true,
    verificationStatus: String(row.verification_status),
    publicProfileStatus: String(row.public_profile_status),
    updatedAt: String(row.updated_at),
    lastDecision: decisions.get(String(row.user_id)) ?? null,
  }));

  return { ok: true, data: { rows, total: count ?? rows.length, limit, offset } };
}

export type InstructorDetail = {
  /** The twenty-one-field score a reviewer sees before approving, and the seven that block publication. */
  completion: { percent: number; fields: Array<{ key: string; done: boolean }>; missingRequired: string[] };
  id: string;
  profile: {
    displayName: string | null; fullName: string | null; country: string | null; city: string | null;
    timezone: string | null; preferredLanguage: string | null; supportedLanguages: string[];
    bio: string | null; onboardingCompleted: boolean; accountStatus: string; joinedAt: string;
  };
  instructor: {
    slug: string; subjects: string[]; teachingLevels: string[]; languages: string[];
    yearsExperience: number | null; teachingApproach: string | null; availabilitySummary: string | null;
    sect: string | null; hasIjazah: boolean; verificationStatus: string; publicProfileStatus: string;
    trainingStatus: string; testStatus: string; updatedAt: string;
  };
  /** Document metadata plus the private object path, so the desk can request a signed URL. */
  credentials: Array<{ id: string; objectPath: string; mimeType: string; sizeBytes: number; reviewStatus: string; createdAt: string }>;
  /** Their answers to learner requirements — activity, not private learner detail. */
  responses: Array<{ id: string; status: string; createdAt: string; requirementSubject: string | null }>;
  history: Array<{ id: string; action: string; actorName: string | null; from: string | null; to: string | null; note: string | null; createdAt: string }>;
};

export async function getInstructorDetail(
  identity: SupabaseIdentity,
  input: { instructorId: string },
): Promise<AdminResult<InstructorDetail>> {
  const gate = await requireAdmin(identity);
  if (!gate.ok) return gate.failure;
  const { admin } = gate;

  const { data: instructor, error } = await admin
    .from("instructor_profiles")
    .select("user_id,public_slug,subjects,teaching_levels,teaching_languages,years_experience,teaching_approach,availability_summary,sect,has_ijazah,verification_status,public_profile_status,training_status,test_status,updated_at")
    .eq("user_id", input.instructorId).maybeSingle();
  if (error) {
    logFailure("admin-instructors", error);
    return { ok: false, error: "The instructor profile could not be read." };
  }
  if (!instructor) return notFound("instructor profile");

  /*
   * What the reviewer is actually deciding about.
   *
   * Approving a teacher makes their profile live, so the desk should show how much of it exists
   * before that button is pressed — the same twenty-one-field score the teacher sees, field by
   * field, rather than a reviewer opening the public page and guessing. `avatar_url` and the three
   * counts live outside the two rows already read, so they are fetched here.
   */
  const [{ data: avatarRow }, availabilityCount, mediaCount, qualificationCount] = await Promise.all([
    admin.from("profiles").select("avatar_url").eq("id", input.instructorId).maybeSingle(),
    admin.from("instructor_availability").select("id", { count: "exact", head: true }).eq("instructor_id", input.instructorId),
    admin.from("instructor_media").select("id", { count: "exact", head: true }).eq("instructor_id", input.instructorId),
    admin.from("instructor_qualifications").select("id", { count: "exact", head: true }).eq("instructor_id", input.instructorId),
  ]);

  const [{ data: profile }, { data: credentials }, { data: responses }, { data: history }] = await Promise.all([
    admin.from("profiles")
      .select("display_name,full_name,country,city,timezone,preferred_language,supported_languages,bio,onboarding_completed,account_status,created_at")
      .eq("id", input.instructorId).maybeSingle(),
    admin.from("instructor_credentials")
      .select("id,object_path,mime_type,size_bytes,review_status,created_at")
      .eq("instructor_id", input.instructorId).order("created_at", { ascending: false }),
    admin.from("requirement_responses")
      .select("id,status,created_at,learner_requirements(subject)")
      .eq("instructor_id", input.instructorId).order("created_at", { ascending: false }).limit(20),
    admin.from("audit_logs")
      .select("id,action,metadata,created_at,profiles:actor_id(display_name,full_name)")
      .eq("entity_type", "instructor_profiles").eq("entity_id", input.instructorId)
      .order("created_at", { ascending: false }).limit(50),
  ]);

  const p = (profile ?? {}) as Record<string, unknown>;
  const i = instructor as Record<string, unknown>;

  const completion = scoreInstructorProfile({
    profile: { ...(p as Record<string, unknown>), avatar_url: (avatarRow as { avatar_url?: unknown } | null)?.avatar_url },
    instructorProfile: i as Record<string, unknown>,
    availabilityCount: availabilityCount.count ?? 0,
    mediaCount: mediaCount.count ?? 0,
    // The table arrives in 0034; an unapplied migration must not read as a missing answer.
    qualificationCount: qualificationCount.error ? 1 : qualificationCount.count ?? 0,
  });

  return {
    ok: true,
    data: {
      id: input.instructorId,
      /* The score, and which of the seven a profile cannot be published without are still blank. */
      completion: {
        percent: completion.percent,
        fields: completion.fields,
        missingRequired: missingRequired({
          profile: { ...(p as Record<string, unknown>) },
          instructorProfile: i as Record<string, unknown>,
        }),
      },
      profile: {
        displayName: p.display_name ? String(p.display_name) : null,
        fullName: p.full_name ? String(p.full_name) : null,
        country: p.country ? String(p.country) : null,
        city: p.city ? String(p.city) : null,
        timezone: p.timezone ? String(p.timezone) : null,
        preferredLanguage: p.preferred_language ? String(p.preferred_language) : null,
        supportedLanguages: (p.supported_languages as string[]) ?? [],
        bio: p.bio ? String(p.bio) : null,
        onboardingCompleted: p.onboarding_completed === true,
        accountStatus: String(p.account_status ?? "unknown"),
        joinedAt: String(p.created_at ?? ""),
      },
      instructor: {
        slug: String(i.public_slug ?? ""),
        subjects: (i.subjects as string[]) ?? [],
        teachingLevels: (i.teaching_levels as string[]) ?? [],
        languages: (i.teaching_languages as string[]) ?? [],
        yearsExperience: i.years_experience === null || i.years_experience === undefined ? null : Number(i.years_experience),
        teachingApproach: i.teaching_approach ? String(i.teaching_approach) : null,
        availabilitySummary: i.availability_summary ? String(i.availability_summary) : null,
        sect: i.sect ? String(i.sect) : null,
        hasIjazah: i.has_ijazah === true,
        verificationStatus: String(i.verification_status),
        publicProfileStatus: String(i.public_profile_status),
        trainingStatus: String(i.training_status ?? "not_started"),
        testStatus: String(i.test_status ?? "not_started"),
        updatedAt: String(i.updated_at),
      },
      credentials: ((credentials ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: String(row.id),
        objectPath: String(row.object_path),
        mimeType: String(row.mime_type),
        sizeBytes: Number(row.size_bytes ?? 0),
        reviewStatus: String(row.review_status),
        createdAt: String(row.created_at),
      })),
      responses: ((responses ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: String(row.id),
        status: String(row.status),
        createdAt: String(row.created_at),
        requirementSubject: (row.learner_requirements as { subject?: string } | null)?.subject ?? null,
      })),
      history: ((history ?? []) as Array<Record<string, unknown>>).map((row) => {
        const metadata = (row.metadata ?? {}) as Record<string, unknown>;
        return {
          id: String(row.id),
          action: String(row.action),
          actorName: displayNameOf(row.profiles),
          from: typeof metadata.from === "string" ? metadata.from : null,
          to: typeof metadata.to === "string" ? metadata.to : null,
          note: typeof metadata.note === "string" ? metadata.note : null,
          createdAt: String(row.created_at),
        };
      }),
    },
  };
}

/**
 * Records a verification decision.
 *
 * Approve and reject go through `setInstructorVerification`, which re-checks the
 * role itself, refuses self-review, writes the audit row and notifies the tutor.
 * Only `request_changes` is implemented here, and it performs the same three
 * steps rather than skipping any of them.
 */
export async function decideInstructor(
  identity: SupabaseIdentity,
  input: { instructorId: string; decision: InstructorDecision; note?: string },
): Promise<AdminResult<{ instructorId: string; status: string; notified: boolean }>> {
  const gate = await requireAdmin(identity);
  if (!gate.ok) return gate.failure;
  const { admin } = gate;

  if (!(INSTRUCTOR_DECISIONS as readonly string[]).includes(input.decision)) return invalid("Unknown decision.");
  // A reviewer must never decide on their own application. Said in its own words:
  // the generic refusal would tell an operator they lack a role they do hold.
  if (input.instructorId === identity.id) return selfReview();

  if (input.decision !== "request_changes") {
    const result = await setInstructorVerification(identity, {
      instructorId: input.instructorId, status: input.decision, note: input.note,
    });
    return result.ok
      ? { ok: true, data: { instructorId: input.instructorId, status: result.data.status, notified: result.data.notified } }
      : { ok: false, error: result.error, code: result.code as never };
  }

  const { data: existing, error: readError } = await admin
    .from("instructor_profiles").select("user_id,verification_status").eq("user_id", input.instructorId).maybeSingle();
  if (readError) {
    logFailure("admin-instructors", readError);
    return { ok: false, error: "The instructor profile could not be read." };
  }
  if (!existing) return notFound("instructor profile");

  const previous = String((existing as { verification_status: string }).verification_status);

  // Back to pending: the tutor can act on the note and the profile stays out of
  // public discovery until a reviewer approves it.
  const { error: writeError } = await admin
    .from("instructor_profiles").update({ verification_status: "verification_pending" }).eq("user_id", input.instructorId);
  if (writeError) {
    logFailure("admin-instructors", writeError);
    return { ok: false, error: "The decision could not be saved." };
  }

  await recordAudit(admin, {
    actorId: identity.id,
    action: CHANGES_REQUESTED_ACTION,
    entityType: "instructor_profiles",
    entityId: input.instructorId,
    metadata: { from: previous, to: "verification_pending", ...noteFor(input.note) },
  });

  // The delivery outcome is kept, not discarded: the decision is saved either
  // way, but the desk must not claim the instructor was told when they were not.
  const raised = await notify({
    userId: input.instructorId,
    type: "verification_decided",
    title: "Changes were requested on your profile",
    body: input.note?.trim()
      ? `A reviewer asked for changes: ${input.note.trim().slice(0, 300)}`
      : "A reviewer asked for changes before your profile can be approved.",
    relatedEntityType: "instructor_profiles",
    relatedEntityId: input.instructorId,
    // Keyed on the decision, not the clock. With Date.now() in it, every retry
    // produced a fresh key and therefore a duplicate row — the opposite of what
    // an idempotency key is for.
    idempotencyKey: `verification-changes:${input.instructorId}`,
  });

  if (!raised.delivered) {
    console.error("[admin-instructors] changes requested but notification not delivered:", { reason: raised.reason });
  }
  return { ok: true, data: { instructorId: input.instructorId, status: "verification_pending", notified: raised.delivered } };
}

/** Approves or rejects one uploaded credential document. */
export async function reviewCredential(
  identity: SupabaseIdentity,
  input: { credentialId: string; status: CredentialDecision; note?: string },
): Promise<AdminResult<{ credentialId: string; status: CredentialDecision }>> {
  const gate = await requireAdmin(identity);
  if (!gate.ok) return gate.failure;
  const { admin } = gate;

  if (!(CREDENTIAL_DECISIONS as readonly string[]).includes(input.status)) return invalid("Unknown credential status.");

  const { data: credential, error } = await admin
    .from("instructor_credentials").select("id,instructor_id,review_status").eq("id", input.credentialId).maybeSingle();
  if (error) {
    logFailure("admin-instructors", error);
    return { ok: false, error: "The credential could not be read." };
  }
  if (!credential) return notFound("credential");

  const row = credential as { instructor_id: string; review_status: string };
  // Reviewing your own document is the same conflict as approving your own profile.
  if (row.instructor_id === identity.id) return selfReview();

  const { error: writeError } = await admin
    .from("instructor_credentials").update({ review_status: input.status }).eq("id", input.credentialId);
  if (writeError) {
    logFailure("admin-instructors", writeError);
    return { ok: false, error: "The credential decision could not be saved." };
  }

  await recordAudit(admin, {
    actorId: identity.id,
    action: CREDENTIAL_ACTION,
    entityType: "instructor_credentials",
    entityId: input.credentialId,
    metadata: { from: row.review_status, to: input.status, instructor_id: row.instructor_id, ...noteFor(input.note) },
  });

  return { ok: true, data: { credentialId: input.credentialId, status: input.status } };
}
