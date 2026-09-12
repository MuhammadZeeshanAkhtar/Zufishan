import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ui = readFileSync(new URL("../client/src/components/RequirementsExperience.tsx", import.meta.url), "utf8");
/** The file without its opening doc comment, which quotes the patterns it replaced. */
const code = ui.slice(ui.indexOf("*/") + 2);
const core = readFileSync(new URL("./supabase-core.ts", import.meta.url), "utf8");
const routers = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const guard = readFileSync(new URL("../supabase/migrations/0019_response_decision_is_the_learners.sql", import.meta.url), "utf8");
const rls = readFileSync(new URL("../supabase/migrations/0002_auth_and_rls.sql", import.meta.url), "utf8");
const opened = readFileSync(new URL("../supabase/migrations/0020_published_requirements_readable_by_instructors.sql", import.meta.url), "utf8");
const catalog = readFileSync(new URL("../client/src/i18n/catalog.ts", import.meta.url), "utf8");

describe("nothing displayed is invented", () => {
  it("shows the record's own status rather than forcing every row to published", () => {
    expect(code).not.toContain('status: "published" as RequirementStatus');
    expect(ui).toContain("<Status status={item.status} />");
  });

  it("shows the real number of responses rather than a hardcoded zero", () => {
    expect(code).not.toContain("responsesCount: 0");
    expect(core).toContain('.select("*, requirement_responses(count)")');
    expect(ui).toContain("const responseCount = (row: RequirementRow) => row.requirement_responses?.[0]?.count ?? 0;");
  });

  it("has dropped the fixture module entirely", () => {
    // demoRequirements / getRequirement / getRequirementResponses / getRecommendedInstructors.
    expect(ui).not.toContain('from "../lib/requirements-data"');
    expect(code).not.toMatch(/demoRequirements|getRecommendedInstructors|getRequirementResponses/);
    // MatchPreview fell back to demoRequirements[0] and was routed nowhere.
    expect(ui).not.toContain("export function MatchPreview");
  });

  it("no longer labels a real published requirement as a demo", () => {
    expect(code).not.toContain('t("requirementsExp.demo")');
  });
});

describe("the filters actually filter", () => {
  it("narrows on every field it collects", () => {
    for (const clause of [
      "if (filters.query && !text.includes(filters.query.toLowerCase())) return false;",
      "if (filters.subject && row.subject !== filters.subject) return false;",
      "if (filters.level && row.level !== filters.level) return false;",
      "if (filters.language && row.preferred_language !== filters.language) return false;",
      "if (filters.timezone && row.timezone !== filters.timezone) return false;",
      "if (filters.status && row.status !== filters.status) return false;",
    ]) {
      expect(ui, "each filter must narrow the list").toContain(clause);
    }
  });

  it("distinguishes 'filtered to nothing' from 'there is nothing'", () => {
    expect(ui).toContain("const filtering = Object.values(filters).some(Boolean);");
    expect(ui).toContain('message={state === "empty" ? (filtering ? t("requirementsExp.noMatch") : dashboard ? t("requirementsExp.noPublishedRequirements") : t("requirementsExp.notVisibleYet")) : resultError(query as never)}');
  });
});

describe("the learner's own screens read the learner's own list", () => {
  it("loads the requirement being edited from the owner's list, not a fixture or the public endpoint", () => {
    const edit = ui.slice(ui.indexOf("export function RequirementEditForm"), ui.indexOf("export function ResponseComparison"));
    expect(edit).toContain("trpc.supabaseCore.requirements.useQuery");
    expect(edit).not.toContain("publishedRequirementById");
    expect(edit).not.toContain("getRequirement(id)");
  });

  it("loads responses against the owner's own requirement, so a draft still works", () => {
    const compare = ui.slice(ui.indexOf("export function ResponseComparison"), ui.indexOf("export function TrialCTA"));
    expect(compare).toContain("trpc.supabaseCore.requirements.useQuery");
    expect(compare).toContain("trpc.supabaseCore.requirementResponses.useQuery");
    expect(compare).not.toContain("publishedRequirementById");
  });

  it("treats a requirement absent from the caller's own list as a refusal, not a fault", () => {
    expect(ui.match(/\? "forbidden" : /g)?.length).toBeGreaterThanOrEqual(2);
    expect(ui).toContain('t("requirementsExp.ownerChecks")');
  });
});

