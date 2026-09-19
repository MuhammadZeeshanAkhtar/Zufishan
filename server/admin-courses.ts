/**
 * Course management for the admin desk.
 *
 * `courses.status` already carries the whole vocabulary the brief asks for —
 * draft, in_review, published, rejected, archived — so nothing here invents a
 * state. What was missing is the set of transitions an operator can actually
 * make, and each one below is validated against the row's current status before
 * it is written:
 *
 *   publish          in_review  → published
 *   reject           in_review  → rejected
 *   request_changes  in_review  → draft       (with the reviewer's note)
 *   unpublish        published  → archived
 *   restore          archived   → draft
 *
 * Publish and reject delegate to `setCourseReviewDecision`, the procedure the
 * existing reviewer queue uses, so the same decision cannot behave differently
 * on two screens. That procedure also guards against a concurrent decision by
 * re-asserting `status = 'in_review'` in the UPDATE itself.
 *
 * Note what is *not* here: no procedure edits a course's title, description,
 * modules or lessons. Moderation decides visibility; authorship stays with the
 * instructor.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SupabaseIdentity } from "./supabase-auth";
import { setCourseReviewDecision } from "./course-review";
import { notify } from "./notifications";
import {
  clampLimit, clampOffset, displayNameOf, invalid, likeTerm, logFailure,
  notFound, noteFor, recordAudit, requireAdmin, type AdminResult, type Page,
} from "./admin-guard";

export const COURSE_STATUSES = ["draft", "in_review", "published", "rejected", "archived"] as const;

/**
 * The statuses an administrator's course desk deals with.
 *
 * `draft` is deliberately absent. A draft is the instructor's own unfinished work: it has
 * not been submitted to anyone, and listing it here put every half-written course into the
 * review queue, where it looked like something awaiting a decision. Work reaches this desk
 * when the instructor submits it, and not before.
 *
 * `COURSE_STATUSES` still names all five, because that is the column's vocabulary — this
 * list is only about what a reviewer is shown.
 */
export const REVIEWABLE_COURSE_STATUSES = ["in_review", "published", "rejected", "archived"] as const;
export const COURSE_FILTERS = ["all", ...REVIEWABLE_COURSE_STATUSES] as const;
export type CourseFilter = (typeof COURSE_FILTERS)[number];

export const COURSE_ACTIONS = ["publish", "reject", "request_changes", "unpublish", "restore"] as const;
export type CourseAction = (typeof COURSE_ACTIONS)[number];

/** Which status an action may be applied from, and what it produces. */
const TRANSITIONS: Record<CourseAction, { from: string; to: string; action: string }> = {
  publish:         { from: "in_review", to: "published", action: "course.review.decide" },
  reject:          { from: "in_review", to: "rejected",  action: "course.review.decide" },
  request_changes: { from: "in_review", to: "draft",     action: "course.review.changes_requested" },
  unpublish:       { from: "published", to: "archived",  action: "course.visibility.unpublished" },
  restore:         { from: "archived",  to: "draft",     action: "course.visibility.restored" },
};

export type CourseRow = {
  /** The reviewer's mark, added in 0035. Separate from `status`, which is the author's. */
  verificationStatus: string;
  id: string;
  slug: string;
  title: string;
  subject: string;
  level: string;
  language: string;
  status: string;
  instructorId: string;
  instructorName: string | null;
  moduleCount: number;
  lessonCount: number;
  updatedAt: string;
};

/**
 * Module and lesson counts for the courses on this page.
 *
 * Lessons hang off modules, not courses, and PostgREST cannot aggregate two
 * levels down — so the counts are assembled from two scoped queries rather than
 * guessed or left out. Scoped to the visible ids, so this does not grow with the
 * catalogue.
 */
