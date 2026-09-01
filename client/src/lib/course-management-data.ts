export type CourseStatus = "draft" | "submitted" | "under_review" | "published" | "rejected" | "archived" | "suspended";
export type CourseLevel = "beginner" | "intermediate" | "advanced" | "children";
export type CourseFormat = "recorded" | "live_planned" | "one_to_one" | "group";
export type CourseAccessType = "free" | "paid" | "coming_soon";
export type CourseModuleStatus = "draft" | "published";
export type LessonContentType = "video" | "audio" | "text" | "document" | "quiz" | "assignment";
export type LessonStatus = "draft" | "published";
export type EnrollmentStatus = "active" | "paused" | "completed" | "cancelled";
export type LessonProgressStatus = "not_started" | "in_progress" | "completed";
export type SubmissionStatus = "not_started" | "submitted" | "reviewed" | "returned";
export type CertificateStatus = "not_eligible" | "in_progress" | "eligible" | "under_review" | "issued";

export type CourseLesson = {
  id: string;
  moduleId: string;
  courseId: string;
  title: string;
  description: string;
  lessonOrder: number;
  contentType: LessonContentType;
  durationMinutes: number;
  mediaPath?: string;
  attachmentPath?: string;
  transcript?: string;
  isPreview: boolean;
  isDownloadable: boolean;
  status: LessonStatus;
  assignment?: AssignmentPlaceholder;
  demo: boolean;
};

export type CourseModule = {
  id: string;
  courseId: string;
  title: string;
  description: string;
  moduleOrder: number;
  status: CourseModuleStatus;
  lessons: CourseLesson[];
  demo: boolean;
};

export type CourseRecord = {
  id: string;
  instructorId: string;
  instructorName: string;
  instructorSlug: string;
  title: string;
  slug: string;
  subject: string;
  level: CourseLevel;
  language: string;
  format: CourseFormat;
  shortDescription: string;
  description: string;
  thumbnailPath?: string;
  durationMinutes: number;
  weeklyEffort: string;
  learningOutcomes: string[];
  prerequisites: string;
  syllabusSummary: string;
  priceAmount?: number;
  currency?: string;
  accessType: CourseAccessType;
  previewLessonId?: string;
  status: CourseStatus;
  moderationNote?: string;
  modules: CourseModule[];
  createdAt: string;
  updatedAt: string;
  demo: boolean;
};

export type Enrollment = {
  id: string;
  learnerId: string;
  courseId: string;
  status: EnrollmentStatus;
  enrolledAt: string;
  completedAt?: string;
  demo: true;
};

export type LessonProgress = {
  id: string;
  learnerId: string;
  courseId: string;
  lessonId: string;
  status: LessonProgressStatus;
  progressPercent: number;
  lastPositionSeconds: number;
  completedAt?: string;
  updatedAt: string;
  demo: true;
};

export type AssignmentPlaceholder = {
  id: string;
  lessonId: string;
  instructions: string;
  dueDateLabel: string;
  submissionStatus: SubmissionStatus;
  scoreLabel: string;
  feedbackLabel: string;
  demo: true;
};

const thumbnail = "/brand/course-geometry.svg";
const now = "2026-08-23T00:00:00.000Z";

