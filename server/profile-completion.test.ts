import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { instructorFormCompletion, instructorProfileCompletion, learnerProfileCompletion, profileCompletionFor } from "../client/src/lib/profile-completion";
import { calculateProfileCompletion } from "../client/src/lib/instructor-data";

const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const overview = readFileSync(new URL("../client/src/components/DashboardOverview.tsx", import.meta.url), "utf8");
const tutorDash = readFileSync(new URL("../client/src/components/InstructorDashboard.tsx", import.meta.url), "utf8");
const banner = readFileSync(new URL("../client/src/components/ProfileCompletionBanner.tsx", import.meta.url), "utf8");
const dashboardData = readFileSync(new URL("../client/src/lib/dashboard-data.ts", import.meta.url), "utf8");
const core = readFileSync(new URL("./supabase-core.ts", import.meta.url), "utf8");
const routers = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const tutorForm = readFileSync(new URL("../client/src/components/InstructorManagement.tsx", import.meta.url), "utf8");
const learnerHome = readFileSync(new URL("../client/src/components/LearnerOverview.tsx", import.meta.url), "utf8");

const onboardingPage = app.slice(app.indexOf("function OnboardingPage"), app.indexOf("function ProtectedRoute"));
const stepTwo = onboardingPage.slice(onboardingPage.indexOf('{t("onboarding.optionalStep")}'));

const fullLearner = {
  profile: { full_name: "A", display_name: "B", country: "Pakistan", timezone: "Asia/Karachi", preferred_language: "Urdu", gender: "female", supported_languages: ["Urdu"], avatar_url: "x", bio: "hello" },
  learner: { learning_subjects: ["Tajweed"], learning_level: "Beginner", learning_goal: "Fluency", preferred_days_times: "Evenings" },
};
const fullTutor = {
  profile: { full_name: "A", display_name: "B", country: "Pakistan", timezone: "Asia/Karachi", gender: "male", avatar_url: "x", bio: "hello" },
  instructor: { public_slug: "a-b", subjects: ["Tajweed"], teaching_levels: ["Beginner"], teaching_languages: ["Urdu"], years_experience: 5, teaching_approach: "Gentle", availability_summary: "Evenings", hourly_rate_minor: 2000 },
};

describe("profile completion is calculated, not invented", () => {
  it("no longer ships the hardcoded 35% and 42%", () => {
    expect(dashboardData).not.toContain("profileCompletion: 35");
    expect(dashboardData).not.toContain("profileCompletion: 42");
    // The field is gone from the fixture type entirely, so nothing can read a fake number.
    expect(dashboardData).not.toContain("profileCompletion");
  });

  it("reaches 100 only when every counted field is present", () => {
    expect(learnerProfileCompletion(fullLearner.profile, fullLearner.learner).percent).toBe(100);
    expect(instructorProfileCompletion(fullTutor.profile, fullTutor.instructor).percent).toBe(100);
    expect(learnerProfileCompletion(fullLearner.profile, fullLearner.learner).complete).toBe(true);
    expect(instructorProfileCompletion(fullTutor.profile, fullTutor.instructor).complete).toBe(true);
  });

  it("scores an empty profile at zero and names every missing field", () => {
    const learner = learnerProfileCompletion(null, null);
    expect(learner.percent).toBe(0);
    expect(learner.complete).toBe(false);
    expect(learner.missing).toHaveLength(13);
    const tutor = instructorProfileCompletion(undefined, undefined);
    expect(tutor.percent).toBe(0);
    expect(tutor.missing).toHaveLength(15);
    // Every missing entry carries a translation key so the banner is never hardcoded English.
    for (const field of [...learner.missing, ...tutor.missing]) expect(field.labelKey).toMatch(/^[a-zA-Z]+\.[a-zA-Z]+$/);
  });

  it("treats blank strings, empty arrays and zero as unfilled", () => {
    const result = learnerProfileCompletion(
      { ...fullLearner.profile, bio: "   ", supported_languages: [] },
      { ...fullLearner.learner, learning_level: "" },
    );
    expect(result.percent).toBe(77);
    expect(result.missing.map((field) => field.key).sort()).toEqual(["bio", "learning_level", "supported_languages"]);
    // A tutor with no rate set is incomplete rather than counted as complete at zero.
    expect(instructorProfileCompletion(fullTutor.profile, { ...fullTutor.instructor, hourly_rate_minor: 0 }).missing.map((f) => f.key)).toEqual(["hourly_rate_minor"]);
  });

  it("routes each role to its own field set", () => {
    // Learner columns must not be scored against a tutor, or every tutor would sit at a low score.
    expect(profileCompletionFor("instructor", fullTutor.profile, fullTutor.instructor).percent).toBe(100);
    expect(profileCompletionFor("learner", fullLearner.profile, fullLearner.learner).percent).toBe(100);
    expect(profileCompletionFor("admin", fullLearner.profile, fullLearner.learner).percent).toBe(100);
  });

  it("excludes fields the user cannot control, so the score is always reachable", () => {
    const source = readFileSync(new URL("../client/src/lib/profile-completion.ts", import.meta.url), "utf8");
    for (const uncontrollable of ["verification_status", "training_status", "test_status", "public_profile_status", "profile_status", "account_status"]) {
      expect(source, `${uncontrollable} must not count toward completion`).not.toContain(uncontrollable);
    }
  });
});