async function countStructure(admin: SupabaseClient, courseIds: string[]) {
  const modules = new Map<string, number>();
  const lessons = new Map<string, number>();
  if (courseIds.length === 0) return { modules, lessons };

  const { data: moduleRows, error: moduleError } = await admin
    .from("course_modules").select("id,course_id").in("course_id", courseIds);
  logFailure("admin-courses", moduleError);

  const moduleToCourse = new Map<string, string>();
  for (const row of (moduleRows ?? []) as Array<{ id: string; course_id: string }>) {
    moduleToCourse.set(row.id, row.course_id);
    modules.set(row.course_id, (modules.get(row.course_id) ?? 0) + 1);
  }

  const moduleIds = Array.from(moduleToCourse.keys());
  if (moduleIds.length > 0) {
    const { data: lessonRows, error: lessonError } = await admin
      .from("lessons").select("module_id").in("module_id", moduleIds);
    logFailure("admin-courses", lessonError);
    for (const row of (lessonRows ?? []) as Array<{ module_id: string }>) {
      const courseId = moduleToCourse.get(row.module_id);
      if (courseId) lessons.set(courseId, (lessons.get(courseId) ?? 0) + 1);
    }
  }
  return { modules, lessons };
}

export async function listCourses(
  identity: SupabaseIdentity,
  input: { search?: string; status?: CourseFilter; limit?: number; offset?: number },
): Promise<AdminResult<Page<CourseRow>>> {
  const gate = await requireAdmin(identity);
  if (!gate.ok) return gate.failure;
  const { admin } = gate;

  const limit = clampLimit(input.limit);
  const offset = clampOffset(input.offset);
  const search = input.search?.trim() ?? "";

  let query = admin
    .from("courses")
    .select("id,slug,title,subject,level,language,status,verification_status,instructor_id,updated_at,profiles:instructor_id(display_name,full_name)", { count: "exact" });

  // Never a draft, on any filter: `all` means all of the reviewable statuses, not the
  // instructor's unsubmitted work.
  query = query.in("status", [...REVIEWABLE_COURSE_STATUSES]);
  if (input.status && input.status !== "all") query = query.eq("status", input.status);
  if (search) query = query.or(`title.ilike.${likeTerm(search)},slug.ilike.${likeTerm(search)},subject.ilike.${likeTerm(search)}`);

  const { data, error, count } = await query.order("updated_at", { ascending: false }).range(offset, offset + limit - 1);
  if (error) {
    logFailure("admin-courses", error);
    return { ok: false, error: "The course list could not be loaded." };
  }

  const raw = (data ?? []) as Array<Record<string, unknown>>;
  const { modules, lessons } = await countStructure(admin, raw.map((row) => String(row.id)));

  const rows: CourseRow[] = raw.map((row) => ({
    id: String(row.id),
    slug: String(row.slug),
    title: String(row.title),
    subject: String(row.subject),
    level: String(row.level),
    language: String(row.language),
    status: String(row.status),
    verificationStatus: String(row.verification_status ?? "verification_pending"),
    instructorId: String(row.instructor_id),
    instructorName: displayNameOf(row.profiles),
    moduleCount: modules.get(String(row.id)) ?? 0,
    lessonCount: lessons.get(String(row.id)) ?? 0,
    updatedAt: String(row.updated_at),
  }));

  return { ok: true, data: { rows, total: count ?? rows.length, limit, offset } };
}

export type CourseDetail = {
  /** The reviewer's mark on the COURSE, added in 0035 - not the instructor's. */
  verificationStatus: string;
  id: string;
  slug: string;
  title: string;
  description: string;
  subject: string;
  level: string;
  language: string;
  status: string;
  /** The completion rule: the mark a learner must reach, or null when unset. */
  passMark: number | null;
  createdAt: string;
  updatedAt: string;
  instructor: { id: string; name: string | null; verificationStatus: string | null };
  modules: Array<{ id: string; title: string; status: string; sortOrder: number; lessons: Array<{ id: string; title: string; status: string; sortOrder: number; durationSeconds: number | null; isPreview: boolean }> }>;
  assessments: { assignments: Array<{ id: string; title: string }>; quizzes: Array<{ id: string; title: string; questionCount: number }> };
  enrolmentCount: number;
  history: Array<{ id: string; action: string; actorName: string | null; from: string | null; to: string | null; note: string | null; createdAt: string }>;
};