const tajweedModules: CourseModule[] = [
  {
    id: "module-tajweed-1",
    courseId: "course-tajweed-foundations",
    title: "Start with a listening practice",
    description: "Build a steady relationship with sound, pace, and the shape of a short recitation.",
    moduleOrder: 1,
    status: "published",
    lessons: [
      { id: "lesson-tajweed-1", moduleId: "module-tajweed-1", courseId: "course-tajweed-foundations", title: "A calm first recitation", description: "Set a repeatable practice and listen for the places that need attention.", lessonOrder: 1, contentType: "video", durationMinutes: 12, isPreview: true, isDownloadable: false, status: "published", demo: true },
      { id: "lesson-tajweed-2", moduleId: "module-tajweed-1", courseId: "course-tajweed-foundations", title: "Makhارج: finding the articulation points", description: "A guided introduction to articulation points without rushing into rules.", lessonOrder: 2, contentType: "audio", durationMinutes: 18, transcript: "Transcript placeholder — available after the connected media service is configured.", isPreview: false, isDownloadable: false, status: "published", demo: true },
    ],
    demo: true,
  },
  {
    id: "module-tajweed-2",
    courseId: "course-tajweed-foundations",
    title: "Notice one improvement at a time",
    description: "Practice clear transitions and make progress observable across a week.",
    moduleOrder: 2,
    status: "published",
    lessons: [
      { id: "lesson-tajweed-3", moduleId: "module-tajweed-2", courseId: "course-tajweed-foundations", title: "Clear transitions", description: "Use short, focused repetitions to make transitions more consistent.", lessonOrder: 1, contentType: "text", durationMinutes: 10, isPreview: false, isDownloadable: true, status: "published", demo: true },
      { id: "lesson-tajweed-4", moduleId: "module-tajweed-2", courseId: "course-tajweed-foundations", title: "Weekly reflection", description: "Record what changed and choose one next step for the following practice.", lessonOrder: 2, contentType: "assignment", durationMinutes: 15, isPreview: false, isDownloadable: false, status: "published", assignment: { id: "assignment-tajweed-1", lessonId: "lesson-tajweed-4", instructions: "Write a short reflection on one recitation improvement you noticed this week.", dueDateLabel: "Due date to be agreed", submissionStatus: "not_started", scoreLabel: "Score unavailable", feedbackLabel: "Instructor feedback placeholder", demo: true }, demo: true },
    ],
    demo: true,
  },
];

export const demoCourses: CourseRecord[] = [
  {
    id: "course-tajweed-foundations",
    instructorId: "instructor-demo",
    instructorName: "Ustadha Maryam Khan",
    instructorSlug: "maryam-khan",
    title: "Tajweed Foundations",
    slug: "tajweed-foundations",
    subject: "Tajweed",
    level: "beginner",
    language: "English",
    format: "recorded",
    shortDescription: "A calm, practice-led beginning for learners who want a repeatable recitation rhythm.",
    description: "Tajweed Foundations is a gentle course structure for learners who want to make one clear improvement at a time. The public outline is available in demo mode; private media and learner records remain protected boundaries.",
    thumbnailPath: thumbnail,
    durationMinutes: 95,
    weeklyEffort: "45 minutes / week",
    learningOutcomes: ["Identify a small set of articulation points", "Build a repeatable listening and recitation practice", "Reflect on observable progress without artificial scores"],
    prerequisites: "No prior course required. A willingness to practise aloud is helpful.",
    syllabusSummary: "Listening practice, articulation points, transitions, and weekly reflection.",
    accessType: "free",
    previewLessonId: "lesson-tajweed-1",
    status: "published",
    modules: tajweedModules,
    createdAt: now,
    updatedAt: now,
    demo: true,
  },
  {
    id: "course-arabic-reading",
    instructorId: "instructor-demo",
    instructorName: "Ustadha Maryam Khan",
    instructorSlug: "maryam-khan",
    title: "Arabic for Reading",
    slug: "arabic-for-reading",
    subject: "Arabic",
    level: "intermediate",
    language: "English + Urdu",
    format: "live_planned",
    shortDescription: "A structured reading path for learners who want more confidence with common vocabulary.",
    description: "This course is published as a catalogue record, while live delivery and payment remain setup-needed boundaries in the current demo.",
    thumbnailPath: thumbnail,
    durationMinutes: 180,
    weeklyEffort: "90 minutes / week",
    learningOutcomes: ["Recognise common vocabulary patterns", "Read short guided passages", "Build a sustainable weekly study plan"],
    prerequisites: "Comfort with the Arabic alphabet is recommended.",
    syllabusSummary: "Vocabulary patterns, guided reading, and study rhythm.",
    priceAmount: 35,
    currency: "GBP",
    accessType: "paid",
    status: "published",
    modules: [],
    createdAt: now,
    updatedAt: now,
    demo: true,
  },
  {
    id: "course-arabic-draft",
    instructorId: "instructor-demo",
    instructorName: "Ustadha Maryam Khan",
    instructorSlug: "maryam-khan",
    title: "Arabic Reading Circle",
    slug: "arabic-reading-circle",
    subject: "Arabic",
    level: "beginner",
    language: "Urdu",
    format: "group",
    shortDescription: "A draft course for a future small-group reading circle.",
    description: "Private draft description. This record is intentionally not visible to public catalogue users.",
    thumbnailPath: thumbnail,
    durationMinutes: 240,
    weeklyEffort: "60 minutes / week",
    learningOutcomes: ["Read short passages with more confidence"],
    prerequisites: "Draft prerequisite placeholder.",
    syllabusSummary: "Draft syllabus awaiting instructor review.",
    accessType: "coming_soon",
    status: "draft",
    modules: [],
    createdAt: now,
    updatedAt: now,
    demo: true,
  },
];

