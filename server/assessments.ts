/**
 * Assessments: quizzes, assignments, and the work learners submit against them.
 *
 * The RLS layer already draws the ownership lines correctly — an instructor writes the quizzes and
 * assignments on their own course, a learner writes their own attempts and submissions — so most of
 * this runs on the caller's client and lets the database decide.
 *
 * The exception is `score`, and it matters: both learner policies are `for all using (learner_id =
 * auth.uid())`, which is right about ownership and silent about columns, so the row carrying a
 * learner's answers also carries their grade. Migration 0016 blocks self-grading at the database;
 * this file is the other half — the server marks the work, through the service role, so a score has
 * an author who is not the person being scored.
 *
 * Quiz marking is intentionally simple and explicit: a question is `{ id, answer }`, an attempt is
 * `{ [id]: answer }`, and the score is the percentage of exact matches. No partial credit and no
 * inference — a marking rule nobody can predict is worse than a plain one.
 */
import { getSupabaseAdminClient } from "./supabase-admin-client";
import { getSupabaseUserClient } from "./supabase-user-client";
import type { SupabaseIdentity } from "./supabase-auth";

type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "SETUP_NEEDED" | "VALIDATION" };

/** A question as stored in `quizzes.questions`. Anything without an id cannot be marked. */
type Question = { id?: string; prompt?: string; answer?: string };

/** Marks an attempt against the stored answers. Exported so the rule is testable on its own. */
export function markAttempt(questions: Question[], answers: Record<string, unknown>): { score: number; markable: number } {
  const markable = questions.filter((q) => typeof q?.id === "string" && typeof q?.answer === "string");
  if (!markable.length) return { score: 0, markable: 0 };
  const correct = markable.filter((q) => {
    const given = answers[q.id as string];
    return typeof given === "string" && given.trim().toLowerCase() === String(q.answer).trim().toLowerCase();
  }).length;
  return { score: Math.round((correct / markable.length) * 1000) / 10, markable: markable.length };
}

/* ------------------------------------------------------------------ quizzes */

/** Quizzes on a course. RLS shows published courses to anyone and drafts only to their owner. */
export async function listCourseQuizzes(identity: SupabaseIdentity, courseId: string): Promise<Result<unknown[]>> {
  const db = getSupabaseUserClient(identity.accessToken);
  if (!db) return { ok: false, error: "Supabase persistence unavailable.", code: "SETUP_NEEDED" };
  const { data, error } = await db.from("quizzes").select("id,course_id,title,questions,created_at").eq("course_id", courseId);
  if (error) {
    console.error("[assessments] quiz list failed:", { code: error.code, message: error.message });
    return { ok: false, error: "Quizzes could not be loaded." };
  }
  // The stored answers must never travel to a learner, so they are stripped for anyone who does not
  // own the course. The owner check is a read the database has already authorised.
  const { data: course } = await db.from("courses").select("instructor_id").eq("id", courseId).maybeSingle();
  const isOwner = String((course as { instructor_id?: string } | null)?.instructor_id ?? "") === identity.id;
  const rows = (data ?? []).map((row) => {
    const quiz = row as Record<string, unknown>;
    if (isOwner) return quiz;
    const questions = Array.isArray(quiz.questions) ? (quiz.questions as Question[]) : [];
    return { ...quiz, questions: questions.map(({ answer: _answer, ...rest }) => rest) };
  });
  return { ok: true, data: rows };
}

/** Creates a quiz. `quizzes_owner_write` restricts this to the course's instructor. */
export async function createQuiz(
  identity: SupabaseIdentity,
  input: { courseId: string; title: string; questions: Question[] },
): Promise<Result<unknown>> {
  const title = input.title.trim();
  if (!title) return { ok: false, error: "A quiz needs a title.", code: "VALIDATION" };
  if (!Array.isArray(input.questions) || input.questions.length === 0) {
    return { ok: false, error: "A quiz needs at least one question.", code: "VALIDATION" };
  }

  const db = getSupabaseUserClient(identity.accessToken);
  if (!db) return { ok: false, error: "Supabase persistence unavailable.", code: "SETUP_NEEDED" };
  const { data, error } = await db
    .from("quizzes").insert({ course_id: input.courseId, title, questions: input.questions }).select("id,title").single();
  if (error || !data) {
    // 42501 is the row policy refusing a non-owner; report that as a refusal, not a fault.
    if (error?.code === "42501") return { ok: false, error: "Only the course's instructor can add a quiz.", code: "FORBIDDEN" };
    if (error) console.error("[assessments] quiz create failed:", { code: error.code, message: error.message });
    return { ok: false, error: "The quiz could not be saved." };
  }
  return { ok: true, data };
}

/**
 * Submits an attempt and marks it.
 *
 * The learner's answers are written on their own client, under their own policy. The score is then
 * written by the marking service, because a grade the learner can set is not a grade — and 0016
 * rejects it at the database if this is ever bypassed.
 */
