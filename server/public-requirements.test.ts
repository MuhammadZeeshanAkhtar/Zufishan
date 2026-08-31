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
    expect(listing).toContain("const publicRows");
    expect(listing).not.toContain("getPublicRequirements(filters)");
    expect(listing).toContain("publicRequirements.isError");
    const detail = component.slice(component.indexOf("export function RequirementDetail"), component.indexOf("export function RequirementForm"));
    expect(detail).toContain("trpc.schedulingPublic.publishedRequirementById.useQuery");
    expect(detail).not.toContain("getRequirement(id) || demoRequirements[0]");
    expect(detail).toContain("requirementsExp.notPublicRequirement");
  });
});
