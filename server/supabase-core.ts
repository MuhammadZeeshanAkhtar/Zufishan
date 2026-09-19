import type { SupabaseIdentity } from "./supabase-auth";
import { getSupabasePublicClient, getSupabaseUserClient } from "./supabase-user-client";
import { getSupabaseAdminClient } from "./supabase-admin-client";
import { notifyReviewersOfPublication, notifyTeacherOfMissingFields } from "./review-queue";
import { missingRequired } from "@shared/instructor-publication";

/** Plain English for the notice a teacher receives; the screens translate their own copy. */
const REQUIRED_FIELD_LABELS: Record<string, string> = {
  displayName: "your name", subjects: "what you can teach", languages: "teaching language",
  gender: "gender", rate: "hourly rate", currency: "currency (so credits per hour can be shown)",
  timezone: "timezone",
};
import { summarizeHifzProgress } from "./hifz-progress-utils";
import { statusAfterSave } from "@shared/learner-publication";

export type CoreError =
  | "Supabase persistence unavailable."
  | "Supabase operation failed."
  // A refusal with a reason, rather than a generic failure: enrolling in a course
  // that is not published is a thing the learner can understand and act on.
  | "That course is not open for enrolment.";
export type CoreResult<T> = { ok: true; data: T } | { ok: false; error: CoreError };

function client(identity: SupabaseIdentity) {
  return getSupabaseUserClient(identity.accessToken);
}

function failure<T>(error: CoreError): CoreResult<T> { return { ok: false, error }; }

/**
 * The caller only ever sees a generic message — a raw Postgres error names columns, constraints and
 * policies, and that is not something to hand to a browser. But discarding it entirely left every
 * failure undiagnosable from either side, so the real error is logged on the server, where it is
 * safe to read, with enough detail to identify the column or constraint that actually rejected.
 */
async function safe<T>(operation: () => PromiseLike<{ data: T | null; error: { message: string } | null }>, context?: string): Promise<CoreResult<T>> {
  try {
    const result = await operation();
    if (result.error) {
      const detail = result.error as { message: string; code?: string; details?: string; hint?: string };
      console.error(`[supabase] ${context ?? "operation"} failed:`, {
        code: detail.code, message: detail.message, details: detail.details, hint: detail.hint,
      });
      return failure("Supabase operation failed.");
    }
    return { ok: true, data: result.data as T };
  } catch (cause) {
    console.error(`[supabase] ${context ?? "operation"} threw:`, cause instanceof Error ? cause.message : cause);
    return failure("Supabase persistence unavailable.");
  }
}

export async function getOwnCoreProfiles(identity: SupabaseIdentity) {
  const db = client(identity); if (!db) return failure("Supabase persistence unavailable.");
  return safe(() => Promise.all([
    db.from("profiles").select("*").eq("id", identity.id).maybeSingle(),
    db.from("learner_profiles").select("*").eq("user_id", identity.id).maybeSingle(),
    db.from("instructor_profiles").select("*").eq("user_id", identity.id).maybeSingle(),
    db.from("user_roles").select("role").eq("user_id", identity.id),
  ]).then(([profile, learner, instructor, roles]) => ({ data: { profile: profile.data, learnerProfile: learner.data, instructorProfile: instructor.data, roles: roles.data ?? [] }, error: profile.error ?? learner.error ?? instructor.error ?? roles.error })));
}

export async function updateOwnProfile(identity: SupabaseIdentity, input: { fullName: string; displayName: string; preferredLanguage: string; preferredLocale?: "en" | "ur" | "ar" }) {
  const db = client(identity); if (!db) return failure("Supabase persistence unavailable.");
  return safe(() => db.from("profiles").update({ full_name: input.fullName.trim(), display_name: input.displayName.trim(), preferred_language: input.preferredLanguage, onboarding_completed: true, ...(input.preferredLocale ? { preferred_locale: input.preferredLocale } : {}) }).eq("id", identity.id).select("*").single());
}

export async function updateOwnInstructorProfile(identity: SupabaseIdentity, input: { publicDisplayName: string; publicSlug: string; subjects: string[]; levels: string[]; teachingLanguages: string[]; yearsExperience?: number; teachingApproach?: string; hourlyRateMinor?: number; currency?: string; availabilitySummary?: string; profileVisibility: "public" | "private"; preferredLanguage: string; fullName?: string; country?: string; city?: string; timezone?: string; bio?: string; gender?: string; sect?: string; fiqh?: string; hasIjazah?: boolean }) {
  const db = client(identity); if (!db) return failure("Supabase persistence unavailable.");

  /*
   * Publishing says "I am ready"; a reviewer's approval is what makes it visible (0036).
   *
   * There is no completeness *percentage* in front of it — that is guidance, and a number computed
   * in a browser could never gate anything anyway. There are seven answers, though, that a learner
   * cannot choose a teacher without, and the owner named them: a name, what they can teach, the
   * language, gender, the rate, the credits that rate works out to, and the timezone. Publishing
   * without one of those does not fail the save; the edit is kept as a draft and the teacher is
   * told exactly which are missing, so a reviewer is never handed a profile that cannot be judged.
   *
   * Recomputed here from the values being written rather than trusted from the client, for the
   * ordinary reason: the anon key and a session token are both in the page.
   */
  let missingRequiredFields: string[] = [];
  if (input.profileVisibility === "public") {
    const { data: storedInstructor } = await db
      .from("instructor_profiles").select("currency").eq("user_id", identity.id).maybeSingle();
    missingRequiredFields = missingRequired({
      profile: { display_name: input.publicDisplayName, gender: input.gender, timezone: input.timezone },
      instructorProfile: {
        subjects: input.subjects,
        teaching_languages: input.teachingLanguages,
        hourly_rate_minor: input.hourlyRateMinor,
        currency: input.currency ?? (storedInstructor as { currency?: unknown } | null)?.currency,
      },
    });
  }
  const mayPublish = input.profileVisibility === "public" && missingRequiredFields.length === 0;

  // country / timezone / bio live on `profiles` and were previously collected by the tutor form but
  // never written, so a tutor's location could not be stored at all. Optional columns are only sent
  // when the caller supplied them, so a partial edit never blanks a stored value.
  const optional = <T,>(value: T | undefined, mapped: () => unknown) => (value === undefined ? {} : { ...(mapped() as object) });
  const profileUpdate = db.from("profiles").update({ display_name: input.publicDisplayName.trim(), preferred_language: input.preferredLanguage.trim(), ...optional(input.fullName, () => ({ full_name: input.fullName!.trim() })), ...optional(input.country, () => ({ country: input.country!.trim() || null })), ...optional(input.city, () => ({ city: input.city!.trim() || null })), ...optional(input.timezone, () => ({ timezone: input.timezone!.trim() || null })), ...optional(input.bio, () => ({ bio: input.bio!.trim() || null })), ...optional(input.gender, () => ({ gender: input.gender!.trim() || null })) }).eq("id", identity.id);
  const instructorUpdate = db.from("instructor_profiles").upsert({ user_id: identity.id, public_slug: input.publicSlug.trim(), subjects: input.subjects, teaching_levels: input.levels, teaching_languages: input.teachingLanguages, years_experience: input.yearsExperience ?? null, teaching_approach: input.teachingApproach?.trim() || null, hourly_rate_minor: input.hourlyRateMinor ?? null, currency: input.currency?.trim() || null, availability_summary: input.availabilitySummary?.trim() || null, ...optional(input.sect, () => ({ sect: input.sect!.trim() || null })), ...optional(input.fiqh, () => ({ fiqh: input.fiqh!.trim() || null })), ...optional(input.hasIjazah, () => ({ has_ijazah: input.hasIjazah })), public_profile_status: mayPublish ? "published" : "draft" }, { onConflict: "user_id" });
  const saved = await safe(() => Promise.all([profileUpdate, instructorUpdate]).then(([profile, instructor]) => ({ data: { profile: profile.data, instructorProfile: instructor.data }, error: profile.error ?? instructor.error })), "updateOwnInstructorProfile");
  /*
   * A published profile is listed immediately now (migration 0035), so the reviewer has to be told
   * rather than being the one who switches it on. The notice is raised after the write succeeded,
   * is idempotent on the teacher's id, and cannot fail the save: a teacher publishing must not be
   * blocked because a notification could not be written.
   */
  if (saved.ok && mayPublish) {
    await notifyReviewersOfPublication({
      kind: "instructor_profile",
      subjectId: identity.id,
      title: input.publicDisplayName?.trim() || input.publicSlug,
    });
  }
  /* Told, not left guessing: the notice names the fields, and the editor shows the same list. */
  if (saved.ok && missingRequiredFields.length > 0) {
    await notifyTeacherOfMissingFields({
      instructorId: identity.id,
      missing: missingRequiredFields,
      labels: missingRequiredFields.map((key) => REQUIRED_FIELD_LABELS[key] ?? key),
    });
    return { ok: true as const, data: { ...(saved.data as object), publication: { published: false, missingRequired: missingRequiredFields } } };
  }
  return saved;
}