const demoEnrollmentSeed: Enrollment[] = [
  { id: "enrolment-demo-tajweed", learnerId: "learner-demo", courseId: "course-tajweed-foundations", status: "active", enrolledAt: now, demo: true },
];
const demoProgressSeed: LessonProgress[] = [
  { id: "progress-demo-1", learnerId: "learner-demo", courseId: "course-tajweed-foundations", lessonId: "lesson-tajweed-1", status: "completed", progressPercent: 100, lastPositionSeconds: 720, completedAt: now, updatedAt: now, demo: true },
  { id: "progress-demo-2", learnerId: "learner-demo", courseId: "course-tajweed-foundations", lessonId: "lesson-tajweed-2", status: "in_progress", progressPercent: 42, lastPositionSeconds: 450, updatedAt: now, demo: true },
];
let courses = [...demoCourses];
let enrollments = [...demoEnrollmentSeed];
let progressRecords = [...demoProgressSeed];

// Private enrollment and progress persistence is owned by Supabase procedures.
// These in-memory fixtures remain available only to deterministic unit tests and
// never claim to be production persistence.
const currentEnrollments = () => enrollments;
const currentProgress = () => progressRecords;
const canEditCourse = (course: CourseRecord) => course.status === "draft" || course.status === "rejected";
const flattenLessons = (course: CourseRecord) => course.modules.flatMap((module) => module.lessons.filter((lesson) => lesson.status === "published"));

export const getAllCourses = () => courses;
export const getInstructorCourses = (instructorId: string) => courses.filter((course) => course.instructorId === instructorId);
export const getCourseById = (courseId: string) => courses.find((course) => course.id === courseId);
export const getCourseBySlug = (slug: string) => courses.find((course) => course.slug === slug);
export const getPublishedCourses = () => courses.filter((course) => course.status === "published");
export const getPublishedCourseBySlug = (slug: string) => courses.find((course) => course.slug === slug && course.status === "published");
export const getCourseLessons = (courseId: string) => getCourseById(courseId)?.modules.flatMap((module) => module.lessons) ?? [];
export const getLesson = (lessonId: string) => courses.flatMap((course) => getCourseLessons(course.id)).find((lesson) => lesson.id === lessonId);

export const createDraftCourse = (instructorId: string, instructorName: string, instructorSlug: string): CourseRecord => {
  const index = courses.filter((course) => course.instructorId === instructorId).length + 1;
  const draft: CourseRecord = { id: `course-draft-${Date.now()}`, instructorId, instructorName, instructorSlug, title: "Untitled course", slug: `untitled-course-${index}`, subject: "Tajweed", level: "beginner", language: "English", format: "recorded", shortDescription: "", description: "", thumbnailPath: undefined, durationMinutes: 0, weeklyEffort: "", learningOutcomes: [], prerequisites: "", syllabusSummary: "", accessType: "coming_soon", status: "draft", modules: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), demo: true };
  courses = [draft, ...courses];
  return draft;
};
export const updateCourse = (courseId: string, patch: Partial<CourseRecord>): { ok: boolean; course?: CourseRecord; error?: string } => {
  const index = courses.findIndex((course) => course.id === courseId);
  if (index < 0) return { ok: false, error: "Course not found." };
  if (!canEditCourse(courses[index])) return { ok: false, error: "Published courses require a reviewable revision; direct editing is unavailable." };
  courses[index] = { ...courses[index], ...patch, updatedAt: new Date().toISOString() };
  return { ok: true, course: courses[index] };
};
export const submitCourseForReview = (courseId: string): { ok: boolean; course?: CourseRecord; error?: string } => {
  const course = getCourseById(courseId);
  if (!course) return { ok: false, error: "Course not found." };
  if (!canEditCourse(course)) return { ok: false, error: "Only drafts or rejected courses can be submitted." };
  const missing = [course.title === "Untitled course" ? "title" : "", course.shortDescription ? "" : "short description", course.description ? "" : "full description", course.modules.length ? "module" : "module"].filter(Boolean);
  if (missing.length) return { ok: false, error: `Complete the required ${missing.join(", ")} field(s) before submitting.` };
  course.status = "submitted";
  course.moderationNote = undefined;
  course.updatedAt = new Date().toISOString();
  return { ok: true, course };
};
export const setDemoModeration = (courseId: string, status: Extract<CourseStatus, "under_review" | "published" | "rejected">, moderationNote?: string) => {
  const course = getCourseById(courseId);
  if (!course) return { ok: false, error: "Course not found." };
  course.status = status;
  course.moderationNote = moderationNote;
  course.updatedAt = new Date().toISOString();
  return { ok: true, course };
};

