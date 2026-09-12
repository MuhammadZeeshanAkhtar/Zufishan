/**
 * Reviews.
 *
 * This module was blocked until now, and the block was real rather than incidental: `reviews`
 * carries a NOT NULL foreign key to `class_sessions`, and its insert policy demands that the session
 * exist, belong to the reviewer, and be 'completed':
 *
 *   reviews_eligible_insert
 *     with check (reviewer_id = auth.uid() and exists (
 *       select 1 from class_sessions s
 *       where s.id = session_id and s.learner_id = auth.uid() and s.status = 'completed'))
 *
 * Nothing wrote `class_sessions`, so every insert would have failed on the foreign key. Building the
 * session lifecycle first is what made this module possible, and the policy above is the eligibility
 * rule — this file does not re-implement it, it works with it.
 *
 * Everything runs on the caller's client so that policy is enforced by the database on every
 * statement. A learner can only review a session they attended and that finished; the unique
 * (session_id, reviewer_id) constraint means one review per session, so duplicates are impossible
 * rather than merely discouraged.
 */
import { getSupabaseUserClient } from "./supabase-user-client";
import type { SupabaseIdentity } from "./supabase-auth";

type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "SETUP_NEEDED" | "VALIDATION" };

const REVIEW_COLUMNS = "id,session_id,reviewer_id,instructor_id,rating,body,status,created_at";

/**
 * Writes a review for a completed session.
 *
 * The rating range and the eligibility rule both live in the database — `rating between 1 and 5` as
 * a check constraint, eligibility as the insert policy. They are checked here too so a learner gets
 * a readable message rather than a constraint violation, but the database remains the authority.
 */
export async function createReview(
  identity: SupabaseIdentity,
  input: { sessionId: string; rating: number; body: string },
): Promise<Result<unknown>> {
  const body = input.body.trim();
  if (!body || body.length > 5000) return { ok: false, error: "A review needs a few words.", code: "VALIDATION" };
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    return { ok: false, error: "A rating is between 1 and 5.", code: "VALIDATION" };
  }

  const db = getSupabaseUserClient(identity.accessToken);
  if (!db) return { ok: false, error: "Supabase persistence unavailable.", code: "SETUP_NEEDED" };

  // Read the session to name the instructor and to explain ineligibility precisely; RLS already
  // restricts this read to sessions the caller took part in.
  const { data } = await db
    .from("class_sessions").select("id,learner_id,instructor_id,status").eq("id", input.sessionId).maybeSingle();
  const session = data as { learner_id: string; instructor_id: string; status: string } | null;
  if (!session) return { ok: false, error: "Session not found.", code: "NOT_FOUND" };
  if (session.learner_id !== identity.id) {
    return { ok: false, error: "Only the learner who attended can review a session.", code: "FORBIDDEN" };
  }
  if (session.status !== "completed") {
    return { ok: false, error: "A session can be reviewed once it has finished.", code: "CONFLICT" };
  }

  const { data: created, error } = await db
    .from("reviews")
    .insert({ session_id: input.sessionId, reviewer_id: identity.id, instructor_id: session.instructor_id, rating: input.rating, body })
    .select(REVIEW_COLUMNS)
    .single();

  // 23505 is the unique(session_id, reviewer_id) constraint: this session is already reviewed.
  if (error?.code === "23505") return { ok: false, error: "You have already reviewed this session.", code: "CONFLICT" };
  if (error || !created) {
    if (error) console.error("[reviews] create failed:", { code: error.code, message: error.message });
    return { ok: false, error: "The review could not be saved." };
  }
  return { ok: true, data: created };
}

/** The caller's own reviews, for their history. */
export async function listOwnReviews(identity: SupabaseIdentity): Promise<Result<unknown[]>> {
  const db = getSupabaseUserClient(identity.accessToken);
  if (!db) return { ok: false, error: "Supabase persistence unavailable.", code: "SETUP_NEEDED" };
  const { data, error } = await db
    .from("reviews").select(REVIEW_COLUMNS).eq("reviewer_id", identity.id).order("created_at", { ascending: false }).limit(100);
  if (error) {
    console.error("[reviews] own list failed:", { code: error.code, message: error.message });
    return { ok: false, error: "Reviews could not be loaded." };
  }
  return { ok: true, data: data ?? [] };
}

/**
 * Reviews written *about* the caller, for an instructor's own desk.
 *
 * `listOwnReviews` filters on reviewer_id, which for an instructor returns the reviews they wrote as
 * a learner — not the ones about their teaching. `reviews_public_or_participant` already permits an
 * instructor to read their own reviews at every status, so this shows pending ones too: an
 * instructor should see feedback that has arrived even while it waits for moderation, rather than
 * discovering it only once it is public.
 */
export async function listReviewsAboutMe(identity: SupabaseIdentity): Promise<Result<{ reviews: unknown[]; count: number; average: number | null }>> {
  const db = getSupabaseUserClient(identity.accessToken);
  if (!db) return { ok: false, error: "Supabase persistence unavailable.", code: "SETUP_NEEDED" };
  const { data, error } = await db
    .from("reviews").select(REVIEW_COLUMNS).eq("instructor_id", identity.id).order("created_at", { ascending: false }).limit(100);
  if (error) {
    console.error("[reviews] about-me list failed:", { code: error.code, message: error.message });
    return { ok: false, error: "Reviews could not be loaded." };
  }
  // The average counts published reviews only, so it matches what a visitor sees on the profile.
  const rows = (data ?? []) as { rating: number | null; status: string }[];
  return { ok: true, data: { reviews: data ?? [], count: rows.length, average: averageOf(rows.filter((row) => row.status === "published")) } };
}

/** The mean rating of the given rows, to one decimal, or null when nothing is rated. */
function averageOf(rows: { rating: number | null }[]): number | null {
  const rated = rows.map((row) => row.rating).filter((rating): rating is number => typeof rating === "number");
  return rated.length ? Math.round((rated.reduce((sum, n) => sum + n, 0) / rated.length) * 10) / 10 : null;
}

/**
 * Published reviews for one instructor, with the average.
 *
 * The average is computed from the rows actually returned rather than stored on the profile, so it
 * can never drift from the reviews behind it. `reviews_public_or_participant` decides what is
 * visible; only published rows reach an unrelated reader.
 */
export async function listInstructorReviews(instructorId: string): Promise<Result<{ reviews: unknown[]; count: number; average: number | null }>> {
  const { getSupabasePublicClient } = await import("./supabase-user-client");
  const db = getSupabasePublicClient();
  if (!db) return { ok: false, error: "Supabase persistence unavailable.", code: "SETUP_NEEDED" };

  const { data, error } = await db
    .from("reviews")
    .select("id,rating,body,created_at")
    .eq("instructor_id", instructorId)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[reviews] instructor list failed:", { code: error.code, message: error.message });
    return { ok: false, error: "Reviews could not be loaded." };
  }

  const rows = (data ?? []) as { rating: number | null }[];
  return { ok: true, data: { reviews: data ?? [], count: rows.length, average: averageOf(rows) } };
}
