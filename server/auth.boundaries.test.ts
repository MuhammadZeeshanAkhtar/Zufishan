import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { canAssignRole, demoAuthNotice, isAdminRole, isPublicSignupRole, isSafeInternalReturn, isSessionExpired, normalizeEmail, verificationLabel } from "../client/src/lib/auth-models";
import { getServiceStateCopy, isIndexablePublicPath, isPrivateSurface } from "../client/src/lib/quality-boundaries";

describe("Zufishan auth boundaries", () => {
  it("allows only learner and instructor in public signup", () => {
    expect(isPublicSignupRole("learner")).toBe(true);
    expect(isPublicSignupRole("instructor")).toBe(true);
    expect(isPublicSignupRole("admin")).toBe(false);
    expect(isPublicSignupRole("super_admin")).toBe(false);
  });

  it("allows only admin-tier roles through the admin route gate", () => {
    expect(isAdminRole("learner")).toBe(false);
    expect(isAdminRole("instructor")).toBe(false);
    expect(isAdminRole("admin")).toBe(true);
    expect(isAdminRole("super_admin")).toBe(true);
    expect(isAdminRole(undefined)).toBe(false);
  });

  it("blocks ordinary users from assigning privileged roles", () => {
    expect(canAssignRole("learner", "admin")).toBe(false);
    expect(canAssignRole("instructor", "moderator")).toBe(false);
    expect(canAssignRole("admin", "learner")).toBe(true);
  });

  it("only labels approved instructors as verified", () => {
    expect(verificationLabel("approved")).toBe("Verified instructor");
    expect(verificationLabel("verification_pending")).toBe("Verification process");
  });

  it("keeps private and unknown routes out of the public index", () => {
    expect(isPrivateSurface("/dashboard/learner")).toBe(true);
    expect(isIndexablePublicPath("/courses", true)).toBe(true);
    expect(isIndexablePublicPath("/unknown", false)).toBe(false);
    expect(isIndexablePublicPath("/admin/overview", true)).toBe(false);
  });

  it("uses explicit copy for unavailable service states", () => {
    expect(getServiceStateCopy("offline")).toContain("Nothing was changed");
    expect(getServiceStateCopy("not_enough_data")).toContain("reliable result");
    expect(getServiceStateCopy("coming_soon")).toContain("Coming soon");
  });

  it("clearly identifies the production setup-needed state", () => {
    expect(demoAuthNotice()).toContain("Supabase Auth is not configured");
    expect(demoAuthNotice()).toContain("unavailable");
  });

  it("normalizes identity emails before comparison", () => {
    expect(normalizeEmail("  Learner@Example.COM ")).toBe("learner@example.com");
  });

  it("expires only sessions whose bounded expiry has passed", () => {
    expect(isSessionExpired(1_000, 1_001)).toBe(true);
    expect(isSessionExpired(1_000, 999)).toBe(false);
    expect(isSessionExpired(undefined, 1_001)).toBe(false);
  });

  it("keeps Supabase auth state out of browser localStorage", () => {
    const hook = readFileSync(resolve(process.cwd(), "client/src/_core/hooks/useAuth.ts"), "utf8");
    expect(hook).not.toContain("localStorage.setItem");
    expect(hook).toContain("trpc.auth.me.useQuery");
  });

  it("allows only internal absolute paths as return targets", () => {
    expect(isSafeInternalReturn("/dashboard/learner")).toBe("/dashboard/learner");
    expect(isSafeInternalReturn("https://example.com")).toBeNull();
    expect(isSafeInternalReturn("//example.com")).toBeNull();
    expect(isSafeInternalReturn("javascript:alert(1)")).toBeNull();
  });
});
