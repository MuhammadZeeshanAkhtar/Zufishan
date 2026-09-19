/**
 * How complete a teacher's profile really is, on the screen as well as on the server.
 *
 * The old score counted fifteen fields, seven of which onboarding fills in for you, so a teacher
 * who had typed almost nothing already read 67%. It also counted only the two profile rows — not
 * the hours they had opened, the introduction they had recorded, or the background they had
 * written, which is most of what a learner actually looks at.
 *
 * This hook fetches those three counts and scores with `scoreInstructorProfile` from `shared`.
 *
 * The number gates nothing. Migration 0036 put publication where the reference marketplace has it —
 * a profile is live once a reviewer approves it — so this exists to tell a teacher what is still
 * blank before they hand it over, not to decide anything on their behalf.
 *
 * While the counts are loading the score is still returned, computed from what is known. It can
 * only rise as they arrive, never fall, so the reader is never shown a number that then drops.
 */
import { useMemo } from "react";
import { trpc } from "./trpc";
import { scoreInstructorProfile, PROFILE_READY_PERCENT, type InstructorCompletion } from "@shared/instructor-publication";
import type { TranslationKey } from "../i18n/catalog";

export { PROFILE_READY_PERCENT };

/** What each field in the shared list is called on screen. */
export const COMPLETION_LABEL_KEYS: Record<string, TranslationKey> = {
  fullName: "onboarding.fullName",
  displayName: "onboarding.displayName",
  country: "learnerProfile.country",
  timezone: "onboarding.timezone",
  gender: "gender.label",
  photo: "profileField.photo",
  bio: "profileField.bio",
  slug: "profileField.slug",
  subjects: "learnerProfile.subjects",
  levels: "profileField.teachingLevels",
  languages: "profileField.teachingLanguages",
  experience: "onboarding.experience",
  approach: "profileField.approach",
  rate: "tutorDetail.rate",
  currency: "profileField.currency",
  availabilitySummary: "onboarding.availability",
  availabilityHours: "profileField.availabilityHours",
  sect: "discovery.sect",
  fiqh: "tutorQual.fiqh",
  introMedia: "profileField.introMedia",
  background: "tutorQual.title",
};

type Rows = { profile?: Record<string, unknown> | null; instructorProfile?: Record<string, unknown> | null };

/**
 * Scores the caller's own teacher profile.
 *
 * `rows` are passed in rather than fetched because both callers already hold them: the editor has
 * the form the teacher is typing into, and the banner has the saved rows. Refetching would score a
 * different profile from the one on screen.
 */
export function useInstructorCompletion(rows: Rows, enabled = true): InstructorCompletion {
  const availability = trpc.scheduling.availability.useQuery(undefined, { enabled, retry: false, staleTime: 30_000 });
  const media = trpc.supabaseCore.instructorMedia.useQuery(undefined, { enabled, retry: false, staleTime: 30_000 });
  const qualifications = trpc.scheduling.qualifications.useQuery(undefined, { enabled, retry: false, staleTime: 30_000 });

  const count = (query: { data?: { ok?: boolean; data?: unknown } }) => {
    const payload = query.data;
    if (!payload?.ok) return 0;
    return Array.isArray(payload.data) ? payload.data.length : 0;
  };

  return useMemo(() => scoreInstructorProfile({
    profile: rows.profile,
    instructorProfile: rows.instructorProfile,
    availabilityCount: count(availability),
    mediaCount: count(media),
    qualificationCount: count(qualifications),
  }), [rows.profile, rows.instructorProfile, availability.data, media.data, qualifications.data]);
}
