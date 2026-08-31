import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../client/src/components/InstructorManagement.tsx", import.meta.url), "utf8");
const router = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");

describe("instructor settings persistence boundary", () => {
  it("uses the protected profile update mutation", () => {
    expect(source).toContain("trpc.supabaseCore.updateProfile.useMutation()");
    expect(source).toContain("updateProfile.mutateAsync");
    expect(router).toContain("updateProfile: supabaseOnlyProcedure");
  });

  it("keeps verification and notification providers setup-needed", () => {
    expect(source).toContain('t("dashboard.notificationsSetup")');
    expect(source).toContain('t("dashboard.verificationBoundary")');
    expect(source).toContain('t("dashboard.instructorSettingsCopy")');
  });
});