/**
 * Learner-side profile edit: the subjects a learner wants to study, plus the location and language
 * fields the profile form exposes. `learner_profiles` was read-only until now — nothing wrote it.
 *
 * Both writes are scoped to the caller's own id from the verified identity, so a learner can only
 * ever edit their own row. Subjects are bounded and trimmed rather than trusted as sent.
 */
export async function updateOwnLearnerProfile(identity: SupabaseIdentity, input: {
  fullName: string; displayName: string; learningSubjects: string[];
  country?: string; city?: string; timezone?: string; supportedLanguages?: string[];
  preferredLanguage?: string; preferredLocale?: "en" | "ur" | "ar"; bio?: string; gender?: string;
  profileVisibility?: "public" | "private"; completeOnboarding?: boolean;
  learningLevel?: string; learningGoal?: string; preferredClassFormat?: string;
  preferredDaysTimes?: string; budgetRange?: string;
}) {
  const db = client(identity); if (!db) return failure("Supabase persistence unavailable.");
  const subjects = Array.from(new Set(input.learningSubjects.map((s) => s.trim()).filter(Boolean))).slice(0, 12);
  const languages = Array.from(new Set((input.supportedLanguages ?? []).map((s) => s.trim()).filter(Boolean))).slice(0, 12);
  // Only send a column when the caller supplied it, so a partial edit never blanks a stored value.
  const optional = <T,>(value: T | undefined, mapped: () => unknown) => (value === undefined ? {} : { ...(mapped() as object) });

  const profileUpdate = db.from("profiles").update({
    full_name: input.fullName.trim(),
    display_name: input.displayName.trim(),
    country: input.country?.trim() || null,
    city: input.city?.trim() || null,
    timezone: input.timezone?.trim() || null,
    supported_languages: languages,
    ...optional(input.preferredLanguage, () => ({ preferred_language: input.preferredLanguage!.trim() })),
    ...optional(input.preferredLocale, () => ({ preferred_locale: input.preferredLocale })),
    ...optional(input.bio, () => ({ bio: input.bio!.trim() || null })),
    ...optional(input.gender, () => ({ gender: input.gender!.trim() || null })),
    ...optional(input.profileVisibility, () => ({ profile_visibility: input.profileVisibility })),
    // Onboarding completion is a profile flag, not a separate record.
    ...(input.completeOnboarding ? { onboarding_completed: true } : {}),
  }).eq("id", identity.id);

  const learnerUpdate = db.from("learner_profiles").upsert({
    user_id: identity.id,
    learning_subjects: subjects,
    ...optional(input.learningLevel, () => ({ learning_level: input.learningLevel!.trim() || null })),
    ...optional(input.learningGoal, () => ({ learning_goal: input.learningGoal!.trim() || null })),
    ...optional(input.preferredClassFormat, () => ({ preferred_class_format: input.preferredClassFormat!.trim() || null })),
    ...optional(input.preferredDaysTimes, () => ({ preferred_days_times: input.preferredDaysTimes!.trim() || null })),
    ...optional(input.budgetRange, () => ({ budget_range: input.budgetRange!.trim() || null })),
  }, { onConflict: "user_id" });

  return safe(() => Promise.all([profileUpdate, learnerUpdate]).then(async ([profile, learner]) => {
    const failed = profile.error ?? learner.error;
    if (failed) return { data: { profile: profile.data, learnerProfile: learner.data, profileStatus: "draft" as string }, error: failed };

    // A learner needs no administrator to become discoverable: completing the
    // required fields and saving IS the publication. This reads the merged row
    // rather than the incoming patch, because a partial edit only carries some
    // columns and completeness is a property of the whole profile.
    //
    // `statusAfterSave` returns null for a profile that is still incomplete, for
    // one already published, and — importantly — for one the learner explicitly
    // paused. An edit is not a request to undo a hide.
    const [{ data: mergedProfile }, { data: mergedLearner }] = await Promise.all([
      db.from("profiles").select("full_name,display_name,country,timezone,preferred_language").eq("id", identity.id).maybeSingle(),
      db.from("learner_profiles").select("learning_level,learning_subjects,profile_status").eq("user_id", identity.id).maybeSingle(),
    ]);
    const current = (mergedLearner as { profile_status?: string } | null)?.profile_status;
    const next = statusAfterSave(current, {
      profile: mergedProfile as Record<string, unknown> | null,
      learnerProfile: mergedLearner as Record<string, unknown> | null,
    });
    if (next) {
      // Guarded on the status we read, so a concurrent hide cannot be overwritten.
      await db.from("learner_profiles")
        .update({ profile_status: next })
        .eq("user_id", identity.id)
        .eq("profile_status", current ?? "draft");
    }

    return { data: { profile: profile.data, learnerProfile: learner.data, profileStatus: next ?? current ?? "draft" }, error: null };
  }), "updateOwnLearnerProfile");
}

export async function updateOwnLocale(identity: SupabaseIdentity, preferredLocale: "en" | "ur" | "ar") {
  const db = client(identity); if (!db) return failure("Supabase persistence unavailable.");
  return safe(() => db.from("profiles").update({ preferred_locale: preferredLocale }).eq("id", identity.id).select("preferred_locale").single());
}

export async function listOwnAvailability(identity: SupabaseIdentity) {
  const db = client(identity); if (!db) return failure("Supabase persistence unavailable.");
  return safe(() => db.from("instructor_availability").select("*").eq("instructor_id", identity.id).order("weekday").order("start_local"));
}

export async function listOwnRequirements(identity: SupabaseIdentity) {
  const db = client(identity); if (!db) return failure("Supabase persistence unavailable.");
  // The embedded count is the real number of responses. The listing used to render a hardcoded 0,
  // so a learner with responses waiting was told there were none. `requirement_responses_parties_or_moderator`
  // already lets the requirement's learner read them, so this needs no extra permission.
  return safe(() => db.from("learner_requirements").select("*, requirement_responses(count)").eq("learner_id", identity.id).order("created_at", { ascending: false }), "listOwnRequirements");
}

/**
 * The learner's decision on a response to their own requirement.
 *
 * `updateOwnRequirementResponseStatus` is the instructor's side — it filters on `instructor_id`, so
 * it is how an instructor withdraws. Nothing let the learner shortlist, accept or reject, which is
 * the whole point of the comparison screen, and three of the five statuses were therefore
 * unreachable.
 *
 * `requirement_responses_parties_update` already permits the requirement's learner to write the row,
 * so this runs on their own client. Ownership of the requirement is confirmed first so the refusal
 * is a readable message rather than a silent no-op, and 0019 enforces the same split at the database.
 */
