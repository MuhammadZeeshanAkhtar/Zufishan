/**
 * Assessments: the quiz player, assignment submission, and the instructor's grading desk.
 *
 * The whole module had no UI at all — seven procedures, zero callers — so quizzes and assignments
 * could be created by the server and never taken, submitted or graded by anyone.
 *
 * Two rules shape this file and are worth stating plainly, because both are enforced elsewhere and
 * are only *mirrored* here:
 *
 * 1. Answer keys never reach a learner. `listCourseQuizzes` strips `answer` from every question for
 *    anyone who does not own the course, so the payload this screen renders simply does not contain
 *    them. Nothing here hides an answer that arrived — none arrives.
 *
 * 2. A learner cannot set their own score. Their answers are written on their own client; the score
 *    is written by the marking service through the service role, and migration 0016 rejects a
 *    self-assigned score at the database on insert and on update. So this screen has no score field
 *    to submit, and the result it displays is the server's, read back — never computed locally.
 *
 * Grading is the mirror image: an instructor's own client has no write access to a learner's
 * submission row at all (`submissions_learner_write` is learner-only), so `gradeSubmission` verifies
 * course ownership server-side and writes through the service role.
 */
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, ClipboardList, FileText, Loader2, Send } from "lucide-react";
import { trpc } from "../lib/trpc";
import { useAuth } from "../contexts/AuthContext";
import { useLocale } from "../contexts/LocaleContextState";
import { useHasDashboardChrome } from "../lib/use-dashboard-chrome";
import ResultState from "./ResultState";
import { resultError, resultRows, resultState, type ResultState as State } from "../lib/result-state";
import { useOnlineStatus } from "../lib/use-online-status";

/** A question as it reaches a learner: the key has already been stripped server-side. */
type Question = { id?: string; prompt?: string };
type Quiz = { id: string; title: string; questions: Question[] };
type Attempt = { id: string; quiz_id: string; answers: Record<string, unknown>; score: number | null; submitted_at: string | null; created_at: string };
type Assignment = { id: string; title: string; instructions: string | null; due_offset_days: number | null };
type Submission = {
  id: string; assignment_id: string; learner_id: string; learner_name?: string;
  body: string | null; object_path: string | null; status: string; score: number | null; updated_at: string;
  assignments?: { id: string; title: string };
};

const panel = "rounded-[1.35rem] border border-[var(--ni-sage)] bg-[var(--ni-paper)] p-6";
const primary = "inline-flex items-center justify-center gap-2 rounded-full bg-[var(--ni-moss)] px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50";
const quiet = "inline-flex items-center justify-center gap-2 rounded-full border border-[var(--ni-sage-mid)] px-4 py-2.5 text-sm font-bold ni-t-moss disabled:opacity-50";
const field = "mt-2 w-full rounded-xl border border-[var(--ni-sage-line)] bg-[var(--ni-field)] px-3 py-3 text-sm outline-none focus:border-[var(--ni-moss)] focus:ring-2 focus:ring-[var(--ni-sage-mid)]";

function Shell({ backHref, eyebrow, title, copy, children }: { backHref: string; eyebrow: string; title: string; copy: string; children: React.ReactNode }) {
  const { t } = useLocale();
  const hasChrome = useHasDashboardChrome();
  return (
    <div className="min-h-screen bg-[var(--ni-bg)] ni-t-ink">
      <header className="border-b border-[var(--ni-sage)] bg-[var(--ni-paper)]">
        <div className="mx-auto flex min-w-0 max-w-4xl items-center gap-4 px-5 py-4 lg:px-8">
          {/* The dashboard sidebar already offers this; it stays only where there is none. */}
          {!hasChrome && (
            <Link href={backHref} className="inline-flex items-center gap-2 text-sm font-bold ni-t-moss">
              <ArrowLeft size={15} className="rtl:rotate-180" aria-hidden="true" /> {t("dashboard.back")}
            </Link>
          )}
        </div>
      </header>
      <main className="mx-auto w-full min-w-0 max-w-4xl px-5 py-12 lg:px-8 lg:py-16">
        <p className="max-w-[62ch] text-sm leading-7 ni-t-muted">{copy}</p>
        {children}
      </main>
    </div>
  );
}

