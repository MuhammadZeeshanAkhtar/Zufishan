/**
 * Certificates.
 *
 * The rule, decided by the product owner and enforced here rather than in the browser:
 *
 *   Every *published* lesson in the course is completed, AND
 *   where the course has quizzes or graded assignments, the learner's average score meets the
 *   course's pass mark. A course with no assessment needs only the lessons.
 *
 * Three things about that are deliberate:
 *
 * Draft lessons do not count. `lessons.status` exists, and an unpublished lesson a learner cannot
 * open must not be able to hold their certificate hostage.
 *
 * A missing pass mark is not a pass. `courses.pass_mark` is nullable with no default, because
 * inventing a number would be inventing the rule. A course that has assessments but no pass mark
 * set issues nothing, and says so — that is a setup-needed state pointing at the instructor, not a
 * failure blamed on the learner.
 *
 * An unattempted assessment is not a zero and not a pass. If any quiz or assignment has no score
 * for this learner, the answer is "not finished yet", which is a different sentence from "failed".
 *
 * Where each half runs, and why:
 *
 *   Reading runs on the caller's own client. `lesson_progress_own_write`, `quiz_attempts_own` and
 *   `submissions_own_or_course_owner` scope every row to the learner, so a learner can only ever
 *   evaluate themselves — the eligibility check cannot be pointed at somebody else.
 *
 *   Writing runs through the service role, because `certificates_admin_write` restricts every write
 *   to an administrator. That policy is left exactly as it is: the server proves eligibility first
 *   and then writes, the same shape already used for grading and for reviewed decisions. The
 *   frontend never decides anything — it renders what this module returns.
 *
 * Verification is a separate, deliberately narrow path. It takes a random code, never a row id, and
 * returns only what confirms authenticity. See `verifyByCode`.
 */
import { randomBytes } from "node:crypto";
import { getSupabaseAdminClient } from "./supabase-admin-client";
import { getSupabaseUserClient } from "./supabase-user-client";
import type { SupabaseIdentity } from "./supabase-auth";

type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "SETUP_NEEDED" | "VALIDATION" };

/** Why a learner is or is not eligible. Each reason gets its own sentence on screen. */
export type EligibilityReason =
  | "eligible"
  | "no_lessons"
  | "lessons_incomplete"
  | "pass_mark_not_set"
  | "assessment_incomplete"
  | "assessment_failed";

export type Eligibility = {
  eligible: boolean;
  reason: EligibilityReason;
  lessonsTotal: number;
  lessonsCompleted: number;
  hasAssessment: boolean;
  passMark: number | null;
  /** The learner's average across scored assessments, or null when nothing is scored yet. */
  averageScore: number | null;
  assessmentsTotal: number;
  assessmentsScored: number;
};

/**
 * Decides eligibility from rows the caller is permitted to read.
 *
 * Exported as a pure function so the rule itself is testable without a database: the boundary that
 * matters is which rows reach it, and that is RLS's job, not this function's.
 */
export function decideEligibility(input: {
  publishedLessonIds: string[];
  completedLessonIds: string[];
  passMark: number | null;
  /** One entry per assessment on the course; null means this learner has no score for it. */
  assessmentScores: Array<number | null>;
}): Eligibility {
  const lessonsTotal = input.publishedLessonIds.length;
  const completed = new Set(input.completedLessonIds);
  const lessonsCompleted = input.publishedLessonIds.filter((id) => completed.has(id)).length;

  const assessmentsTotal = input.assessmentScores.length;
  const scored = input.assessmentScores.filter((score): score is number => typeof score === "number");
  const averageScore = scored.length ? Math.round((scored.reduce((sum, n) => sum + n, 0) / scored.length) * 10) / 10 : null;

  const base = {
    lessonsTotal, lessonsCompleted,
    hasAssessment: assessmentsTotal > 0,
    passMark: input.passMark,
    averageScore,
    assessmentsTotal, assessmentsScored: scored.length,
  };

  // A course with nothing published in it cannot be completed, and saying "incomplete" would be
  // misleading — there is nothing to complete.
  if (lessonsTotal === 0) return { ...base, eligible: false, reason: "no_lessons" };
  if (lessonsCompleted < lessonsTotal) return { ...base, eligible: false, reason: "lessons_incomplete" };

  if (assessmentsTotal === 0) return { ...base, eligible: true, reason: "eligible" };

  // The instructor has not said what passing means. That is theirs to fix, not the learner's.
  if (input.passMark === null) return { ...base, eligible: false, reason: "pass_mark_not_set" };

  // An unattempted or ungraded assessment is unfinished, which is not the same as failed.
  if (scored.length < assessmentsTotal) return { ...base, eligible: false, reason: "assessment_incomplete" };

  if ((averageScore ?? 0) < input.passMark) return { ...base, eligible: false, reason: "assessment_failed" };
  return { ...base, eligible: true, reason: "eligible" };
}

