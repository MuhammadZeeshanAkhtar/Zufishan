import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { VERIFICATION_STATUSES } from "./instructor-verification";
import { COURSE_REVIEW_DECISIONS } from "./course-review";

const verification = readFileSync(new URL("./instructor-verification.ts", import.meta.url), "utf8");
const courseReview = readFileSync(new URL("./course-review.ts", import.meta.url), "utf8");
const conversation = readFileSync(new URL("./conversation-start.ts", import.meta.url), "utf8");
const adminAuth = readFileSync(new URL("./supabase-admin-auth.ts", import.meta.url), "utf8");
const routers = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const guard = readFileSync(new URL("../supabase/migrations/0015_verification_is_admin_only.sql", import.meta.url), "utf8");
const rls = readFileSync(new URL("../supabase/migrations/0002_auth_and_rls.sql", import.meta.url), "utf8");

describe("verification is a reviewed decision, not a self-service one", () => {
  it("blocks self-approval at the database, not only in code", () => {
    // The row policy constrains WHO may update, not WHICH column, so an instructor holding their
    // own token could set verification_status = 'approved'. The trigger is the column-level rule.
    expect(guard).toContain("new.verification_status is distinct from old.verification_status");
    expect(guard).toContain("public.is_admin_user() or public.is_moderator_user()");
    expect(guard).toContain("before update on public.instructor_profiles");
    expect(guard).toContain("42501");
  });

  it("leaves the existing policy untouched — the trigger adds a constraint, it does not replace one", () => {
    expect(guard).not.toMatch(/create policy|alter policy|drop policy/i);
    expect(rls).toContain("create policy instructor_profiles_own_update on public.instructor_profiles");
  });

  it("keeps the service-role path open, because the reviewed procedure writes through it", () => {
    expect(guard).toContain("if auth.uid() is null then");
  });

  it("checks the caller's role before any write is attempted", () => {
    expect(verification).toContain("const roles = await readOwnRoles(identity);");
    expect(verification).toContain("if (!roles.isReviewer) return forbidden();");
  });

  it("does not let a reviewer decide their own application", () => {
    expect(verification).toContain("if (input.instructorId === identity.id) return forbidden();");
  });

  it("records every decision with its actor", () => {
    expect(verification).toContain('action: "instructor.verification.set"');
    expect(verification).toContain("actor_id: identity.id");
  });

  it("only accepts statuses the column constraint allows", () => {
    expect(VERIFICATION_STATUSES).toEqual(["verification_pending", "process_coming_soon", "approved", "rejected"]);
  });
});

describe("course publishing is reviewed, and needs no new database rule", () => {
  it("relies on the policy that already blocks an instructor publishing themselves", () => {
    // Unlike instructor_profiles, this policy is already column-aware, so no trigger was added.
    expect(rls).toContain("status <> 'published'");
    expect(courseReview).toContain("no additional trigger is needed and none is added");
  });

  it("decides only a course that is actually in review", () => {
    expect(courseReview).toContain('if (current !== "in_review")');
    // The write repeats the guard, so a concurrent decision cannot double-apply.
    expect(courseReview).toContain('.eq("status", "in_review"); // guards against a concurrent decision');
  });

  it("does not let a reviewer decide their own course", () => {
    expect(courseReview).toContain('if (String((course as { instructor_id: string }).instructor_id) === identity.id) return forbidden();');
  });

  it("offers only publish or reject as outcomes", () => {
    expect(COURSE_REVIEW_DECISIONS).toEqual(["published", "rejected"]);
  });
});

describe("conversations open only between people already connected", () => {
  it("does not weaken the restrictive insert policies", () => {
    expect(conversation).not.toMatch(/create policy|alter policy|drop policy/i);
    expect(conversation).toContain("the RLS policies are left exactly as they are");
  });

  it("requires a real relationship before a thread can exist", () => {
    // The four connection types moved into connection-eligibility.ts, which now
    // owns the rule for both the write and the screens — and, unlike the copy
    // that used to live here, it filters on status so a declined or cancelled
    // record no longer counts.
    const rule = readFileSync(new URL("./connection-eligibility.ts", import.meta.url), "utf8");
    for (const table of ["trial_requests", "bookings", "requirement_responses", "enrolments"]) {
      expect(rule, `${table} should count as a relationship`).toContain(table);
    }
    expect(conversation).toContain("if (!(await relationshipExists(admin, me, other)))");
  });

  it("is idempotent, so a pair never ends up with two threads", () => {
    expect(conversation).toContain("const existing = await findExistingThread(admin, me, other);");
    expect(conversation).toContain("return { ok: true, data: { conversationId: existing, created: false } };");
  });

  it("reuses only a two-party thread, never a group one", () => {
    expect(conversation).toContain("if (set.size === 2 && set.has(a) && set.has(b)) return id;");
  });

  it("never leaves a conversation with no members behind", () => {
    expect(conversation).toContain('await admin.from("conversations").delete().eq("id", conversationId);');
  });

  it("refuses a conversation with oneself", () => {
    expect(conversation).toContain('if (other === me) return { ok: false, error: "A conversation needs two different people.", code: "FORBIDDEN" };');
  });
});

describe("privileged roles are resolved server-side", () => {
  it("reads roles from user_roles on the admin client, not from the caller's claims", () => {
    expect(adminAuth).toContain('admin.from("user_roles").select("role").eq("user_id", identity.id)');
    expect(adminAuth).toContain('export const REVIEWER_ROLES = ["admin", "super_admin", "moderator"] as const;');
  });

  it("exposes the reviewed decisions through identity-bound procedures", () => {
    for (const proc of ["instructorQueue", "setInstructorVerification", "courseQueue", "setCourseDecision", "startConversation"]) {
      expect(routers, `${proc} must be registered`).toContain(`${proc}:`);
    }
    // Every one runs on the verified identity, never a client-supplied id.
    expect(routers).toContain("setInstructorVerification(ctx.supabaseIdentity, input)");
    expect(routers).toContain("setCourseReviewDecision(ctx.supabaseIdentity, input)");
    expect(routers).toContain("startConversation(ctx.supabaseIdentity, input)");
  });
});