export async function submitQuizAttempt(
  identity: SupabaseIdentity,
  input: { quizId: string; answers: Record<string, unknown> },
): Promise<Result<{ attemptId: string; score: number; markable: number }>> {
  const db = getSupabaseUserClient(identity.accessToken);
  const admin = getSupabaseAdminClient();
  if (!db || !admin) return { ok: false, error: "Supabase persistence unavailable.", code: "SETUP_NEEDED" };

  const { data: quiz } = await db.from("quizzes").select("id,questions").eq("id", input.quizId).maybeSingle();
  if (!quiz) return { ok: false, error: "Quiz not found.", code: "NOT_FOUND" };

  const { data: attempt, error } = await db
    .from("quiz_attempts")
    .insert({ quiz_id: input.quizId, learner_id: identity.id, answers: input.answers, submitted_at: new Date().toISOString() })
    .select("id").single();
  if (error || !attempt) {
    if (error) console.error("[assessments] attempt failed:", { code: error.code, message: error.message });
    return { ok: false, error: "The attempt could not be saved." };
  }

  const questions = Array.isArray((quiz as { questions?: unknown }).questions) ? ((quiz as { questions: Question[] }).questions) : [];
  const { score, markable } = markAttempt(questions, input.answers);

  const attemptId = String((attempt as { id: string }).id);
  const { error: scoreError } = await admin.from("quiz_attempts").update({ score }).eq("id", attemptId);
  if (scoreError) {
    console.error("[assessments] marking failed:", { code: scoreError.code, message: scoreError.message });
    return { ok: false, error: "The attempt was saved but could not be marked." };
  }
  return { ok: true, data: { attemptId, score, markable } };
}

/* -------------------------------------------------------------- assignments */

export async function listCourseAssignments(identity: SupabaseIdentity, courseId: string): Promise<Result<unknown[]>> {
  const db = getSupabaseUserClient(identity.accessToken);
  if (!db) return { ok: false, error: "Supabase persistence unavailable.", code: "SETUP_NEEDED" };
  const { data, error } = await db
    .from("assignments").select("id,course_id,title,instructions,due_offset_days,created_at").eq("course_id", courseId);
  if (error) {
    console.error("[assessments] assignment list failed:", { code: error.code, message: error.message });
    return { ok: false, error: "Assignments could not be loaded." };
  }
  return { ok: true, data: data ?? [] };
}

export async function createAssignment(
  identity: SupabaseIdentity,
  input: { courseId: string; title: string; instructions?: string; dueOffsetDays?: number },
): Promise<Result<unknown>> {
  const title = input.title.trim();
  if (!title) return { ok: false, error: "An assignment needs a title.", code: "VALIDATION" };

  const db = getSupabaseUserClient(identity.accessToken);
  if (!db) return { ok: false, error: "Supabase persistence unavailable.", code: "SETUP_NEEDED" };
  const { data, error } = await db
    .from("assignments")
    .insert({ course_id: input.courseId, title, instructions: input.instructions?.trim() || null, due_offset_days: input.dueOffsetDays ?? null })
    .select("id,title").single();
  if (error || !data) {
    if (error?.code === "42501") return { ok: false, error: "Only the course's instructor can add an assignment.", code: "FORBIDDEN" };
    if (error) console.error("[assessments] assignment create failed:", { code: error.code, message: error.message });
    return { ok: false, error: "The assignment could not be saved." };
  }
  return { ok: true, data };
}

/** A learner submits their work. `score` is deliberately not accepted here. */
export async function submitAssignment(
  identity: SupabaseIdentity,
  input: { assignmentId: string; body?: string; objectPath?: string },
): Promise<Result<unknown>> {
  const body = input.body?.trim() ?? "";
  if (!body && !input.objectPath) return { ok: false, error: "Add your work, or attach a file.", code: "VALIDATION" };

  const db = getSupabaseUserClient(identity.accessToken);
  if (!db) return { ok: false, error: "Supabase persistence unavailable.", code: "SETUP_NEEDED" };
  const { data, error } = await db
    .from("submissions")
    .upsert(
      { assignment_id: input.assignmentId, learner_id: identity.id, body: body || null, object_path: input.objectPath ?? null, status: "submitted", updated_at: new Date().toISOString() },
      { onConflict: "assignment_id,learner_id" })
    .select("id,status").single();
  if (error || !data) {
    if (error) console.error("[assessments] submission failed:", { code: error.code, message: error.message });
    return { ok: false, error: "The submission could not be saved." };
  }
  return { ok: true, data };
}

/**
 * The instructor grades a submission.
 *
 * Written through the service role: the row belongs to the learner, so the instructor's own client
 * has no write access to it. Ownership of the course is verified here first — that check is the
 * authorisation, exactly as it is for reviewed decisions elsewhere.
 */
export async function gradeSubmission(
  identity: SupabaseIdentity,
  input: { submissionId: string; score: number; status?: "graded" | "returned" },
): Promise<Result<{ submissionId: string; score: number }>> {
  if (!Number.isFinite(input.score) || input.score < 0 || input.score > 100) {
    return { ok: false, error: "A score is between 0 and 100.", code: "VALIDATION" };
  }
  const admin = getSupabaseAdminClient();
  if (!admin) return { ok: false, error: "Supabase administrative access is not configured.", code: "SETUP_NEEDED" };

  const { data: submission } = await admin
    .from("submissions").select("id,learner_id,assignments!inner(course_id,courses!inner(instructor_id))").eq("id", input.submissionId).maybeSingle();
  if (!submission) return { ok: false, error: "Submission not found.", code: "NOT_FOUND" };

  const assignment = (submission as Record<string, unknown>).assignments as Record<string, unknown> | undefined;
  const course = assignment?.courses as Record<string, unknown> | undefined;
  if (String(course?.instructor_id ?? "") !== identity.id) {
    return { ok: false, error: "Only the course's instructor can grade this.", code: "FORBIDDEN" };
  }
  if (String((submission as { learner_id: string }).learner_id) === identity.id) {
    return { ok: false, error: "You cannot grade your own submission.", code: "FORBIDDEN" };
  }

  const { error } = await admin
    .from("submissions")
    .update({ score: input.score, status: input.status ?? "graded", updated_at: new Date().toISOString() })
    .eq("id", input.submissionId);
  if (error) {
    console.error("[assessments] grading failed:", { code: error.code, message: error.message });
    return { ok: false, error: "The grade could not be saved." };
  }
  return { ok: true, data: { submissionId: input.submissionId, score: input.score } };
}