export async function getCourseDetail(
  identity: SupabaseIdentity,
  input: { courseId: string },
): Promise<AdminResult<CourseDetail>> {
  const gate = await requireAdmin(identity);
  if (!gate.ok) return gate.failure;
  const { admin } = gate;

  const { data: course, error } = await admin
    .from("courses")
    .select("id,slug,title,description,subject,level,language,status,verification_status,pass_mark,created_at,updated_at,instructor_id,profiles:instructor_id(display_name,full_name)")
    .eq("id", input.courseId).maybeSingle();
  if (error) {
    logFailure("admin-courses", error);
    return { ok: false, error: "The course could not be read." };
  }
  if (!course) return notFound("course");

  const row = course as Record<string, unknown>;
  const instructorId = String(row.instructor_id);

  const { data: moduleRows } = await admin
    .from("course_modules").select("id,title,status,sort_order").eq("course_id", input.courseId).order("sort_order", { ascending: true });
  const moduleIds = ((moduleRows ?? []) as Array<{ id: string }>).map((module) => module.id);

  const [{ data: lessonRows }, { data: assignments }, { data: quizzes }, { count: enrolmentCount }, { data: history }, { data: instructorProfile }] =
    await Promise.all([
      moduleIds.length > 0
        ? admin.from("lessons").select("id,module_id,title,status,sort_order,duration_seconds,is_preview").in("module_id", moduleIds).order("sort_order", { ascending: true })
        : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
      admin.from("assignments").select("id,title").eq("course_id", input.courseId).order("created_at", { ascending: true }),
      admin.from("quizzes").select("id,title,questions").eq("course_id", input.courseId).order("created_at", { ascending: true }),
      admin.from("enrolments").select("*", { count: "exact", head: true }).eq("course_id", input.courseId),
      admin.from("audit_logs").select("id,action,metadata,created_at,profiles:actor_id(display_name,full_name)")
        .eq("entity_type", "courses").eq("entity_id", input.courseId).order("created_at", { ascending: false }).limit(50),
      admin.from("instructor_profiles").select("verification_status").eq("user_id", instructorId).maybeSingle(),
    ]);

  const lessonsByModule = new Map<string, CourseDetail["modules"][number]["lessons"]>();
  for (const lesson of (lessonRows ?? []) as Array<Record<string, unknown>>) {
    const key = String(lesson.module_id);
    const list = lessonsByModule.get(key) ?? [];
    list.push({
      id: String(lesson.id),
      title: String(lesson.title),
      status: String(lesson.status),
      sortOrder: Number(lesson.sort_order ?? 0),
      durationSeconds: lesson.duration_seconds === null || lesson.duration_seconds === undefined ? null : Number(lesson.duration_seconds),
      isPreview: lesson.is_preview === true,
    });
    lessonsByModule.set(key, list);
  }

  return {
    ok: true,
    data: {
      id: String(row.id),
      slug: String(row.slug),
      title: String(row.title),
      description: String(row.description ?? ""),
      subject: String(row.subject),
      level: String(row.level),
      language: String(row.language),
      status: String(row.status),
      verificationStatus: String(row.verification_status ?? "verification_pending"),
      passMark: row.pass_mark === null || row.pass_mark === undefined ? null : Number(row.pass_mark),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      instructor: {
        id: instructorId,
        name: displayNameOf(row.profiles),
        verificationStatus: (instructorProfile as { verification_status?: string } | null)?.verification_status ?? null,
      },
      modules: ((moduleRows ?? []) as Array<Record<string, unknown>>).map((module) => ({
        id: String(module.id),
        title: String(module.title),
        status: String(module.status),
        sortOrder: Number(module.sort_order ?? 0),
        lessons: lessonsByModule.get(String(module.id)) ?? [],
      })),
      assessments: {
        assignments: ((assignments ?? []) as Array<Record<string, unknown>>).map((item) => ({ id: String(item.id), title: String(item.title) })),
        quizzes: ((quizzes ?? []) as Array<Record<string, unknown>>).map((item) => ({
          id: String(item.id),
          title: String(item.title),
          questionCount: Array.isArray(item.questions) ? item.questions.length : 0,
        })),
      },
      enrolmentCount: enrolmentCount ?? 0,
      history: ((history ?? []) as Array<Record<string, unknown>>).map((entry) => {
        const metadata = (entry.metadata ?? {}) as Record<string, unknown>;
        return {
          id: String(entry.id),
          action: String(entry.action),
          actorName: displayNameOf(entry.profiles),
          from: typeof metadata.from === "string" ? metadata.from : null,
          to: typeof metadata.to === "string" ? metadata.to : null,
          note: typeof metadata.note === "string" ? metadata.note : null,
          createdAt: String(entry.created_at),
        };
      }),
    },
  };
}

