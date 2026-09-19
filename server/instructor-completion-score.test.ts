/**
 * The completeness score — the bug it fixes, and the fact that it decides nothing.
 *
 * A teacher wrote a line or two and their profile read 67% complete. Nothing was miscalculated:
 * ten of fifteen fields really is 67%. The fault was the list. Seven of those fifteen are filled in
 * by onboarding — name, display name, country, timezone, gender, slug, language — so a profile with
 * almost nothing in it started two thirds of the way home, and the list could not see the hours a
 * teacher had opened, the introduction they had recorded, or the background they had written, which
 * is most of what a learner reads.
 *
 * The score briefly gated publication at 85%. It does not any more: migration 0036 put the gate
 * where the reference marketplace has it, with a reviewer, and a percentage computed in a browser
 * was never going to be a gate anyway. So this file exercises the arithmetic — the thing that was
 * actually wrong — and then checks that the number is guidance and nothing turns on it.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PROFILE_READY_PERCENT, scoreInstructorProfile } from "../shared/instructor-publication";

const core = readFileSync(new URL("./supabase-core.ts", import.meta.url), "utf8");
const hook = readFileSync(new URL("../client/src/lib/use-instructor-completion.ts", import.meta.url), "utf8");
const editor = readFileSync(new URL("../client/src/components/InstructorManagement.tsx", import.meta.url), "utf8");
const catalog = readFileSync(new URL("../client/src/i18n/catalog.ts", import.meta.url), "utf8");

/** What onboarding fills in by itself — the seven that used to carry a thin profile to 67%. */
const afterSignup = {
  profile: { full_name: "SUFI", display_name: "SUFI", country: "Pakistan", timezone: "Asia/Karachi", gender: "male" },
  instructorProfile: { public_slug: "sufi" },
};

/** A profile with everything a learner needs, and nothing optional. */
const readyToTeach = {
  profile: {
    full_name: "SUFI", display_name: "SUFI", country: "Pakistan", timezone: "Asia/Karachi",
    gender: "male", avatar_url: "avatars/sufi.png", bio: "I teach Tajweed slowly and carefully.",
  },
  instructorProfile: {
    public_slug: "sufi", subjects: ["Tajweed"], teaching_levels: ["Beginner"],
    teaching_languages: ["English", "Urdu"], years_experience: 5,
    teaching_approach: "Correction first, pace second.", hourly_rate_minor: 700,
    currency: "USD", availability_summary: "Evenings", sect: "Sunni",
  },
  availabilityCount: 3,
  mediaCount: 0,
  qualificationCount: 0,
};

describe("a thin profile scores like a thin profile", () => {
  it("no longer reads two thirds complete straight after signup", () => {
    const score = scoreInstructorProfile(afterSignup);
    // The number that prompted this. Six of twenty-one is 29%.
    expect(score.percent).toBeLessThan(40);
    expect(score.ready).toBe(false);
  });

  it("counts an empty profile as empty rather than as a third done", () => {
    expect(scoreInstructorProfile({}).percent).toBe(0);
    expect(scoreInstructorProfile({}).ready).toBe(false);
  });

  it("counts the hours, the introduction and the background, which the old list could not see", () => {
    const base = scoreInstructorProfile({ ...readyToTeach, availabilityCount: 0 });
    const withHours = scoreInstructorProfile({ ...readyToTeach, availabilityCount: 2 });
    expect(withHours.percent).toBeGreaterThan(base.percent);

    const withEverything = scoreInstructorProfile({
      ...readyToTeach,
      mediaCount: 1,
      qualificationCount: 2,
      instructorProfile: { ...readyToTeach.instructorProfile, fiqh: "Hanafi" },
    });
    expect(withEverything.percent).toBe(100);
    expect(withEverything.complete).toBe(true);
  });

  it("treats a blank string and an empty list as not filled in", () => {
    const blank = scoreInstructorProfile({
      profile: { full_name: "   ", bio: "" },
      instructorProfile: { subjects: [], hourly_rate_minor: 0 },
    });
    expect(blank.percent).toBe(0);
  });
});

describe("the suggestion is reachable, and means something", () => {
  it("calls a teacher who has done the real work ready", () => {
    // No introduction video, no ijazah written up, no school of fiqh stated — three omissions.
    const score = scoreInstructorProfile(readyToTeach);
    expect(score.percent).toBeGreaterThanOrEqual(PROFILE_READY_PERCENT);
    expect(score.ready).toBe(true);
  });

  it("notices a teacher with no bookable hours", () => {
    // A listing nobody can book is not a listing, whatever else is filled in.
    const score = scoreInstructorProfile({ ...readyToTeach, availabilityCount: 0 });
    expect(score.missing).toContain("availabilityHours");
  });

  it("names what is missing rather than leaving a teacher to guess", () => {
    const score = scoreInstructorProfile(afterSignup);
    expect(score.missing).toContain("bio");
    expect(score.missing).toContain("rate");
    expect(score.missing).toContain("subjects");
    expect(score.missing.length).toBeGreaterThan(10);
  });

  it("is the eighty-five the owner asked for", () => {
    expect(PROFILE_READY_PERCENT).toBe(85);
  });
});

describe("the number is guidance, and nothing turns on it", () => {
  it("scores one list, wherever it is read", () => {
    expect(hook).toContain('from "@shared/instructor-publication"');
    // The page computes nothing of its own.
    expect(editor).toContain("useInstructorCompletion(completionRows)");
    expect(editor).toContain("const completion = scored.percent;");
  });

  it("does not let a percentage decide whether a profile publishes", () => {
    const fn = core.slice(core.indexOf("export async function updateOwnInstructorProfile"), core.indexOf("export async function publishOwnCourse"));
    /*
     * Seven named answers block a publish; a percentage never does. The distinction matters: the
     * seven are things a learner cannot choose without, and they are checked here from the values
     * being written. The score is advice, and advice does not belong in a gate.
     */
    expect(fn).toContain('public_profile_status: mayPublish ? "published" : "draft"');
    expect(fn).toContain("missingRequired({");
    expect(fn).not.toContain("scoreInstructorProfile");
    expect(fn).not.toContain(".percent");
    // And no percentage is accepted from the browser either, which would be worse than useless.
    expect(fn).not.toContain("input.percent");
    expect(fn).not.toContain("input.completion");
  });

  it("tells the teacher which of the three states they are in, in all three languages", () => {
    for (const key of ["publishGate.draftTitle", "publishGate.reviewTitle", "publishGate.liveTitle"]) {
      expect(editor, key).toContain(key);
    }
    expect(editor).toContain("COMPLETION_LABEL_KEYS[key]");
    for (const key of ["publishGate.draftCopy", "publishGate.reviewCopy", "publishGate.liveCopy", "publishGate.guidance"]) {
      expect(catalog.match(new RegExp(`"${key.replace(/\./g, "\\.")}":`, "g")), key).toHaveLength(3);
    }
  });

  it("says going live is the reviewer's decision, not a percentage", () => {
    expect(catalog).toContain("It goes live for students once they verify you.");
  });
});
