/**
 * Progress — a module the sidebar offered and nothing served.
 *
 * `/dashboard/learner/progress` had no route of its own, so it fell through to the dashboard's
 * catch-all, which printed a hardcoded English line — "Lesson completion and learning activity
 * will be tracked here" — under a gold "Setup needed" banner. Every one of those facts was already
 * being recorded; nobody had written the page that reads them.
 *
 * Nothing new is stored for this. Four reads that already existed answer it:
 *
 *  - `supabaseCore.learnerWorkspace` — enrolments, their courses, those courses' modules and lessons,
 *    and this learner's `lesson_progress` rows. Per-course completion is derived here rather than
 *    on the server, because it is a count over rows the caller already has.
 *  - `supabaseCore.hifzPlans` — memorisation, which is progress that no course carries.
 *  - `scheduling.myCertificates` — what has actually been awarded.
 *  - `scheduling.learnerSessions` — classes attended, counted from completed sessions only.
 *
 * Two things this page refuses to do. It never invents a percentage for a course with no lessons
 * published yet — an empty course is "not started", not 0% of nothing — and it never counts a
 * scheduled class as attended. Both would read as progress somebody had not made.
 */
import { useMemo } from "react";
import { Link } from "wouter";
import { Award, BookOpen, CalendarCheck, GraduationCap } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useLocale } from "../contexts/LocaleContextState";
import ResultState from "./ResultState";
import { resultError, resultState } from "../lib/result-state";
import { useOnlineStatus } from "../lib/use-online-status";
import { trpc } from "../lib/trpc";
import { supabaseClient } from "../lib/supabase-client";

type Workspace = {
  enrolments: { id: string; course_id: string; status: string; enrolled_at: string; completed_at: string | null }[];
  courses: { id: string; slug: string; title: string; subject: string; level: string }[];
  modules: { id: string; course_id: string; title: string }[];
  lessons: { id: string; module_id: string; title: string }[];
  progress: { lesson_id: string; status: string; progress_percent: number }[];
};

type CourseProgress = {
  id: string; slug: string; title: string; subject: string;
  total: number; done: number; percent: number | null;
};

/** One headline number. The icon carries the meaning when the label wraps. */
function Tile({ icon: Icon, label, value }: { icon: typeof Award; label: string; value: number }) {
  const { formatNumber } = useLocale();
  return (
    <div className="ni-ed-card p-4">
      <Icon size={17} aria-hidden="true" className="ni-t-gold" />
      <p className="mt-2.5 font-display text-3xl ni-t-ink tabular-nums">{formatNumber(value)}</p>
      <p className="mt-0.5 text-xs font-semibold ni-t-muted">{label}</p>
    </div>
  );
}