export const addModule = (courseId: string, title: string, description = ""): { ok: boolean; module?: CourseModule; error?: string } => {
  const course = getCourseById(courseId);
  if (!course || !canEditCourse(course)) return { ok: false, error: "Only an owned draft or rejected course can be edited." };
  if (!title.trim()) return { ok: false, error: "Add a module title before saving." };
  const module: CourseModule = { id: `module-${Date.now()}`, courseId, title: title.trim(), description, moduleOrder: course.modules.length + 1, status: "draft", lessons: [], demo: true };
  course.modules = [...course.modules, module];
  course.updatedAt = new Date().toISOString();
  return { ok: true, module };
};
export const updateModule = (courseId: string, moduleId: string, patch: Partial<CourseModule>) => {
  const course = getCourseById(courseId);
  if (!course || !canEditCourse(course)) return { ok: false, error: "Module editing is unavailable for this course status." };
  const module = course.modules.find((item) => item.id === moduleId);
  if (!module) return { ok: false, error: "Module not found." };
  Object.assign(module, patch);
  course.updatedAt = new Date().toISOString();
  return { ok: true, module };
};
export const deleteModule = (courseId: string, moduleId: string) => {
  const course = getCourseById(courseId);
  if (!course || !canEditCourse(course)) return { ok: false, error: "Only draft modules can be deleted." };
  const module = course.modules.find((item) => item.id === moduleId);
  if (!module || module.status !== "draft") return { ok: false, error: "Only draft modules can be deleted." };
  course.modules = course.modules.filter((item) => item.id !== moduleId).map((item, index) => ({ ...item, moduleOrder: index + 1 }));
  course.updatedAt = new Date().toISOString();
  return { ok: true };
};
export const reorderModules = (courseId: string, orderedModuleIds: string[]) => {
  const course = getCourseById(courseId);
  if (!course || !canEditCourse(course)) return { ok: false, error: "Module reordering is unavailable for this course status." };
  const byId = new Map(course.modules.map((module) => [module.id, module]));
  course.modules = orderedModuleIds.map((id) => byId.get(id)).filter((module): module is CourseModule => Boolean(module)).map((module, index) => ({ ...module, moduleOrder: index + 1 }));
  course.updatedAt = new Date().toISOString();
  return { ok: true };
};