describe("the dashboards show the real number", () => {
  it("computes the percentage from the stored rows instead of a fixture", () => {
    expect(overview).toContain("profileCompletionFor(role,");
    expect(overview).toContain("trpc.supabaseCore.profiles.useQuery");
    expect(overview).not.toContain("data.profileCompletion");
  });

  it("mounts the completion banner on both the learner and the tutor dashboard", () => {
    expect(overview).toContain("<ProfileCompletionBanner role={role} />");
    expect(tutorDash).toContain('<ProfileCompletionBanner role="instructor" />');
    // LearnerOverview, not DashboardOverview, is what a learner actually opens.
    expect(learnerHome).toContain('<ProfileCompletionBanner role="learner" />');
  });

  it("is a notice the reader can close, remembered per account", () => {
    expect(banner).toContain('aria-label={t("common.close")}');
    expect(banner).toContain("onClick={dismiss}");
    expect(banner).toContain("if (dismissed) return null;");
    // Keyed by account so a second person signing in on this browser is not silently opted out,
    // and guarded because storage can be unavailable or throw.
    expect(banner).toContain("DISMISS_PREFIX + user.id");
    expect(banner).toMatch(/try \{[\s\S]*?window\.localStorage\.setItem[\s\S]*?\} catch/);
    expect(banner).toMatch(/try \{[\s\S]*?window\.localStorage\.getItem[\s\S]*?\} catch/);
  });

  it("opens the learner desk on the learner's own figures, with no greeting above them", () => {
    // A name in a headline and a paragraph explaining that zero means zero were the first two
    // things on the page. Neither told the learner anything they had come to find out.
    expect(learnerHome).not.toContain('t("learnerHome.greeting"');
    expect(learnerHome).not.toContain('t("learnerHome.copy")');
    expect(learnerHome).not.toContain('t("learnerHome.eyebrow")');
    // The page still carries a heading, so it is not headingless for a screen reader.
    expect(learnerHome).toContain('<h1 className="sr-only">');
  });

  it("hides the banner once nothing is missing, and never guesses before the rows load", () => {
    expect(banner).toContain("if (result.complete) return null;");
    expect(banner).toContain("if (!profiles.data?.ok) return null;");
  });

  it("sends the user to the profile page for their own role", () => {
    expect(banner).toContain('`/dashboard/${role === "instructor" ? "instructor" : "learner"}/profile`');
  });
});

