import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { summarizeHifzProgress } from "./hifz-progress-utils";

const migration = readFileSync(new URL("../supabase/migrations/0010_hifz_progress_and_reviews.sql", import.meta.url), "utf8");
const reviewPolicy = readFileSync(new URL("../supabase/migrations/0011_hifz_review_assignment_policies.sql", import.meta.url), "utf8");
const core = readFileSync(new URL("./supabase-core.ts", import.meta.url), "utf8");
const router = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const ui = readFileSync(new URL("../client/src/components/HifzTrackerExperience.tsx", import.meta.url), "utf8");

 describe("Hifz progress persistence contract", () => {
  it("uses additive tables and preserves existing data", () => {
    expect(migration).toContain("create table if not exists public.hifz_records");
    expect(migration).toContain("create table if not exists public.hifz_reminders");
    expect(migration).not.toMatch(/^\s*(drop table|delete from)\b/im);
    expect(migration).toContain("unique (plan_id, record_date, section_type)");
    expect(migration).toContain("unique (learner_id, idempotency_key)");
  });
  it("enables RLS and keeps learner and instructor boundaries explicit", () => {
    expect(migration).toContain("alter table public.hifz_records enable row level security");
    expect(migration).toContain("learner_id = auth.uid()");
    expect(migration).toContain("instructor_id = auth.uid()");
    expect(reviewPolicy).toContain("r.instructor_id = auth.uid()");
    expect(reviewPolicy).toContain("reviewed_by = auth.uid()");
  });
  it("exposes validated protected procedures for the requested lifecycle", () => {
    for (const name of ["createAdvancedHifzPlan", "updateAdvancedHifzPlan", "createHifzRecord", "updateOwnDraftHifzRecord", "submitHifzRecordForReview", "listAssignedLearnerHifzRecords", "listAssignedHifzReviews", "reviewHifzRecord", "calculateHifzProgress", "createHifzReminder", "listHifzReminders"]) expect(core).toContain(`export async function ${name}`);
    expect(router).toContain("advancedHifzPlans");
    expect(router).toContain("assignedHifzRecords");
    expect(router).toContain("assignedHifzReviews");
    expect(router).toContain("reviewHifzRecord");
    expect(router).toContain("hifzProgress");
  });
  it("connects assigned instructor review controls without widening the Quran-content boundary", () => {
    expect(ui).toContain("assignedHifzReviews");
    expect(ui).toContain("reviewHifzRecord");
    expect(ui).toContain("hifz.feedbackPlaceholder");
    expect(ui).toContain("hifz.requestRevision");
  });
  it("does not add Quran text or fake local persistence", () => {
    expect(ui).toContain("hifz.setupNeeded");
    expect(ui).not.toMatch(/localStorage|fake|demo.*progress/i);
    expect(core).toContain("onConflict: \"learner_id,idempotency_key\"");
  });
});

describe("Hifz progress summaries", () => {
  it("calculates completion, rolling activity, and a current-day streak from persisted records only", () => {
    const summary = summarizeHifzProgress([
      { section_type: "sabaq", status: "approved", practice_minutes: 20, record_date: "2026-08-27" },
      { section_type: "sabqi", status: "reviewed", practice_minutes: 10, record_date: "2026-08-26" },
      { section_type: "manzil", status: "planned", practice_minutes: 0, record_date: "2026-08-25" },
    ], new Date("2026-08-27T12:00:00Z"));
    expect(summary.completionPercentage).toBe(67);
    expect(summary.streakDays).toBe(2);
    expect(summary.weeklyActivity).toBe(3);
    expect(summary.monthlyActivity).toBe(3);
    expect(summary.practiceMinutes).toBe(30);
    expect(summary.sabaqCompleted).toBe(1);
    expect(summary.sabqiCompleted).toBe(1);
    expect(summary.manzilCompleted).toBe(0);
  });

  it("does not count planned records as completed or start a fabricated streak", () => {
    const summary = summarizeHifzProgress([{ section_type: "sabaq", status: "planned", practice_minutes: 0, record_date: "2026-08-27" }], new Date("2026-08-27T12:00:00Z"));
    expect(summary.completionPercentage).toBe(0);
    expect(summary.streakDays).toBe(0);
    expect(summary.weeklyActivity).toBe(1);
    expect(summary.practiceMinutes).toBe(0);
  });
});
