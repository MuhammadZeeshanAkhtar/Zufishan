import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../client/src/components/InstructorManagement.tsx", import.meta.url), "utf8");
const router = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");

describe("public instructor profile boundary", () => {
  it("uses the public slug procedure and approved fields", () => {
    expect(source).toContain("trpc.schedulingPublic.instructorBySlug.useQuery");
    expect(source).toContain("trpc.supabaseCore.profiles.useQuery");
    expect(source).not.toContain("export function InstructorProfilePreview() { const profile = demoInstructorProfile;");
    expect(source).toContain("profile.public_slug");
    expect(source).toContain("profile.teaching_languages");
    expect(router).toContain("instructorBySlug: publicProcedure");
  });

  it("keeps private profile data private and messaging behind the relationship gate", () => {
    expect(source).toContain('t("tutorDetail.trustCopy")');
    // This used to assert the disabled `messaging.setupNeeded` button. That placeholder existed
    // only because nothing could open a thread; it is now the real action, which is a stronger
    // guarantee than a dead control: startConversation refuses two accounts with no trial,
    // booking, requirement response or enrolment between them.
    expect(source).toContain('<MessageAction counterpartId={profile.user_id} tone="standard"/>');
    expect(source).not.toContain('t("messaging.setupNeeded")');
    expect(source).toContain('t("common.loading")');
    const profileBody = source.slice(source.indexOf("export function PublicInstructorProfile"));
    expect(profileBody).not.toContain("publicCredentialsSummary");
    expect(profileBody).not.toContain("getPublicInstructorProfile");
  });
});