describe("stage one asks only for what an account needs", () => {
  it("requires the full set per role before the dashboard opens", () => {
    expect(onboardingPage).toContain("!profile.countryCity.trim() || !profile.timezone.trim()");
    expect(onboardingPage).toContain('role === "learner" ? !profile.level.trim() : !profile.subjects.length || !(profile.teachingLanguages || "").trim()');
  });

  it("leaves every step-two field optional, so nothing blocks the dashboard", () => {
    // The bio / goal textarea used to be `required` even though it is not needed to open an account.
    expect(stepTwo).not.toContain("<textarea required");
    expect(stepTwo).not.toContain("<input required value");
    // Consent is a legal acknowledgement rather than profile data, so it stays required.
    expect(stepTwo).toContain('<input required type="checkbox" checked={profile.consent}');
  });

  it("collects country and timezone as real identifiers, not free text", () => {
    expect(onboardingPage).toContain("options={countryOptions()}");
    expect(onboardingPage).toContain("options={timezoneOptionsForCountry(profile.countryCity)}");
    expect(onboardingPage).toContain("timezone: nextTimezoneForCountry(value, current.timezone)");
    expect(onboardingPage).not.toContain('update("countryCity", e.target.value)');
    expect(onboardingPage).not.toContain('placeholder="e.g. GMT+5"');
  });

  it("finally collects the subjects it has always stored but never asked for", () => {
    expect(onboardingPage).toContain("onChange={setSubjects}");
    expect(onboardingPage).toContain("onChange={setTeachingLanguages}");
  });

  it("keeps onboarding_completed as the required-stage gate, separate from the percentage", () => {
    expect(onboardingPage).toContain("completeOnboarding: true");
    expect(banner).not.toContain("onboarding_completed");
    expect(banner).not.toContain("onboardingCompleted");
  });
});

