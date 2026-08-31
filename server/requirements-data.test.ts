import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { calculateRequirementMatch, getPublicRequirements, getRequirement, getRecommendedInstructors, prepareTrialRequest } from "../client/src/lib/requirements-data";

describe("Prompt 6 requirement boundaries", () => {
  it("returns only public requirements and omits private contact fields", () => {
    const rows = getPublicRequirements({ subject: "Quran Recitation" });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.visibility === "public")).toBe(true);
    expect(rows[0]).not.toHaveProperty("email");
    expect(rows[0]).not.toHaveProperty("phone");
  });

  it("keeps match scores explicitly labelled as demo placeholders", () => {
    const requirement = getRequirement("req-101")!;
    const match = calculateRequirementMatch(requirement, { subjects: ["Quran Recitation"], languages: ["English"], timezone: "GMT+5", formats: ["one-to-one"] });
    expect(match.score).toBe(100);
    expect(match.label).toContain("Demo placeholder");
    expect(getRecommendedInstructors(requirement)[0]?.match.label).toContain("not an algorithmic result");
  });

  it("prepares a trial request without claiming scheduling or notifications", () => {
    const trial = prepareTrialRequest({ requirementId: "req-101", instructorId: "ins-2" });
    expect(trial.status).toBe("ready_for_connection");
    expect(trial.note).toContain("not enabled");
  });

  it("keeps private requirement editing free of demo ownership and fake save claims", () => {
    const source = readFileSync(resolve(process.cwd(), "client/src/components/RequirementsExperience.tsx"), "utf8");
    expect(source).not.toContain("demoLearnerIdentity");
    expect(source).not.toContain("Saved in demo mode");
    expect(source).toContain("trpc.supabaseCore.updateRequirementGoal.useMutation()");
    expect(source).toContain('requirementsExp.goalSaved');
    expect(source).not.toContain('requirementsExp.notPersisted');
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("setStatus");
    expect(source).not.toContain("setResponseSubmitted");
    expect(source).not.toContain("setShortlisted");
    expect(source).toContain('label ?? t("requirementsExp.prepareTrial")');
    expect(source).toContain('label?: string');
  });
});
