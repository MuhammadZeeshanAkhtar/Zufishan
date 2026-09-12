import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const core = readFileSync(new URL("./supabase-core.ts", import.meta.url), "utf8");
const router = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const component = readFileSync(new URL("../client/src/components/RequirementsExperience.tsx", import.meta.url), "utf8");

describe("public requirements discovery boundary", () => {
  it("uses the anonymous client, published status, and public field allowlist", () => {
    expect(core).toContain("listPublicPublishedRequirements");
    expect(core).toContain("getSupabasePublicClient");
    expect(core).toContain(".eq(\"status\", \"published\")");
    expect(core).toContain("preferred_language, timezone, availability");
    expect(router).toContain("publishedRequirements: publicProcedure");
  });

  it("wires public RequirementListing and RequirementDetail to Supabase without demo fallback", () => {
    const listing = component.slice(component.indexOf("export function RequirementListing"), component.indexOf("export function RequirementDetail"));
    expect(listing).toContain("trpc.schedulingPublic.publishedRequirements.useQuery");
    expect(listing).not.toContain("getPublicRequirements(filters)");
    // `const publicRows` and a bare `isError` check were the old shape. `resultRows` is stronger —
    // it yields rows only from a successful envelope instead of coalescing a failure to [] — and
    // `resultState` catches a handled `ok: false`, which `isError` never sees.
    expect(listing).toContain("resultRows<RequirementRow>(query as never)");
    expect(listing).toContain("const base = resultState(query as never, online);");

    const detail = component.slice(component.indexOf("export function RequirementDetail"), component.indexOf("export function RequirementForm"));
    expect(detail).toContain("trpc.schedulingPublic.publishedRequirementById.useQuery");
    expect(detail).not.toContain("getRequirement(id) || demoRequirements[0]");
    // The old copy said "not a public requirement", which blames the record. No policy grants read
    // access to a published requirement at all, so the honest message names the permission.
    expect(detail).toContain("<VisibilityBlocker />");
    expect(component).toContain('t("requirementsExp.notVisibleYet")');
  });
});
