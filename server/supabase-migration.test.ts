import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../supabase/migrations/0001_noor_ilm_lms_canonical.sql", import.meta.url), "utf8");
const requiredTables = [
  "profiles", "user_roles", "learner_profiles", "instructor_profiles", "instructor_credentials", "instructor_media",
  "learner_requirements", "requirement_responses", "learner_shortlists", "instructor_availability", "trial_requests",
  "class_sessions", "class_participants", "class_attendance", "courses", "course_modules", "lessons", "enrolments",
  "lesson_progress", "assignments", "submissions", "quizzes", "quiz_attempts", "certificates", "conversations",
  "conversation_members", "messages", "notifications", "notification_preferences", "reviews", "review_reports", "reports",
  "session_ledger", "payment_references", "withdrawal_requests", "moderation_cases", "moderation_actions", "audit_logs", "admin_settings",
];

describe("canonical Supabase migration review", () => {
  it("contains every approved LMS table exactly once", () => {
    for (const table of requiredTables) {
      expect(migration.match(new RegExp(`create table public\\.${table}\\b`, "g"))?.length).toBe(1);
    }
  });

  it("does not introduce unrelated religious or marketplace modules", () => {
    expect(migration).not.toMatch(/prayer|qibla|hijri|dua|azkar|tasbih|zakat|fatwa|community|donation|religious_ai|marketplace/i);
  });

  it("is explicitly review-only and not an applied-migration claim", () => {
    expect(migration).toContain("REVIEW ONLY: not applied");
    expect(migration).toContain("Fails fast on duplicates");
  });
});
