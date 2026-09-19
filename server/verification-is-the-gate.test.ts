/**
 * Verification is the gate. A profile goes live when a reviewer says so.
 *
 * 0035 briefly tried the opposite — publish first, verify after — and 0036 reversed it once the
 * reference marketplace's own policy was read: a tutor is evaluated "before their profile becomes
 * live". This file follows that reversal, and keeps the parts of 0035 that were never about the
 * gate and are still in force.
 *
 * Two things are load-bearing here:
 *
 *  1. The gate must hold in the DATABASE, not just in a procedure. The anon key and a session token
 *     are both in the browser, so an unapproved teacher who could be read directly would be visible
 *     however carefully the server queries were written.
 *  2. The mark must stay impossible to award to yourself, because it is now the gate itself.
 *
 * Everything else checks that the reversal is the reversal that was asked for and no more: a
 * teacher still publishes their own profile and their own courses, and the reviewer notification
 * still fires — which matters more here than it did, since an unreviewed teacher is never live.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../supabase/migrations/0035_publish_first_verify_after.sql", import.meta.url), "utf8");
const reversal = readFileSync(new URL("../supabase/migrations/0036_verification_is_the_gate_again.sql", import.meta.url), "utf8");
const reviewQueue = readFileSync(new URL("./review-queue.ts", import.meta.url), "utf8");
const core = readFileSync(new URL("./supabase-core.ts", import.meta.url), "utf8");
const scheduling = readFileSync(new URL("./scheduling.ts", import.meta.url), "utf8");
const routers = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const adminUi = readFileSync(new URL("../client/src/components/AdminCoursesExperience.tsx", import.meta.url), "utf8");
const courseUi = readFileSync(new URL("../client/src/components/CourseManagementExperience.tsx", import.meta.url), "utf8");
const catalog = readFileSync(new URL("../client/src/i18n/catalog.ts", import.meta.url), "utf8");

/** SQL with its `--` commentary removed: these migrations explain themselves at length. */
const sql = migration.replace(/--.*$/gm, " ");
const current = reversal.replace(/--.*$/gm, " ");
/** TypeScript with its comments removed, for the same reason. */
const codeOnly = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, " ");

describe("the mark cannot be awarded to yourself", () => {
  it("guards the course column with the same trigger the teacher's has", () => {
    expect(sql).toContain("create or replace function public.enforce_course_verification_is_admin_only()");
    expect(sql).toContain("if not (public.is_admin_user() or public.is_moderator_user()) then");
    expect(sql).toContain("raise exception 'Course verification is a reviewer decision.'");
    expect(sql).toContain("create trigger courses_verification_is_admin_only");
  });

  it("leaves the teacher's own verification guard exactly where it was", () => {
    // 0035 must not have relaxed 0014's guard on the way past.
    expect(sql).not.toContain("drop trigger if exists instructor_profiles_verification");
    expect(sql).not.toContain("enforce_verification_status_is_admin_only");
  });

  it("never lets a publish set a mark", () => {
    const publish = core.slice(core.indexOf("export async function publishOwnCourse"), core.indexOf("export async function unpublishOwnCourse"));
    expect(publish).toContain('status: "published"');
    expect(publish).not.toContain("verification_status");
  });

  it("checks the caller's role before recording a decision, and reads it from the roles table", () => {
    const fn = reviewQueue.slice(reviewQueue.indexOf("export async function setCourseVerification"));
    expect(fn).toContain('.from("user_roles").select("role").eq("user_id", identity.id).in("role", REVIEWER_ROLES)');
    expect(fn).toContain('return fail("Only a reviewer may verify a course.", "FORBIDDEN")');
    expect(reviewQueue).toContain('const REVIEWER_ROLES = ["admin", "super_admin", "moderator"];');
  });
});

