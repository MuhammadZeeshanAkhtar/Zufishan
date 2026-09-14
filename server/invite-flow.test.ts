import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const scheduling = readFileSync(new URL("../client/src/components/SchedulingExperience.tsx", import.meta.url), "utf8");
const routers = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const catalog = readFileSync(new URL("../client/src/i18n/catalog.ts", import.meta.url), "utf8");

describe("a teacher can answer an invite three ways, not two", () => {
  it("reaches the propose procedure that was already on the server", () => {
    expect(routers).toContain("proposeTime: supabaseOnlyProcedure");
    expect(scheduling).toContain("trpc.scheduling.proposeTime.useMutation()");
    // The placeholder that stood in for it is gone.
    expect(scheduling).not.toContain("Propose new time requires input");
  });

  it("sends a real instant and names the timezone it came from", () => {
    const propose = scheduling.slice(scheduling.indexOf("const propose = async ()"));
    expect(propose.slice(0, 1600)).toContain("start.toISOString()");
    expect(propose.slice(0, 1600)).toContain("Intl.DateTimeFormat().resolvedOptions().timeZone");
  });

  it("refuses a past or unparseable time before calling the server", () => {
    const propose = scheduling.slice(scheduling.indexOf("const propose = async ()"));
    expect(propose.slice(0, 1600)).toContain("Number.isNaN(start.getTime())");
    expect(propose.slice(0, 1600)).toContain("start <= new Date()");
  });

  it("moves the lesson without resizing it", () => {
    const propose = scheduling.slice(scheduling.indexOf("const propose = async ()"));
    // The learner's original duration is carried over rather than replaced with a default.
    expect(propose.slice(0, 1600)).toContain("requested_end_at");
    expect(propose.slice(0, 1600)).toContain("requested_start_at");
  });
});

describe("the invite is named as one", () => {
  it("uses invite wording in every locale", () => {
    expect(catalog).toContain('"tutorDetail.requestTrial": "Invite this teacher"');
    expect(catalog.match(/"tutorDetail\.requestTrial":/g)).toHaveLength(3);
    expect(catalog).not.toContain('"tutorDetail.requestTrial": "Request a trial"');
  });
});
