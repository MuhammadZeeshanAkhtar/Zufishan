import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const coreSource = readFileSync(new URL("./supabase-core.ts", import.meta.url), "utf8");
const routerSource = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const instructorSource = readFileSync(new URL("../client/src/components/InstructorManagement.tsx", import.meta.url), "utf8");
const courseSource = readFileSync(new URL("../client/src/components/CourseManagementExperience.tsx", import.meta.url), "utf8");

describe("protected instructor credential contracts", () => {
  it("scopes metadata reads and writes to the authenticated instructor", () => {
    expect(coreSource).toContain('from("instructor_credentials").select("*").eq("instructor_id", identity.id)');
    expect(coreSource).toContain('instructor_id: identity.id');
    expect(coreSource).toContain('input.objectPath.startsWith(`${identity.id}/`)');
  });

  it("exposes credential and instructor-profile procedures only through the Supabase-only router", () => {
    expect(routerSource).toContain("credentials: supabaseOnlyProcedure");
    expect(routerSource).toContain("createCredential: supabaseOnlyProcedure");
    expect(routerSource).toContain("deleteCredential: supabaseOnlyProcedure");
    expect(routerSource).toContain("updateInstructorProfile: supabaseOnlyProcedure");
  });

  it("deletes credential metadata only for the authenticated instructor", () => {
    expect(coreSource).toContain("deleteOwnCredential");
    expect(coreSource).toContain('.eq("id", credentialId).eq("instructor_id", identity.id)');
    expect(coreSource).toContain('.delete().eq("id", credentialId).eq("instructor_id", identity.id)');
  });

  it("updates only authenticated instructor-owned profile fields", () => {
    expect(coreSource).toContain("updateOwnInstructorProfile");
    expect(coreSource).toContain('from(\"instructor_profiles\").upsert');
    expect(coreSource).toContain("public_profile_status: input.profileVisibility === \"public\" ? \"published\" : \"draft\"");
  });

  it("keeps private learner course surfaces fail-closed and writes lesson progress through Supabase", () => {
    expect(courseSource).toContain('t("catalogue.courseDiscoveryUnavailable")');
    expect(courseSource).toContain("trpc.supabaseCore.learnerWorkspace.useQuery");
    expect(courseSource).toContain("trpc.supabaseCore.updateProgress.useMutation");
    expect(courseSource).not.toContain("Progress saved in demo mode.");
  });

  it("uploads through permission, authenticated Storage, then metadata and cleans up on metadata failure", () => {
    expect(instructorSource).toContain('bucket: "instructor-credentials"');
    expect(instructorSource).toContain("supabaseClient.storage.from(permission.data.bucket).upload");
    expect(instructorSource).toContain("createCredential.mutateAsync");
    expect(instructorSource).toContain("remove([permission.data.objectPath])");
  });
});
