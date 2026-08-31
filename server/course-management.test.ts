import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  calculateCourseProgress,
  completeLesson,
  enrollInCourse,
  getPublishedCourseBySlug,
  getCertificateStatus,
  isLessonAccessible,
  prepareLessonMediaUpload,
  prepareThumbnailUpload,
  startLesson,
  submitCourseForReview,
} from "../client/src/lib/course-management-data";

describe("Prompt 9 course management boundaries", () => {
  it("exposes only published course records to public discovery", () => {
    expect(getPublishedCourseBySlug("tajweed-foundations")?.status).toBe("published");
    expect(getPublishedCourseBySlug("arabic-reading-circle")).toBeUndefined();
  });

  it("prevents instructors from directly publishing a published course", () => {
    const result = submitCourseForReview("course-tajweed-foundations");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Only drafts or rejected courses");
  });

  it("prevents paid enrolment from pretending that payment completed", () => {
    const result = enrollInCourse("prompt9-paid-learner", "course-arabic-reading");
    expect(result.ok).toBe(false);
    expect(result.paymentRequired).toBe(true);
    expect(result.error).toContain("Payment integration coming soon");
  });

  it("prevents duplicate free enrolments", () => {
    const result = enrollInCourse("learner-demo", "course-tajweed-foundations");
    expect(result.ok).toBe(true);
    expect(result.error).toContain("already enrolled");
  });

  it("requires an active enrolment before lesson progress can be written", () => {
    const result = startLesson("un enrolled learner", "lesson-tajweed-1");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("active enrolment");
  });

  it("calculates progress from valid completion records and exposes a safe certificate state", () => {
    const started = startLesson("progress-test-learner", "lesson-tajweed-1");
    expect(started.ok).toBe(false);
    const progress = calculateCourseProgress("learner-demo", "course-tajweed-foundations");
    expect(progress.ok).toBe(true);
    expect(progress.completedLessons).toBe(1);
    expect(progress.progressPercent).toBe(25);
    expect(getCertificateStatus("learner-demo", "course-tajweed-foundations")).toBe("in_progress");
    expect(completeLesson("learner-demo", "lesson-tajweed-2").ok).toBe(true);
  });

  it("allows preview access only through the published course boundary", () => {
    expect(isLessonAccessible("un enrolled learner", "lesson-tajweed-1").ok).toBe(true);
    expect(isLessonAccessible("un enrolled learner", "lesson-tajweed-2").ok).toBe(false);
  });

  it("does not claim that media was uploaded when secure storage is absent", () => {
    expect(prepareThumbnailUpload().message).toContain("Secure storage connection required");
    expect(prepareLessonMediaUpload().message).toContain("Secure storage connection required");
  });

  it("does not persist private enrollment or progress through browser storage", () => {
    const source = readFileSync(new URL("../client/src/lib/course-management-data.ts", import.meta.url), "utf8");
    expect(source).not.toContain("window.localStorage");
    expect(source).not.toContain("noor-ilm-enrollments");
    expect(source).not.toContain("noor-ilm-lesson-progress");
  });

  it("wires the mounted learner workspace and lesson routes to the authenticated workspace and progress procedures", () => {
    const source = readFileSync(new URL("../client/src/components/CourseManagementExperience.tsx", import.meta.url), "utf8");
    expect(source).toContain("trpc.supabaseCore.learnerWorkspace.useQuery");
    expect(source).toContain("trpc.supabaseCore.updateProgress.useMutation");
    expect(source).not.toContain('getLearnerCourses(learnerId: string)');
  });

  it("wires instructor course and structure routes to protected Supabase procedures", () => {
    const source = readFileSync(new URL("../client/src/components/CourseManagementExperience.tsx", import.meta.url), "utf8");
    expect(source).toContain("trpc.supabaseCore.courses.useQuery");
    expect(source).toContain("trpc.supabaseCore.createCourse.useMutation");
    expect(source).toContain("trpc.supabaseCore.updateCourse.useMutation");
    expect(source).toContain("trpc.supabaseCore.submitCourseForReview.useMutation");
    expect(source).toContain("trpc.supabaseCore.structure.useQuery");
    expect(source).toContain("trpc.supabaseCore.createModule.useMutation");
    expect(source).toContain("trpc.supabaseCore.createLesson.useMutation");
    expect(source).not.toContain("Draft created in demo mode");
    expect(source).not.toContain("Lesson saved in demo mode");
  });

  it("keeps private media fail-closed while allowing metadata-only lesson persistence", () => {
    const source = readFileSync(new URL("../client/src/components/CourseManagementExperience.tsx", import.meta.url), "utf8");
    expect(source).toContain("signed-URL and provider gated");
    expect(source).toContain("No fake upload success is shown");
    expect(source).toContain("media_path");
  });

  it("wires the mounted enrolment route to the published Supabase course read and protected enrolment mutation", () => {
    const source = readFileSync(new URL("../client/src/components/CourseManagementExperience.tsx", import.meta.url), "utf8");
    const enrolmentSource = source.slice(source.indexOf("export function EnrolPage"), source.indexOf("export function LearnerCoursesPage"));
    expect(enrolmentSource).toContain("trpc.supabaseCore.publicCourseById.useQuery");
    expect(enrolmentSource).toContain("trpc.supabaseCore.createEnrolment.useMutation");
    expect(enrolmentSource).toContain("No demo course is substituted");
    expect(enrolmentSource).not.toContain("getCourseById(courseId)");
  });

  it("wires the mounted instructor submission route to protected Supabase review submission", () => {
    const source = readFileSync(new URL("../client/src/components/CourseManagementExperience.tsx", import.meta.url), "utf8");
    const submitSource = source.slice(source.indexOf("export function CourseSubmitPage"), source.indexOf("export function EnrolPage"));
    expect(submitSource).toContain("trpc.supabaseCore.courses.useQuery");
    expect(submitSource).toContain("trpc.supabaseCore.submitCourseForReview.useMutation");
    expect(submitSource).not.toContain("Submission prepared in demo mode");
  });

  it("routes public course detail through the Supabase published-course component and removes mounted demo lookup", () => {
    const appSource = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
    const courseRoute = appSource.slice(appSource.indexOf('path="/courses/:slug"'), appSource.indexOf('path="/teachers"'));
    expect(courseRoute).toContain("<CourseDetail slug={params.slug}/>");
    expect(courseRoute).not.toContain("getManagedCourseBySlug");
    expect(courseRoute).not.toContain("<PublicCourseDetail");
  });

  it("loads public lesson metadata through Supabase and never reads demo course or lesson records", () => {
    const source = readFileSync(new URL("../client/src/components/CourseManagementExperience.tsx", import.meta.url), "utf8");
    const previewSource = source.slice(source.indexOf("export function PublicLessonPreview"));
    expect(previewSource).toContain("trpc.supabaseCore.publicLessonMetadata.useQuery");
    expect(previewSource).toContain('t("catalogue.courseNotPublicCopy")');
    expect(previewSource).not.toContain("getCourseBySlug(slug)");
    expect(previewSource).not.toContain("getLesson(lessonId)");
    expect(previewSource).not.toContain("media_path");
  });

  it("wires the mounted instructor preview route to owner-scoped Supabase structure", () => {
    const source = readFileSync(new URL("../client/src/components/CourseManagementExperience.tsx", import.meta.url), "utf8");
    const previewSource = source.slice(source.indexOf("function InstructorCoursePreview"), source.indexOf("export function CoursePreviewPage"));
    expect(previewSource).toContain("trpc.supabaseCore.courses.useQuery");
    expect(previewSource).toContain("trpc.supabaseCore.structure.useQuery");
    expect(previewSource).not.toContain("getCourseById(courseId)");
  });
});
