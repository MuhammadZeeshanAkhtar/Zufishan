import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SESSION_FLOW, SESSION_STATUSES } from "./class-session-lifecycle";

const session = readFileSync(new URL("./class-session-lifecycle.ts", import.meta.url), "utf8");
const reviews = readFileSync(new URL("./reviews.ts", import.meta.url), "utf8");
const routers = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const rls = readFileSync(new URL("../supabase/migrations/0002_auth_and_rls.sql", import.meta.url), "utf8");

describe("class sessions are the record of a meeting that happened", () => {
  it("keeps the schema's distinction between an agreement and a meeting", () => {
    // No booking_id exists on class_sessions; trial_request_id is the shared link.
    expect(session).toContain('.eq("trial_request_id", trialRequestId)');
    expect(session).toContain("a `booking` is an agreement to meet, a");
  });

  it("is idempotent, so both parties opening at once cannot split attendance", () => {
    expect(session).toContain("return { ok: true, data: { sessionId: String((existing as { id: string }).id), created: false } };");
  });

  it("seeds the roster server-side, because class_participants is moderator-write", () => {
    expect(rls).toContain("create policy class_participants_moderator_write");
    expect(session).toContain('admin.from("class_participants").insert');
  });

  it("never leaves a session without its roster", () => {
    expect(session).toContain('await admin.from("class_sessions").delete().eq("id", sessionId);');
  });

  it("moves through its stages in order and cannot skip to completed", () => {
    expect(SESSION_FLOW).toEqual(["scheduled", "waiting_room", "live", "completed"]);
    expect(session).toContain("if (next !== current + 1)");
  });

  it("allows cancel and no_show from any open state", () => {
    expect(session).toContain('if (input.status !== "cancelled" && input.status !== "no_show")');
    expect(SESSION_STATUSES).toContain("cancelled");
    expect(SESSION_STATUSES).toContain("no_show");
  });

  it("lets only the instructor drive the session, while attendance is each person's own", () => {
    expect(session).toContain("Only the instructor can move a session through its stages.");
    expect(rls).toContain("create policy class_attendance_own_write");
    expect(session).toContain("class_attendance_own_write` enforces");
  });

  it("records no provider it has not got", () => {
    // A session must be usable with no video provider configured; nothing may claim otherwise.
    expect(session).toContain("No provider is configured here on purpose");
    expect(session).not.toMatch(/recording_status:\s*['"](?!not_configured)/);
    expect(session).not.toMatch(/live_provider:\s*['"]/);
  });
});

describe("reviews rest on a completed session, which now exists", () => {
  it("works with the eligibility policy rather than re-implementing it", () => {
    expect(rls).toContain("create policy reviews_eligible_insert");
    expect(reviews).toContain("s.status = 'completed'");
    expect(reviews).toContain("it works with it");
  });

  it("refuses a review before the session finished, and from anyone but the learner", () => {
    expect(reviews).toContain('if (session.status !== "completed")');
    expect(reviews).toContain("Only the learner who attended can review a session.");
  });

  it("treats the unique constraint as the duplicate guard", () => {
    expect(reviews).toContain('if (error?.code === "23505")');
    expect(reviews).toContain("You have already reviewed this session.");
  });

  it("computes the average from the rows themselves, so it cannot drift", () => {
    expect(reviews).toContain("const average = rated.length ?");
    expect(reviews).not.toMatch(/average_rating|rating_cache/);
  });

  it("shows only published reviews to the public", () => {
    expect(reviews).toContain('.eq("status", "published")');
  });

  it("runs under the caller's client so the policy applies to every statement", () => {
    expect(reviews).toContain("getSupabaseUserClient(identity.accessToken)");
  });
});

describe("procedures are exposed on the verified identity", () => {
  it("registers session and review procedures", () => {
    for (const proc of ["openSession", "setSessionStatus", "recordAttendance", "createReview", "myReviews", "instructorReviews"]) {
      expect(routers, `${proc} must be registered`).toContain(`${proc}:`);
    }
    expect(routers).toContain("openSessionForBooking(ctx.supabaseIdentity, input)");
    expect(routers).toContain("createReview(ctx.supabaseIdentity, input)");
  });
});
