/**
 * How complete a teacher's profile is — as guidance, not as a gate.
 *
 * THE BUG THIS FIXES. Completion was scored out of fifteen fields, seven of which onboarding fills
 * in for you — name, display name, country, timezone, gender, slug, language. A teacher who had
 * typed almost nothing was therefore already two thirds of the way to "complete": ten of fifteen is
 * 67%, which is exactly the number that prompted this. The score was arithmetically right and
 * useless, because the list left out most of what a learner actually reads.
 *
 * The list below is that list: everything the public profile shows, including the parts that live
 * in other tables — the hours a teacher opens, the introduction they recorded, the background they
 * wrote. A thin profile now scores like a thin profile.
 *
 * WHAT IT DOES NOT DO. It decides nothing. Migration 0036 put publication where the reference
 * marketplace has it: a profile is live only once a reviewer has approved it, and the reviewer is
 * the one who judges whether it is good enough. A percentage computed here would be a second,
 * weaker opinion about that — and, computed in a browser, one anybody could step around. `missing`
 * is here so a teacher can be *told* what is still blank before they hand it to a reviewer, which
 * is the whole of its job.
 */

/**
 * The share of the profile worth having filled in before handing it to a reviewer.
 *
 * Guidance only — nothing refuses a publish below it. Kept as one number so the editor's nudge and
 * any later admin-facing summary agree about what "ready" looks like.
 */
export const PROFILE_READY_PERCENT = 85;

/**
 * The fields a profile cannot be published without.
 *
 * Distinct from the twenty-one scored above, which are guidance. These seven are the answers a
 * learner needs before they can even consider a teacher, and the owner named them: a name, what
 * they can teach, the language they teach in, gender, the hourly rate, the credits that rate works
 * out to, and the timezone the hours are in.
 *
 * `credits / hour` is not a field anyone types. It is `hourly_rate_minor` read through the currency
 * — `creditsPerHour` in the pricing module returns null for a currency it does not know — so the
 * requirement behind it is that the currency is set. Requiring a phantom input the editor does not
 * offer would be a gate nobody could pass.
 */
export const REQUIRED_FOR_PUBLICATION = [
  "displayName",
  "subjects",
  "languages",
  "gender",
  "rate",
  "currency",
  "timezone",
] as const;

export type RequiredField = (typeof REQUIRED_FOR_PUBLICATION)[number];

/** Which of the required fields are still blank. Empty means the profile may be published. */
export function missingRequired(input: CompletionInput): RequiredField[] {
  const done = new Set(scoreInstructorProfile(input).fields.filter((field) => field.done).map((field) => field.key));
  return REQUIRED_FOR_PUBLICATION.filter((key) => !done.has(key));
}

export type CompletionInput = {
  /** The `profiles` row. */
  profile?: Record<string, unknown> | null;
  /** The `instructor_profiles` row. */
  instructorProfile?: Record<string, unknown> | null;
  /** How many bookable availability intervals the teacher has saved. */
  availabilityCount?: number;
  /** How many intro media files (video or recitation) they have uploaded. */
  mediaCount?: number;
  /** How many employment / certification / ijazah entries they have written. */
  qualificationCount?: number;
};

export type CompletionField = {
  /** Stable identifier, also the i18n suffix the screens use to name the field. */
  key: string;
  done: boolean;
};

export type InstructorCompletion = {
  percent: number;
  fields: CompletionField[];
  missing: string[];
  /** True once every field is filled. */
  complete: boolean;
  /** True once enough is filled in to be worth a reviewer's time. Advisory. */
  ready: boolean;
};

/** A value counts as filled if it is a non-empty string, a non-empty array, or a positive number. */
function filled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "number") return Number.isFinite(value) && value > 0;
  if (typeof value === "boolean") return value;
  return true;
}

/**
 * Scores a teacher's profile against everything a learner sees.
 *
 * Twenty-one fields. `ready` means eighteen of them, so a teacher may leave three out — roughly the
 * room needed for someone with no ijazah to record, no school of fiqh they wish to state, and no
 * introduction video. It is a suggestion; the reviewer decides.
 */
export function scoreInstructorProfile(input: CompletionInput): InstructorCompletion {
  const p = input.profile ?? {};
  const i = input.instructorProfile ?? {};

  const fields: CompletionField[] = [
    // Who they are.
    { key: "fullName", done: filled(p.full_name) },
    { key: "displayName", done: filled(p.display_name) },
    { key: "country", done: filled(p.country) },
    { key: "timezone", done: filled(p.timezone) },
    { key: "gender", done: filled(p.gender) },
    { key: "photo", done: filled(p.avatar_url) },
    { key: "bio", done: filled(p.bio) },

    // What they teach.
    { key: "slug", done: filled(i.public_slug) },
    { key: "subjects", done: filled(i.subjects) },
    { key: "levels", done: filled(i.teaching_levels) },
    { key: "languages", done: filled(i.teaching_languages) },
    { key: "experience", done: filled(i.years_experience) },
    { key: "approach", done: filled(i.teaching_approach) },

    // What it costs, and when.
    { key: "rate", done: filled(i.hourly_rate_minor) },
    { key: "currency", done: filled(i.currency) },
    { key: "availabilitySummary", done: filled(i.availability_summary) },
    // The hours themselves, not the sentence describing them: a listing nobody can book is not a
    // listing. This is the field the old score missed most.
    { key: "availabilityHours", done: (input.availabilityCount ?? 0) > 0 },

    // What reassures a learner.
    { key: "sect", done: filled(i.sect) },
    { key: "fiqh", done: filled(i.fiqh) },
    { key: "introMedia", done: (input.mediaCount ?? 0) > 0 },
    { key: "background", done: (input.qualificationCount ?? 0) > 0 },
  ];

  const done = fields.filter((field) => field.done).length;
  const percent = fields.length ? Math.round((done / fields.length) * 100) : 0;
  return {
    percent,
    fields,
    missing: fields.filter((field) => !field.done).map((field) => field.key),
    complete: done === fields.length,
    ready: percent >= PROFILE_READY_PERCENT,
  };
}