export async function setRequirementResponseDecision(
  identity: SupabaseIdentity,
  input: { responseId: string; status: "shortlisted" | "accepted" | "rejected" },
) {
  const db = client(identity); if (!db) return failure("Supabase persistence unavailable.");
  return safe(async () => {
    const response = await db.from("requirement_responses").select("id, requirement_id").eq("id", input.responseId).maybeSingle();
    if (response.error || !response.data) return { data: null, error: response.error ?? { message: "Response not found" } };
    const owned = await db
      .from("learner_requirements").select("id")
      .eq("id", (response.data as { requirement_id: string }).requirement_id)
      .eq("learner_id", identity.id).maybeSingle();
    if (owned.error || !owned.data) return { data: null, error: owned.error ?? { message: "Only the learner who posted this requirement can decide on a response" } };
    return db.from("requirement_responses").update({ status: input.status, updated_at: new Date().toISOString() }).eq("id", input.responseId).select("*").single();
  }, "setRequirementResponseDecision");
}

export async function listPublicPublishedRequirements() {
  const db = getSupabasePublicClient(); if (!db) return failure("Supabase persistence unavailable.");
  return safe(() => db.from("learner_requirements").select("id, subject, level, goal, preferred_language, timezone, availability, budget_minor, currency, status, created_at").eq("status", "published").order("created_at", { ascending: false }));
}

export async function getPublicPublishedRequirement(id: string) {
  const db = getSupabasePublicClient(); if (!db) return failure("Supabase persistence unavailable.");
  return safe(() => db.from("learner_requirements").select("id, subject, level, goal, preferred_language, timezone, availability, budget_minor, currency, status, created_at").eq("id", id).eq("status", "published").maybeSingle());
}

export async function listPublishedRequirements(identity: SupabaseIdentity) {
  const db = client(identity); if (!db) return failure("Supabase persistence unavailable.");
  return safe(() => db.from("learner_requirements").select("id, subject, level, goal, preferred_language, timezone, availability, budget_minor, currency, status, created_at").eq("status", "published").order("created_at", { ascending: false }));
}

export async function createRequirement(identity: SupabaseIdentity, input: { subject: string; level: string; goal: string; preferredLanguage: string; timezone: string; availability: string; budgetMinor?: number; currency?: string }) {
  const db = client(identity); if (!db) return failure("Supabase persistence unavailable.");
  return safe(() => db.from("learner_requirements").insert({ learner_id: identity.id, subject: input.subject.trim(), level: input.level.trim(), goal: input.goal.trim(), preferred_language: input.preferredLanguage.trim(), timezone: input.timezone.trim(), availability: input.availability.trim(), budget_minor: input.budgetMinor ?? null, currency: input.currency ?? null }).select("*").single());
}

export async function updateOwnRequirementGoal(identity: SupabaseIdentity, input: { requirementId: string; goal: string }) {
  const db = client(identity); if (!db) return failure("Supabase persistence unavailable.");
  const goal = input.goal.trim();
  if (!goal) return failure("Supabase operation failed.");
  return safe(() => db.from("learner_requirements").update({ goal, updated_at: new Date().toISOString() }).eq("id", input.requirementId).eq("learner_id", identity.id).select("*").single());
}

export async function listOwnRequirementResponses(identity: SupabaseIdentity, requirementId: string) {
  const db = client(identity); if (!db) return failure("Supabase persistence unavailable.");
  return safe(async () => {
    const requirement = await db.from("learner_requirements").select("id").eq("id", requirementId).eq("learner_id", identity.id).maybeSingle();
    if (requirement.error || !requirement.data) return { data: null, error: requirement.error ?? { message: "Requirement not found" } };
    return db.from("requirement_responses").select("*").eq("requirement_id", requirementId).order("created_at", { ascending: false });
  });
}

export async function createRequirementResponse(identity: SupabaseIdentity, input: { requirementId: string; message: string }) {
  const db = client(identity); if (!db) return failure("Supabase persistence unavailable.");
  const message = input.message.trim();
  if (!message) return failure("Supabase operation failed.");
  return safe(async () => {
    const instructor = await db.from("instructor_profiles").select("user_id").eq("user_id", identity.id).maybeSingle();
    if (instructor.error || !instructor.data) return { data: null, error: instructor.error ?? { message: "Instructor profile not found" } };
    const requirement = await db.from("learner_requirements").select("id").eq("id", input.requirementId).eq("status", "published").maybeSingle();
    if (requirement.error || !requirement.data) return { data: null, error: requirement.error ?? { message: "Published requirement not found" } };
    return db.from("requirement_responses").insert({ requirement_id: input.requirementId, instructor_id: identity.id, message, status: "pending" }).select("*").single();
  });
}

export async function updateOwnRequirementResponseStatus(identity: SupabaseIdentity, input: { responseId: string; status: "pending" | "shortlisted" | "accepted" | "rejected" | "withdrawn" }) {
  const db = client(identity); if (!db) return failure("Supabase persistence unavailable.");
  return safe(() => db.from("requirement_responses").update({ status: input.status, updated_at: new Date().toISOString() }).eq("id", input.responseId).eq("instructor_id", identity.id).select("*").single());
}

export async function listOwnCredentials(identity: SupabaseIdentity) {
  const db = client(identity); if (!db) return failure("Supabase persistence unavailable.");
  return safe(() => db.from("instructor_credentials").select("*").eq("instructor_id", identity.id).order("created_at", { ascending: false }));
}

export async function createCredential(identity: SupabaseIdentity, input: { objectPath: string; mimeType: string; sizeBytes: number }) {
  const db = client(identity); if (!db) return failure("Supabase persistence unavailable.");
  if (!input.objectPath.startsWith(`${identity.id}/`) || input.sizeBytes <= 0 || input.sizeBytes > 25 * 1024 * 1024) return failure("Supabase operation failed.");
  return safe(() => db.from("instructor_credentials").insert({ instructor_id: identity.id, object_path: input.objectPath, mime_type: input.mimeType, size_bytes: input.sizeBytes }).select("*").single());
}

export async function deleteOwnCredential(identity: SupabaseIdentity, credentialId: string) {
  const db = client(identity); if (!db) return failure("Supabase persistence unavailable.");
  return safe(async () => {
    const existing = await db.from("instructor_credentials").select("id, object_path").eq("id", credentialId).eq("instructor_id", identity.id).maybeSingle();
    if (existing.error || !existing.data) return { data: null, error: existing.error ?? { message: "Credential not found" } };
    const removed = await db.from("instructor_credentials").delete().eq("id", credentialId).eq("instructor_id", identity.id).select("id").single();
    if (removed.error) return removed;
    return { data: { id: removed.data.id, objectPath: existing.data.object_path }, error: null };
  });
}

/**
 * The intro media a teacher chooses to show on their public profile.
 *
 * There is no "kind" column and none is needed: the mime type already says whether a file is the
 * introduction video or the recitation sample, and the profile reads it that way. Visibility is the
 * teacher's own switch — a file stays private until they say otherwise, and a private file is
 * readable only by them and an administrator, which is what the table policy already enforces.
 */
export async function listOwnInstructorMedia(identity: SupabaseIdentity) {
  const db = client(identity); if (!db) return failure("Supabase persistence unavailable.");
  return safe(() => db.from("instructor_media").select("*").eq("instructor_id", identity.id).order("created_at", { ascending: false }));
}

