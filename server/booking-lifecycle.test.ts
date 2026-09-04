import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BOOKING_OUTCOMES } from "./booking-lifecycle";

const lifecycle = readFileSync(new URL("./booking-lifecycle.ts", import.meta.url), "utf8");
const routers = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const scheduling = readFileSync(new URL("../supabase/migrations/0008_scheduling_persistence.sql", import.meta.url), "utf8");

describe("booking lifecycle completes the states the column already allowed", () => {
  it("adds the three transitions that were missing", () => {
    for (const fn of ["rescheduleBooking", "cancelBooking", "completeBooking"]) {
      expect(lifecycle, `${fn} must exist`).toContain(`export async function ${fn}`);
      expect(routers, `${fn} must be exposed`).toContain(fn);
    }
  });

  it("records outcomes the status constraint permits", () => {
    expect(BOOKING_OUTCOMES).toEqual(["completed", "no_show"]);
  });
});

describe("overlap is settled by the database, not by a pre-check", () => {
  it("leaves the GiST exclusion constraints as the authority", () => {
    expect(scheduling).toContain("bookings_instructor_slot_excl");
    expect(scheduling).toContain("bookings_learner_slot_excl");
    // Checking first and trusting the check would be a race between check and write.
    expect(lifecycle).toContain('const isOverlap = (error: { code?: string } | null) => error?.code === "23P01";');
  });

  it("translates a constraint violation into a readable conflict", () => {
    expect(lifecycle).toContain('return { ok: false, error: "That time overlaps another booking for one of you.", code: "CONFLICT" };');
  });
});

describe("each transition guards its own preconditions", () => {
  it("moves only a confirmed booking, and never into the past", () => {
    expect(lifecycle).toContain('if (start.getTime() < Date.now())');
    expect(lifecycle).toContain('if (end <= start)');
    expect(lifecycle).toMatch(/Only a confirmed booking can be moved/);
  });

  it("repeats the status guard on every write so a concurrent change cannot be clobbered", () => {
    expect(lifecycle.match(/\.eq\("status", "confirmed"\)/g)?.length).toBe(3);
  });

  it("lets only a party act, and only the instructor close a session out", () => {
    expect(lifecycle).toMatch(/Only the learner or instructor on a booking can move it/);
    expect(lifecycle).toMatch(/Only the learner or instructor on a booking can cancel it/);
    expect(lifecycle).toContain("if (booking.instructor_id !== identity.id) {");
  });

  it("refuses to close a session that has not finished", () => {
    expect(lifecycle).toContain("if (new Date(booking.scheduled_end_at).getTime() > Date.now())");
  });

  it("requires a reason to cancel", () => {
    expect(lifecycle).toContain("A cancellation reason is required.");
  });
});

describe("permissions stay with RLS", () => {
  it("runs on the caller's client, so the row policy is in force for every statement", () => {
    expect(lifecycle).toContain("getSupabaseUserClient(identity.accessToken)");
    expect(lifecycle).not.toContain("getSupabaseAdminClient");
    expect(scheduling).toContain("create policy bookings_parties_update on public.bookings");
  });

  it("keeps closed-out sessions inside the active set, so history stays protected", () => {
    expect(lifecycle).toContain('const ACTIVE = ["confirmed", "completed", "no_show", "disputed"] as const;');
  });
});
