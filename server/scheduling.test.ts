import { describe, expect, it } from "vitest";
import { atomicallyConfirmTrial } from "./scheduling-atomic";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("real scheduling persistence boundaries", () => {
  const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/0008_scheduling_persistence.sql"), "utf8");
  const noticeMigration = readFileSync(resolve(process.cwd(), "supabase/migrations/0012_scheduling_notice_buffer.sql"), "utf8");
  const schedulingUi = readFileSync(resolve(process.cwd(), "client/src/components/SchedulingExperience.tsx"), "utf8");

  it("uses additive scheduling migration without destructive data statements", () => {
    expect(migration.toLowerCase()).not.toMatch(/\b(drop table|delete from|truncate)\b/);
    expect(migration).toContain("create table if not exists public.bookings");
    expect(migration).toContain("create extension if not exists btree_gist");
  });

  it("declares learner and instructor exclusion constraints for confirmed time ranges", () => {
    expect(migration).toContain("bookings_instructor_slot_excl");
    expect(migration).toContain("bookings_learner_slot_excl");
    expect(migration).toContain("class_sessions_instructor_slot_excl");
    expect(migration).toContain("class_sessions_learner_slot_excl");
    expect(migration).toContain("tstzrange(scheduled_start_at, scheduled_end_at, '[)') with &&");
  });

  it("declares recipient-scoped notification idempotency and trial retry keys", () => {
    expect(migration).toContain("notifications_recipient_idempotency_idx");
    expect(migration).toContain("trial_requests_learner_idempotency_idx");
    expect(migration).toContain("unique(idempotency_key)");
  });

  it("adds notice and buffer controls without destructive scheduling statements", () => {
    expect(noticeMigration).toContain("buffer_minutes");
    expect(noticeMigration).toContain("minimum_notice_minutes");
    expect(noticeMigration.toLowerCase()).not.toMatch(/\b(drop table|delete from|truncate)\b/);
  });

  it("does not fall back to demo sessions or notification fixtures in active scheduling pages", () => {
    expect(schedulingUi).not.toContain("demoSessions");
    expect(schedulingUi).not.toContain("getNotifications");
    expect(schedulingUi).toContain("trpc.scheduling.availableSlots");
    // Bookings come from the query envelope, never a fixture. This used to check for the
    // `safeBookings` local; `resultRows` replaced it and is a stronger guarantee, because it
    // returns rows only from a successful envelope instead of coalescing a failure to [].
    expect(schedulingUi).toContain("resultRows<");
    expect(schedulingUi).toContain("trpc.scheduling.learnerBookings.useQuery");
  });

  it("does not attempt an atomic booking when the server database boundary is unavailable", async () => {
    const previous = process.env.SUPABASE_DB_URL;
    delete process.env.SUPABASE_DB_URL;
    const result = await atomicallyConfirmTrial({ id: "learner", accessToken: "redacted" } as never, "00000000-0000-0000-0000-000000000000", "learner");
    expect(result).toEqual({ ok: false, error: "Scheduling persistence is not configured.", code: "SETUP_NEEDED" });
    if (previous) process.env.SUPABASE_DB_URL = previous;
  });
});