export async function createInstructorMedia(identity: SupabaseIdentity, input: { objectPath: string; mimeType: string; sizeBytes: number; visibility: "public" | "private" }) {
  const db = client(identity); if (!db) return failure("Supabase persistence unavailable.");
  // The path is built from the caller's own id by the storage layer; refusing anything else here
  // means a forged path cannot attach a stranger's object to this profile.
  if (!input.objectPath.startsWith(`${identity.id}/`) || input.sizeBytes <= 0 || input.sizeBytes > 25 * 1024 * 1024) return failure("Supabase operation failed.");
  return safe(() => db.from("instructor_media").insert({ instructor_id: identity.id, object_path: input.objectPath, mime_type: input.mimeType, size_bytes: input.sizeBytes, visibility: input.visibility }).select("*").single());
}

export async function setOwnInstructorMediaVisibility(identity: SupabaseIdentity, input: { mediaId: string; visibility: "public" | "private" }) {
  const db = client(identity); if (!db) return failure("Supabase persistence unavailable.");
  return safe(() => db.from("instructor_media").update({ visibility: input.visibility }).eq("id", input.mediaId).eq("instructor_id", identity.id).select("*").single());
}

export async function deleteOwnInstructorMedia(identity: SupabaseIdentity, mediaId: string) {
  const db = client(identity); if (!db) return failure("Supabase persistence unavailable.");
  return safe(async () => {
    const existing = await db.from("instructor_media").select("id, object_path").eq("id", mediaId).eq("instructor_id", identity.id).maybeSingle();
    if (existing.error || !existing.data) return { data: null, error: existing.error ?? { message: "Media not found" } };
    const removed = await db.from("instructor_media").delete().eq("id", mediaId).eq("instructor_id", identity.id).select("id").single();
    if (removed.error) return removed;
    return { data: { id: removed.data.id, objectPath: existing.data.object_path }, error: null };
  });
}

export async function listPublishedCourses(identity?: SupabaseIdentity) {
  if (!identity) return failure("Supabase persistence unavailable.");
  const db = client(identity); if (!db) return failure("Supabase persistence unavailable.");
  return safe(() => db.from("courses").select("*").eq("status", "published").order("created_at", { ascending: false }));
}

/**
 * Filters for public course discovery. Like instructor discovery, each field narrows the query
 * itself; the published gate is applied first and cannot be overridden by caller input.
 */
export type PublicCourseFilters = {
  query?: string;
  subjects?: string[];
  levels?: string[];
  languages?: string[];
  sort?: "newest" | "title_asc";
  limit?: number;
  offset?: number;
};

export async function listPublicPublishedCourses(filters: PublicCourseFilters = {}) {
  const db = getSupabasePublicClient(); if (!db) return failure("Supabase persistence unavailable.");
  const limit = Math.min(Math.max(filters.limit ?? 24, 1), 48);
  const offset = Math.max(filters.offset ?? 0, 0);

  let request = db
    .from("courses")
    .select("id, slug, title, description, subject, level, language, status, created_at", { count: "exact" })
    .eq("status", "published");

  if (filters.subjects?.length) request = request.in("subject", filters.subjects);
  if (filters.levels?.length) request = request.in("level", filters.levels);
  if (filters.languages?.length) request = request.in("language", filters.languages);

  const term = filters.query?.trim();
  if (term) {
    const escaped = term.replace(/[%,()]/g, " ").trim();
    if (escaped) request = request.or(`title.ilike.%${escaped}%,description.ilike.%${escaped}%,subject.ilike.%${escaped}%`);
  }

  request = filters.sort === "title_asc"
    ? request.order("title", { ascending: true })
    : request.order("created_at", { ascending: false });

  const { data, error, count } = await request.range(offset, offset + limit - 1);
  if (error) return failure("Supabase operation failed.");
  return { ok: true as const, data: { courses: data ?? [], total: count ?? 0, limit, offset } };
}

/** Distinct subject/level/language values across published courses, for real filter options. */
export async function listCourseFilterFacets() {
  const db = getSupabasePublicClient(); if (!db) return failure("Supabase persistence unavailable.");
  const { data, error } = await db.from("courses").select("subject, level, language").eq("status", "published");
  if (error) return failure("Supabase operation failed.");
  const rows = data ?? [];
  const distinct = (key: "subject" | "level" | "language") =>
    Array.from(new Set(rows.map((row) => row[key] as string | null).filter(Boolean))).sort() as string[];
  return { ok: true as const, data: { subjects: distinct("subject"), levels: distinct("level"), languages: distinct("language") } };
}

export async function getPublicPublishedCourse(slug: string) {
  const db = getSupabasePublicClient(); if (!db) return failure("Supabase persistence unavailable.");
  return safe(() => db.from("courses").select("id, slug, title, description, subject, level, language, status, created_at").eq("slug", slug).eq("status", "published").maybeSingle());
}

export async function getPublicPublishedCourseById(courseId: string) {
  const db = getSupabasePublicClient(); if (!db) return failure("Supabase persistence unavailable.");
  return safe(() => db.from("courses").select("id, slug, title, description, subject, level, language, status, created_at").eq("id", courseId).eq("status", "published").maybeSingle());
}

export async function getPublicPublishedLessonMetadata(slug: string, lessonId: string) {
  const db = getSupabasePublicClient(); if (!db) return failure("Supabase persistence unavailable.");
  return safe(async () => {
    const course = await db.from("courses").select("id, slug, title, subject, level, language, status").eq("slug", slug).eq("status", "published").maybeSingle();
    if (course.error || !course.data) return { data: null, error: course.error ?? { message: "Course not found" } };
    const modules = await db.from("course_modules").select("id, title, sort_order").eq("course_id", course.data.id).eq("status", "published");
    if (modules.error) return { data: null, error: modules.error };
    const moduleIds = (modules.data ?? []).map((module) => module.id);
    if (!moduleIds.length) return { data: null, error: { message: "Lesson not found" } };
    const lesson = await db.from("lessons").select("id, module_id, title, description, duration_seconds, transcript, sort_order, status, is_preview").eq("id", lessonId).in("module_id", moduleIds).eq("status", "published").maybeSingle();
    if (lesson.error || !lesson.data) return { data: null, error: lesson.error ?? { message: "Lesson not found" } };
    const lessonData = lesson.data;
    const module = (modules.data ?? []).find((item) => item.id === lessonData.module_id);
    return { data: { course: course.data, module: module ?? null, lesson: lessonData }, error: null };
  });
}

export async function listOwnCourses(identity: SupabaseIdentity) {
  const db = client(identity); if (!db) return failure("Supabase persistence unavailable.");
  return safe(() => db.from("courses").select("*").eq("instructor_id", identity.id).order("updated_at", { ascending: false }));
}

export async function createCourse(identity: SupabaseIdentity, input: { slug: string; title: string; description: string; subject: string; level: string; language: string }) {
  const db = client(identity); if (!db) return failure("Supabase persistence unavailable.");
  return safe(() => db.from("courses").insert({ instructor_id: identity.id, slug: input.slug.trim(), title: input.title.trim(), description: input.description.trim(), subject: input.subject.trim(), level: input.level.trim(), language: input.language.trim(), status: "draft" }).select("*").single());
}

export async function updateOwnCourse(identity: SupabaseIdentity, courseId: string, input: { slug: string; title: string; description: string; subject: string; level: string; language: string }) {
  const db = client(identity); if (!db) return failure("Supabase persistence unavailable.");
  return safe(() => db.from("courses").update({ slug: input.slug.trim(), title: input.title.trim(), description: input.description.trim(), subject: input.subject.trim(), level: input.level.trim(), language: input.language.trim(), updated_at: new Date().toISOString() }).eq("id", courseId).eq("instructor_id", identity.id).neq("status", "published").select("*").single());
}

/**
 * Sends one of the instructor's own courses to the review queue.
 *
 * The write is deliberately narrow: `instructor_id = identity.id` means an instructor can
 * only submit their own course, and the `courses_status_guard` trigger from migration 0032
 * independently refuses any transition to `published` by a non-reviewer — so this cannot
 * become a way to self-publish even if the filter above were wrong.
 *
 * A submission nobody is told about waits forever, so every reviewer is notified.
 */
