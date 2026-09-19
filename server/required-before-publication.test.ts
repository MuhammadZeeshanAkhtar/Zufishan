/**
 * The seven answers a profile cannot be published without, and what a reviewer sees before saying yes.
 *
 * The owner named them: a name, what the teacher can teach, the language, gender, the hourly rate,
 * the credits that rate works out to, and the timezone. Without those a learner cannot choose a
 * teacher at all, so a profile missing one is not a profile a reviewer should be handed.
 *
 * Two things this file is careful about:
 *
 *  1. **`credits / hour` is not a field.** It is the hourly rate read through the currency, and
 *     `creditsPerHour` returns null for a currency the pricing table does not know. So the
 *     requirement behind it is the currency. Requiring a phantom input the editor never offers
 *     would be a gate nobody could pass, which is worse than no gate.
 *  2. **An incomplete publish must not lose the teacher's work.** The edit is saved as a draft and
 *     the teacher is told which answers are missing. Failing the save would punish them for trying.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { REQUIRED_FOR_PUBLICATION, missingRequired, scoreInstructorProfile } from "../shared/instructor-publication";
import { creditsPerHour } from "../client/src/lib/pricing-config";

const core = readFileSync(new URL("./supabase-core.ts", import.meta.url), "utf8");
const reviewQueue = readFileSync(new URL("./review-queue.ts", import.meta.url), "utf8");
const adminServer = readFileSync(new URL("./admin-instructors.ts", import.meta.url), "utf8");
const adminUi = readFileSync(new URL("../client/src/components/AdminInstructorsExperience.tsx", import.meta.url), "utf8");
const catalog = readFileSync(new URL("../client/src/i18n/catalog.ts", import.meta.url), "utf8");

/** Everything the seven require, and nothing else. */
const minimum = {
  profile: { display_name: "SUFI", gender: "male", timezone: "Asia/Karachi" },
  instructorProfile: {
    subjects: ["Tajweed"], teaching_languages: ["English"],
    hourly_rate_minor: 700, currency: "USD",
  },
};

describe("the seven the owner named", () => {
  it("is exactly that list", () => {
    expect([...REQUIRED_FOR_PUBLICATION]).toEqual([
      "displayName", "subjects", "languages", "gender", "rate", "currency", "timezone",
    ]);
  });

  it("passes a profile that has all seven and nothing else", () => {
    expect(missingRequired(minimum)).toEqual([]);
    // And that profile is nowhere near "complete" — the two ideas stay separate.
    expect(scoreInstructorProfile(minimum).percent).toBeLessThan(50);
  });

  it("names each one when it is blank", () => {
    for (const [key, broken] of [
      ["displayName", { ...minimum, profile: { ...minimum.profile, display_name: "" } }],
      ["gender", { ...minimum, profile: { ...minimum.profile, gender: null } }],
      ["timezone", { ...minimum, profile: { ...minimum.profile, timezone: "   " } }],
      ["subjects", { ...minimum, instructorProfile: { ...minimum.instructorProfile, subjects: [] } }],
      ["languages", { ...minimum, instructorProfile: { ...minimum.instructorProfile, teaching_languages: [] } }],
      ["rate", { ...minimum, instructorProfile: { ...minimum.instructorProfile, hourly_rate_minor: 0 } }],
      ["currency", { ...minimum, instructorProfile: { ...minimum.instructorProfile, currency: null } }],
    ] as const) {
      expect(missingRequired(broken as never), `${key} must be reported missing`).toContain(key);
    }
  });

  it("reports an empty profile as missing all seven", () => {
    expect(missingRequired({})).toHaveLength(REQUIRED_FOR_PUBLICATION.length);
  });
});

describe("credits per hour is the rate read through the currency", () => {
  it("cannot be shown without both halves, which is why currency is required", () => {
    // The requirement exists because of this: no currency, no credit figure.
    expect(creditsPerHour(700, "USD")).toBe(7);
    expect(creditsPerHour(700, null)).toBeNull();
    expect(creditsPerHour(null as never, "USD")).toBeNull();
  });

  it("is not asked for as a field of its own", () => {
    // A gate on an input the editor never offers would be a gate nobody could pass.
    expect([...REQUIRED_FOR_PUBLICATION]).not.toContain("creditsPerHour");
    expect([...REQUIRED_FOR_PUBLICATION]).not.toContain("credits");
  });
});

