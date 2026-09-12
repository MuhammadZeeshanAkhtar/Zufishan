import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isSafeInternalReturn } from "../client/src/lib/auth-models";

const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const courses = readFileSync(new URL("../client/src/components/CourseManagementExperience.tsx", import.meta.url), "utf8");
const core = readFileSync(new URL("./supabase-core.ts", import.meta.url), "utf8");
const routers = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const rls = readFileSync(new URL("../supabase/migrations/0002_auth_and_rls.sql", import.meta.url), "utf8");

/**
 * The journey is discovery → detail → enrolment → module → lesson → progress. Each step must be
 * reachable from the one before it, and served by a real procedure rather than a fixture.
 */
describe("every step of the journey is wired to a real procedure", () => {
  it("discovery and detail read the public course procedures", () => {
    expect(app).toContain("trpc.schedulingPublic.publishedCourses.useQuery");
    expect(app).toContain("trpc.schedulingPublic.courseBySlug.useQuery");
    expect(routers).toContain("publishedCourses: publicProcedure");
    expect(routers).toContain("courseBySlug: publicProcedure");
  });

  it("enrolment, the workspace and progress read the authenticated procedures", () => {
    expect(courses).toContain("trpc.supabaseCore.createEnrolment.useMutation");
    expect(courses).toContain("trpc.supabaseCore.learnerWorkspace.useQuery");
    expect(courses).toContain("trpc.supabaseCore.updateProgress.useMutation");
  });

  it("serves discovery from published rows only", () => {
    const discovery = core.slice(core.indexOf("export async function listPublicPublishedCourses"), core.indexOf("export async function getPublicPublishedCourse"));
    expect(discovery).toContain('.eq("status", "published")');
    expect(discovery).toContain("getSupabasePublicClient()");
  });

  it("builds the workspace from the caller's own enrolments", () => {
    const workspace = core.slice(core.indexOf("export async function getLearnerWorkspace"), core.indexOf("export async function listHifzPlans"));
    expect(workspace).toContain('.eq("learner_id", identity.id)');
    expect(workspace).toContain('.in("status", ["active", "completed"])');
    // A course that has been unpublished should stop appearing in the workspace.
    expect(workspace).toContain('.eq("status", "published")');
  });

  it("clamps progress rather than trusting the number sent", () => {
    expect(core).toContain("const progress = Math.max(0, Math.min(100, Math.round(input.progressPercent)));");
    expect(core).toContain('const status = input.completed ? "completed" : progress > 0 ? "in_progress" : "not_started";');
  });
});

describe("each step is reachable from the one before it", () => {
  it("the public course detail leads to enrolment, not to a dead end", () => {
    // It used to link to /login unconditionally, so a signed-in learner was bounced away from the
    // course they were trying to join.
    expect(app).toContain("<Button href={isAuthenticated ? `/enrol/${course.id}` : `/login?returnTo=${encodeURIComponent(`/enrol/${course.id}`)}`}>");
    expect(app).not.toContain('<Button href="/login">{t("courseDetail.enrol")}');
  });

  it("login carries the visitor onward instead of dropping them on a dashboard", () => {
    expect(app).toContain("setLocation(returnTo || result.next);");
  });

  it("enrolling lands the learner in the course workspace", () => {
    expect(courses).toContain("setLocation(`/dashboard/learner/courses/${course.id}`)");
  });

  it("the workspace links into individual lessons", () => {
    expect(courses).toContain("href={`/dashboard/learner/lessons/${lesson.id}`}");
  });

  it("routes exist for every hop", () => {
    for (const route of [
      // `/courses` renders through CoursesRoute, which only reads the `subject` query
      // parameter and hands it to CoursesPage. The hop is the same; it just carries an
      // opening filter now, so the Our Courses menu can link to a published subject.
      '<Route path="/courses">',
      'return <CoursesPage key={subject} initialSubject={subject}/>;',
      '<Route path="/courses/:slug">',
      '<Route path="/enrol/:courseId">',
      '<Route path="/dashboard/learner/courses/:courseId">',
      '<Route path="/dashboard/learner/lessons/:lessonId">',
    ]) {
      expect(app, `${route} must exist`).toContain(route);
    }
  });
});

describe("the redirect that carries a visitor through login cannot be turned outward", () => {
  // The helper sanitises rather than validates: it returns the path when it is safe to follow,
  // and null when it is not, so a caller cannot accidentally use a rejected value.
  it("returns an internal path unchanged", () => {
    expect(isSafeInternalReturn("/enrol/abc")).toBe("/enrol/abc");
    expect(isSafeInternalReturn("/dashboard/learner/courses")).toBe("/dashboard/learner/courses");
  });

  it("returns null for anything that would leave the site", () => {
    for (const value of ["//evil.example", "https://evil.example", "http://evil.example", "javascript:alert(1)", "evil.example", "", null, undefined]) {
      expect(isSafeInternalReturn(value as string | null | undefined), `${String(value)} must be refused`).toBeNull();
    }
  });
});

describe("the access rules the journey depends on", () => {
  it("shows a published course to anyone, and a draft only to its owner", () => {
    expect(rls).toContain("create policy courses_published_or_owner on public.courses for select using (status = 'published' or instructor_id = auth.uid() or public.is_admin_user());");
  });

  it("opens a non-preview lesson only to an enrolled learner", () => {
    const policy = rls.slice(rls.indexOf("create policy lessons_public_preview_or_enrolled"));
    expect(policy).toContain("public.lessons.is_preview");
    expect(policy).toContain("e.learner_id = auth.uid() and e.status in ('active','completed')");
  });

  it("lets a learner enrol only themselves, and record only their own progress", () => {
    expect(rls).toContain("create policy enrolments_learner_insert on public.enrolments for insert with check (learner_id = auth.uid());");
    expect(rls).toContain("create policy lesson_progress_own_write on public.lesson_progress for all using (learner_id = auth.uid()) with check (learner_id = auth.uid());");
  });

  it("keeps publishing out of an instructor's own hands", () => {
    // This is the blocker Task 11 reports: an instructor may submit, but not publish.
    const policy = rls.slice(rls.indexOf("create policy courses_instructor_update"));
    expect(policy).toContain("status <> 'published'");
    expect(core).toContain("export async function submitOwnCourseForReview");
  });
});
