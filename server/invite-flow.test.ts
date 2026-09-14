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

describe("each side sees what is waiting on them", () => {
  it("splits the list by who must act next, not by status alone", () => {
    // A trial the learner just sent is the instructor's to answer; a time the instructor
    // proposed is the learner's to confirm. The two sides are deliberately different.
    expect(scheduling).toContain('const awaitingStatuses = instructor ? ["pending", "requested"] : ["proposed", "proposed_new_time"];');
    expect(scheduling).toContain("const awaiting = items.filter");
    expect(scheduling).toContain("const settled = items.filter");
    // Waiting items lead the list rather than being scattered through it.
    expect(scheduling).toContain("[...awaiting, ...settled].map");
  });

  it("counts them where the teacher will see it", () => {
    expect(scheduling).toContain("waiting for your answer");
    expect(scheduling).toContain("waiting for you to confirm");
  });

  it("says what accepting did, and offers the thread it opened", () => {
    expect(scheduling).toContain("Invite accepted. The lesson is booked, and your message thread with this learner is now open.");
    expect(scheduling).toContain('feedback.startsWith("Invite accepted")');
    // The old wording described the server's internals to a teacher.
    expect(scheduling).not.toContain("the server created the next scheduling state");
  });
});
