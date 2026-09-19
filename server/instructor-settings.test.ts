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
    // Each boundary is stated on the panel it governs. The page used to open with a paragraph that
    // summarised both of these before the reader reached either; that intro is gone, and the two
    // statements below are the ones that actually have to survive.
    expect(source).toContain('t("dashboard.notificationsSetup")');
    expect(source).toContain('t("dashboard.verificationBoundary")');
  });
});
