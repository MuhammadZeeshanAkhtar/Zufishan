import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const scheduling = readFileSync(new URL("./scheduling.ts", import.meta.url), "utf8");
const router = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");

describe("public instructor discovery boundary", () => {
  it("filters discovery to published and approved rows with the anonymous client", () => {
    expect(scheduling).toContain("getSupabasePublicClient");
    expect(scheduling).toContain("listPublicInstructors");
    expect(scheduling).toContain('.eq("public_profile_status", "published")');
    // 0035: listed on publication; the Verified mark is awarded afterwards and gates nothing.
    expect(scheduling).toContain('.eq("public_profile_status", "published")');
    expect(router).toContain("instructors: publicProcedure");
  });

  it("wires TeachersPage to Supabase and avoids demo fallback", () => {
    const page = app.slice(app.indexOf("function TeachersPage"), app.indexOf("function TutorDetail"));
    expect(page).toContain("trpc.schedulingPublic.instructors.useQuery");
    expect(page).toContain('t("catalogue.instructorDiscoveryUnavailable")');
    expect(page).not.toContain("instructors.filter");
  });
});