export async function decideCourse(
  identity: SupabaseIdentity,
  input: { courseId: string; action: CourseAction; note?: string },
): Promise<AdminResult<{ courseId: string; status: string }>> {
  const gate = await requireAdmin(identity);
  if (!gate.ok) return gate.failure;
  const { admin } = gate;

  const transition = TRANSITIONS[input.action];
  if (!transition) return invalid("Unknown course action.");

  // A draft was never submitted, so there is nothing here to decide. Refusing it closes
  // the direct-call route as well as the listing: hiding a row is presentation, and a
  // reviewer must not be able to publish work its author has not handed over.
  const { data: current } = await admin.from("courses").select("status").eq("id", input.courseId).maybeSingle();
  if (current && String((current as { status: string }).status) === "draft") {
    return invalid("That course has not been submitted for review yet.");
  }

  // Publish and reject already have a hardened implementation, including the
  // concurrent-decision guard. Reuse it rather than writing a second one.
  if (input.action === "publish" || input.action === "reject") {
    const result = await setCourseReviewDecision(identity, {
      courseId: input.courseId,
      decision: input.action === "publish" ? "published" : "rejected",
      note: input.note,
    });
    return result.ok
      ? { ok: true, data: { courseId: input.courseId, status: result.data.status } }
      : { ok: false, error: result.error, code: result.code as never };
  }

  const { data: course, error } = await admin
    .from("courses").select("id,status,instructor_id,title").eq("id", input.courseId).maybeSingle();
  if (error) {
    logFailure("admin-courses", error);
    return { ok: false, error: "The course could not be read." };
  }
  if (!course) return notFound("course");

  const row = course as { status: string; instructor_id: string; title: string };
  if (row.status !== transition.from) {
    return { ok: false, code: "CONFLICT", error: `This action needs a course in "${transition.from}"; this one is "${row.status}".` };
  }

  const { error: writeError } = await admin
    .from("courses")
    .update({ status: transition.to, updated_at: new Date().toISOString() })
    .eq("id", input.courseId)
    .eq("status", transition.from); // guards against a decision that landed between read and write
  if (writeError) {
    logFailure("admin-courses", writeError);
    return { ok: false, error: "The decision could not be saved." };
  }

  await recordAudit(admin, {
    actorId: identity.id,
    action: transition.action,
    entityType: "courses",
    entityId: input.courseId,
    metadata: { from: row.status, to: transition.to, ...noteFor(input.note) },
  });

  // The instructor is always told: a change to their course's visibility is not
  // something they should have to discover by looking.
  const titles: Record<CourseAction, { title: string; body: string }> = {
    publish: { title: "Your course is live", body: "Learners can now find and enrol on it." },
    reject: { title: "Your course was reviewed", body: "A reviewer sent your course back." },
    request_changes: { title: "Changes were requested on your course", body: input.note?.trim() ? `A reviewer asked for changes: ${input.note.trim().slice(0, 300)}` : "A reviewer returned your course to draft with changes to make." },
    unpublish: { title: "Your course was unpublished", body: "It has been archived and is no longer in public discovery." },
    restore: { title: "Your course was restored", body: "It is back in draft and can be edited and resubmitted." },
  };
  await notify({
    userId: row.instructor_id,
    type: "course_moderated",
    title: titles[input.action].title,
    body: titles[input.action].body,
    relatedEntityType: "courses",
    relatedEntityId: input.courseId,
    // Keyed on the course and the action, not the clock: a repeated decision
    // must not raise a second notification.
    idempotencyKey: `course-moderation:${input.courseId}:${input.action}`,
  });

  return { ok: true, data: { courseId: input.courseId, status: transition.to } };
}