/**
 * The teacher publishes their own course, and the reviewer is told.
 *
 * Migration 0035 moved publication back to the author: a course appears in the catalogue when its
 * teacher says it is ready, and a reviewer's decision afterwards adds the Verified mark rather than
 * switching the listing on. The database enforces the same boundary — the owner may reach 'draft',
 * 'in_review' or 'published' and nothing else; 'rejected' and 'archived' stay a reviewer's.
 *
 * `verification_status` is not touched here and could not be: the trigger added in 0035 refuses any
 * non-reviewer write to it. Publishing never marks a course verified.
 */
export async function publishOwnCourse(identity: SupabaseIdentity, courseId: string) {
  const db = client(identity); if (!db) return failure("Supabase persistence unavailable.");
  const result = await safe(() => db.from("courses").update({ status: "published", updated_at: new Date().toISOString() }).eq("id", courseId).eq("instructor_id", identity.id).in("status", ["draft", "in_review", "rejected", "published"]).select("*").single());
  if (result.ok) {
    const row = result.data as { id?: string; title?: string } | null;
    await notifyReviewersOfPublication({ kind: "course", subjectId: String(row?.id ?? courseId), title: row?.title || "A course" });
  }
  return result;
}

/** And takes it down again. Unpublishing is the author's too, and raises no notice. */
export async function unpublishOwnCourse(identity: SupabaseIdentity, courseId: string) {
  const db = client(identity); if (!db) return failure("Supabase persistence unavailable.");
  return safe(() => db.from("courses").update({ status: "draft", updated_at: new Date().toISOString() }).eq("id", courseId).eq("instructor_id", identity.id).in("status", ["published", "in_review"]).select("*").single());
}

export async function submitOwnCourseForReview(identity: SupabaseIdentity, courseId: string) {
  const db = client(identity); if (!db) return failure("Supabase persistence unavailable.");
  const result = await safe(() => db.from("courses").update({ status: "in_review", updated_at: new Date().toISOString() }).eq("id", courseId).eq("instructor_id", identity.id).in("status", ["draft", "rejected"]).select("*").single());
  if (result.ok) await notifyReviewersOfSubmission(courseId, (result.data as { title?: string } | null)?.title);
  return result;
}

/**
 * Tells the people who can act on it that a course is waiting.
 *
 * Recipients come from `user_roles`, not a configured address: the reviewers are whoever
 * currently holds an administrating role, so a change of staff needs no change here. The
 * ADMIN_EMAIL rule guarding the admin desk is untouched — this decides only who RECEIVES a
 * notification, never who may approve.
 *
 * `notifyUser` upserts on `(user_id, idempotency_key)` and the key carries the course id,
 * so pressing Publish twice does not produce two notifications. Failure is logged and
 * swallowed: the course has already been submitted, and a lost notification must not be
 * reported to the instructor as a failed submission.
 */
async function notifyReviewersOfSubmission(courseId: string, title?: string) {
  const admin = getSupabaseAdminClient();
  if (!admin) return;

  const { data, error } = await admin.from("user_roles").select("user_id").in("role", ["admin", "super_admin", "moderator"]);
  if (error) {
    console.error("[supabase-core] reviewer lookup failed:", { code: error.code, message: error.message });
    return;
  }

  const reviewers = Array.from(new Set((data ?? []).map((row) => String((row as { user_id: string }).user_id))));
  await Promise.all(reviewers.map((reviewer) => notifyUser(
    reviewer,
    "course_submitted_for_review",
    "A course is waiting for review",
    `${title?.trim() || "A course"} has been submitted and is waiting for a decision.`,
    "course",
    courseId,
    `course-review-${courseId}`,
  )));
}

export async function createCourseModule(identity: SupabaseIdentity, input: { courseId: string; title: string; description?: string; sortOrder: number }) {
  const db = client(identity); if (!db) return failure("Supabase persistence unavailable.");
  return safe(() => db.from("course_modules").insert({ course_id: input.courseId, title: input.title.trim(), description: input.description?.trim() || null, sort_order: input.sortOrder, status: "draft" }).select("*").single());
}

export async function updateCourseModule(identity: SupabaseIdentity, input: { moduleId: string; title: string; description?: string; sortOrder?: number }) {
  const db = client(identity); if (!db) return failure("Supabase persistence unavailable.");
  return safe(() => db.from("course_modules").update({ title: input.title.trim(), description: input.description?.trim() || null, ...(input.sortOrder === undefined ? {} : { sort_order: input.sortOrder }), updated_at: new Date().toISOString() }).eq("id", input.moduleId).select("*").single());
}

export async function deleteCourseModule(identity: SupabaseIdentity, moduleId: string) {
  const db = client(identity); if (!db) return failure("Supabase persistence unavailable.");
  return safe(() => db.from("course_modules").delete().eq("id", moduleId).eq("status", "draft").select("id").single());
}

export async function createCourseLesson(identity: SupabaseIdentity, input: { moduleId: string; title: string; description?: string; durationSeconds?: number; transcript?: string; mediaPath?: string; sortOrder: number; isPreview?: boolean }) {
  const db = client(identity); if (!db) return failure("Supabase persistence unavailable.");
  return safe(() => db.from("lessons").insert({ module_id: input.moduleId, title: input.title.trim(), description: input.description?.trim() || null, duration_seconds: input.durationSeconds ?? null, transcript: input.transcript?.trim() || null, media_path: input.mediaPath?.trim() || null, sort_order: input.sortOrder, status: "draft", is_preview: input.isPreview ?? false }).select("*").single());
}

export async function updateCourseLesson(identity: SupabaseIdentity, input: { lessonId: string; title: string; description?: string; durationSeconds?: number; transcript?: string; mediaPath?: string; sortOrder?: number; isPreview?: boolean }) {
  const db = client(identity); if (!db) return failure("Supabase persistence unavailable.");
  return safe(() => db.from("lessons").update({ title: input.title.trim(), description: input.description?.trim() || null, duration_seconds: input.durationSeconds ?? null, transcript: input.transcript?.trim() || null, media_path: input.mediaPath?.trim() || null, ...(input.sortOrder === undefined ? {} : { sort_order: input.sortOrder }), ...(input.isPreview === undefined ? {} : { is_preview: input.isPreview }), updated_at: new Date().toISOString() }).eq("id", input.lessonId).eq("status", "draft").select("*").single());
}

export async function deleteCourseLesson(identity: SupabaseIdentity, lessonId: string) {
  const db = client(identity); if (!db) return failure("Supabase persistence unavailable.");
  return safe(() => db.from("lessons").delete().eq("id", lessonId).eq("status", "draft").select("id").single());
}

export async function listCourseModules(identity: SupabaseIdentity, courseId: string) {
  const db = client(identity); if (!db) return failure("Supabase persistence unavailable.");
  return safe(() => db.from("course_modules").select("*").eq("course_id", courseId).order("sort_order"));
}

export async function listCourseLessons(identity: SupabaseIdentity, moduleId: string) {
  const db = client(identity); if (!db) return failure("Supabase persistence unavailable.");
  return safe(() => db.from("lessons").select("*").eq("module_id", moduleId).order("sort_order"));
}

