/**
 * Aggregate facts about a published instructor, counted from rows that already exist.
 *
 * Every number here is computed at read time from real tables. Nothing is cached,
 * stored, estimated, sampled or generated, so any figure this module returns can be
 * traced back to rows a real person created.
 *
 * **Presence is deliberately absent.** The discovery reference also carries an
 * online/offline state. Noor Ilm tracks no presence anywhere: there is no
 * last_seen_at column, no heartbeat and no realtime presence channel. There is
 * therefore nothing truthful to return, and this module offers no such field.
 * lastActiveAt is NOT presence -- it is the last time the instructor actually
 * joined a class, which the session rows already record.
 *
 * **Which client reads what, and why.**
 *   - reviews is readable by anyone once status = 'published' (policy
 *     reviews_public_or_participant), so ratings use the anonymous client and the
 *     row policy does the filtering rather than this code.
 *   - class_sessions is participant-or-moderator only, so nobody browsing the
 *     marketplace may read it. Counts therefore go through the admin client, and
 *     only aggregates leave this module: two totals and one timestamp. No learner
 *     id, title, schedule or session row is ever returned to the browser.
 */
import { getSupabaseAdminClient } from "./supabase-admin-client";
import { getSupabasePublicClient } from "./supabase-user-client";

export type InstructorStats = {
  /** Mean of published review ratings, one decimal place. Null when nobody has reviewed yet. */
  ratingAverage: number | null;
  /** How many published reviews that mean was taken from. */
  ratingCount: number;
  /** Completed class sessions. A booked-but-unheld session is not a taught session. */
  sessionsConducted: number;
  /** Distinct learners across those completed sessions. */
  studentsTaught: number;
  /** When the instructor last joined a class. Not a login, and not presence. */
  lastActiveAt: string | null;
};

export const blankStats: InstructorStats = {
  ratingAverage: null, ratingCount: 0, sessionsConducted: 0, studentsTaught: 0, lastActiveAt: null,
};

/**
 * Upper bound on rows pulled for one page of instructors.
 *
 * The counts are exact below this ceiling. If a future roster ever crosses it the
 * aggregate belongs in a database view or an RPC rather than in application code;
 * raising the constant would only move the same problem.
 */
const SESSION_ROW_CAP = 50_000;
const REVIEW_ROW_CAP = 50_000;
/** Matches the cap discovery already uses for its id lookups. */
const INSTRUCTOR_ID_CAP = 2_000;

/** Mean to one decimal, taken from the rows themselves so it can never drift from them. */
function averageOf(ratings: number[]): number | null {
  if (!ratings.length) return null;
  return Math.round((ratings.reduce((sum, n) => sum + n, 0) / ratings.length) * 10) / 10;
}

/** Published review ratings for the given instructors, grouped by instructor. */
async function ratingsByInstructor(ids: string[]): Promise<Map<string, number[]>> {
  const grouped = new Map<string, number[]>();
  const client = getSupabasePublicClient();
  if (!client || ids.length === 0) return grouped;

  const { data, error } = await client
    .from("reviews")
    .select("instructor_id,rating")
    .eq("status", "published")
    .in("instructor_id", ids)
    .limit(REVIEW_ROW_CAP);
  if (error) {
    console.error("[discovery-stats] rating lookup failed:", { code: error.code, message: error.message });
    return grouped;
  }

  for (const row of (data ?? []) as Array<{ instructor_id: string; rating: number | null }>) {
    if (typeof row.rating !== "number") continue;
    const key = String(row.instructor_id);
    const list = grouped.get(key);
    if (list) list.push(row.rating); else grouped.set(key, [row.rating]);
  }
  return grouped;
}

type SessionStats = Omit<InstructorStats, "ratingAverage" | "ratingCount">;

/**
 * Completed-session aggregates for the given instructors.
 *
 * Only completed counts. A cancelled or no-show session was scheduled, not taught,
 * and counting it would overstate what the instructor has actually done.
 */