export const addLesson = (courseId: string, moduleId: string, input: Pick<CourseLesson, "title" | "description" | "contentType" | "durationMinutes">): { ok: boolean; lesson?: CourseLesson; error?: string } => {
  const course = getCourseById(courseId);
  const module = course?.modules.find((item) => item.id === moduleId);
  if (!course || !module || !canEditCourse(course)) return { ok: false, error: "Only an owned draft or rejected course can be edited." };
  if (!input.title.trim()) return { ok: false, error: "Add a lesson title before saving." };
  const lesson: CourseLesson = { id: `lesson-${Date.now()}`, moduleId, courseId, title: input.title.trim(), description: input.description, lessonOrder: module.lessons.length + 1, contentType: input.contentType, durationMinutes: input.durationMinutes, isPreview: false, isDownloadable: false, status: "draft", demo: true };
  module.lessons = [...module.lessons, lesson];
  course.updatedAt = new Date().toISOString();
  return { ok: true, lesson };
};
export const updateLesson = (courseId: string, moduleId: string, lessonId: string, patch: Partial<CourseLesson>) => {
  const course = getCourseById(courseId);
  const module = course?.modules.find((item) => item.id === moduleId);
  const lesson = module?.lessons.find((item) => item.id === lessonId);
  if (!course || !module || !lesson || !canEditCourse(course)) return { ok: false, error: "Lesson editing is unavailable for this course status." };
  Object.assign(lesson, patch);
  course.updatedAt = new Date().toISOString();
  return { ok: true, lesson };
};
export const deleteLesson = (courseId: string, moduleId: string, lessonId: string) => {
  const course = getCourseById(courseId);
  const module = course?.modules.find((item) => item.id === moduleId);
  const lesson = module?.lessons.find((item) => item.id === lessonId);
  if (!course || !module || !lesson || !canEditCourse(course) || lesson.status !== "draft") return { ok: false, error: "Only draft lessons can be deleted." };
  module.lessons = module.lessons.filter((item) => item.id !== lessonId).map((item, index) => ({ ...item, lessonOrder: index + 1 }));
  course.updatedAt = new Date().toISOString();
  return { ok: true };
};
export const reorderLessons = (courseId: string, moduleId: string, orderedLessonIds: string[]) => {
  const course = getCourseById(courseId);
  const module = course?.modules.find((item) => item.id === moduleId);
  if (!course || !module || !canEditCourse(course)) return { ok: false, error: "Lesson reordering is unavailable for this course status." };
  const byId = new Map(module.lessons.map((lesson) => [lesson.id, lesson]));
  module.lessons = orderedLessonIds.map((id) => byId.get(id)).filter((lesson): lesson is CourseLesson => Boolean(lesson)).map((lesson, index) => ({ ...lesson, lessonOrder: index + 1 }));
  course.updatedAt = new Date().toISOString();
  return { ok: true };
};
export const prepareThumbnailUpload = () => ({ ok: false as const, message: "Secure storage connection required. No thumbnail was uploaded in demo mode." });
export const prepareLessonMediaUpload = () => ({ ok: false as const, message: "Secure storage connection required. No lesson media was uploaded in demo mode." });

