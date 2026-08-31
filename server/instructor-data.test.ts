import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { calculateProfileCompletion, demoInstructorProfile, getPublicInstructorProfile, getTestStatus, saveInstructorAvailability, validateAvailability } from "../client/src/lib/instructor-data";
const instructorUi = readFileSync(new URL("../client/src/components/InstructorManagement.tsx", import.meta.url), "utf8");

describe("instructor management boundaries", () => {
  it("calculates a bounded profile completion percentage", () => {
    const result = calculateProfileCompletion(demoInstructorProfile);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(100);
  });

  it("rejects overlapping active intervals on the same day", () => {
    const result = validateAvailability([
      { id: "a", day: "Tuesday", start: "19:00", end: "20:00", timezone: "GMT+5", active: true },
      { id: "b", day: "Tuesday", start: "19:30", end: "20:30", timezone: "GMT+5", active: true },
    ]);
    expect(result).toEqual({ ok: false, error: "Overlapping intervals are not allowed." });
    expect(saveInstructorAvailability([])).toEqual({ ok: true, intervals: [] });
  });

  it("does not expose the demo profile while it is private", () => {
    expect(getPublicInstructorProfile("amina-rahman")).toBeUndefined();
  });

  it("hydrates the active editor from protected Supabase profiles instead of demo defaults", () => {
    expect(instructorUi).toContain("trpc.supabaseCore.profiles.useQuery");
    expect(instructorUi).toContain("const emptyInstructorProfile");
    expect(instructorUi).not.toContain("useState<InstructorProfile>(demoInstructorProfile)");
  });

  it("keeps active training honest until approved content persistence exists", () => {
    expect(instructorUi).toContain('t("courseStudio.trainingPersistenceRequired")');
    expect(instructorUi).not.toContain("demoTrainingModules.map");
  });

  it("keeps test results unavailable without a test engine", () => {
    expect(getTestStatus().message).toContain("connection required");
    expect(instructorUi).toContain('t("common.setupNeeded")');
    expect(instructorUi).toContain('t("common.comingSoon")');
    expect(instructorUi).not.toContain("Start test placeholder");
  });
});