async function sessionStatsByInstructor(ids: string[]): Promise<Map<string, SessionStats>> {
  const grouped = new Map<string, SessionStats>();
  const admin = getSupabaseAdminClient();
  if (!admin || ids.length === 0) return grouped;

  const { data, error } = await admin
    .from("class_sessions")
    .select("instructor_id,learner_id,instructor_joined_at,ended_at")
    .eq("status", "completed")
    .in("instructor_id", ids)
    .limit(SESSION_ROW_CAP);
  if (error) {
    console.error("[discovery-stats] session lookup failed:", { code: error.code, message: error.message });
    return grouped;
  }

  const learners = new Map<string, Set<string>>();
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const key = String(row.instructor_id ?? "");
    if (!key) continue;
    const current = grouped.get(key) ?? { sessionsConducted: 0, studentsTaught: 0, lastActiveAt: null };
    current.sessionsConducted += 1;

    const seen = learners.get(key) ?? new Set<string>();
    if (row.learner_id) seen.add(String(row.learner_id));
    learners.set(key, seen);

    // The moment the instructor was last actually in a class. ended_at stands in
    // for sessions recorded before join times were captured.
    const moment = (row.instructor_joined_at ?? row.ended_at) as string | null;
    if (moment && (!current.lastActiveAt || new Date(moment) > new Date(current.lastActiveAt))) {
      current.lastActiveAt = String(moment);
    }
    grouped.set(key, current);
  }

  learners.forEach((seen, key) => {
    const current = grouped.get(key);
    if (current) current.studentsTaught = seen.size;
  });
  return grouped;
}

/** Attaches the aggregates to a page of listing rows. One lookup per table, not one per instructor. */
export async function attachInstructorStats<T extends { user_id?: string }>(rows: T[]): Promise<Array<T & InstructorStats>> {
  const ids = rows.map((row) => row.user_id).filter((id): id is string => typeof id === "string");
  if (ids.length === 0) return rows.map((row) => ({ ...row, ...blankStats }));

  const [ratings, sessions] = await Promise.all([ratingsByInstructor(ids), sessionStatsByInstructor(ids)]);

  return rows.map((row) => {
    const key = String(row.user_id ?? "");
    const rated = ratings.get(key) ?? [];
    const session = sessions.get(key);
    return {
      ...row,
      ratingAverage: averageOf(rated),
      ratingCount: rated.length,
      sessionsConducted: session?.sessionsConducted ?? 0,
      studentsTaught: session?.studentsTaught ?? 0,
      lastActiveAt: session?.lastActiveAt ?? null,
    };
  });
}

/** Every published, approved instructor id. The population both rating helpers work over. */
async function publishedInstructorIds(): Promise<string[] | null> {
  const client = getSupabasePublicClient();
  if (!client) return null;
  const { data, error } = await client
    .from("instructor_profiles")
    .select("user_id")
    .eq("public_profile_status", "published")
    .eq("verification_status", "approved")
    .limit(INSTRUCTOR_ID_CAP);
  if (error) {
    console.error("[discovery-stats] published id lookup failed:", { code: error.code, message: error.message });
    return null;
  }
  return (data ?? []).map((row) => String((row as { user_id: string }).user_id));
}

/**
 * Ids of published instructors whose mean published rating is at least the minimum.
 *
 * An instructor with no reviews has no average and is therefore not "4.0 and above";
 * they are excluded rather than treated as zero or as passing.
 */
export async function instructorIdsWithMinRating(minimum: number): Promise<string[] | null> {
  const ids = await publishedInstructorIds();
  if (ids === null) return null;
  if (!ids.length) return [];
  const ratings = await ratingsByInstructor(ids);
  const matched: string[] = [];
  for (const id of ids) {
    const average = averageOf(ratings.get(id) ?? []);
    if (average !== null && average >= minimum) matched.push(id);
  }
  return matched;
}

/** The thresholds the sidebar offers, highest first, exactly as the reference orders them. */
export const RATING_BUCKETS = [4.5, 4, 3, 2, 1] as const;

/**
 * How many published instructors sit at or above each threshold.
 *
 * These are counts of instructors, not of reviews, so the number beside "4.0 and above"
 * says how many teachers that filter would actually return.
 */
export async function ratingBucketCounts(): Promise<Array<{ minimum: number; count: number }> | null> {
  const ids = await publishedInstructorIds();
  if (ids === null) return null;
  const ratings = await ratingsByInstructor(ids);
  const averages = ids
    .map((id) => averageOf(ratings.get(id) ?? []))
    .filter((average): average is number => average !== null);
  return RATING_BUCKETS.map((minimum) => ({
    minimum,
    count: averages.filter((average) => average >= minimum).length,
  }));
}