export default function LearnerProgress() {
  const { t, formatNumber } = useLocale();
  const { currentSession } = useAuth();
  const online = useOnlineStatus();
  const realMode = Boolean(supabaseClient && currentSession);

  const workspaceQuery = trpc.supabaseCore.learnerWorkspace.useQuery(undefined, { enabled: realMode });
  const hifzQuery = trpc.supabaseCore.hifzPlans.useQuery(undefined, { enabled: realMode });
  const certificatesQuery = trpc.scheduling.myCertificates.useQuery(undefined, { enabled: realMode });
  const sessionsQuery = trpc.scheduling.learnerSessions.useQuery(undefined, { enabled: realMode });

  /* The workspace is the page; the other three decorate it. So only its failure replaces the
     screen, and a certificate list that will not load costs one tile rather than everything. */
  const state = resultState(workspaceQuery as never, online);
  const broken = state === "loading" || state === "error" || state === "offline" || state === "setup" || state === "forbidden";

  const workspace = (workspaceQuery.data?.ok ? workspaceQuery.data.data : null) as Workspace | null;
  const hifz = (hifzQuery.data?.ok ? hifzQuery.data.data : []) as { id: string; title: string; daily_target_ayahs: number; status: string }[];
  const certificates = (certificatesQuery.data?.ok ? certificatesQuery.data.data : []) as unknown[];
  const sessions = (sessionsQuery.data?.ok ? sessionsQuery.data.data : []) as { status: string }[];

  /**
   * Per-course completion, derived from rows the caller already holds.
   *
   * A course's lessons are the lessons of its modules, and `lesson_progress` is keyed by lesson —
   * so the two are joined through `module_id` rather than asked for again. A course whose lessons
   * are not published yet gets `null`, not zero: "nothing to do yet" and "none of it done" look
   * the same as a number and are not the same thing to read.
   */
  const courses = useMemo<CourseProgress[]>(() => {
    if (!workspace) return [];
    const completed = new Set(workspace.progress.filter((row) => row.status === "completed").map((row) => row.lesson_id));
    const lessonsByModule = new Map<string, string[]>();
    for (const lesson of workspace.lessons) {
      const held = lessonsByModule.get(lesson.module_id);
      if (held) held.push(lesson.id); else lessonsByModule.set(lesson.module_id, [lesson.id]);
    }
    const byCourse = new Map<string, string[]>();
    for (const module of workspace.modules) {
      const ids = lessonsByModule.get(module.id) ?? [];
      const held = byCourse.get(module.course_id);
      if (held) held.push(...ids); else byCourse.set(module.course_id, [...ids]);
    }
    return workspace.courses.map((course) => {
      const lessonIds = byCourse.get(course.id) ?? [];
      const done = lessonIds.filter((id) => completed.has(id)).length;
      return {
        id: course.id, slug: course.slug, title: course.title, subject: course.subject,
        total: lessonIds.length, done,
        percent: lessonIds.length === 0 ? null : Math.round((done / lessonIds.length) * 100),
      };
    });
  }, [workspace]);

  const lessonsDone = workspace?.progress.filter((row) => row.status === "completed").length ?? 0;
  // Attended means attended. A scheduled class is a plan, not an attendance.
  const attended = sessions.filter((session) => session.status === "completed").length;

  return (
    <main className="mx-auto max-w-6xl px-5 py-10 lg:px-8 lg:py-14">
      <h1 className="sr-only">{t("progress.title")}</h1>

      {broken ? (
        <ResultState
          state={state === "loading" ? "loading" : (state as "error" | "offline" | "setup" | "forbidden")}
          message={resultError(workspaceQuery as never)}
          onRetry={() => workspaceQuery.refetch()}
          retrying={workspaceQuery.isFetching}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile icon={BookOpen} label={t("progress.coursesActive")} value={courses.length} />
            <Tile icon={GraduationCap} label={t("progress.lessonsDone")} value={lessonsDone} />
            <Tile icon={CalendarCheck} label={t("progress.classesAttended")} value={attended} />
            <Tile icon={Award} label={t("progress.certificates")} value={certificates.length} />
          </div>

          <section className="mt-9">
            <h2 className="font-display text-xl ni-t-ink">{t("progress.byCourse")}</h2>
            {courses.length === 0 ? (
              <div className="ni-ed-card mt-3 p-5">
                <p className="text-sm ni-t-muted">{t("progress.noCourses")}</p>
                <Link href="/courses" className="ni-btn ni-btn--primary mt-4 text-sm">{t("progress.browseCourses")}</Link>
              </div>
            ) : (
              <ul className="mt-3 grid gap-3 md:grid-cols-2">
                {courses.map((course) => (
                  <li key={course.id} className="ni-ed-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-display text-lg ni-t-moss">{course.title}</p>
                        <p className="text-xs ni-t-muted">{course.subject}</p>
                      </div>
                      <span className="ni-verify shrink-0 tabular-nums">
                        {course.percent === null ? t("progress.notStarted") : t("progress.complete", { percent: formatNumber(course.percent) })}
                      </span>
                    </div>

                    {/* A course with no published lessons gets no bar, because there is nothing to fill. */}
                    {course.percent !== null && (
                      <>
                        <div className="ni-progress ni-progress--gold mt-3.5" role="presentation">
                          <div className="ni-progress__bar" style={{ "--value": course.percent } as React.CSSProperties} />
                        </div>
                        <p className="mt-2 text-xs ni-t-muted tabular-nums">
                          {t("progress.ofLessons", { done: formatNumber(course.done), total: formatNumber(course.total) })}
                        </p>
                      </>
                    )}

                    <Link href={`/courses/${course.slug}`} className="ni-btn ni-btn--outline mt-3.5 text-sm">
                      {t("progress.openCourse")}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-9">
            <h2 className="font-display text-xl ni-t-ink">{t("progress.hifz")}</h2>
            {hifz.length === 0 ? (
              <div className="ni-ed-card mt-3 p-5">
                <p className="text-sm ni-t-muted">{t("progress.noHifz")}</p>
                <Link href="/dashboard/learner/hifz" className="ni-btn ni-btn--outline mt-4 text-sm">{t("progress.openHifz")}</Link>
              </div>
            ) : (
              <ul className="mt-3 flex flex-wrap gap-2">
                {hifz.map((plan) => (
                  <li key={plan.id} className="ni-verify">
                    {plan.title} · {t("progress.ayahsPerDay", { count: formatNumber(plan.daily_target_ayahs) })}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}