const dateOf = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
};

/* -------------------------------------------------------------- quiz player */

function QuizPlayer({ quiz, attempts, onDone }: { quiz: Quiz; attempts: Attempt[]; onDone: () => void }) {
  const { t } = useLocale();
  const submit = trpc.scheduling.submitQuizAttempt.useMutation();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);
  const [failure, setFailure] = useState("");
  const [result, setResult] = useState<{ score: number; markable: number } | null>(null);

  // Only questions carrying an id can be marked, and only those are answerable.
  const questions = useMemo(() => quiz.questions.filter((question) => typeof question.id === "string"), [quiz.questions]);
  const best = attempts.reduce<number | null>((top, row) => (row.score === null ? top : top === null ? row.score : Math.max(top, row.score)), null);
  const answered = questions.filter((question) => (answers[question.id as string] ?? "").trim().length > 0).length;
  const complete = questions.length > 0 && answered === questions.length;

  const send = async () => {
    setFailure("");
    try {
      const response = await submit.mutateAsync({ quizId: quiz.id, answers });
      if (!response.ok) { setFailure(response.error); return; }
      // The score shown is the one the server returned, never a local calculation.
      const data = response.data as { score: number; markable: number };
      setResult({ score: data.score, markable: data.markable });
      setAnswers({});
      onDone();
    } catch {
      setFailure(t("assess.submitFailed"));
    }
  };

  return (
    <article className={panel}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-2xl">{quiz.title}</h2>
          <p className="mt-1 text-xs ni-t-muted">
            {t("assess.questionCount", { count: questions.length })}
            {attempts.length > 0 && ` · ${t("assess.attemptCount", { count: attempts.length })}`}
            {best !== null && ` · ${t("assess.bestScore", { score: String(best) })}`}
          </p>
        </div>
        <button type="button" onClick={() => { setOpen((value) => !value); setResult(null); }} className={quiet} aria-expanded={open}>
          <ClipboardList size={15} aria-hidden="true" />
          {open ? t("common.close") : attempts.length ? t("assess.tryAgain") : t("assess.start")}
        </button>
      </div>

      {result && (
        <p role="status" className="mt-4 rounded-xl border border-[var(--ni-sage-mid)] bg-[var(--ni-sage-soft)] px-4 py-3 text-sm leading-6 ni-t-moss-deep">
          {t("assess.scored", { score: String(result.score), count: result.markable })}
        </p>
      )}

      {open && (
        <div className="mt-5 space-y-5">
          {questions.length === 0 && <ResultState state="empty" message={t("assess.noQuestions")} />}

          {questions.map((question, index) => (
            <div key={question.id}>
              <label className="block text-sm font-bold ni-t-moss-deep">
                <span className="me-2 ni-t-muted-soft tabular">{index + 1}.</span>
                {question.prompt || t("assess.untitledQuestion")}
                <input
                  value={answers[question.id as string] ?? ""}
                  onChange={(event) => setAnswers((current) => ({ ...current, [question.id as string]: event.target.value }))}
                  disabled={submit.isPending}
                  maxLength={2000}
                  className={field}
                  autoComplete="off"
                />
              </label>
            </div>
          ))}

          {questions.length > 0 && (
            <>
              <p className="text-xs ni-t-muted-soft tabular">{answered}/{questions.length}</p>
              <button type="button" onClick={send} disabled={!complete || submit.isPending} aria-busy={submit.isPending} className={primary}>
                {submit.isPending ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Send size={15} className="icon-directional" aria-hidden="true" />}
                {submit.isPending ? t("assess.submitting") : t("assess.submitAttempt")}
              </button>
              {!complete && <p className="mt-2 text-xs ni-t-muted">{t("assess.answerAll")}</p>}
            </>
          )}

          {failure && (
            <p role="alert" className="flex flex-wrap items-center gap-2 rounded-xl bg-[var(--ni-clay-soft)] px-4 py-3 text-sm ni-t-clay">
              {failure}
              <button type="button" onClick={send} className="font-bold underline">{t("common.retry")}</button>
            </p>
          )}
        </div>
      )}

      {attempts.length > 0 && (
        <ul className="mt-5 space-y-1.5 border-t border-[var(--ni-sage)] pt-4">
          {attempts.slice(0, 5).map((attempt) => (
            <li key={attempt.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="ni-t-muted-soft ltr-embed">{dateOf(attempt.submitted_at ?? attempt.created_at)}</span>
              <span className="font-bold ni-t-moss-deep tabular">
                {attempt.score === null ? t("assess.notMarked") : `${attempt.score}%`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

/* ------------------------------------------------------ assignment submission */

function AssignmentCard({ assignment, submission, onDone }: { assignment: Assignment; submission?: Submission; onDone: () => void }) {
  const { t } = useLocale();
  const submit = trpc.scheduling.submitAssignment.useMutation();
  const [body, setBody] = useState(submission?.body ?? "");
  const [open, setOpen] = useState(false);
  const [failure, setFailure] = useState("");
  const [saved, setSaved] = useState(false);

  // A graded submission is closed: re-submitting would silently invalidate a grade already given.
  const graded = submission?.status === "graded" || submission?.score !== null && submission?.score !== undefined;

  const send = async () => {
    setFailure(""); setSaved(false);
    try {
      const response = await submit.mutateAsync({ assignmentId: assignment.id, body: body.trim() });
      if (!response.ok) { setFailure(response.error); return; }
      setSaved(true); setOpen(false); onDone();
    } catch {
      setFailure(t("assess.submitFailed"));
    }
  };

  return (
    <article className={panel}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-2xl">{assignment.title}</h2>
          {assignment.instructions && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 ni-t-muted">{assignment.instructions}</p>}
        </div>
        {submission && (
          <span className="shrink-0 rounded-full bg-[var(--ni-sage-soft)] px-3 py-1 text-[10px] font-bold uppercase tracking-[.14em] ni-t-moss-deep">
            {t(`assess.status.${submission.status}` as never)}
          </span>
        )}
      </div>

      {submission?.score !== null && submission?.score !== undefined && (
        <p className="mt-4 rounded-xl border border-[var(--ni-sage-mid)] bg-[var(--ni-sage-soft)] px-4 py-3 text-sm font-bold ni-t-moss-deep">
          {t("assess.yourGrade", { score: String(submission.score) })}
        </p>
      )}

      {saved && <p role="status" className="mt-4 text-sm font-bold ni-t-moss">{t("assess.submitted")}</p>}

      {graded ? (
        <p className="mt-4 text-xs leading-5 ni-t-muted">{t("assess.gradedLocked")}</p>
      ) : (
        <>
          <button type="button" onClick={() => setOpen((value) => !value)} className={`${quiet} mt-4`} aria-expanded={open}>
            <FileText size={15} aria-hidden="true" />
            {open ? t("common.close") : submission ? t("assess.editSubmission") : t("assess.submitWork")}
          </button>

          {open && (
            <div className="mt-4">
              <label className="block text-sm font-bold ni-t-moss-deep">
                {t("assess.yourWork")}
                <textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  rows={7}
                  maxLength={20000}
                  disabled={submit.isPending}
                  className={field}
                  placeholder={t("assess.yourWorkPlaceholder")}
                />
              </label>
              <p className="mt-1 text-xs ni-t-muted-soft tabular">{body.trim().length}/20000</p>

              <button type="button" onClick={send} disabled={!body.trim() || submit.isPending} aria-busy={submit.isPending} className={`${primary} mt-4`}>
                {submit.isPending ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Send size={15} className="icon-directional" aria-hidden="true" />}
                {submit.isPending ? t("assess.submitting") : t("assess.submitWork")}
              </button>
              {/* File attachment rides on `object_path`, which needs the storage upload flow. */}
              <p className="mt-2 text-xs ni-t-muted-soft">{t("assess.attachmentsNotConnected")}</p>

              {failure && (
                <p role="alert" className="mt-3 flex flex-wrap items-center gap-2 text-sm ni-t-clay">
                  {failure}
                  <button type="button" onClick={send} className="font-bold underline">{t("common.retry")}</button>
                </p>
              )}
            </div>
          )}
        </>
      )}
    </article>
  );
}

/* ------------------------------------------------------------ learner screen */

export function CourseAssessmentsPage({ courseId }: { courseId: string }) {
  const { t } = useLocale();
  const { currentSession } = useAuth();
  const online = useOnlineStatus();
  const signedIn = Boolean(currentSession);

  const quizzes = trpc.scheduling.courseQuizzes.useQuery({ courseId }, { enabled: signedIn, retry: false });
  const assignments = trpc.scheduling.courseAssignments.useQuery({ courseId }, { enabled: signedIn, retry: false });
  const attempts = trpc.scheduling.myQuizAttempts.useQuery({}, { enabled: signedIn, retry: false });
  const submissions = trpc.scheduling.courseSubmissions.useQuery({ courseId }, { enabled: signedIn, retry: false });

  const quizRows = resultRows<Quiz>(quizzes as never);
  const assignmentRows = resultRows<Assignment>(assignments as never);
  const attemptRows = resultRows<Attempt>(attempts as never);
  const submissionRows = (submissions.data?.ok ? (submissions.data.data as { submissions: Submission[] }).submissions : []) ?? [];

  const attemptsByQuiz = useMemo(() => {
    const map = new Map<string, Attempt[]>();
    for (const row of attemptRows) {
      if (!map.has(row.quiz_id)) map.set(row.quiz_id, []);
      map.get(row.quiz_id)!.push(row);
    }
    return map;
  }, [attemptRows]);

  const submissionByAssignment = useMemo(
    () => new Map(submissionRows.map((row) => [row.assignment_id, row])),
    [submissionRows],
  );

  // Quizzes and assignments load separately; the panel reports the first that is not ready, so a
  // failure on either is visible rather than being hidden by the other's success.
  const quizState = resultState(quizzes as never, online);
  const assignmentState = resultState(assignments as never, online);
  const problem = [quizState, assignmentState].find((state) => state !== "ready" && state !== "empty");
  const bothEmpty = quizState === "empty" && assignmentState === "empty";
  const state: State | undefined = problem ?? (bothEmpty ? "empty" : undefined);

  const refetchAll = () => { void quizzes.refetch(); void assignments.refetch(); void attempts.refetch(); void submissions.refetch(); };

  if (!signedIn) {
    return (
      <Shell backHref="/dashboard/learner/courses" eyebrow={t("assess.eyebrow")} title={t("assess.title")} copy={t("assess.copy")}>
        <div className="mt-8"><ResultState state="forbidden" message={t("messaging.unauthorized")} /></div>
      </Shell>
    );
  }

  return (
    <Shell backHref={`/dashboard/learner/courses/${courseId}`} eyebrow={t("assess.eyebrow")} title={t("assess.title")} copy={t("assess.copy")}>
      <div className="mt-8 space-y-5">
        {state && (
          <ResultState
            state={state}
            message={state === "empty" ? t("assess.none") : resultError(quizzes as never) ?? resultError(assignments as never)}
            onRetry={refetchAll}
            retrying={quizzes.isFetching || assignments.isFetching}
          />
        )}

        {quizRows.map((quiz) => (
          <QuizPlayer key={quiz.id} quiz={quiz} attempts={attemptsByQuiz.get(quiz.id) ?? []} onDone={() => void attempts.refetch()} />
        ))}

        {assignmentRows.map((assignment) => (
          <AssignmentCard
            key={assignment.id}
            assignment={assignment}
            submission={submissionByAssignment.get(assignment.id)}
            onDone={() => void submissions.refetch()}
          />
        ))}
      </div>
    </Shell>
  );
}

/* --------------------------------------------------------- instructor screen */

export function SubmissionsGradingPage({ courseId }: { courseId: string }) {
  const { t } = useLocale();
  const { currentSession } = useAuth();
  const online = useOnlineStatus();
  const signedIn = Boolean(currentSession);

  const query = trpc.scheduling.courseSubmissions.useQuery({ courseId }, { enabled: signedIn, retry: false });
  const grade = trpc.scheduling.gradeSubmission.useMutation();

  const [scores, setScores] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState("");
  const [busyId, setBusyId] = useState("");
  const [savedId, setSavedId] = useState("");

  const payload = query.data?.ok ? (query.data.data as { submissions: Submission[]; isCourseOwner: boolean }) : null;
  const rows = payload?.submissions ?? [];
  const base = resultState(query as never, online);
  const state: State = base === "ready" && !rows.length ? "empty" : base;

  const send = async (submission: Submission) => {
    const raw = scores[submission.id] ?? "";
    const score = Number(raw);
    setFailure(""); setSavedId("");
    if (raw.trim() === "" || !Number.isFinite(score) || score < 0 || score > 100) {
      setFailure(t("assess.scoreRange"));
      return;
    }
    setBusyId(submission.id);
    try {
      const result = await grade.mutateAsync({ submissionId: submission.id, score });
      if (!result.ok) { setFailure(result.error); return; }
      setSavedId(submission.id);
      await query.refetch();
    } catch {
      setFailure(t("assess.gradeFailed"));
    } finally {
      setBusyId("");
    }
  };

  if (!signedIn) {
    return (
      <Shell backHref="/dashboard/instructor/courses" eyebrow={t("assess.gradingEyebrow")} title={t("assess.gradingTitle")} copy={t("assess.gradingCopy")}>
        <div className="mt-8"><ResultState state="forbidden" message={t("messaging.unauthorized")} /></div>
      </Shell>
    );
  }

  return (
    <Shell
      backHref={`/dashboard/instructor/courses/${courseId}/edit`}
      eyebrow={t("assess.gradingEyebrow")}
      title={t("assess.gradingTitle")}
      copy={t("assess.gradingCopy")}
    >
      <div className="mt-8 space-y-5">
        {/* The read policy returns a non-owner only their own rows; say so rather than showing a
            short list that looks like the whole class. */}
        {payload && !payload.isCourseOwner && <ResultState state="forbidden" message={t("assess.notCourseOwner")} />}

        {state !== "ready" && (
          <ResultState
            state={state}
            message={state === "empty" ? t("assess.noSubmissions") : resultError(query as never)}
            onRetry={() => query.refetch()}
            retrying={query.isFetching}
          />
        )}

        {failure && <p role="alert" className="rounded-xl bg-[var(--ni-clay-soft)] px-4 py-3 text-sm ni-t-clay">{failure}</p>}

        {state === "ready" && payload?.isCourseOwner && rows.map((submission) => (
          <article key={submission.id} className={panel}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-display text-xl">{submission.assignments?.title ?? t("assess.untitledAssignment")}</h2>
                <p className="mt-1 text-xs ni-t-muted">
                  {submission.learner_name || t("assess.unnamedLearner")} · <span className="ltr-embed">{dateOf(submission.updated_at)}</span>
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-[var(--ni-sage-soft)] px-3 py-1 text-[10px] font-bold uppercase tracking-[.14em] ni-t-moss-deep">
                {t(`assess.status.${submission.status}` as never)}
              </span>
            </div>

            {submission.body && (
              <p className="mt-4 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl bg-[var(--ni-field)] p-4 text-sm leading-6">{submission.body}</p>
            )}

            <div className="mt-4 flex flex-wrap items-end gap-3">
              <label className="text-sm font-bold ni-t-moss-deep">
                {t("assess.score")}
                <input
                  type="number"
                  min={0}
                  max={100}
                  inputMode="numeric"
                  value={scores[submission.id] ?? (submission.score === null ? "" : String(submission.score))}
                  onChange={(event) => setScores((current) => ({ ...current, [submission.id]: event.target.value }))}
                  disabled={busyId === submission.id}
                  className={`${field} w-28 ltr-embed`}
                />
              </label>
              <button
                type="button"
                onClick={() => send(submission)}
                disabled={busyId === submission.id || grade.isPending}
                aria-busy={busyId === submission.id}
                className={primary}
              >
                {busyId === submission.id ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : null}
                {t("assess.saveGrade")}
              </button>
              {savedId === submission.id && <span role="status" className="text-sm font-bold ni-t-moss">{t("common.saved")}</span>}
            </div>
          </article>
        ))}
      </div>
    </Shell>
  );
}
