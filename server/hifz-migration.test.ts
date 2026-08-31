import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../supabase/migrations/0009_hifz_tracker.sql", import.meta.url), "utf8");

describe("Hifz tracker migration review", () => {
  it("defines learner-owned plans and Sabaq/Sabqi/Manzil reviews", () => {
    expect(migration).toContain("create table if not exists public.hifz_plans");
    expect(migration).toContain("create table if not exists public.hifz_reviews");
    expect(migration).toContain("review_type text not null check (review_type in ('sabaq','sabqi','manzil'))");
  });

  it("adds ownership RLS and useful learner/plan indexes", () => {
    expect(migration).toContain("alter table public.hifz_plans enable row level security");
    expect(migration).toContain("alter table public.hifz_reviews enable row level security");
    expect(migration).toContain("hifz_plans_learner_updated_idx");
    expect(migration).toContain("hifz_reviews_plan_type_idx");
    expect(migration).toContain("learner_id = auth.uid()");
  });

  it("is additive and contains no destructive data operation", () => {
    expect(migration).not.toMatch(/\b(drop|delete)\s+(table|from)\b/i);
    expect(migration).not.toMatch(/truncate\s+table/i);
  });
});
