/**
 * Course management — the catalogue and the review detail.
 *
 * The action row on each course is not fixed: it is derived from that course's
 * current status, because the server validates the transition and offering a
 * button that will be refused is worse than offering none. A course in review
 * can be published, rejected or sent back; a published one can be unpublished;
 * an archived one restored; a draft is the instructor's and shows no action at all.
 *
 * Nothing here edits course content. Moderation decides visibility; authorship
 * stays with the instructor, and there is no procedure on the server that would
 * let this screen do otherwise.
 */
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, BookOpen, ClipboardCheck, Layers } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLocale } from "../contexts/LocaleContextState";
import AdminShell from "./AdminShell";
import ResultState from "./ResultState";
import {
  AdminPanel, AdminTable, ConfirmDialog, DefinitionList, FilterBar, Outcome, Pager,
  RowAction, StatusBadge, statusLabel, type ConfirmRequest,
} from "./AdminUI";
import { resultError } from "../lib/result-state";
import { objectData, pagedMeta, pagedRows, pagedState } from "../lib/admin-paged";
import { useOnlineStatus } from "../lib/use-online-status";
import { useDebounced } from "../lib/use-debounced";
import type { TranslationKey } from "@/i18n/catalog";

type Row = {
  id: string; slug: string; title: string; subject: string; level: string; language: string;
  status: string; instructorId: string; instructorName: string | null;
  moduleCount: number; lessonCount: number; updatedAt: string;
};

type Action = "publish" | "reject" | "request_changes" | "unpublish" | "restore" | "verify" | "unverify";

/** Which actions the server will accept for a course in this status. */
export function actionsForStatus(status: string): Action[] {
  if (status === "in_review") return ["publish", "request_changes", "reject"];
  if (status === "published") return ["unpublish"];
  if (status === "archived") return ["restore"];
  return [];
}

const ACTION_LABEL: Record<Action, TranslationKey> = {
  publish: "adminCourses.publish",
  reject: "adminCourses.reject",
  request_changes: "adminCourses.requestChanges",
  unpublish: "adminCourses.unpublish",
  restore: "adminCourses.restore",
  verify: "adminUI.verifyCourse",
  unverify: "adminUI.unverifyCourse",
};

const FILTERS = ["all", "draft", "in_review", "published", "rejected", "archived"] as const;
const PAGE = 25;

function useCourseDecision(onDone: () => void) {
  const { t } = useLocale();
  const decide = trpc.admin.decideCourse.useMutation();
  /* The mark is a second, separate decision (0035): status is the author's, the mark is the
     reviewer's. It goes through the same confirmation dialog as every other admin write. */
  const verify = trpc.admin.verifyCourse.useMutation();
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string } | null>(null);

  const ask = (courseId: string, title: string, action: Action) => {
    setConfirm({
      title: t(`adminCourses.confirm.${action}` as TranslationKey),
      body: t("adminCourses.confirmBody", { title }),
      confirmLabel: t(ACTION_LABEL[action]),
      // Anything that sends a course back or removes it from discovery has to be
      // explainable afterwards, so those require a written reason.
      requireReason: action !== "publish" && action !== "restore" && action !== "verify" && action !== "unverify",
      destructive: action === "reject" || action === "unpublish",
      onConfirm: async (reason) => {
        // The mark and the status are different writes; the dialog is the same.
        const result = (action === "verify" || action === "unverify")
          ? (await verify.mutateAsync({ courseId, status: action === "verify" ? "approved" : "verification_pending" })) as { ok: boolean; error?: string }
          : (await decide.mutateAsync({ courseId, action, note: reason || undefined })) as { ok: boolean; error?: string };
        setOutcome({ ok: result.ok, text: result.ok ? t("adminCourses.saved") : result.error ?? t("common.error") });
        setConfirm(null);
        onDone();
      },
    });
  };

  return { ask, confirm, setConfirm, outcome, pending: decide.isPending || verify.isPending };
}