/** Gathers the caller's own rows and applies the rule. */
export async function getOwnEligibility(identity: SupabaseIdentity, input: { courseId: string }): Promise<Result<Eligibility & { certificate: unknown | null }>> {
  const db = getSupabaseUserClient(identity.accessToken);
  if (!db) return { ok: false, error: "Supabase persistence unavailable.", code: "SETUP_NEEDED" };

  const { data: course, error: courseError } = await db
    .from("courses").select("id,title,pass_mark,status").eq("id", input.courseId).maybeSingle();
  if (courseError) {
    console.error("[certificates] course read failed:", { code: courseError.code, message: courseError.message });
    return { ok: false, error: "The course could not be loaded." };
  }
  if (!course) return { ok: false, error: "This course is not available to your account.", code: "NOT_FOUND" };

  // Published lessons only, reached through the course's modules.
  const { data: lessons } = await db
    .from("lessons").select("id,status,course_modules!inner(course_id)").eq("course_modules.course_id", input.courseId).eq("status", "published");
  const publishedLessonIds = (lessons ?? []).map((row) => String((row as { id: string }).id));

  const { data: progress } = await db
    .from("lesson_progress").select("lesson_id,status").eq("learner_id", identity.id).eq("status", "completed");
  const completedLessonIds = (progress ?? []).map((row) => String((row as { lesson_id: string }).lesson_id));

  // One score per assessment: the learner's best quiz attempt, and each graded submission.
  const { data: quizzes } = await db.from("quizzes").select("id").eq("course_id", input.courseId);
  const quizIds = (quizzes ?? []).map((row) => String((row as { id: string }).id));
  const { data: attempts } = quizIds.length
    ? await db.from("quiz_attempts").select("quiz_id,score").eq("learner_id", identity.id).in("quiz_id", quizIds)
    : { data: [] };
  const bestByQuiz = new Map<string, number>();
  for (const row of attempts ?? []) {
    const attempt = row as { quiz_id: string; score: number | null };
    if (typeof attempt.score !== "number") continue;
    const current = bestByQuiz.get(String(attempt.quiz_id));
    if (current === undefined || attempt.score > current) bestByQuiz.set(String(attempt.quiz_id), attempt.score);
  }

  const { data: assignments } = await db.from("assignments").select("id").eq("course_id", input.courseId);
  const assignmentIds = (assignments ?? []).map((row) => String((row as { id: string }).id));
  const { data: submissions } = assignmentIds.length
    ? await db.from("submissions").select("assignment_id,score").eq("learner_id", identity.id).in("assignment_id", assignmentIds)
    : { data: [] };
  const scoreByAssignment = new Map<string, number>();
  for (const row of submissions ?? []) {
    const submission = row as { assignment_id: string; score: number | null };
    if (typeof submission.score === "number") scoreByAssignment.set(String(submission.assignment_id), submission.score);
  }

  const assessmentScores: Array<number | null> = [
    ...quizIds.map((id) => bestByQuiz.get(id) ?? null),
    ...assignmentIds.map((id) => scoreByAssignment.get(id) ?? null),
  ];

  const passMarkRaw = (course as { pass_mark: number | null }).pass_mark;
  const eligibility = decideEligibility({
    publishedLessonIds,
    completedLessonIds,
    passMark: typeof passMarkRaw === "number" ? passMarkRaw : null,
    assessmentScores,
  });

  // An existing certificate is the caller's own row; `certificates_own_or_public` permits the read.
  const { data: certificate } = await db
    .from("certificates").select("id,status,issued_at,verification_code").eq("learner_id", identity.id).eq("course_id", input.courseId).maybeSingle();

  return { ok: true, data: { ...eligibility, certificate: certificate ?? null } };
}

