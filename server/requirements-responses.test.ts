import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const core = readFileSync(new URL("./supabase-core.ts", import.meta.url), "utf8");
const router = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/0002_auth_and_rls.sql", import.meta.url), "utf8");
const experience = readFileSync(new URL("../client/src/components/RequirementsExperience.tsx", import.meta.url), "utf8");

describe("protected requirement-response persistence boundary", () => {
  it("lists responses only after checking learner-owned requirement scope", () => {
    expect(core).toContain("export async function listOwnRequirementResponses");
    expect(core).toContain('.eq("learner_id", identity.id).maybeSingle()');
    expect(core).toContain('.from("requirement_responses").select("*")');
    expect(core).toContain('.eq("requirement_id", requirementId)');
  });

  it("requires an instructor profile and published requirement before inserting", () => {
    expect(core).toContain("export async function createRequirementResponse");
    expect(core).toContain('.from("instructor_profiles").select("user_id").eq("user_id", identity.id)');
    expect(core).toContain('.eq("status", "published").maybeSingle()');
    expect(core).toContain('instructor_id: identity.id');
    expect(core).toContain('status: "pending"');
  });

  it("exposes both operations only through Supabase-only procedures", () => {
    expect(router).toContain("requirementResponses: supabaseOnlyProcedure");
    expect(router).toContain("respondToRequirement: supabaseOnlyProcedure");
  });

  it("keeps response status transitions instructor-owned and canonical", () => {
    expect(core).toContain("export async function updateOwnRequirementResponseStatus");
    expect(core).toContain('.eq("instructor_id", identity.id)');
    expect(core).toContain("updated_at: new Date().toISOString()");
    expect(router).toContain("updateRequirementResponseStatus: supabaseOnlyProcedure");
    expect(router).toContain('["pending", "shortlisted", "accepted", "rejected", "withdrawn"]');
  });

  it("keeps learner requirement goal updates owner-scoped and protected", () => {
    expect(core).toContain("export async function updateOwnRequirementGoal");
    expect(core).toContain('.from("learner_requirements").update({ goal');
    expect(core).toContain('.eq("learner_id", identity.id)');
    expect(router).toContain("updateRequirementGoal: supabaseOnlyProcedure");
    expect(experience).toContain("trpc.supabaseCore.updateRequirementGoal.useMutation()");
    expect(experience).toContain("updateGoal.mutateAsync");
    expect(experience).toContain('t("requirementsExp.goalSaved")');
  });

  it("connects the instructor response form to the protected mutation with honest UI states", () => {
    expect(experience).toContain("trpc.supabaseCore.respondToRequirement.useMutation()");
    expect(experience).toContain("submitResponse.mutateAsync");
    expect(experience).toContain('t("requirementsExp.responseSubmitted")');
    expect(experience).not.toContain('disabled aria-disabled="true"');
  });

  it("keeps database policies scoped to parties and instructor role", () => {
    expect(migration).toContain("requirement_responses_parties_or_moderator");
    expect(migration).toContain("requirement_responses_instructor_insert");
    expect(migration).toContain("public.is_user_role('instructor')");
  });
});