export default function AdminCoursesExperience() {
  const { t, formatNumber, formatDate } = useLocale();
  const online = useOnlineStatus();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [offset, setOffset] = useState(0);

  const debounced = useDebounced(search);
  const query = trpc.admin.courses.useQuery(
    { search: debounced || undefined, status: status as never, limit: PAGE, offset },
    { retry: false },
  );
  const { ask, confirm, setConfirm, outcome, pending } = useCourseDecision(() => query.refetch());

  const state = pagedState<Row>(query as never, online);
  const rows = pagedRows<Row>(query as never);
  const meta = pagedMeta<Row>(query as never);

  return (
    <AdminShell
      activeKey="courses"
      eyebrow={t("adminDesk.nav.courses")}
      title={t("adminCourses.title")}
      copy={t("adminCourses.copy")}
    >
      <AdminPanel>
        <FilterBar
          search={{ value: search, placeholder: t("adminCourses.searchPlaceholder"), onChange: (value) => { setSearch(value); setOffset(0); } }}
          filters={[{
            id: "course-status",
            label: t("adminUI.filterStatus"),
            value: status,
            options: FILTERS.map((value) => ({ value, label: statusLabel(t, value) })),
            onChange: (value) => { setStatus(value); setOffset(0); },
          }]}
          resultLabel={state === "ready" ? t("adminUI.resultCount", { count: formatNumber(meta.total) }) : undefined}
        />

        <Outcome outcome={outcome} />

        <div className="mt-5">
          {state !== "ready" ? (
            <ResultState
              state={state}
              message={state === "empty" ? t("adminCourses.empty") : resultError(query as never)}
              onRetry={() => query.refetch()}
              retrying={query.isFetching}
            />
          ) : (
            <>
              <AdminTable<Row>
                caption={t("adminCourses.tableCaption")}
                rows={rows}
                rowKey={(row) => row.id}
                columns={[
                  {
                    key: "title", header: t("adminCourses.colTitle"), primary: true,
                    cell: (row) => (
                      <span className="block min-w-0">
                        <Link href={`/admin/courses/${row.id}`} className="font-semibold ni-link outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]">
                          {row.title}
                        </Link>
                        <span className="mt-0.5 block text-xs ni-t-muted ltr-embed">{row.slug}</span>
                      </span>
                    ),
                  },
                  { key: "instructor", header: t("adminCourses.colInstructor"), cell: (row) => <span className="text-sm ni-t-muted">{row.instructorName ?? t("adminUI.none")}</span> },
                  { key: "category", header: t("adminCourses.colCategory"), cell: (row) => <span className="text-sm ni-t-muted">{row.subject} · {row.level}</span> },
                  {
                    key: "structure", header: t("adminCourses.colStructure"),
                    cell: (row) => (
                      <span className="text-sm ni-t-muted ltr-embed">
                        {formatNumber(row.moduleCount)} / {formatNumber(row.lessonCount)}
                      </span>
                    ),
                  },
                  { key: "status", header: t("adminUI.filterStatus"), cell: (row) => <StatusBadge status={row.status} label={statusLabel(t, row.status)} /> },
                  {
                    key: "updated", header: t("adminUI.updated"), align: "end",
                    cell: (row) => <span className="whitespace-nowrap text-xs ni-t-muted ltr-embed">{formatDate(row.updatedAt, { dateStyle: "medium" })}</span>,
                  },
                ]}
                actions={(row) => {
                  const available = actionsForStatus(row.status);
                  if (available.length === 0) return <span className="ni-label">{t("adminCourses.noAction")}</span>;
                  return (
                    <>
                      {available.map((action) => (
                        <RowAction
                          key={action}
                          onClick={() => ask(row.id, row.title, action)}
                          tone={action === "publish" ? "primary" : action === "reject" || action === "unpublish" ? "danger" : "quiet"}
                          disabled={pending}
                        >
                          {t(ACTION_LABEL[action])}
                        </RowAction>
                      ))}
                    </>
                  );
                }}
              />
              <Pager total={meta.total} limit={meta.limit} offset={meta.offset} onOffset={setOffset} />
            </>
          )}
        </div>
      </AdminPanel>

      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} busy={pending} />
    </AdminShell>
  );
}

/* -------------------------------------------------------------- detail page */

type Detail = {
  id: string; slug: string; title: string; description: string; subject: string; level: string;
  language: string; status: string; passMark: number | null; createdAt: string; updatedAt: string;
  /* The reviewer's mark on the course itself (0035), separate from the instructor's below. */
  verificationStatus: string;
  instructor: { id: string; name: string | null; verificationStatus: string | null };
  modules: Array<{ id: string; title: string; status: string; sortOrder: number; lessons: Array<{ id: string; title: string; status: string; sortOrder: number; durationSeconds: number | null; isPreview: boolean }> }>;
  assessments: { assignments: Array<{ id: string; title: string }>; quizzes: Array<{ id: string; title: string; questionCount: number }> };
  enrolmentCount: number;
  history: Array<{ id: string; action: string; actorName: string | null; from: string | null; to: string | null; note: string | null; createdAt: string }>;
};

