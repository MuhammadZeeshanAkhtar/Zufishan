import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { instructorFormCompletion, instructorProfileCompletion, learnerProfileCompletion } from "../client/src/lib/profile-completion";
import { genderValues, isGender } from "../client/src/lib/reference-data";

const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const core = readFileSync(new URL("./supabase-core.ts", import.meta.url), "utf8");
const routers = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const scheduling = readFileSync(new URL("./scheduling.ts", import.meta.url), "utf8");
const learnerForm = readFileSync(new URL("../client/src/components/LearnerProfileEditor.tsx", import.meta.url), "utf8");
const tutorForm = readFileSync(new URL("../client/src/components/InstructorManagement.tsx", import.meta.url), "utf8");
const filters = readFileSync(new URL("../client/src/components/MarketplaceFilters.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/0013_profile_gender.sql", import.meta.url), "utf8");
const rls = readFileSync(new URL("../supabase/migrations/0002_auth_and_rls.sql", import.meta.url), "utf8");
const canonical = readFileSync(new URL("../supabase/migrations/0001_noor_ilm_lms_canonical.sql", import.meta.url), "utf8");

const onboardingPage = app.slice(app.indexOf("function OnboardingPage"), app.indexOf("function ProtectedRoute"));

describe("gender is stored once, on the shared profile table", () => {
  it("adds one nullable column to profiles rather than a lookup table", () => {
    expect(migration).toContain("alter table public.profiles add column if not exists gender text");
    for (const table of ["genders", "user_genders", "tutor_genders", "gender_options"]) {
      expect(migration, `${table} must not be created`).not.toContain(`create table public.${table}`);
    }
    expect(migration).not.toMatch(/create table/i);
  });

  it("does not add gender to the role tables, so there is nothing to keep in sync", () => {
    for (const source of [migration, canonical]) {
      const learnerBlock = source.slice(source.indexOf("learner_profiles"), source.indexOf("learner_profiles") + 900);
      expect(learnerBlock).not.toContain("gender");
    }
    expect(core).not.toContain('from("learner_profiles").upsert({\n    user_id: identity.id,\n    gender');
  });

  it("is additive only — nothing dropped, deleted or rewritten", () => {
    const withoutComments = migration.replace(/--.*$/gm, "");
    for (const destructive of ["drop table", "drop column", "delete from", "truncate", "alter column"]) {
      expect(withoutComments.toLowerCase(), `${destructive} must not appear`).not.toContain(destructive);
    }
    expect(migration).toContain("add column if not exists");
    expect(migration).toContain("create index if not exists");
  });

  it("constrains the stored value to the vocabulary the UI offers", () => {
    expect(migration).toContain("check (gender is null or gender in ('male', 'female'))");
    expect(genderValues).toEqual(["male", "female"]);
    expect(isGender("male")).toBe(true);
    expect(isGender("Male")).toBe(false);
    expect(isGender("other")).toBe(false);
  });

  it("leaves RLS untouched", () => {
    expect(migration).not.toMatch(/create policy|alter policy|drop policy|enable row level security|disable row level security/i);
    // The own-row-only rule on profiles is still exactly as it was.
    expect(rls).toContain("create policy profiles_select_own_or_admin on public.profiles for select using (auth.uid() = id or public.is_admin_user());");
  });
});