export async function getOwnCourseStructure(identity: SupabaseIdentity, courseId: string) {
  const db = client(identity); if (!db) return failure("Supabase persistence unavailable.");
  return safe(async () => {
    const course = await db.from("courses").select("id, instructor_id, slug, title, description, subject, level, language, thumbnail_path, status, created_at, updated_at").eq("id", courseId).eq("instructor_id", identity.id).maybeSingle();
    if (course.error || !course.data) return { data: null, error: course.error ?? { message: "Course not found" } };
    const modules = await db.from("course_modules").select("*").eq("course_id", courseId).order("sort_order");
    if (modules.error) return { data: null, error: modules.error };
    const moduleIds = (modules.data ?? []).map((row) => row.id);
    const lessons = moduleIds.length === 0 ? { data: [], error: null } : await db.from("lessons").select("*").in("module_id", moduleIds).order("sort_order");
    return { data: { course: course.data, modules: modules.data ?? [], lessons: lessons.data ?? [] }, error: lessons.error };
  });
}

/**
 * Takes a place on a published course.
 *
 * The published check is here for the message, not for the security: policy
 * `enrolments_learner_insert` refuses an unpublished course at the database, so
 * a caller who skips this path is still stopped. It matters because an active
 * enrolment is one of the four relationships that authorise messaging — without
 * the rule, holding any course UUID would have been enough to open a thread with
 * its instructor, whether or not that instructor had published anything.
 *
 * The instructor is then told, because someone joining your course is exactly
 * the kind of thing you should not have to go looking for. Reuses the existing
 * notifications table and its idempotency key; no new delivery system.
 */
/**
 * Writes a notification on the admin client.
 *
 * `notifications` restricts inserts, so a learner cannot write a row addressed to
 * their instructor through their own session — which is correct, and is why this
 * goes through the service role after the calling procedure has already decided
 * the event genuinely happened. Same shape and same conflict target as the
 * scheduling module already uses, so nothing new is introduced.
 */
async function notifyUser(
  userId: string, type: string, title: string, body: string,
  relatedEntityType: string, relatedEntityId: string, idempotencyKey: string,
) {
  const admin = getSupabaseAdminClient();
  if (!admin) return;
  const { error } = await admin.from("notifications").upsert({
    user_id: userId, type, title, body,
    related_entity_type: relatedEntityType, related_entity_id: relatedEntityId,
    idempotency_key: idempotencyKey, locale: "en",
  }, { onConflict: "user_id,idempotency_key", ignoreDuplicates: true });
  if (error) console.error("[supabase-core] notification failed:", { type, code: error.code, message: error.message });
}

export async function createEnrolment(identity: SupabaseIdentity, courseId: string) {
  const db = client(identity); if (!db) return failure("Supabase persistence unavailable.");

  const { data: course } = await db
    .from("courses").select("id,title,status,instructor_id").eq("id", courseId).maybeSingle();
  const row = course as { id: string; title?: string; status?: string; instructor_id?: string } | null;
  if (!row || row.status !== "published") {
    return failure("That course is not open for enrolment.");
  }

  const result = await safe(() => db.from("enrolments")
    .upsert({ learner_id: identity.id, course_id: courseId, status: "active" }, { onConflict: "learner_id,course_id" })
    .select("*").single());

  if (result.ok && row.instructor_id && row.instructor_id !== identity.id) {
    await notifyUser(
      row.instructor_id,
      "enrolment_created",
      "A learner enrolled in your course",
      `Someone enrolled in ${row.title ?? "your course"}.`,
      "enrolment",
      String(courseId),
      `enrolment:${courseId}:${identity.id}`,
    );
  }
  return result;
}

export async function listOwnEnrolments(identity: SupabaseIdentity) {
  const db = client(identity); if (!db) return failure("Supabase persistence unavailable.");
  return safe(() => db.from("enrolments").select("*").eq("learner_id", identity.id).order("enrolled_at", { ascending: false }));
}

export async function listOwnProgress(identity: SupabaseIdentity) {
  const db = client(identity); if (!db) return failure("Supabase persistence unavailable.");
  return safe(() => db.from("lesson_progress").select("*").eq("learner_id", identity.id).order("updated_at", { ascending: false }));
}

export async function getLearnerWorkspace(identity: SupabaseIdentity) {
  const db = client(identity); if (!db) return failure("Supabase persistence unavailable.");
  return safe(async () => {
    const enrolments = await db.from("enrolments").select("id, course_id, status, enrolled_at, completed_at").eq("learner_id", identity.id).in("status", ["active", "completed"]).order("enrolled_at", { ascending: false });
    if (enrolments.error) return { data: null, error: enrolments.error };
    const courseIds = (enrolments.data ?? []).map((row) => row.course_id);
    if (courseIds.length === 0) return { data: { enrolments: [], courses: [], modules: [], lessons: [], progress: [] }, error: null };
    const [courses, modules, progress] = await Promise.all([
      db.from("courses").select("id, slug, title, description, subject, level, language, status, created_at, updated_at").in("id", courseIds).eq("status", "published"),
      db.from("course_modules").select("id, course_id, title, sort_order").in("course_id", courseIds).order("sort_order"),
      db.from("lesson_progress").select("lesson_id, status, progress_percent, last_position_seconds, updated_at").eq("learner_id", identity.id).order("updated_at", { ascending: false }),
    ]);
    const moduleIds = (modules.data ?? []).map((row) => row.id);
    const lessons = moduleIds.length === 0 ? { data: [], error: null } : await db.from("lessons").select("id, module_id, title, description, duration_seconds, transcript, media_path, sort_order, status, is_preview").in("module_id", moduleIds).order("sort_order");
    return {
      data: { enrolments: enrolments.data ?? [], courses: courses.data ?? [], modules: modules.data ?? [], lessons: lessons.data ?? [], progress: progress.data ?? [] },
      error: courses.error ?? modules.error ?? lessons.error ?? progress.error,
    };
  });
}

export async function listHifzPlans(identity: SupabaseIdentity) {
  const db = client(identity); if (!db) return failure("Supabase persistence unavailable.");
  return safe(() => db.from("hifz_plans").select("*").eq("learner_id", identity.id).order("updated_at", { ascending: false }));
}

export async function createHifzPlan(identity: SupabaseIdentity, input: { title: string; dailyTargetAyahs: number }) {
  const db = client(identity); if (!db) return failure("Supabase persistence unavailable.");
  return safe(() => db.from("hifz_plans").insert({ learner_id: identity.id, title: input.title.trim(), daily_target_ayahs: input.dailyTargetAyahs, status: "active" }).select("*").single());
}

export async function listHifzReviews(identity: SupabaseIdentity, planId: string) {
  const db = client(identity); if (!db) return failure("Supabase persistence unavailable.");
  return safe(() => db.from("hifz_reviews").select("*").eq("learner_id", identity.id).eq("plan_id", planId).order("reviewed_at", { ascending: false }));
}

export async function createHifzReview(identity: SupabaseIdentity, input: { planId: string; reviewType: "sabaq" | "sabqi" | "manzil"; surahNumber: number; ayahFrom: number; ayahTo: number; quality: number; notes?: string }) {
  const db = client(identity); if (!db) return failure("Supabase persistence unavailable.");
  return safe(() => db.from("hifz_reviews").insert({ plan_id: input.planId, learner_id: identity.id, review_type: input.reviewType, surah_number: input.surahNumber, ayah_from: input.ayahFrom, ayah_to: input.ayahTo, quality: input.quality, notes: input.notes?.trim() || null }).select("*").single());
}

type HifzReference = { surah?: number; ayahFrom?: number; ayahTo?: number; juz?: number };
type HifzPlanInput = { title: string; startDate?: string; targetDate?: string; currentReference?: HifzReference; dailyTarget?: { ayahs: number }; weeklyTarget?: { ayahs?: number; sessions?: number }; preferredDays?: string[]; reminderTime?: string; timezone?: string; instructorId?: string | null };
type HifzRecordInput = { planId: string; recordDate: string; reference: HifzReference; sessionType: "new_memorisation" | "revision" | "assessment"; sectionType: "sabaq" | "sabqi" | "manzil"; status?: "planned" | "practiced" | "needs_revision" | "paused"; selfRating?: number; mistakeCount?: number; practiceMinutes?: number; learnerNote?: string };