/** A code with enough entropy that the public lookup cannot be walked. */
function newVerificationCode(): string {
  // 20 bytes of CSPRNG output, base32-ish over an unambiguous alphabet — no 0/O/1/I.
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(20);
  let code = "";
  // Array.from keeps this within the project's compilation target.
  for (const byte of Array.from(bytes)) code += alphabet[byte % alphabet.length];
  return `NI-${code.slice(0, 5)}-${code.slice(5, 10)}-${code.slice(10, 15)}-${code.slice(15, 20)}`;
}

/**
 * Issues the caller's certificate for a course, if the rule says they have earned it.
 *
 * Eligibility is re-decided here from the database rather than trusted from the client, and the row
 * is written through the service role because every write to `certificates` is admin-only. The
 * unique(learner_id, course_id) constraint makes a second issue impossible rather than merely
 * unlikely, so a double click cannot produce two certificates with two codes.
 */
export async function issueOwnCertificate(identity: SupabaseIdentity, input: { courseId: string }): Promise<Result<{ certificateId: string; verificationCode: string; created: boolean }>> {
  const admin = getSupabaseAdminClient();
  if (!admin) return { ok: false, error: "Supabase administrative access is not configured.", code: "SETUP_NEEDED" };

  const decision = await getOwnEligibility(identity, input);
  if (!decision.ok) return decision;
  if (!decision.data.eligible) {
    return { ok: false, error: "This course is not complete, so no certificate can be issued.", code: "FORBIDDEN" };
  }

  const existing = decision.data.certificate as { id: string; status: string; verification_code: string | null } | null;
  if (existing && existing.status === "issued" && existing.verification_code) {
    return { ok: true, data: { certificateId: existing.id, verificationCode: existing.verification_code, created: false } };
  }
  if (existing && existing.status === "revoked") {
    return { ok: false, error: "This certificate was revoked and cannot be reissued here.", code: "CONFLICT" };
  }

  const verificationCode = newVerificationCode();
  const { data, error } = await admin
    .from("certificates")
    .upsert({
      learner_id: identity.id,
      course_id: input.courseId,
      status: "issued",
      issued_at: new Date().toISOString(),
      verification_code: existing?.verification_code ?? verificationCode,
    }, { onConflict: "learner_id,course_id" })
    .select("id,verification_code")
    .single();

  if (error || !data) {
    console.error("[certificates] issue failed:", { code: error?.code, message: error?.message });
    return { ok: false, error: "The certificate could not be issued." };
  }
  const row = data as { id: string; verification_code: string };
  return { ok: true, data: { certificateId: row.id, verificationCode: row.verification_code, created: !existing } };
}

/** The caller's own certificates, for their list. */
export async function listOwnCertificates(identity: SupabaseIdentity): Promise<Result<unknown[]>> {
  const db = getSupabaseUserClient(identity.accessToken);
  if (!db) return { ok: false, error: "Supabase persistence unavailable.", code: "SETUP_NEEDED" };
  const { data, error } = await db
    .from("certificates")
    // The learner's own display name, for the certificate itself. `profiles_select_own_or_admin`
    // permits reading your own profile, and a certificate must carry a name, never an email.
    .select("id,course_id,status,issued_at,verification_code,courses!inner(title,slug),profiles!inner(display_name)")
    .eq("learner_id", identity.id)
    .order("issued_at", { ascending: false });
  if (error) {
    console.error("[certificates] list failed:", { code: error.code, message: error.message });
    return { ok: false, error: "Certificates could not be loaded." };
  }
  return { ok: true, data: data ?? [] };
}

/* ------------------------------------------------------------- verification */

/**
 * A very small throttle, so a scripted caller cannot hammer the public lookup.
 *
 * Stated honestly: this is per-process and in memory. It resets on restart and does not coordinate
 * across instances, so it is a speed bump, not a rate limiter. The real defence against enumeration
 * is the code itself — 20 characters from a 31-symbol alphabet is roughly 99 bits, so guessing is
 * not a practical attack. If this ever runs behind more than one process, this belongs in a shared
 * store; there is no such infrastructure in the project today, and pretending otherwise would be
 * worse than saying so.
 */