describe("an incomplete publish keeps the work and says why", () => {
  it("decides on the server, from the values being written", () => {
    const fn = core.slice(core.indexOf("export async function updateOwnInstructorProfile"), core.indexOf("export async function publishOwnCourse"));
    expect(fn).toContain("missingRequiredFields = missingRequired({");
    expect(fn).toContain("const mayPublish = input.profileVisibility === \"public\" && missingRequiredFields.length === 0;");
    // Currency may already be stored rather than resent, so the stored value counts.
    expect(fn).toContain('.from("instructor_profiles").select("currency").eq("user_id", identity.id)');
  });

  it("saves the edit as a draft rather than refusing it", () => {
    const fn = core.slice(core.indexOf("export async function updateOwnInstructorProfile"), core.indexOf("export async function publishOwnCourse"));
    expect(fn).toContain('public_profile_status: mayPublish ? "published" : "draft"');
    expect(fn).toContain("publication: { published: false, missingRequired: missingRequiredFields }");
  });

  it("raises no reviewer notice for a profile that did not go up", () => {
    const fn = core.slice(core.indexOf("export async function updateOwnInstructorProfile"), core.indexOf("export async function publishOwnCourse"));
    expect(fn).toContain("if (saved.ok && mayPublish) {");
  });

  it("tells the teacher which answers are missing", () => {
    expect(core).toContain("await notifyTeacherOfMissingFields({");
    const notice = reviewQueue.slice(reviewQueue.indexOf("export async function notifyTeacherOfMissingFields"));
    expect(notice).toContain('type: "profile_incomplete"');
    expect(notice).toContain("Add these before it can be published:");
    // Written on the admin client, because `notifications` lets nobody address a row to anybody.
    expect(notice).toContain("const admin = getSupabaseAdminClient();");
    // Re-saving the same incomplete profile does not stack duplicates; fixing one produces a new notice.
    expect(notice).toContain("idempotency_key: `profile-incomplete-${[...input.missing].sort().join(\"-\")}`");
  });
});

describe("the reviewer sees the profile before approving it", () => {
  it("returns the score and the field list with the instructor detail", () => {
    expect(adminServer).toContain("const completion = scoreInstructorProfile({");
    expect(adminServer).toContain("missingRequired: missingRequired({");
    // The three counts live outside the two rows the desk already read.
    expect(adminServer).toContain('admin.from("instructor_availability").select("id", { count: "exact", head: true })');
    expect(adminServer).toContain('admin.from("instructor_media").select("id", { count: "exact", head: true })');
  });

  it("does not let an unapplied migration read as a missing answer", () => {
    expect(adminServer).toContain("qualificationCount: qualificationCount.error ? 1 : qualificationCount.count ?? 0");
  });

  it("shows the percentage, the blank required fields and every field's state", () => {
    expect(adminUi).toContain('t("adminInstructors.completion")');
    expect(adminUi).toContain("{formatNumber(detail.completion.percent)}%");
    expect(adminUi).toContain("detail.completion.missingRequired.length === 0");
    expect(adminUi).toContain("detail.completion.fields.map((field) => (");
  });

  it("puts it in front of the approve button rather than behind a visit to the public page", () => {
    expect(adminUi.indexOf('t("adminInstructors.decision")')).toBeLessThan(adminUi.indexOf('t("adminInstructors.completion")'));
  });

  it("is written in all three languages", () => {
    for (const key of ["adminInstructors.completion", "adminInstructors.missingRequired", "adminInstructors.allRequiredDone", "adminInstructors.filledCount"]) {
      expect(catalog.match(new RegExp(`"${key.replace(/\./g, "\\.")}":`, "g")), key).toHaveLength(3);
    }
  });
});