function validIsoDate(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)); }
function validReference(reference: HifzReference) { return (reference.surah === undefined || (Number.isInteger(reference.surah) && reference.surah >= 1 && reference.surah <= 114)) && (reference.ayahFrom === undefined || (Number.isInteger(reference.ayahFrom) && reference.ayahFrom >= 1)) && (reference.ayahTo === undefined || (Number.isInteger(reference.ayahTo) && reference.ayahTo >= (reference.ayahFrom ?? 1))) && (reference.juz === undefined || (Number.isInteger(reference.juz) && reference.juz >= 1 && reference.juz <= 30)); }

export async function createAdvancedHifzPlan(identity: SupabaseIdentity, input: HifzPlanInput) {
  const db = client(identity); if (!db) return failure("Supabase persistence unavailable.");
  const title = input.title.trim(); const startDate = input.startDate ?? new Date().toISOString().slice(0, 10);
  if (!title || !validIsoDate(startDate) || (input.targetDate && (!validIsoDate(input.targetDate) || input.targetDate < startDate)) || !validReference(input.currentReference ?? {}) || (input.dailyTarget?.ayahs !== undefined && (!Number.isInteger(input.dailyTarget.ayahs) || input.dailyTarget.ayahs < 1 || input.dailyTarget.ayahs > 100))) return failure("Supabase operation failed.");
  return safe(() => db.from("hifz_plans").insert({ learner_id: identity.id, instructor_id: input.instructorId ?? null, title, start_date: startDate, target_date: input.targetDate ?? null, current_reference_json: input.currentReference ?? {}, daily_target_json: input.dailyTarget ?? { ayahs: 5 }, weekly_target_json: input.weeklyTarget ?? {}, preferred_days: input.preferredDays ?? [], reminder_time: input.reminderTime ?? null, timezone: input.timezone ?? "UTC", status: "active", daily_target_ayahs: input.dailyTarget?.ayahs ?? 5 }).select("*").single());
}

export async function updateAdvancedHifzPlan(identity: SupabaseIdentity, planId: string, input: Partial<HifzPlanInput> & { status?: "active" | "paused" | "completed" | "archived" }) {
  const db = client(identity); if (!db) return failure("Supabase persistence unavailable.");
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.title !== undefined) { const title = input.title.trim(); if (!title) return failure("Supabase operation failed."); patch.title = title; }
  if (input.startDate !== undefined) { if (!validIsoDate(input.startDate)) return failure("Supabase operation failed."); patch.start_date = input.startDate; }
  if (input.targetDate !== undefined) { if (input.targetDate && !validIsoDate(input.targetDate)) return failure("Supabase operation failed."); patch.target_date = input.targetDate || null; }
  if (input.currentReference !== undefined) { if (!validReference(input.currentReference)) return failure("Supabase operation failed."); patch.current_reference_json = input.currentReference; }
  if (input.dailyTarget !== undefined) { if (!Number.isInteger(input.dailyTarget.ayahs) || input.dailyTarget.ayahs < 1 || input.dailyTarget.ayahs > 100) return failure("Supabase operation failed."); patch.daily_target_json = input.dailyTarget; patch.daily_target_ayahs = input.dailyTarget.ayahs; }
  if (input.weeklyTarget !== undefined) patch.weekly_target_json = input.weeklyTarget;
  if (input.preferredDays !== undefined) patch.preferred_days = input.preferredDays;
  if (input.reminderTime !== undefined) patch.reminder_time = input.reminderTime || null;
  if (input.timezone !== undefined) patch.timezone = input.timezone;
  if (input.instructorId !== undefined) patch.instructor_id = input.instructorId || null;
  if (input.status !== undefined) patch.status = input.status;
  return safe(() => db.from("hifz_plans").update(patch).eq("id", planId).eq("learner_id", identity.id).select("*").single());
}

export async function listAdvancedHifzPlans(identity: SupabaseIdentity) { const db = client(identity); if (!db) return failure("Supabase persistence unavailable."); return safe(() => db.from("hifz_plans").select("*").eq("learner_id", identity.id).order("updated_at", { ascending: false })); }

export async function createHifzRecord(identity: SupabaseIdentity, input: HifzRecordInput) {
  const db = client(identity); if (!db) return failure("Supabase persistence unavailable.");
  if (!validIsoDate(input.recordDate) || !validReference(input.reference) || (input.selfRating !== undefined && (!Number.isInteger(input.selfRating) || input.selfRating < 1 || input.selfRating > 5)) || (input.mistakeCount !== undefined && (!Number.isInteger(input.mistakeCount) || input.mistakeCount < 0)) || (input.practiceMinutes !== undefined && (!Number.isInteger(input.practiceMinutes) || input.practiceMinutes < 0 || input.practiceMinutes > 1440))) return failure("Supabase operation failed.");
  return safe(async () => { const plan = await db.from("hifz_plans").select("id,instructor_id").eq("id", input.planId).eq("learner_id", identity.id).maybeSingle(); if (plan.error || !plan.data) return { data: null, error: plan.error ?? { message: "Plan not found" } }; return db.from("hifz_records").upsert({ plan_id: input.planId, learner_id: identity.id, instructor_id: plan.data.instructor_id, record_date: input.recordDate, reference_json: input.reference, session_type: input.sessionType, section_type: input.sectionType, status: input.status ?? "planned", self_rating: input.selfRating ?? null, mistake_count: input.mistakeCount ?? null, practice_minutes: input.practiceMinutes ?? null, learner_note: input.learnerNote?.trim() || null }, { onConflict: "plan_id,record_date,section_type" }).select("*").single(); });
}

export async function updateOwnDraftHifzRecord(identity: SupabaseIdentity, recordId: string, input: Partial<Omit<HifzRecordInput, "planId">>) {
  const db = client(identity); if (!db) return failure("Supabase persistence unavailable.");
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }; if (input.recordDate !== undefined) patch.record_date = input.recordDate; if (input.reference !== undefined && validReference(input.reference)) patch.reference_json = input.reference; if (input.sessionType !== undefined) patch.session_type = input.sessionType; if (input.sectionType !== undefined) patch.section_type = input.sectionType; if (input.status !== undefined && ["planned", "practiced", "needs_revision", "paused"].includes(input.status)) patch.status = input.status; if (input.selfRating !== undefined) patch.self_rating = input.selfRating; if (input.mistakeCount !== undefined) patch.mistake_count = input.mistakeCount; if (input.practiceMinutes !== undefined) patch.practice_minutes = input.practiceMinutes; if (input.learnerNote !== undefined) patch.learner_note = input.learnerNote?.trim() || null; return safe(() => db.from("hifz_records").update(patch).eq("id", recordId).eq("learner_id", identity.id).in("status", ["planned", "practiced", "needs_revision", "paused"]).select("*").single());
}