describe("both roles save and reload gender through the same column", () => {
  it("writes profiles.gender from the learner and the tutor procedure alike", () => {
    expect(core).toContain("...optional(input.gender, () => ({ gender: input.gender!.trim() || null }))");
    expect(core.match(/optional\(input\.gender/g)).toHaveLength(2);
    expect(routers.match(/gender: z\.enum\(\["male", "female"\]\)\.optional\(\)/g)).toHaveLength(3);
  });

  it("rejects anything outside the vocabulary at the API boundary", () => {
    // The enum is the gate — a free-form string cannot reach the column.
    expect(routers).not.toContain("gender: z.string()");
  });

  it("sends gender from both onboarding paths", () => {
    expect(onboardingPage.match(/gender: profile\.gender === "male" \|\| profile\.gender === "female" \? profile\.gender : undefined/g)).toHaveLength(2);
  });

  it("lets the student view, edit and reload it on their Profile page", () => {
    expect(learnerForm).toContain("<GenderSelect name=\"learner-gender\" value={gender} onChange={setGender}/>");
    expect(learnerForm).toContain('setGender(String(p.gender ?? ""));');
    expect(learnerForm).toContain('gender: gender === "male" || gender === "female" ? gender : undefined,');
  });

  it("lets the tutor view, edit and reload it on their Profile page", () => {
    expect(tutorForm).toContain('<GenderSelect value={profile.gender} onChange={(value) => update("gender", value)} required/>');
    expect(tutorForm).toContain('gender: String(base?.gender ?? current.gender)');
    expect(tutorForm).toContain('gender: profile.gender === "male" || profile.gender === "female" ? profile.gender : undefined');
  });

  it("reads it back from the profiles row on session load, so it survives logout", () => {
    const auth = readFileSync(new URL("../client/src/contexts/AuthContext.tsx", import.meta.url), "utf8");
    expect(auth).toContain('gender: String(profile.gender ?? "")');
  });
});

describe("onboarding requires it of tutors and not of students", () => {
  it("blocks a tutor who has not chosen, because the filter depends on it", () => {
    expect(onboardingPage).toContain('!(profile.teachingLanguages || "").trim() || !profile.gender.trim()');
    expect(onboardingPage).toContain('onChange={(value) => update("gender", value)} required/>');
  });

  it("leaves the student free to skip it and add it later", () => {
    const stepTwo = onboardingPage.slice(onboardingPage.indexOf('{t("onboarding.optionalStep")}'));
    expect(stepTwo).toContain('{role === "learner" && <Field label={t("gender.label")}>');
    // The learner control carries no `required`, and the gate never mentions the learner's gender.
    expect(onboardingPage).not.toContain('role === "learner" ? !profile.gender');
  });
});

describe("Find a Tutor filters on real stored gender", () => {
  it("accepts the filter on the public discovery contract", () => {
    expect(scheduling).toContain('gender?: "male" | "female";');
    // Declared on the discovery input alongside the other profile-side filters.
    expect(routers).toMatch(/gender: z\.enum\(\["male", "female"\]\)\.optional\(\),\s*country:/);
  });

  it("resolves gender through the database, never in the browser", () => {
    expect(scheduling).toContain("async function publishedInstructorIdsByProfile");
    expect(scheduling).toContain('.eq("profiles.gender", match.gender)');
    expect(scheduling).toContain('request = request.in("user_id", ids);');
    // The page hands the choice to the server like every other filter.
    expect(app).toContain('gender: filters.gender === "male" || filters.gender === "female" ? filters.gender : undefined,');
  });

  it("keeps the published/approved gate ahead of the gender lookup", () => {
    const fn = scheduling.slice(scheduling.indexOf("async function publishedInstructorIdsByProfile"), scheduling.indexOf("const MAX_DISCOVERY_PAGE"));
    expect(fn).toContain('.eq("public_profile_status", "published")');
    expect(fn).toContain('.eq("verification_status", "approved")');
    // Discovery still runs on the anonymous client, so RLS remains the authority on visibility.
    const discovery = scheduling.slice(scheduling.indexOf("export async function listPublicInstructors"));
    expect(discovery).toContain("const client = getSupabasePublicClient();");
  });

  it("returns an empty page rather than everyone when no tutor matches", () => {
    expect(scheduling).toContain("if (!ids.length) return { ok: true as const, data: { instructors: [], total: 0, limit, offset } };");
  });

  it("never leaks gender into the public result rows", () => {
    const select = scheduling.slice(scheduling.indexOf('.from("instructor_profiles")\n    .select('), scheduling.indexOf('{ count: "exact" }'));
    expect(select).not.toContain("gender");
  });

  it("offers All / Male / Female, with All clearing the filter", () => {
    expect(filters).toContain("gender?: string;");
    expect(filters).toContain('{ value: "", labelKey: "gender.any" as const }');
    expect(filters).toContain("set({ gender: option.value || undefined })");
    expect(filters).toContain('name="tutor-gender"');
  });
});

describe("gender counts toward the one completion calculator", () => {
  it("is scored for both roles", () => {
    expect(learnerProfileCompletion(null, null).missing.map((f) => f.key)).toContain("gender");
    expect(instructorProfileCompletion(null, null).missing.map((f) => f.key)).toContain("gender");
  });

  it("moves the score when it is filled in", () => {
    const without = instructorProfileCompletion({ full_name: "A" }, null);
    const with_ = instructorProfileCompletion({ full_name: "A", gender: "female" }, null);
    expect(with_.percent).toBeGreaterThan(without.percent);
    expect(with_.missing.map((f) => f.key)).not.toContain("gender");
  });

  it("keeps the dashboard banner and the tutor Profile page in agreement", () => {
    const profile = { full_name: "A", display_name: "B", country: "Pakistan", timezone: "Asia/Karachi", gender: "female", avatar_url: "x", bio: "hi" };
    const instructor = { public_slug: "a-b", subjects: ["Tajweed"], teaching_levels: ["Beginner"], teaching_languages: ["Urdu"], years_experience: 5, teaching_approach: "Gentle", availability_summary: "Evenings", hourly_rate_minor: 2000 };
    const form = {
      privateAccountName: "A", publicDisplayName: "B", countryRegion: "Pakistan", timezone: "Asia/Karachi",
      gender: "female", publicBio: "hi", publicSlug: "a-b", subjects: ["Tajweed"], levels: ["Beginner"],
      teachingLanguages: ["Urdu"], yearsExperience: "5", teachingApproach: "Gentle", availabilitySummary: "Evenings", hourlyRate: "20",
    };
    const dashboard = instructorProfileCompletion(profile, instructor);
    const page = instructorFormCompletion(form, profile.avatar_url);
    expect(dashboard.percent).toBe(100);
    expect(page.percent).toBe(dashboard.percent);
    expect(page.missing.map((f) => f.key)).toEqual(dashboard.missing.map((f) => f.key));

    // And they still agree when gender is the only thing missing.
    const noGender = instructorProfileCompletion({ ...profile, gender: null }, instructor);
    const noGenderForm = instructorFormCompletion({ ...form, gender: "" }, profile.avatar_url);
    expect(noGenderForm.percent).toBe(noGender.percent);
    expect(noGenderForm.missing.map((f) => f.key)).toEqual(["gender"]);
  });
});