describe("a reviewer is actually told", () => {
  it("raises a notice when a teacher publishes their profile", () => {
    // Publishing summons the reviewer — but only a publish that actually went up. A profile held
    // back for a missing required answer raises no notice, because there is nothing to review yet.
    expect(core).toContain('if (saved.ok && mayPublish) {');
    expect(core).toContain('kind: "instructor_profile",');
  });

  it("raises one when a course is published", () => {
    const publish = core.slice(core.indexOf("export async function publishOwnCourse"), core.indexOf("export async function unpublishOwnCourse"));
    expect(publish).toContain('notifyReviewersOfPublication({ kind: "course"');
  });

  it("writes the notice on the admin client, because nobody may forge one", () => {
    expect(reviewQueue).toContain("const admin = getSupabaseAdminClient();");
    expect(reviewQueue).toContain('.from("notifications").upsert(rows, {');
    expect(reviewQueue).toContain('onConflict: "user_id,idempotency_key"');
  });

  it("does not let a failed notice fail the publish", () => {
    // Publishing is the teacher's act; a queue that is down is not their problem.
    const fn = reviewQueue.slice(reviewQueue.indexOf("export async function notifyReviewersOfPublication"), reviewQueue.indexOf("export async function setCourseVerification"));
    expect(fn).toContain("return { notified: 0 };");
    expect(fn).toContain('console.error("[review-queue] notice failed:"');
  });

  it("does not repeat itself when a teacher republishes", () => {
    expect(reviewQueue).toContain("idempotency_key: `review-${input.kind}-${input.subjectId}`");
  });
});

describe("what the rule change actually changed", () => {
  it("lists a teacher only when they have published AND a reviewer has approved", () => {
    expect(current).toContain("(public_profile_status = 'published' and verification_status = 'approved')");
    // The procedures say what the policy says, so neither is the only thing holding the line.
    expect(codeOnly(scheduling)).toContain('.eq("verification_status", "approved")');
    expect(codeOnly(scheduling)).toContain('verification_status !== "approved"');
  });

  it("lists a course only through an approved teacher", () => {
    expect(current).toContain("(status = 'published' and public.is_approved_instructor(instructor_id))");
  });

  it("leaves publishing itself with the author", () => {
    // 0036 moved the gate, not the act: a teacher still says when their own work is ready.
    expect(current).not.toContain("enforce_course_status_is_a_reviewer_decision");
    expect(current).not.toContain("courses_instructor_insert");
  });

  it("keeps a draft private and the owner's own view intact", () => {
    // Both policies still carry the owner and admin branches; only the public branch moved.
    expect(current.match(/or public\.is_admin_user\(\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(current).toContain("or auth.uid() = user_id");
    expect(current).toContain("or instructor_id = auth.uid()");
  });

  it("gives publishing back to the author without giving away the rest", () => {
    // Draft, in_review and published are the author's; rejected and archived stay a reviewer's.
    expect(sql).toContain("new.instructor_id = auth.uid() and new.status in ('draft', 'in_review', 'published')");
    expect(sql).toContain("raise exception 'Only a reviewer may set that course status.'");
  });

  it("drops, renames and truncates nothing", () => {
    for (const source of [sql, current]) {
      for (const forbidden of ["drop table", "drop column", "truncate", "delete from", "rename"]) {
        expect(source.toLowerCase(), `migration must not ${forbidden}`).not.toContain(forbidden);
      }
    }
  });
});

describe("what a person sees", () => {
  it("offers the teacher publish and unpublish, and says the course is not yet verified", () => {
    expect(courseUi).toContain("trpc.supabaseCore.publishCourse.useMutation()");
    expect(courseUi).toContain('t("course.liveNotVerified")');
    expect(catalog).toContain("Live for students. An administrator has not verified it yet.");
  });

  it("puts the admin decision behind the same confirmation as every other admin write", () => {
    expect(adminUi).toContain('ask(detail.id, detail.title, detail.verificationStatus === "approved" ? "unverify" : "verify")');
    // Never straight from a click.
    expect(adminUi).not.toMatch(/onClick=\{[^}]*mutateAsync/);
  });

  it("names both procedures on the router, and validates the status it accepts", () => {
    expect(routers).toContain("publishCourse: supabaseOnlyProcedure");
    expect(routers).toContain("verifyCourse: supabaseOnlyProcedure");
    expect(routers).toContain("status: z.enum(COURSE_VERIFICATION_STATUSES)");
  });

  it("is written in all three languages", () => {
    for (const key of ["course.publish", "course.liveNotVerified", "adminUI.verifyCourse", "adminCourses.confirm.verify"]) {
      expect(catalog.match(new RegExp(`"${key.replace(/\./g, "\\.")}":`, "g")), key).toHaveLength(3);
    }
  });
});