describe("one source of truth for profile completion", () => {
  // The editor's own shape, holding exactly what the stored rows above hold.
  const formFromRows = {
    privateAccountName: fullTutor.profile.full_name,
    publicDisplayName: fullTutor.profile.display_name,
    countryRegion: fullTutor.profile.country,
    timezone: fullTutor.profile.timezone,
    publicBio: fullTutor.profile.bio,
    gender: fullTutor.profile.gender,
    publicSlug: fullTutor.instructor.public_slug,
    subjects: fullTutor.instructor.subjects,
    levels: fullTutor.instructor.teaching_levels,
    teachingLanguages: fullTutor.instructor.teaching_languages,
    yearsExperience: String(fullTutor.instructor.years_experience),
    teachingApproach: fullTutor.instructor.teaching_approach,
    availabilitySummary: fullTutor.instructor.availability_summary,
    hourlyRate: String(fullTutor.instructor.hourly_rate_minor / 100),
  };

  it("gives the dashboard and the Profile page the same number for the same profile", () => {
    const dashboard = instructorProfileCompletion(fullTutor.profile, fullTutor.instructor);
    const profilePage = instructorFormCompletion(formFromRows, fullTutor.profile.avatar_url);
    expect(profilePage.percent).toBe(dashboard.percent);
    expect(profilePage.missing.map((f) => f.key)).toEqual(dashboard.missing.map((f) => f.key));
  });

  it("agrees on every partially filled profile too, not just the complete one", () => {
    for (const drop of ["bio", "country", "timezone", "avatar_url"] as const) {
      const rows = { ...fullTutor.profile, [drop]: "" };
      const form = { ...formFromRows, ...(drop === "bio" ? { publicBio: "" } : drop === "country" ? { countryRegion: "" } : drop === "timezone" ? { timezone: "" } : {}) };
      const dashboard = instructorProfileCompletion(rows, fullTutor.instructor);
      const profilePage = instructorFormCompletion(form, drop === "avatar_url" ? "" : fullTutor.profile.avatar_url);
      expect(profilePage.percent, `disagreement after dropping ${drop}`).toBe(dashboard.percent);
      expect(profilePage.missing.map((f) => f.key)).toEqual(dashboard.missing.map((f) => f.key));
    }
    // An empty editor and an empty row set must both read zero.
    expect(instructorFormCompletion({}).percent).toBe(0);
    expect(instructorProfileCompletion(null, null).percent).toBe(0);
  });

  it("keeps the old tutor calculator as a delegate rather than a second field list", () => {
    const source = readFileSync(new URL("../client/src/lib/instructor-data.ts", import.meta.url), "utf8");
    expect(source).toContain("return instructorFormCompletion(profile).percent;");
    // The independent 13-field list is gone.
    expect(source).not.toContain("profile.courseFormats.length");
    expect(source).not.toMatch(/const fields = \[profile\.publicDisplayName/);
    expect(calculateProfileCompletion({ ...formFromRows } as never)).toBe(instructorFormCompletion(formFromRows).percent);
  });

  it("wires the Profile page to the shared calculator", () => {
    /*
     * The shared calculator moved. `instructorFormCompletion` counted fifteen fields, seven of
     * which onboarding fills in, and could not see the hours, media or background that live in
     * other tables — which is how a nearly-empty profile read 67%. The list is now
     * `scoreInstructorProfile` in `shared`, read through `useInstructorCompletion`, and the point
     * of this assertion is unchanged and stronger: the page computes nothing of its own, and what
     * it shows is what the server enforces.
     */
    expect(tutorForm).toContain("useInstructorCompletion(completionRows)");
    expect(tutorForm).toContain("const completion = scored.percent;");
    expect(tutorForm).not.toContain("calculateProfileCompletion");
    // No second formula anywhere on the page.
    expect(tutorForm).not.toMatch(/Math\.round\(\s*\(done/);
  });

  it("loads the tutor columns from the row that actually holds them", () => {
    // country / timezone / bio / display_name live on `profiles`; instructor_profiles has no such
    // columns, so the old reads always came back undefined and the form never repopulated.
    expect(tutorForm).toContain("countryRegion: String(base?.country ??");
    expect(tutorForm).toContain("timezone: String(base?.timezone ??");
    expect(tutorForm).toContain("publicBio: String(base?.bio ??");
    expect(tutorForm).toContain("publicDisplayName: String(base?.display_name ??");
    for (const ghost of ["record?.country_region", "record?.public_bio", "record?.public_display_name", "record?.timezone"]) {
      expect(tutorForm, `${ghost} is not a real column`).not.toContain(ghost);
    }
  });
});

describe("the banner uses the requested wording", () => {
  const catalog = readFileSync(new URL("../client/src/i18n/catalog.ts", import.meta.url), "utf8");
  it("says please complete your profile, with a Complete Profile button", () => {
    expect(catalog).toContain('"profileCompletion.title": "Please complete your profile"');
    expect(catalog).toContain('"profileCompletion.cta": "Complete Profile"');
  });

  it("keeps all three locales translated rather than falling back to English", () => {
    expect(catalog.match(/"profileCompletion\.title":/g)).toHaveLength(3);
    expect(catalog.match(/"profileCompletion\.cta":/g)).toHaveLength(3);
    expect(catalog).toContain('"profileCompletion.title": "براہِ کرم اپنی پروفائل مکمل کریں"');
    expect(catalog).toContain('"profileCompletion.title": "يرجى إكمال ملفك الشخصي"');
  });
});

describe("a tutor location is actually stored", () => {
  it("persists country, timezone and bio, which the tutor form collected but dropped", () => {
    expect(core).toContain("...optional(input.country, () => ({ country: input.country!.trim() || null }))");
    expect(core).toContain("...optional(input.timezone, () => ({ timezone: input.timezone!.trim() || null }))");
    expect(core).toContain("...optional(input.bio, () => ({ bio: input.bio!.trim() || null }))");
    const instructorInput = routers.slice(routers.indexOf("updateInstructorProfile: supabaseOnlyProcedure"), routers.indexOf("=> updateOwnInstructorProfile"));
    for (const field of ["country: z.string().max(80).optional()", "city: z.string().max(120).optional()", "timezone: z.string().max(80).optional()", "bio: z.string().max(2000).optional()"]) {
      expect(instructorInput, `updateInstructorProfile should accept ${field}`).toContain(field);
    }
  });

  it("sends them from both the tutor profile form and onboarding", () => {
    expect(tutorForm).toContain("country: profile.countryRegion, timezone: profile.timezone, bio: profile.publicBio");
    // Line endings are mixed in this file, so match the sequence rather than exact whitespace.
    expect(onboardingPage).toMatch(/country: profile\.countryCity,\s*timezone: profile\.timezone,\s*bio: profile\.bio,/);
  });

  it("still scopes every write to the identity of the caller", () => {
    const fn = core.slice(core.indexOf("export async function updateOwnInstructorProfile"), core.indexOf("export async function updateOwnLearnerProfile"));
    expect(fn).toContain('.eq("id", identity.id)');
    expect(fn).toContain("user_id: identity.id");
    expect(fn).not.toMatch(/input\.(userId|user_id|identity)/);
  });
});
