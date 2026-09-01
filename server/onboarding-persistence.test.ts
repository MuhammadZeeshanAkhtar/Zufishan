import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const core = readFileSync(new URL("./supabase-core.ts", import.meta.url), "utf8");
const routers = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const authModels = readFileSync(new URL("../client/src/lib/auth-models.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/0001_noor_ilm_lms_canonical.sql", import.meta.url), "utf8");

const onboardingPage = app.slice(app.indexOf("function OnboardingPage"), app.indexOf("function OnboardingPage") + 16000);

describe("onboarding writes to the profile tables", () => {
  it("no longer discards the fields it collects", () => {
    // The old handler sent only four fields and dropped the other sixteen.
    expect(onboardingPage).not.toContain('const result = await profileMutation.mutateAsync({ fullName: profile.fullName.trim(), displayName: profile.displayName.trim(), preferredLanguage: profile.preferredLanguage, preferredLocale: profile.preferredLanguage === "Urdu" ? "ur" : profile.preferredLanguage === "Arabic" ? "ar" : "en" });');
    for (const field of ["country: profile.countryCity", "timezone: profile.timezone", "learningLevel: profile.level", "learningGoal: profile.goal", "preferredClassFormat: profile.classFormat", "preferredDaysTimes: profile.availability", "budgetRange: profile.budget", "learningSubjects: profile.subjects"]) {
      expect(onboardingPage).toContain(field);
    }
  });

  it("routes each role to the mutation that owns its table", () => {
    expect(onboardingPage).toContain('role === "instructor"');
    expect(onboardingPage).toContain("instructorMutation.mutateAsync");
    expect(onboardingPage).toContain("learnerMutation.mutateAsync");
    expect(onboardingPage).toContain("teachingApproach: profile.teachingApproach");
    expect(onboardingPage).toContain("availabilitySummary: profile.availability");
  });

  it("uses the same procedures the Profile pages use — no parallel write path", () => {
    expect(routers).toContain("updateLearnerProfile: supabaseOnlyProcedure");
    expect(routers).toContain("updateInstructorProfile: supabaseOnlyProcedure");
    expect(core).toContain("export async function updateOwnLearnerProfile");
    expect(core).toContain("export async function updateOwnInstructorProfile");
  });

  it("keeps onboarding completion as a profile flag, not a separate record", () => {
    expect(migration).toContain("onboarding_completed boolean not null default false");
    // There is no onboarding table anywhere in the schema.
    expect(migration).not.toMatch(/create table public\.onboarding/i);
    expect(core).toContain("...(input.completeOnboarding ? { onboarding_completed: true } : {})");
  });

  it("never blanks a stored value on a partial edit", () => {
    // Optional columns are only sent when the caller supplied them.
    expect(core).toContain("const optional = <T,>(value: T | undefined, mapped: () => unknown) => (value === undefined ? {} : { ...(mapped() as object) });");
    expect(core).toContain("...optional(input.learningLevel,");
    expect(core).toContain("...optional(input.bio,");
  });

  it("writes every collected field to a column that already exists", () => {
    for (const column of [
      "full_name", "display_name", "country text", "timezone text", "preferred_language",
      "profile_visibility", "bio text", "learning_subjects", "learning_level", "learning_goal",
      "preferred_class_format", "preferred_days_times", "budget_range",
      "teaching_languages", "teaching_approach", "years_experience", "availability_summary",
    ]) {
      expect(migration, `missing column for ${column}`).toContain(column);
    }
  });

  it("keeps the localStorage draft as a fixture-only aid, never production storage", () => {
    expect(authModels).toContain("if (isClientFixtureMode) localStorage.setItem");
    expect(authModels).toContain('export const isClientFixtureMode = import.meta.env.DEV && import.meta.env.VITE_ENABLE_TEST_FIXTURES === "true";');
  });
});
