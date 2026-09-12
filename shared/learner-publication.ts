/**
 * When a learner profile becomes discoverable.
 *
 * THE RULE. A learner needs no administrator. Completing the required profile
 * fields and saving is the whole of it: the row moves from `draft` to
 * `published` and the profile appears in Find Students. There is no queue, no
 * approval, and no verification status anywhere in this path — that boundary
 * belongs to instructors, who are trusted with teaching, and it is not borrowed
 * here.
 *
 * REQUIRED, NOT RECOMMENDED. `learnerProfileCompletion` in the client scores a
 * profile out of thirteen fields, including an avatar, a biography and a gender.
 * That list drives the "your profile is 60% complete" banner — it is an
 * encouragement, not a gate, and using it here would mean a learner who filled
 * in everything onboarding actually asked for still never appeared. The list
 * below is the set onboarding genuinely enforces, plus one subject, because a
 * learner with no subject gives a teacher nothing to answer.
 *
 * THE THREE STATES, AND WHY `paused` EXISTS. The status column already carried
 * `draft | published | paused`, and the discoverability switch used to write
 * `draft` for "hide me". That made "never published" and "deliberately hidden"
 * the same value — so auto-publishing on save would have silently overridden a
 * learner who had just turned themselves off. The switch now writes `paused` for
 * an explicit hide, which is what that value was always for:
 *
 *   draft     — never published. A complete save publishes it.
 *   published — visible to instructors.
 *   paused    — the learner turned discovery off. A save NEVER re-publishes it.
 *
 * No migration: all three values already existed in the check constraint.
 */

/** A value counts as filled if it is a non-empty string or a non-empty array. */
function filled(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return typeof value === "string" ? value.trim().length > 0 : value !== null && value !== undefined;
}

/** The columns a learner must have filled before their profile can be published. */
export const REQUIRED_PROFILE_FIELDS = ["full_name", "display_name", "country", "timezone", "preferred_language"] as const;
export const REQUIRED_LEARNER_FIELDS = ["learning_level", "learning_subjects"] as const;

export type PublicationInput = {
  profile: Record<string, unknown> | null | undefined;
  learnerProfile: Record<string, unknown> | null | undefined;
};

/** Whether the saved profile carries everything the required set asks for. */
export function learnerProfileIsComplete({ profile, learnerProfile }: PublicationInput): boolean {
  const p = profile ?? {};
  const l = learnerProfile ?? {};
  return REQUIRED_PROFILE_FIELDS.every((field) => filled(p[field]))
    && REQUIRED_LEARNER_FIELDS.every((field) => filled(l[field]));
}

export type LearnerProfileStatus = "draft" | "published" | "paused";

/**
 * The status a save should leave behind.
 *
 * Returns null when nothing should change, so the caller writes only when there
 * is something to write — and so an explicit hide, or an already-published row,
 * is never touched by an ordinary edit.
 */
export function statusAfterSave(
  current: string | null | undefined,
  input: PublicationInput,
): LearnerProfileStatus | null {
  const status = (current ?? "draft") as LearnerProfileStatus;
  // The learner turned discovery off. Saving an edit is not a request to undo that.
  if (status === "paused") return null;
  if (status === "published") return null;
  return learnerProfileIsComplete(input) ? "published" : null;
}