describe("deciding on a response is the learner's", () => {
  it("gives the learner the three decisions that had no caller at all", () => {
    expect(ui).toContain("trpc.supabaseCore.decideOnRequirementResponse.useMutation()");
    expect(ui).toContain('{(["shortlisted", "accepted", "rejected"] as const).map((status) => (');
    expect(routers).toContain('decideOnRequirementResponse: supabaseOnlyProcedure.input(z.object({ responseId: z.string().uuid(), status: z.enum(["shortlisted", "accepted", "rejected"]) })).mutation(({ ctx, input }) => setRequirementResponseDecision(ctx.supabaseIdentity, input)),');
  });

  it("confirms the caller owns the requirement before writing", () => {
    expect(core).toContain('.eq("learner_id", identity.id).maybeSingle();');
    expect(core).toContain('return { data: null, error: owned.error ?? { message: "Only the learner who posted this requirement can decide on a response" } };');
  });

  it("keeps withdrawal as the instructor's own act", () => {
    expect(core).toContain('.eq("id", input.responseId).eq("instructor_id", identity.id).select("*").single());');
    expect(ui).toContain('{response.status !== "withdrawn" && (');
  });

  it("stops an instructor accepting their own response, at the database", () => {
    expect(guard).toContain("if new.status is distinct from old.status then");
    expect(guard).toContain("if new.status = 'withdrawn' then");
    expect(guard).toContain("if auth.uid() is distinct from requirement_owner then");
    expect(guard).toContain("create trigger requirement_responses_decision_guard");
    expect(guard.toLowerCase()).not.toMatch(/\b(drop table|delete from|truncate|drop policy)\b/);
    // The policy it supplements is ownership-aware and column-blind, like 0015-0018.
    expect(rls).toContain("create policy requirement_responses_parties_update on public.requirement_responses for update using (instructor_id = auth.uid()");
  });
});

describe("the visibility blocker is reported, not disguised", () => {
  it("names the permission wherever a foreign requirement must be read", () => {
    expect(ui).toContain("function VisibilityBlocker()");
    expect(ui).toContain('<ResultState state="forbidden" message={t("requirementsExp.notVisibleYet")} />');
    // The two anonymous surfaces only: the public listing and the public detail page. 0020 opened
    // the instructor desk and the respond form, so a blocker there would now be wrong.
    expect(ui.match(/<VisibilityBlocker \/>/g)?.length).toBe(2);
  });

  it("leaves the original policy in place and adds a second, narrower one", () => {
    expect(rls).toContain("create policy learner_requirements_own_or_moderator on public.learner_requirements for select using (learner_id = auth.uid() or public.is_moderator_user());");
    // 0019 guards a column and creates no policy at all.
    expect(guard).not.toMatch(/create policy/);
    expect(guard).not.toMatch(/alter policy|drop policy/);
    // 0020 is additive: a second permissive SELECT policy, scoped to published rows and to
    // instructors. It alters no existing policy and opens nothing to anonymous readers.
    expect(opened).toContain("using (status = 'published' and public.is_user_role('instructor'));");
    expect(opened).not.toMatch(/alter policy|drop policy if exists learner_requirements_own/);
    expect(opened.toLowerCase()).not.toMatch(/\b(drop table|delete from|truncate)\b/);
  });

  it("reads the requirement as the instructor, not through the anonymous client", () => {
    const respond = ui.slice(ui.indexOf("export function InstructorResponse"));
    expect(respond).toContain("trpc.supabaseCore.publishedRequirements.useQuery");
    // getPublicPublishedRequirement runs on the anon client, which 0020 deliberately does not open.
    expect(respond).not.toContain("publishedRequirementById");
  });

  it("translates the explanation in all three locales", () => {
    expect(catalog.match(/"requirementsExp\.notVisibleYet":/g)?.length).toBe(3);
  });
});

describe("states, translation and direction", () => {
  it("derives every panel through the shared helper", () => {
    // Listing, detail, edit, comparison (requirement + responses), instructor desk, response form.
    expect(ui.match(/resultState\(/g)?.length).toBe(7);
    expect(ui.match(/resultRows</g)?.length).toBe(6);
  });

  it("offers retry wherever retrying can help, and shows pending on every write", () => {
    expect(ui.match(/onRetry=\{/g)?.length).toBe(7);
    // Create, edit-save, decide, respond — four writes, each with a spinner and aria-busy.
    expect(ui.match(/animate-spin/g)?.length).toBe(4);
    expect(ui.match(/aria-busy/g)?.length).toBe(4);
  });

  it("renders every status as words in all three locales", () => {
    for (const key of ["draft", "published", "matched", "closed", "cancelled", "pending", "shortlisted", "accepted", "rejected", "withdrawn"]) {
      expect(catalog.match(new RegExp(`"reqStatus\\.${key}":`, "g"))?.length, `reqStatus.${key} needs en/ur/ar`).toBe(3);
    }
  });

  it("uses logical spacing and mirrors directional icons", () => {
    expect(ui).not.toMatch(/\b(ml|mr|pl|pr)-\d/);
    expect(ui.match(/icon-directional/g)?.length).toBe(2);
  });
});