const attempts = new Map<string, { count: number; windowStart: number }>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;

function throttled(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    attempts.set(key, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  // Keep the map from growing without bound on a long-running process.
  if (attempts.size > 5000) attempts.clear();
  return entry.count > MAX_PER_WINDOW;
}

/** Exactly what a verifier needs to believe a certificate, and not one field more. */
export type VerificationRecord = {
  valid: boolean;
  status: "issued" | "revoked" | "unknown";
  verificationCode: string | null;
  courseTitle: string | null;
  learnerName: string | null;
  issuedAt: string | null;
};

/**
 * Confirms a certificate from its printed code.
 *
 * Public on purpose: an employer must be able to check a certificate without an account. What that
 * costs is carefully bounded — the lookup accepts only the random code, never a row id; it returns
 * the six fields above and nothing else; and an unknown code and a revoked one are answered in the
 * same shape, so the response cannot be used to probe for which codes exist beyond what a correct
 * code already reveals.
 *
 * Deliberately absent from the response: email, any internal id, scores, lesson or module detail,
 * enrolment history, the instructor's identity, and the learner's full or private name — only the
 * display name they already publish.
 */
export async function verifyByCode(input: { code: string; clientKey?: string }): Promise<Result<VerificationRecord>> {
  const code = input.code.trim().toUpperCase();
  const unknown: VerificationRecord = { valid: false, status: "unknown", verificationCode: null, courseTitle: null, learnerName: null, issuedAt: null };

  // Shape check first: a malformed code never reaches the database.
  if (!/^NI-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(code)) {
    return { ok: true, data: unknown };
  }
  if (throttled(input.clientKey || "anonymous")) {
    return { ok: false, error: "Too many verification attempts. Please wait a moment and try again.", code: "CONFLICT" };
  }

  const admin = getSupabaseAdminClient();
  if (!admin) return { ok: false, error: "Verification is not configured.", code: "SETUP_NEEDED" };

  const { data, error } = await admin
    .from("certificates")
    .select("status,issued_at,verification_code,courses!inner(title),profiles!inner(display_name)")
    .eq("verification_code", code)
    .maybeSingle();

  if (error) {
    console.error("[certificates] verify failed:", { code: error.code, message: error.message });
    return { ok: false, error: "Verification could not be completed." };
  }
  if (!data) return { ok: true, data: unknown };

  const row = data as Record<string, unknown>;
  const status = String(row.status) === "issued" ? "issued" : "revoked";
  return {
    ok: true,
    data: {
      valid: status === "issued",
      status,
      verificationCode: String(row.verification_code),
      courseTitle: String((row.courses as { title?: string } | undefined)?.title ?? ""),
      learnerName: String((row.profiles as { display_name?: string } | undefined)?.display_name ?? ""),
      issuedAt: row.issued_at ? String(row.issued_at) : null,
    },
  };
}

/** The instructor sets what passing means on their own course. */
export async function setCoursePassMark(identity: SupabaseIdentity, input: { courseId: string; passMark: number | null }): Promise<Result<{ passMark: number | null }>> {
  if (input.passMark !== null && (!Number.isInteger(input.passMark) || input.passMark < 0 || input.passMark > 100)) {
    return { ok: false, error: "A pass mark is a whole number from 0 to 100.", code: "VALIDATION" };
  }
  const db = getSupabaseUserClient(identity.accessToken);
  if (!db) return { ok: false, error: "Supabase persistence unavailable.", code: "SETUP_NEEDED" };

  // `courses_owner_write` restricts this to the course's instructor; no extra check is needed here.
  const { data, error } = await db
    .from("courses").update({ pass_mark: input.passMark, updated_at: new Date().toISOString() })
    .eq("id", input.courseId).select("pass_mark").maybeSingle();
  if (error) {
    if (error.code === "42501") return { ok: false, error: "Only the course's instructor can set a pass mark.", code: "FORBIDDEN" };
    console.error("[certificates] pass mark write failed:", { code: error.code, message: error.message });
    return { ok: false, error: "The pass mark could not be saved." };
  }
  if (!data) return { ok: false, error: "Only the course's instructor can set a pass mark.", code: "FORBIDDEN" };
  return { ok: true, data: { passMark: (data as { pass_mark: number | null }).pass_mark } };
}
