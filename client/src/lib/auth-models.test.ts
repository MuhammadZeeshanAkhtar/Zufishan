import { describe, expect, it } from "vitest";
import { canAssignRole, demoAuthNotice, isPublicSignupRole, verificationLabel } from "./auth-models";

describe("Noor Ilm auth model boundaries", () => {
  it("allows only learner and instructor in public signup", () => {
    expect(isPublicSignupRole("learner")).toBe(true);
    expect(isPublicSignupRole("instructor")).toBe(true);
    expect(isPublicSignupRole("admin")).toBe(false);
    expect(isPublicSignupRole("super_admin")).toBe(false);
  });

  it("does not let ordinary users assign privileged roles", () => {
    expect(canAssignRole("learner", "admin")).toBe(false);
    expect(canAssignRole("instructor", "moderator")).toBe(false);
    expect(canAssignRole("admin", "learner")).toBe(true);
  });

  it("only labels approved instructors as verified", () => {
    expect(verificationLabel("approved")).toBe("Verified instructor");
    expect(verificationLabel("verification_pending")).toBe("Verification process");
  });

  it("clearly identifies the fallback mode", () => {
    expect(demoAuthNotice()).toContain("Demo mode");
  });
});