export async function listOwnHifzRecords(identity: SupabaseIdentity, planId: string) { const db = client(identity); if (!db) return failure("Supabase persistence unavailable."); return safe(() => db.from("hifz_records").select("*").eq("plan_id", planId).eq("learner_id", identity.id).order("record_date", { ascending: false })); }
export async function submitHifzRecordForReview(identity: SupabaseIdentity, recordId: string) { const db = client(identity); if (!db) return failure("Supabase persistence unavailable."); return safe(async () => { const record = await db.from("hifz_records").select("*").eq("id", recordId).eq("learner_id", identity.id).in("status", ["planned", "practiced", "needs_revision"]).maybeSingle(); if (record.error || !record.data) return { data: null, error: record.error ?? { message: "Record not found" } }; const updated = await db.from("hifz_records").update({ status: "submitted_for_review", submitted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", recordId).eq("learner_id", identity.id).select("*").single(); if (updated.error || !updated.data) return updated; const ref = (record.data.reference_json ?? {}) as HifzReference; const review = await db.from("hifz_reviews").insert({ record_id: recordId, plan_id: record.data.plan_id, learner_id: identity.id, review_type: record.data.section_type, surah_number: ref.surah ?? 1, ayah_from: ref.ayahFrom ?? 1, ayah_to: ref.ayahTo ?? ref.ayahFrom ?? 1, quality: record.data.self_rating ?? 3, status: "submitted_for_review" }).select("*").single(); return { data: { record: updated.data, review: review.data }, error: review.error }; }); }
export async function listAssignedLearnerHifzRecords(identity: SupabaseIdentity, learnerId?: string) { const db = client(identity); if (!db) return failure("Supabase persistence unavailable."); let query = db.from("hifz_records").select("*").eq("instructor_id", identity.id); if (learnerId) query = query.eq("learner_id", learnerId); return safe(() => query.order("record_date", { ascending: false })); }
export async function listAssignedHifzReviews(identity: SupabaseIdentity, learnerId?: string) { const db = client(identity); if (!db) return failure("Supabase persistence unavailable."); let query = db.from("hifz_reviews").select("*").eq("instructor_id", identity.id); if (learnerId) query = query.eq("learner_id", learnerId); return safe(() => query.order("reviewed_at", { ascending: false })); }
export async function reviewHifzRecord(identity: SupabaseIdentity, input: { reviewId: string; status: "reviewed" | "needs_revision" | "approved"; qualityRating?: number; mistakeCategories?: string[]; feedbackNote?: string; revisionRecommendation?: string; nextSabaqSuggestion?: string }) { const db = client(identity); if (!db) return failure("Supabase persistence unavailable."); if (input.qualityRating !== undefined && (!Number.isInteger(input.qualityRating) || input.qualityRating < 1 || input.qualityRating > 5)) return failure("Supabase operation failed."); return safe(async () => { const review = await db.from("hifz_reviews").select("id,record_id").eq("id", input.reviewId).maybeSingle(); if (review.error || !review.data?.record_id) return { data: null, error: review.error ?? { message: "Review not found" } }; const record = await db.from("hifz_records").select("id,status").eq("id", review.data.record_id).eq("instructor_id", identity.id).eq("status", "submitted_for_review").maybeSingle(); if (record.error || !record.data) return { data: null, error: record.error ?? { message: "Assigned submitted record not found" } }; const updated = await db.from("hifz_reviews").update({ instructor_id: identity.id, reviewed_by: identity.id, status: input.status, quality_rating: input.qualityRating ?? null, mistake_categories: input.mistakeCategories ?? [], feedback_note: input.feedbackNote?.trim() || null, revision_recommendation: [input.revisionRecommendation, input.nextSabaqSuggestion].filter(Boolean).join("\\n") || null, reviewed_at: new Date().toISOString() }).eq("id", input.reviewId).is("instructor_id", null).select("*").single(); if (updated.error || !updated.data) return updated; const nextStatus = input.status === "needs_revision" ? "needs_revision" : input.status; const recordUpdate = await db.from("hifz_records").update({ status: nextStatus, updated_at: new Date().toISOString() }).eq("id", review.data.record_id).eq("instructor_id", identity.id).select("id").single(); return { data: updated.data, error: recordUpdate.error }; }); }
export async function calculateHifzProgress(identity: SupabaseIdentity, planId: string) { const db = client(identity); if (!db) return failure("Supabase persistence unavailable."); return safe(async () => { const records = await db.from("hifz_records").select("section_type,status,practice_minutes,record_date").eq("plan_id", planId).eq("learner_id", identity.id).order("record_date", { ascending: false }); if (records.error) return records; return { data: summarizeHifzProgress(records.data ?? []), error: null }; }); }
export async function createHifzReminder(identity: SupabaseIdentity, input: { planId: string; reminderType: "daily_sabaq" | "sabqi_revision" | "manzil_revision" | "pending_review" | "needs_revision" | "weekly_progress"; scheduledFor: string; timezone: string; idempotencyKey: string }) { const db = client(identity); if (!db) return failure("Supabase persistence unavailable."); if (!input.idempotencyKey.trim() || Number.isNaN(Date.parse(input.scheduledFor))) return failure("Supabase operation failed."); return safe(async () => { const plan = await db.from("hifz_plans").select("id").eq("id", input.planId).eq("learner_id", identity.id).maybeSingle(); if (plan.error || !plan.data) return { data: null, error: plan.error ?? { message: "Plan not found" } }; return db.from("hifz_reminders").upsert({ plan_id: input.planId, learner_id: identity.id, reminder_type: input.reminderType, scheduled_for: input.scheduledFor, timezone: input.timezone, status: "scheduled", idempotency_key: input.idempotencyKey.trim() }, { onConflict: "learner_id,idempotency_key" }).select("*").single(); }); }
export async function listHifzReminders(identity: SupabaseIdentity) { const db = client(identity); if (!db) return failure("Supabase persistence unavailable."); return safe(() => db.from("hifz_reminders").select("*").eq("learner_id", identity.id).order("scheduled_for", { ascending: true })); }

export async function upsertLessonProgress(identity: SupabaseIdentity, input: { lessonId: string; completed: boolean; progressPercent: number }) {
  const db = client(identity); if (!db) return failure("Supabase persistence unavailable.");
  const progress = Math.max(0, Math.min(100, Math.round(input.progressPercent)));
  const status = input.completed ? "completed" : progress > 0 ? "in_progress" : "not_started";
  return safe(() => db.from("lesson_progress").upsert({ learner_id: identity.id, lesson_id: input.lessonId, status, progress_percent: progress }).select("*").single());
}


export async function listOwnConversations(identity: SupabaseIdentity) {
  const db = client(identity); if (!db) return failure("Supabase persistence unavailable.");
  return safe(async () => {
    const memberships = await db.from("conversation_members").select("conversation_id, member_role, joined_at").eq("user_id", identity.id).order("joined_at", { ascending: false });
    if (memberships.error) return memberships;
    const ids = (memberships.data ?? []).map((row) => row.conversation_id);
    if (ids.length === 0) return { data: [], error: null };
    const conversations = await db.from("conversations").select("*").in("id", ids).order("updated_at", { ascending: false });
    if (conversations.error) return conversations;
    return { data: conversations.data ?? [], error: null };
  });
}

export async function listConversationMessages(identity: SupabaseIdentity, conversationId: string) {
  const db = client(identity); if (!db) return failure("Supabase persistence unavailable.");
  return safe(async () => {
    const member = await db.from("conversation_members").select("conversation_id").eq("conversation_id", conversationId).eq("user_id", identity.id).maybeSingle();
    if (member.error || !member.data) return { data: null, error: member.error ?? { message: "Conversation access denied" } };
    return db.from("messages").select("*").eq("conversation_id", conversationId).order("created_at", { ascending: true });
  });
}

export async function createConversationMessage(identity: SupabaseIdentity, input: { conversationId: string; body: string; attachmentPath?: string }) {
  const db = client(identity); if (!db) return failure("Supabase persistence unavailable.");
  const body = input.body.trim();
  if (!body || body.length > 12000) return failure("Supabase operation failed.");
  return safe(async () => {
    const member = await db.from("conversation_members").select("conversation_id").eq("conversation_id", input.conversationId).eq("user_id", identity.id).maybeSingle();
    if (member.error || !member.data) return { data: null, error: member.error ?? { message: "Conversation access denied" } };
    return db.from("messages").insert({ conversation_id: input.conversationId, sender_id: identity.id, body, attachment_path: input.attachmentPath?.trim() || null }).select("*").single();
  });
}
