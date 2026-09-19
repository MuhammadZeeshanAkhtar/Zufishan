import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../supabase/migrations/0031_published_courses_require_an_approved_instructor.sql", import.meta.url), "utf8");
const canonical = readFileSync(new URL("../supabase/migrations/0001_noor_ilm_lms_canonical.sql", import.meta.url), "utf8");
const core = readFileSync(new URL("./supabase-core.ts", import.meta.url), "utf8");

/** Statements only, so an assertion cannot be satisfied by a comment. */
const statements = migration.replace(/--.*$/gm, "");

describe("a published course reaches learners on its own publication", () => {
  it("narrows the public branch of the policy and leaves the other two alone", () => {
    /*
     * 0031 required the course's teacher to be approved. 0035 replaced that branch on the owner's
     * decision: a published course is listed, and a reviewer's mark is recorded separately. The two
     * branches this test has always protected — the owner sees their drafts, an administrator sees
     * everything — are untouched, and are what the rest of this case checks.
     */
    const current = readFileSync(new URL("../supabase/migrations/0035_publish_first_verify_after.sql", import.meta.url), "utf8").replace(/--.*$/gm, "");
    expect(current).toContain("status = 'published'");
    expect(current).not.toContain("status = 'published' and public.is_approved_instructor(instructor_id)");
    expect(current).toContain("or instructor_id = auth.uid()");
    expect(current).toContain("or public.is_admin_user()");
    // The owner still sees their own drafts, and an administrator still sees everything.
    expect(statements).toContain("or instructor_id = auth.uid()");
    expect(statements).toContain("or public.is_admin_user()");
  });

  it("asks about verification and nothing else", () => {
    // instructor_profiles has its own RLS requiring the PUBLIC PROFILE to be published.
    // A subquery would therefore hide an approved instructor who had not published that
    // profile — two separate decisions. The definer function reads one column.
    expect(statements).toContain("security definer");
    expect(statements).toContain("ip.verification_status = 'approved'");
    expect(statements).not.toMatch(/public_profile_status/);
  });

  it("uses the vocabulary the schema already defines", () => {
    expect(canonical).toContain("verification_status in ('verification_pending','process_coming_soon','approved','rejected')");
    expect(canonical).toContain("status in ('draft','in_review','published','rejected','archived')");
  });

  it("adds no table, column or status value", () => {
    expect(statements).not.toMatch(/create table|add column|alter type|drop column/i);
  });
});

describe("multiple courses per instructor were always allowed", () => {
  it("has no unique constraint tying an instructor to one course", () => {
    const courses = canonical.slice(canonical.indexOf("create table public.courses"), canonical.indexOf("alter table public.trial_requests"));
    expect(courses).not.toMatch(/unique\s*\(\s*instructor_id\s*\)/);
    // The only uniqueness on a course row is its slug.
    expect(courses).toContain("slug text not null unique");
  });
});

describe("the reads that feed learners keep their published gate", () => {
  it("still filters on published, with RLS as the second gate", () => {
    for (const fn of ["listPublicPublishedCourses", "getPublicPublishedCourseById", "createEnrolment"]) {
      expect(core, `${fn} must exist`).toContain(`export async function ${fn}`);
    }
    // Enrolment refuses anything that is not published, and reads `courses` through the
    // caller's own client — so the policy decides whether the row is even visible.
    const enrol = core.slice(core.indexOf("export async function createEnrolment"));
    expect(enrol.slice(0, 800)).toContain('row.status !== "published"');
  });
});

describe("publishing is a reviewer's decision, enforced by the database", () => {
  const guard = readFileSync(new URL("../supabase/migrations/0032_course_publication_is_a_reviewer_decision.sql", import.meta.url), "utf8")
    .replace(/--.*$/gm, "");

  it("lets the owner submit and withdraw, and nothing else", () => {
    expect(guard).toContain("old.status in ('draft', 'rejected') and new.status = 'in_review'");
    expect(guard).toContain("old.status = 'in_review' and new.status = 'draft'");
    // No branch anywhere lets an owner reach published.
    expect(guard).not.toMatch(/new\.status = 'published'/);
  });

  it("reserves every other transition for a reviewer", () => {
    expect(guard).toContain("public.is_admin_user() or public.is_moderator_user()");
    expect(guard).toContain("errcode = '42501'");
    expect(guard).toContain("before update on public.courses");
  });

  it("restricts the status column only, so ordinary editing still works", () => {
    expect(guard).toContain("if new.status is distinct from old.status then");
  });

  it("does not let instructor verification stand in for course approval", () => {
    // 0031 asks whether the OWNER is approved; 0032 asks who changed the STATUS.
    // Neither consults the other, which is what keeps the two gates separate.
    expect(guard).not.toMatch(/verification_status|is_approved_instructor/);
  });

  it("matches the guard pattern the project already uses for decision columns", () => {
    for (const sibling of ["0015_verification_is_admin_only.sql", "0017_review_status_is_moderated.sql"]) {
      const existing = readFileSync(new URL(`../supabase/migrations/${sibling}`, import.meta.url), "utf8");
      expect(existing).toContain("security definer");
    }
    expect(guard).toContain("security definer");
    // The service role carries no auth.uid(); the admin procedures run there.
    expect(guard).toContain("if auth.uid() is null then");
  });
});