export const getEnrollment = (learnerId: string, courseId: string) => currentEnrollments().find((item) => item.learnerId === learnerId && item.courseId === courseId && item.status !== "cancelled");
export const getLearnerEnrollments = (learnerId: string) => currentEnrollments().filter((item) => item.learnerId === learnerId && item.status !== "cancelled");
export const enrollInCourse = (learnerId: string, courseId: string): { ok: boolean; enrollment?: Enrollment; error?: string; paymentRequired?: boolean } => {
  const course = getPublishedCourses().find((item) => item.id === courseId);
  if (!course) return { ok: false, error: "This course is not available for enrolment." };
  const existing = getEnrollment(learnerId, courseId);
  if (existing) return { ok: true, enrollment: existing, error: "You are already enrolled in this course." };
  if (course.accessType === "paid") return { ok: false, error: "Payment integration coming soon. No enrolment or charge was created.", paymentRequired: true };
  if (course.accessType === "coming_soon") return { ok: false, error: "This course is coming soon and cannot be enrolled in yet." };
  const enrollment: Enrollment = { id: `enrolment-${Date.now()}`, learnerId, courseId, status: "active", enrolledAt: new Date().toISOString(), demo: true };
  enrollments = [enrollment, ...currentEnrollments()];
  // Production enrollment writes are handled by trpc.supabaseCore.createEnrolment.
  return { ok: true, enrollment };
};
export const getProgress = (learnerId: string, lessonId: string) => currentProgress().find((item) => item.learnerId === learnerId && item.lessonId === lessonId);
const ensureProgress = (learnerId: string, lessonId: string) => {
  const lesson = getLesson(lessonId);
  if (!lesson || !getEnrollment(learnerId, lesson.courseId)) return { error: "An active enrolment is required before lesson progress can be updated." } as const;
  let progress = getProgress(learnerId, lessonId);
  if (!progress) { progress = { id: `progress-${Date.now()}`, learnerId, courseId: lesson.courseId, lessonId, status: "not_started", progressPercent: 0, lastPositionSeconds: 0, updatedAt: new Date().toISOString(), demo: true }; progressRecords = [progress, ...currentProgress()]; }
  return { progress } as const;
};
export const startLesson = (learnerId: string, lessonId: string) => {
  const result = ensureProgress(learnerId, lessonId);
  if ("error" in result) return { ok: false, error: result.error };
  result.progress.status = result.progress.status === "completed" ? "completed" : "in_progress";
  result.progress.updatedAt = new Date().toISOString();
  // Production progress writes are handled by trpc.supabaseCore.updateProgress.
  return { ok: true, progress: result.progress };
};
export const updateLessonProgress = (learnerId: string, lessonId: string, progressPercent: number) => {
  const result = ensureProgress(learnerId, lessonId);
  if ("error" in result) return { ok: false, error: result.error };
  const clamped = Math.max(0, Math.min(99, Math.round(progressPercent)));
  result.progress.progressPercent = clamped;
  result.progress.status = clamped > 0 ? "in_progress" : "not_started";
  result.progress.updatedAt = new Date().toISOString();
  // Production progress writes are handled by trpc.supabaseCore.updateProgress.
  return { ok: true, progress: result.progress };
};
export const saveLastPosition = (learnerId: string, lessonId: string, seconds: number) => {
  const result = ensureProgress(learnerId, lessonId);
  if ("error" in result) return { ok: false, error: result.error };
  result.progress.lastPositionSeconds = Math.max(0, Math.round(seconds));
  result.progress.updatedAt = new Date().toISOString();
  // Production progress writes are handled by trpc.supabaseCore.updateProgress.
  return { ok: true, progress: result.progress };
};
export const completeLesson = (learnerId: string, lessonId: string) => {
  const result = ensureProgress(learnerId, lessonId);
  if ("error" in result) return { ok: false, error: result.error };
  result.progress.progressPercent = 100;
  result.progress.status = "completed";
  result.progress.completedAt = new Date().toISOString();
  result.progress.updatedAt = new Date().toISOString();
  // Production progress writes are handled by trpc.supabaseCore.updateProgress.
  return { ok: true, progress: result.progress };
};
export const calculateCourseProgress = (learnerId: string, courseId: string) => {
  if (!getEnrollment(learnerId, courseId)) return { ok: false, progressPercent: 0, completedLessons: 0, totalLessons: 0, error: "An active enrolment is required to calculate course progress." };
  const lessons = getCourseLessons(courseId).filter((lesson) => lesson.status === "published");
  const records = currentProgress().filter((item) => item.learnerId === learnerId && item.courseId === courseId);
  const completedLessons = lessons.filter((lesson) => records.some((record) => record.lessonId === lesson.id && record.status === "completed")).length;
  const progressPercent = lessons.length ? Math.round((completedLessons / lessons.length) * 100) : 0;
  return { ok: true, progressPercent, completedLessons, totalLessons: lessons.length };
};
export const getCertificateStatus = (learnerId: string, courseId: string): CertificateStatus => {
  const result = calculateCourseProgress(learnerId, courseId);
  if (!result.ok || result.totalLessons === 0) return "not_eligible";
  if (result.progressPercent < 100) return result.progressPercent > 0 ? "in_progress" : "not_eligible";
  return "eligible";
};
export const isLessonAccessible = (learnerId: string, lessonId: string) => {
  const lesson = getLesson(lessonId);
  if (!lesson) return { ok: false, reason: "Lesson not found." };
  const course = getCourseById(lesson.courseId);
  if (lesson.isPreview && course?.status === "published") return { ok: true, preview: true };
  if (getEnrollment(learnerId, lesson.courseId)) return { ok: true, preview: false };
  return { ok: false, reason: "Active enrolment required for this lesson." };
};

export const courseStatusCopy: Record<CourseStatus, { label: string; tone: "gold" | "sage" | "red" | "ink" }> = {
  draft: { label: "Draft", tone: "ink" }, submitted: { label: "Submitted", tone: "gold" }, under_review: { label: "Under review", tone: "gold" }, published: { label: "Published", tone: "sage" }, rejected: { label: "Changes requested", tone: "red" }, archived: { label: "Archived", tone: "ink" }, suspended: { label: "Suspended", tone: "red" },
};
export const certificateStatusCopy: Record<CertificateStatus, string> = { not_eligible: "Not eligible", in_progress: "In progress", eligible: "Eligible for review", under_review: "Under review", issued: "Issued after policy approval" };
export const lessonContentLabels: Record<LessonContentType, string> = { video: "Video", audio: "Audio", text: "Text", document: "Document", quiz: "Quiz placeholder", assignment: "Assignment placeholder" };
export const flattenPublishedLessons = (course: CourseRecord) => flattenLessons(course);