export function AdminCourseDetailExperience({ courseId }: { courseId: string }) {
  const { t, formatNumber, formatDate } = useLocale();
  const online = useOnlineStatus();
  const [, setLocation] = useLocation();

  const query = trpc.admin.course.useQuery({ courseId }, { retry: false });
  const { ask, confirm, setConfirm, outcome, pending } = useCourseDecision(() => query.refetch());
  /* Separate from the decision above: status is the author's, the mark is the reviewer's (0035). */
  const verify = trpc.admin.verifyCourse.useMutation();
  const [verifyNotice, setVerifyNotice] = useState("");

  const state = pagedState<never>(query as never, online);
  const detail = objectData<Detail>(query as never);
  const available = detail ? actionsForStatus(detail.status) : [];

  const back = (
    <button type="button" onClick={() => setLocation("/admin/courses")} className="ni-btn ni-btn--outline text-sm">
      <ArrowLeft size={14} aria-hidden="true" className="rtl:-scale-x-100" />
      {t("adminUI.back")}
    </button>
  );

  return (
    <AdminShell
      activeKey="courses"
      eyebrow={t("adminDesk.nav.courses")}
      title={detail?.title ?? t("adminCourses.detailTitle")}
      copy={t("adminCourses.detailCopy")}
      actions={back}
    >
      {state !== "ready" || !detail ? (
        <ResultState
          state={state === "ready" ? "error" : state}
          message={resultError(query as never)}
          onRetry={() => query.refetch()}
          retrying={query.isFetching}
        />
      ) : (
        <div className="space-y-6">
          <Outcome outcome={outcome} />

          <AdminPanel
            title={t("adminCourses.decision")}
            description={available.length > 0 ? t("adminCourses.decisionCopy") : t("adminCourses.noActionCopy")}
            actions={available.map((action) => (
              <RowAction
                key={action}
                onClick={() => ask(detail.id, detail.title, action)}
                tone={action === "publish" ? "primary" : action === "reject" || action === "unpublish" ? "danger" : "quiet"}
                disabled={pending}
              >
                {t(ACTION_LABEL[action])}
              </RowAction>
            ))}
          >
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={detail.status} label={statusLabel(t, detail.status)} />
              {detail.instructor.verificationStatus && (
                <StatusBadge status={detail.instructor.verificationStatus} label={`${t("adminCourses.instructorIs")} ${statusLabel(t, detail.instructor.verificationStatus)}`} />
              )}
            </div>
          </AdminPanel>

          {/* The Verified mark. It changes nothing about who can see the course — that is the
              teacher's publication — and everything about what a learner is told. It is asked for
              through the same dialog as every other admin write, never fired straight from a click. */}
          <AdminPanel
            title={t("adminUI.verifyCourse")}
            description={detail.verificationStatus === "approved" ? t("course.verifiedCopy") : t("course.liveNotVerified")}
            actions={[
              <RowAction
                key="verify"
                onClick={() => ask(detail.id, detail.title, detail.verificationStatus === "approved" ? "unverify" : "verify")}
                tone={detail.verificationStatus === "approved" ? "quiet" : "primary"}
                disabled={pending}
              >
                {t(detail.verificationStatus === "approved" ? "adminUI.unverifyCourse" : "adminUI.verifyCourse")}
              </RowAction>,
            ]}
          >
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={detail.verificationStatus} label={statusLabel(t, detail.verificationStatus)} />
            </div>
          </AdminPanel>

          <div className="grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
            <AdminPanel title={t("adminCourses.information")}>
              <DefinitionList
                items={[
                  { label: t("adminCourses.colInstructor"), value: <Link href={`/admin/users/${detail.instructor.id}`} className="ni-link hover:underline">{detail.instructor.name ?? t("adminUI.none")}</Link> },
                  { label: t("adminCourses.slug"), value: <span className="ltr-embed">{detail.slug}</span> },
                  { label: t("adminCourses.subject"), value: detail.subject },
                  { label: t("adminCourses.level"), value: detail.level },
                  { label: t("adminCourses.language"), value: detail.language },
                  { label: t("adminCourses.enrolments"), value: <span className="ltr-embed">{formatNumber(detail.enrolmentCount)}</span> },
                  { label: t("adminCourses.passMark"), value: detail.passMark === null ? t("adminCourses.passMarkUnset") : <span className="ltr-embed">{formatNumber(detail.passMark)}%</span> },
                  { label: t("adminCourses.created"), value: <span className="ltr-embed">{formatDate(detail.createdAt, { dateStyle: "medium" })}</span> },
                ]}
              />
              {detail.description && (
                <>
                  <hr className="ni-rule my-4" />
                  <p className="ni-label">{t("adminCourses.description")}</p>
                  <p className="mt-1.5 whitespace-pre-line text-sm leading-6 ni-t-muted">{detail.description}</p>
                </>
              )}
            </AdminPanel>

            <AdminPanel title={t("adminCourses.assessments")} description={t("adminCourses.assessmentsCopy")}>
              {detail.assessments.assignments.length === 0 && detail.assessments.quizzes.length === 0 ? (
                <ResultState state="empty" message={t("adminCourses.noAssessments")} />
              ) : (
                <div className="space-y-4">
                  {detail.assessments.quizzes.length > 0 && (
                    <div>
                      <p className="ni-label">{t("adminCourses.quizzes")}</p>
                      <ul className="mt-2 space-y-1.5">
                        {detail.assessments.quizzes.map((quiz) => (
                          <li key={quiz.id} className="flex flex-wrap items-center justify-between gap-2 text-sm ni-t-ink">
                            <span className="min-w-0">{quiz.title}</span>
                            <span className="ni-label ltr-embed">{formatNumber(quiz.questionCount)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {detail.assessments.assignments.length > 0 && (
                    <div>
                      <p className="ni-label">{t("adminCourses.assignments")}</p>
                      <ul className="mt-2 space-y-1.5">
                        {detail.assessments.assignments.map((assignment) => (
                          <li key={assignment.id} className="text-sm ni-t-ink">{assignment.title}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </AdminPanel>
          </div>

          <AdminPanel title={t("adminCourses.structure")} description={t("adminCourses.structureCopy")}>
            {detail.modules.length === 0 ? (
              <ResultState state="empty" message={t("adminCourses.noModules")} />
            ) : (
              <ol className="space-y-3">
                {detail.modules.map((module) => (
                  <li key={module.id} className="rounded-[9px] border border-[var(--ni-sage-line)] bg-[var(--ni-field)] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <Layers size={15} aria-hidden="true" className="shrink-0 ni-t-gold" />
                        <span className="min-w-0 font-semibold ni-t-ink">{module.title}</span>
                      </span>
                      <StatusBadge status={module.status} label={statusLabel(t, module.status)} />
                    </div>
                    {module.lessons.length === 0 ? (
                      <p className="mt-2.5 text-xs ni-t-muted-soft">{t("adminCourses.noLessons")}</p>
                    ) : (
                      <ul className="mt-2.5 space-y-1.5">
                        {module.lessons.map((lesson) => (
                          <li key={lesson.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--ni-sage)] pt-1.5 text-sm first:border-t-0 first:pt-0">
                            <span className="flex min-w-0 items-center gap-2 ni-t-ink">
                              <BookOpen size={13} aria-hidden="true" className="shrink-0 ni-t-muted-soft" />
                              <span className="min-w-0">{lesson.title}</span>
                              {lesson.isPreview && <span className="ni-label">{t("adminCourses.preview")}</span>}
                            </span>
                            <span className="flex items-center gap-2">
                              {lesson.durationSeconds !== null && (
                                <span className="ni-label ltr-embed">{formatNumber(Math.round(lesson.durationSeconds / 60))}m</span>
                              )}
                              <StatusBadge status={lesson.status} label={statusLabel(t, lesson.status)} />
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </AdminPanel>

          <AdminPanel title={t("adminCourses.history")} description={t("adminCourses.historyCopy")}>
            {detail.history.length === 0 ? (
              <ResultState state="empty" message={t("adminCourses.noHistory")} />
            ) : (
              <ol className="space-y-0">
                {detail.history.map((entry) => (
                  <li key={entry.id} className="flex gap-3 border-b border-[var(--ni-sage)] py-3.5 last:border-b-0">
                    <ClipboardCheck size={15} aria-hidden="true" className="mt-0.5 shrink-0 ni-t-gold" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold ni-t-ink ltr-embed">{entry.action}</p>
                      <p className="mt-1 text-xs leading-5 ni-t-muted">
                        {entry.actorName ?? t("adminUI.system")}
                        {entry.from && entry.to && <> · <span className="ltr-embed">{statusLabel(t, entry.from)} → {statusLabel(t, entry.to)}</span></>}
                      </p>
                      {entry.note && <p className="mt-1.5 rounded-[7px] bg-[var(--ni-sage-soft)] px-2.5 py-2 text-xs leading-5 ni-t-muted">{entry.note}</p>}
                      <p className="mt-1 text-[11px] ni-t-muted-soft ltr-embed">{formatDate(entry.createdAt, { dateStyle: "medium", timeStyle: "short" })}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </AdminPanel>
        </div>
      )}

      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} busy={pending} />
    </AdminShell>
  );
}