describe("submitting a course reaches the people who can decide it", () => {
  it("notifies every reviewer, once per course", () => {
    const submit = core.slice(core.indexOf("export async function submitOwnCourseForReview"));
    expect(submit.slice(0, 900)).toContain("notifyReviewersOfSubmission(courseId");
    const notify = core.slice(core.indexOf("async function notifyReviewersOfSubmission"));
    expect(notify.slice(0, 1200)).toContain('.in("role", ["admin", "super_admin", "moderator"])');
    // Keyed on the course, so pressing Publish twice does not notify twice.
    expect(notify.slice(0, 1200)).toContain("`course-review-${courseId}`");
  });

  it("submits only the owner's own course, and only from an editable state", () => {
    const submit = core.slice(core.indexOf("export async function submitOwnCourseForReview"));
    expect(submit.slice(0, 900)).toContain('.eq("instructor_id", identity.id)');
    expect(submit.slice(0, 900)).toContain('.in("status", ["draft", "rejected"])');
    expect(submit.slice(0, 900)).toContain('status: "in_review"');
    // Submission never writes `published`; only a reviewer's decision can.
    expect(submit.slice(0, 900)).not.toContain('status: "published"');
  });

  it("leaves the admin decision to the admin procedure, which is admin-gated", () => {
    const adminCourses = readFileSync(new URL("./admin-courses.ts", import.meta.url), "utf8");
    expect(adminCourses).toContain('export const COURSE_ACTIONS = ["publish", "reject", "request_changes", "unpublish", "restore"] as const;');
    const decide = adminCourses.slice(adminCourses.indexOf("export async function decideCourse"));
    expect(decide.slice(0, 600)).toMatch(/requireAdmin/);
  });
});

describe("a draft belongs to its author, not to the review desk", () => {
  const adminCourses = readFileSync(new URL("./admin-courses.ts", import.meta.url), "utf8");
  const builder = readFileSync(new URL("../client/src/components/CourseManagementExperience.tsx", import.meta.url), "utf8");

  it("never lists a draft on the admin desk, whatever filter is asked for", () => {
    expect(adminCourses).toContain('export const REVIEWABLE_COURSE_STATUSES = ["in_review", "published", "rejected", "archived"] as const;');
    expect(adminCourses).toContain("query = query.in(\"status\", [...REVIEWABLE_COURSE_STATUSES]);");
    // "all" is all of the REVIEWABLE statuses, so it cannot reintroduce drafts.
    expect(adminCourses).toContain('export const COURSE_FILTERS = ["all", ...REVIEWABLE_COURSE_STATUSES] as const;');
  });

  it("refuses a decision on a draft even when called directly", () => {
    const decide = adminCourses.slice(adminCourses.indexOf("export async function decideCourse"));
    expect(decide.slice(0, 1400)).toContain('=== "draft"');
    expect(decide.slice(0, 1400)).toContain("has not been submitted for review yet");
  });

  it("gives the instructor the Publish action, and says what it really does", () => {
    /*
     * Migration 0035 moved publication back to the author, so the button publishes rather than
     * submitting. What the assertion is for is unchanged: the control must not overstate itself.
     * It now has to say the opposite true thing — the course is live, and not yet verified.
     */
    expect(builder).toContain("function CoursePublishAction(");
    expect(builder).toContain("trpc.supabaseCore.publishCourse.useMutation()");
    expect(builder).toContain("trpc.supabaseCore.unpublishCourse.useMutation()");
    // The notice is chosen by the action taken, so both keys are asserted where they are written.
    expect(builder).toContain('"course.publishedNotice"');
    expect(builder).toContain('"course.unpublishedNotice"');
    expect(builder).toContain('t("course.liveNotVerified")');
    // And the mark it cannot award itself is read, never written, here.
    expect(builder).toContain('course.verification_status === "approved"');
    expect(builder).not.toMatch(/verification_status:\s*["']/);
  });

  it("shows the instructor no technical database wording", () => {
    expect(builder).not.toMatch(/Draft saved to Supabase|review-gated/);
  });
});

describe("an approved course reaches the learner's own Courses module", () => {
  const builder = readFileSync(new URL("../client/src/components/CourseManagementExperience.tsx", import.meta.url), "utf8");

  it("lists the published catalogue there, not only the learner's enrolments", () => {
    expect(builder).toContain("function AvailableCourses(");
    expect(builder).toContain("<AvailableCourses enrolledIds=");
    // The learner module used to read learnerWorkspace alone, which is enrolments only.
    expect(builder).toContain("trpc.supabaseCore.learnerWorkspace.useQuery");
  });

  it("reuses the existing procedure rather than adding a second listing", () => {
    const section = builder.slice(builder.indexOf("function AvailableCourses("));
    expect(section.slice(0, 1600)).toContain("trpc.schedulingPublic.publishedCourses.useQuery");
    // No status or eligibility filtering in the browser: the policy already decided.
    expect(section.slice(0, 2600)).not.toMatch(/status === "published"|verification_status/);
  });

  it("removes only what the learner already holds", () => {
    const section = builder.slice(builder.indexOf("function AvailableCourses("));
    expect(section.slice(0, 1600)).toContain("!enrolledIds.has(course.id)");
  });
});
