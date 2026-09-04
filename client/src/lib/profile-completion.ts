/**
 * Two separate ideas, deliberately kept apart:
 *
 *   onboarding_completed — the required first-time setup is done, so the dashboard opens.
 *   profile completion   — how much of the recommended profile is filled in, 0-100.
 *
 * A user can have onboarding_completed = true and a 60% profile. That is a normal, working state:
 * the banner nudges, it never blocks.
 *
 * Completion is computed from the real profile rows every render, not read from a stored number, so
 * it cannot drift out of date. Only fields a user can actually fill in count — city, budget,
 * currency, and the verification / training statuses are excluded so the score never stalls on
 * something outside their control.
 */
import type { TranslationKey } from "../i18n/catalog";

export type ProfileRow = Record<string, unknown> | null | undefined;

export type CompletionField = { key: string; labelKey: TranslationKey; done: boolean };
export type CompletionResult = { percent: number; missing: CompletionField[]; complete: boolean };

const filled = (value: unknown): boolean => {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "number") return Number.isFinite(value) && value > 0;
  return Boolean(value);
};

function score(fields: CompletionField[]): CompletionResult {
  const done = fields.filter((field) => field.done).length;
  const percent = fields.length ? Math.round((done / fields.length) * 100) : 100;
  return { percent, missing: fields.filter((field) => !field.done), complete: done === fields.length };
}

/** Recommended learner fields. City, budget and tutor preference stay genuinely optional. */
export function learnerProfileCompletion(profile: ProfileRow, learnerProfile: ProfileRow): CompletionResult {
  const p = profile ?? {};
  const l = learnerProfile ?? {};
  return score([
    { key: "full_name", labelKey: "onboarding.fullName", done: filled(p.full_name) },
    { key: "display_name", labelKey: "onboarding.displayName", done: filled(p.display_name) },
    { key: "country", labelKey: "learnerProfile.country", done: filled(p.country) },
    { key: "timezone", labelKey: "onboarding.timezone", done: filled(p.timezone) },
    { key: "preferred_language", labelKey: "profileField.preferredLanguage", done: filled(p.preferred_language) },
    { key: "gender", labelKey: "gender.label", done: filled(p.gender) },
    { key: "supported_languages", labelKey: "learnerProfile.languages", done: filled(p.supported_languages) },
    { key: "avatar_url", labelKey: "profileField.photo", done: filled(p.avatar_url) },
    { key: "bio", labelKey: "profileField.bio", done: filled(p.bio) },
    { key: "learning_subjects", labelKey: "learnerProfile.subjects", done: filled(l.learning_subjects) },
    { key: "learning_level", labelKey: "profileField.learningLevel", done: filled(l.learning_level) },
    { key: "learning_goal", labelKey: "profileField.learningGoal", done: filled(l.learning_goal) },
    { key: "preferred_days_times", labelKey: "onboarding.availability", done: filled(l.preferred_days_times) },
  ]);
}

/** Recommended tutor fields. Currency and the review statuses a tutor cannot set are excluded. */
export function instructorProfileCompletion(profile: ProfileRow, instructorProfile: ProfileRow): CompletionResult {
  const p = profile ?? {};
  const i = instructorProfile ?? {};
  return score([
    { key: "full_name", labelKey: "onboarding.fullName", done: filled(p.full_name) },
    { key: "display_name", labelKey: "onboarding.displayName", done: filled(p.display_name) },
    { key: "country", labelKey: "learnerProfile.country", done: filled(p.country) },
    { key: "timezone", labelKey: "onboarding.timezone", done: filled(p.timezone) },
    { key: "gender", labelKey: "gender.label", done: filled(p.gender) },
    { key: "avatar_url", labelKey: "profileField.photo", done: filled(p.avatar_url) },
    { key: "bio", labelKey: "profileField.bio", done: filled(p.bio) },
    { key: "public_slug", labelKey: "profileField.slug", done: filled(i.public_slug) },
    { key: "subjects", labelKey: "learnerProfile.subjects", done: filled(i.subjects) },
    { key: "teaching_levels", labelKey: "profileField.teachingLevels", done: filled(i.teaching_levels) },
    { key: "teaching_languages", labelKey: "profileField.teachingLanguages", done: filled(i.teaching_languages) },
    { key: "years_experience", labelKey: "onboarding.experience", done: filled(i.years_experience) },
    { key: "teaching_approach", labelKey: "profileField.approach", done: filled(i.teaching_approach) },
    { key: "availability_summary", labelKey: "onboarding.availability", done: filled(i.availability_summary) },
    { key: "hourly_rate_minor", labelKey: "tutorDetail.rate", done: filled(i.hourly_rate_minor) },
  ]);
}

export function profileCompletionFor(
  role: "learner" | "instructor" | "admin",
  profile: ProfileRow,
  roleProfile: ProfileRow,
): CompletionResult {
  return role === "instructor"
    ? instructorProfileCompletion(profile, roleProfile)
    : learnerProfileCompletion(profile, roleProfile);
}

/**
 * The tutor Profile page holds its state in the editor's own camelCase shape and needs the score to
 * move as the form is edited, before anything is saved. It maps onto the stored columns here rather
 * than growing a second calculator, so the Profile page and the dashboard banner always agree: one
 * field list, one weighting, one set of rules.
 *
 * `avatarUrl` is passed separately because the editor has no avatar control — the value comes from
 * the loaded profile row, so a tutor who has a photo is not told otherwise.
 */
export type InstructorFormShape = {
  privateAccountName?: string; publicDisplayName?: string; countryRegion?: string; timezone?: string;
  publicBio?: string; publicSlug?: string; subjects?: string[]; levels?: string[];
  teachingLanguages?: string[]; yearsExperience?: string; teachingApproach?: string;
  availabilitySummary?: string; hourlyRate?: string; gender?: string;
};

export function instructorFormCompletion(form: InstructorFormShape, avatarUrl?: unknown): CompletionResult {
  return instructorProfileCompletion(
    {
      full_name: form.privateAccountName,
      display_name: form.publicDisplayName,
      country: form.countryRegion,
      timezone: form.timezone,
      gender: form.gender,
      avatar_url: avatarUrl,
      bio: form.publicBio,
    },
    {
      public_slug: form.publicSlug,
      subjects: form.subjects,
      teaching_levels: form.levels,
      teaching_languages: form.teachingLanguages,
      // The editor keeps numeric fields as strings; Number("") is 0, which `filled` reads as unset.
      years_experience: Number(form.yearsExperience ?? ""),
      teaching_approach: form.teachingApproach,
      availability_summary: form.availabilitySummary,
      hourly_rate_minor: Number(form.hourlyRate ?? ""),
    },
  );
}
