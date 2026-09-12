/**
 * Certificates: the learner's list, the print-ready certificate, and public verification.
 *
 * Nothing here decides anything. Eligibility is decided by `certificateEligibility` from rows the
 * database scopes to the caller, and issuance re-decides it server-side before writing — so an
 * ineligible learner cannot render a valid certificate by reaching this screen, editing state, or
 * guessing a URL. What this file does is say, precisely, which of the six outcomes applies, because
 * "not eligible" alone tells someone nothing about what to do next.
 *
 * The verification code shown here and printed on the certificate is the same string the public
 * lookup accepts. It is a random code, never the row id.
 */
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Award, ArrowLeft, CheckCircle2, Loader2, Printer, ShieldCheck, XCircle } from "lucide-react";
import { trpc } from "../lib/trpc";
import { useAuth } from "../contexts/AuthContext";
import { useLocale } from "../contexts/LocaleContextState";
import { useHasDashboardChrome } from "../lib/use-dashboard-chrome";
import ResultState from "./ResultState";
import { resultError, resultRows, resultState, type ResultState as State } from "../lib/result-state";
import { useOnlineStatus } from "../lib/use-online-status";

type Eligibility = {
  eligible: boolean;
  reason: "eligible" | "no_lessons" | "lessons_incomplete" | "pass_mark_not_set" | "assessment_incomplete" | "assessment_failed";
  lessonsTotal: number; lessonsCompleted: number;
  hasAssessment: boolean; passMark: number | null;
  averageScore: number | null; assessmentsTotal: number; assessmentsScored: number;
  certificate: { id: string; status: string; issued_at: string | null; verification_code: string | null } | null;
};
type CertificateRow = {
  id: string; course_id: string; status: string; issued_at: string | null;
  verification_code: string | null; courses?: { title: string; slug: string }; profiles?: { display_name: string };
};

const panel = "rounded-[1.35rem] border border-[var(--ni-sage)] bg-[var(--ni-paper)] p-6";
const primary = "inline-flex items-center justify-center gap-2 rounded-full bg-[var(--ni-moss)] px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50";
const quiet = "inline-flex items-center justify-center gap-2 rounded-full border border-[var(--ni-sage-mid)] px-4 py-2.5 text-sm font-bold ni-t-moss disabled:opacity-50";

function Shell({ backHref, eyebrow, title, copy, children }: { backHref: string; eyebrow: string; title: string; copy?: string; children: React.ReactNode }) {
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
        {copy && <p className="max-w-[62ch] text-sm leading-7 ni-t-muted">{copy}</p>}
        {children}
      </main>
    </div>
  );
}

const onDate = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
};

/* ----------------------------------------------------------- eligibility */

/**
 * The one place that turns a reason into a sentence.
 *
 * Each reason names what is actually missing and who can fix it. "Not eligible" on its own leaves a
 * learner guessing whether they failed, whether they have work left, or whether the course itself is
 * unfinished — three very different situations.
 */
export function EligibilityPanel({ courseId }: { courseId: string }) {
  const { t } = useLocale();
  const { currentSession } = useAuth();
  const online = useOnlineStatus();
  const [, setLocation] = useLocation();
  const signedIn = Boolean(currentSession);

  const query = trpc.scheduling.certificateEligibility.useQuery({ courseId }, { enabled: signedIn, retry: false });
  const issue = trpc.scheduling.issueCertificate.useMutation();
  const [failure, setFailure] = useState("");

  const data = query.data?.ok ? (query.data.data as unknown as Eligibility) : null;
  const state = resultState(query as never, online);

  if (!signedIn) return <ResultState state="forbidden" message={t("messaging.unauthorized")} />;
  if (state !== "ready" || !data) {
    return (
      <ResultState
        state={state === "ready" || state === "empty" ? "error" : state}
        message={resultError(query as never)}
        onRetry={() => query.refetch()}
        retrying={query.isFetching}
      />
    );
  }

  const claim = async () => {
    setFailure("");
    try {
      const result = await issue.mutateAsync({ courseId });
      if (!result.ok) { setFailure(result.error); return; }
      setLocation(`/dashboard/learner/certificates/${(result.data as { certificateId: string }).certificateId}`);
    } catch { setFailure(t("cert.issueFailed")); }
  };

  // An already-issued certificate needs no claim button, only a way in.
  if (data.certificate?.status === "issued") {
    return (
      <div className={panel}>
        <div className="flex flex-wrap items-center gap-3">
          <Award size={20} className="ni-t-gold" aria-hidden="true" />
          <h2 className="font-display text-xl">{t("cert.issuedTitle")}</h2>
        </div>
        <p className="mt-2 text-sm ni-t-muted">{t("cert.issuedOn", { date: onDate(data.certificate.issued_at) })}</p>
        <Link href={`/dashboard/learner/certificates/${data.certificate.id}`} className={`${primary} mt-4`}>
          <Award size={15} aria-hidden="true" /> {t("cert.openCertificate")}
        </Link>
      </div>
    );
  }

  if (data.certificate?.status === "revoked") {
    return <ResultState state="forbidden" message={t("cert.revokedCopy")} />;
  }

  if (data.eligible) {
    return (
      <div className={panel}>
        <div className="flex flex-wrap items-center gap-3">
          <CheckCircle2 size={20} className="ni-t-moss" aria-hidden="true" />
          <h2 className="font-display text-xl">{t("cert.eligibleTitle")}</h2>
        </div>
        <p className="mt-2 text-sm leading-6 ni-t-muted">
          {t("cert.eligibleCopy", { lessons: data.lessonsTotal })}
          {data.hasAssessment && data.averageScore !== null ? ` ${t("cert.eligibleScore", { score: String(data.averageScore), pass: String(data.passMark ?? 0) })}` : ""}
        </p>
        <button type="button" onClick={claim} disabled={issue.isPending} aria-busy={issue.isPending} className={`${primary} mt-4`}>
          {issue.isPending ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Award size={15} aria-hidden="true" />}
          {issue.isPending ? t("cert.issuing") : t("cert.claim")}
        </button>
        {failure && (
          <p role="alert" className="mt-3 flex flex-wrap items-center gap-2 text-sm ni-t-clay">
            {failure}
            <button type="button" onClick={claim} className="font-bold underline">{t("common.retry")}</button>
          </p>
        )}
      </div>
    );
  }

  // Not eligible: say which of the four reasons applies, and what changes it.
  const reasonCopy: Record<Eligibility["reason"], string> = {
    eligible: "",
    no_lessons: t("cert.reason.noLessons"),
    lessons_incomplete: t("cert.reason.lessonsIncomplete", { done: data.lessonsCompleted, total: data.lessonsTotal }),
    pass_mark_not_set: t("cert.reason.passMarkNotSet"),
    assessment_incomplete: t("cert.reason.assessmentIncomplete", { done: data.assessmentsScored, total: data.assessmentsTotal }),
    assessment_failed: t("cert.reason.assessmentFailed", { score: String(data.averageScore ?? 0), pass: String(data.passMark ?? 0) }),
  };

  // A missing pass mark is the instructor's to fix, so it is setup-needed rather than a refusal.
  const tone: State = data.reason === "pass_mark_not_set" || data.reason === "no_lessons" ? "setup" : "empty";
  return <ResultState state={tone} message={reasonCopy[data.reason]} />;
}

/* -------------------------------------------------------------- the list */

export function LearnerCertificatesPage() {
  const { t } = useLocale();
  const { currentSession } = useAuth();
  const online = useOnlineStatus();
  const signedIn = Boolean(currentSession);

  const query = trpc.scheduling.myCertificates.useQuery(undefined, { enabled: signedIn, retry: false });
  const rows = resultRows<CertificateRow>(query as never);
  const base = resultState(query as never, online);
  const state: State | null = base === "ready" ? (rows.length ? null : "empty") : base;

  if (!signedIn) {
    return (
      <Shell backHref="/login" eyebrow={t("cert.eyebrow")} title={t("cert.listTitle")}>
        <div className="mt-8"><ResultState state="forbidden" message={t("messaging.unauthorized")} /></div>
      </Shell>
    );
  }

  return (
    <Shell backHref="/dashboard/learner" eyebrow={t("cert.eyebrow")} title={t("cert.listTitle")} copy={t("cert.listCopy")}>
      <div className="mt-8 space-y-4">
        {state && (
          <ResultState
            state={state}
            message={state === "empty" ? t("cert.none") : resultError(query as never)}
            onRetry={() => query.refetch()}
            retrying={query.isFetching}
          />
        )}

        {rows.map((row) => (
          <article key={row.id} className={panel}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-display text-xl">{row.courses?.title ?? t("cert.course")}</h2>
                <p className="mt-1 text-sm ni-t-muted">{t("cert.issuedOn", { date: onDate(row.issued_at) })}</p>
              </div>
              <span className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[.14em] ${row.status === "issued" ? "bg-[var(--ni-sage-soft)] ni-t-moss-deep" : "bg-[var(--ni-clay-soft)] ni-t-clay"}`}>
                {t(`cert.status.${row.status}` as never)}
              </span>
            </div>
            {row.status === "issued" && (
              <Link href={`/dashboard/learner/certificates/${row.id}`} className={`${quiet} mt-4`}>
                <Award size={15} aria-hidden="true" /> {t("cert.openCertificate")}
              </Link>
            )}
          </article>
        ))}
      </div>
    </Shell>
  );
}

/* --------------------------------------------------------- the certificate */

/**
 * The print-ready certificate.
 *
 * Everything outside `.certificate-sheet` is marked `no-print`, so what comes out of the browser's
 * print dialog is the certificate alone — no navigation, no buttons, no dashboard chrome. The sheet
 * itself is sized in millimetres at A4 landscape so the printed result is not a screenshot of a web
 * page. The print rules live in index.css beside the other print styles.
 */
export function CertificatePage({ certificateId }: { certificateId: string }) {
  const { t } = useLocale();
  const { currentSession } = useAuth();
  const online = useOnlineStatus();
  const signedIn = Boolean(currentSession);

  const query = trpc.scheduling.myCertificates.useQuery(undefined, { enabled: signedIn, retry: false });
  const row = resultRows<CertificateRow>(query as never).find((item) => item.id === certificateId);
  const state = resultState(query as never, online);

  if (!signedIn) {
    return (
      <Shell backHref="/login" eyebrow={t("cert.eyebrow")} title={t("cert.certificateTitle")}>
        <div className="mt-8"><ResultState state="forbidden" message={t("messaging.unauthorized")} /></div>
      </Shell>
    );
  }

  if (state !== "ready" || !row) {
    return (
      <Shell backHref="/dashboard/learner/certificates" eyebrow={t("cert.eyebrow")} title={t("cert.certificateTitle")}>
        <div className="mt-8">
          <ResultState
            // Absent from the caller's own list means it is not theirs to open.
            state={state === "ready" || state === "empty" ? "forbidden" : state}
            message={state === "ready" || state === "empty" ? t("cert.notYours") : resultError(query as never)}
            onRetry={() => query.refetch()}
            retrying={query.isFetching}
          />
        </div>
      </Shell>
    );
  }

  // A revoked certificate is never rendered as a certificate.
  if (row.status !== "issued") {
    return (
      <Shell backHref="/dashboard/learner/certificates" eyebrow={t("cert.eyebrow")} title={t("cert.certificateTitle")}>
        <div className="mt-8"><ResultState state="forbidden" message={t("cert.revokedCopy")} /></div>
      </Shell>
    );
  }

  const verifyUrl = `${typeof window === "undefined" ? "" : window.location.origin}/verify/${row.verification_code ?? ""}`;

  return (
    <div className="certificate-page min-h-screen bg-[var(--ni-bg)] ni-t-ink">
      <div className="no-print border-b border-[var(--ni-sage)] bg-[var(--ni-paper)]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-4 lg:px-8">
          <Link href="/dashboard/learner/certificates" className="inline-flex items-center gap-2 text-sm font-bold ni-t-moss">
            <ArrowLeft size={15} className="rtl:rotate-180" aria-hidden="true" /> {t("dashboard.back")}
          </Link>
          <button type="button" onClick={() => window.print()} className={primary}>
            <Printer size={15} aria-hidden="true" /> {t("cert.print")}
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-5 py-10 lg:px-8">
        <section className="certificate-sheet" aria-label={t("cert.certificateTitle")}>
          <div className="certificate-border">
            <p className="certificate-brand">{t("brand.name")}</p>
            <p className="certificate-kicker">{t("cert.sheetKicker")}</p>

            <p className="certificate-presented">{t("cert.presentedTo")}</p>
            <p className="certificate-name">{row.profiles?.display_name || ""}</p>

            <p className="certificate-presented">{t("cert.forCompleting")}</p>
            <p className="certificate-course">{row.courses?.title ?? ""}</p>

            <div className="certificate-footer">
              <div>
                <p className="certificate-label">{t("cert.completedOn")}</p>
                <p className="certificate-value">{onDate(row.issued_at)}</p>
              </div>
              <div>
                <p className="certificate-label">{t("cert.verifyAt")}</p>
                <p className="certificate-value certificate-code">{row.verification_code}</p>
                <p className="certificate-url">{verifyUrl}</p>
              </div>
            </div>
          </div>
        </section>

        <p className="no-print mt-6 max-w-[62ch] text-xs leading-5 ni-t-muted">{t("cert.printHint")}</p>
      </div>
    </div>
  );
}

/* --------------------------------------------------------- public verify */

/**
 * The public verification page.
 *
 * Reachable without an account, on purpose. It accepts only the printed random code, and shows only
 * what confirms authenticity — course, the learner's display name, issue date, and whether the
 * certificate stands. No score, no lesson detail, no contact details, no internal id.
 */
export function VerifyCertificatePage({ code }: { code?: string }) {
  const { t } = useLocale();
  const [entered, setEntered] = useState(code ?? "");
  const [submitted, setSubmitted] = useState(code ?? "");

  const query = trpc.schedulingPublic.verifyCertificate.useQuery(
    { code: submitted },
    { enabled: submitted.trim().length >= 8, retry: false },
  );
  const record = query.data?.ok ? (query.data.data as { valid: boolean; status: string; verificationCode: string | null; courseTitle: string | null; learnerName: string | null; issuedAt: string | null }) : null;

  return (
    <div className="min-h-screen bg-[var(--ni-bg)] ni-t-ink">
      <header className="border-b border-[var(--ni-sage)] bg-[var(--ni-paper)]">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-4 lg:px-8">
          <ShieldCheck size={18} className="ni-t-moss" aria-hidden="true" />
          <Link href="/" className="font-display text-xl">{t("brand.name")}</Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-5 py-12 lg:px-8 lg:py-16">
        <p className="ni-eyebrow">{t("cert.verifyEyebrow")}</p>
        <h1 className="mt-3 font-display text-[clamp(2rem,5vw,3rem)] leading-tight">{t("cert.verifyTitle")}</h1>
        <p className="mt-4 max-w-[62ch] text-sm leading-7 ni-t-muted">{t("cert.verifyCopy")}</p>

        <form
          className="mt-8 flex flex-wrap items-end gap-3"
          onSubmit={(event) => { event.preventDefault(); setSubmitted(entered.trim().toUpperCase()); }}
        >
          <label className="min-w-0 flex-1 text-sm font-bold ni-t-moss-deep">
            {t("cert.codeLabel")}
            <input
              value={entered}
              onChange={(event) => setEntered(event.target.value)}
              placeholder="NI-XXXXX-XXXXX-XXXXX-XXXXX"
              maxLength={40}
              autoComplete="off"
              spellCheck={false}
              className="ltr-embed mt-2 w-full rounded-xl border border-[var(--ni-sage-line)] bg-[var(--ni-field)] px-3 py-3 font-mono text-sm uppercase outline-none focus:border-[var(--ni-moss)] focus:ring-2 focus:ring-[var(--ni-sage-mid)]"
            />
          </label>
          <button type="submit" className={primary}>{t("cert.verifyAction")}</button>
        </form>

        <div className="mt-8">
          {query.isFetching && <ResultState state="loading" />}

          {!query.isFetching && query.data && !query.data.ok && (
            <ResultState state="error" message={query.data.error} onRetry={() => query.refetch()} />
          )}

          {!query.isFetching && record && !record.valid && (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--ni-clay-ink)] bg-[var(--ni-clay-soft)] px-5 py-4 text-sm ni-t-clay" role="alert">
              <XCircle size={18} aria-hidden="true" />
              {t(record.status === "revoked" ? "cert.verifyRevoked" : "cert.verifyUnknown")}
            </div>
          )}

          {!query.isFetching && record?.valid && (
            <div className={panel} role="status">
              <div className="flex flex-wrap items-center gap-3">
                <CheckCircle2 size={20} className="ni-t-moss" aria-hidden="true" />
                <h2 className="font-display text-xl">{t("cert.verifyValid")}</h2>
              </div>
              <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                {([
                  [t("cert.verifyLearner"), record.learnerName || "—"],
                  [t("cert.verifyCourse"), record.courseTitle || "—"],
                  [t("cert.completedOn"), onDate(record.issuedAt)],
                  [t("cert.codeLabel"), record.verificationCode ?? "—"],
                ] as Array<[string, string]>).map(([name, value]) => (
                  <div key={name} className="rounded-xl bg-[var(--ni-sage-soft)] p-4">
                    <dt className="text-xs font-bold uppercase tracking-[.13em] ni-t-muted-soft">{name}</dt>
                    <dd className="mt-1 text-sm font-semibold">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 text-xs leading-5 ni-t-muted-soft">{t("cert.verifyPrivacyNote")}</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

/* ----------------------------------------------------- instructor pass mark */

/**
 * The instructor's pass mark for their own course.
 *
 * `courses.pass_mark` is nullable with no default, so a course with assessments issues nothing until
 * this is set. That is deliberate — the alternative was inventing a number on the instructor's
 * behalf — and this is the control that resolves it.
 */
export function CoursePassMarkField({ courseId, current }: { courseId: string; current: number | null }) {
  const { t } = useLocale();
  const save = trpc.scheduling.setCoursePassMark.useMutation();
  const [value, setValue] = useState(current === null ? "" : String(current));
  const [notice, setNotice] = useState("");
  const [failure, setFailure] = useState("");

  const submit = async () => {
    setNotice(""); setFailure("");
    const trimmed = value.trim();
    const passMark = trimmed === "" ? null : Number(trimmed);
    if (passMark !== null && (!Number.isInteger(passMark) || passMark < 0 || passMark > 100)) {
      setFailure(t("cert.passMarkRange"));
      return;
    }
    try {
      const result = await save.mutateAsync({ courseId, passMark });
      if (!result.ok) { setFailure(result.error); return; }
      setNotice(t("common.saved"));
    } catch { setFailure(t("cert.passMarkFailed")); }
  };

  return (
    <div className={panel}>
      <h2 className="font-display text-xl">{t("cert.passMarkTitle")}</h2>
      <p className="mt-2 max-w-[60ch] text-sm leading-6 ni-t-muted">{t("cert.passMarkCopy")}</p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-sm font-bold ni-t-moss-deep">
          {t("cert.passMarkLabel")}
          <input
            type="number"
            min={0}
            max={100}
            inputMode="numeric"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={t("cert.passMarkUnset")}
            className="ltr-embed mt-2 w-32 rounded-xl border border-[var(--ni-sage-line)] bg-[var(--ni-field)] px-3 py-3 text-sm outline-none focus:border-[var(--ni-moss)]"
          />
        </label>
        <button type="button" onClick={submit} disabled={save.isPending} aria-busy={save.isPending} className={primary}>
          {save.isPending && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
          {t("common.save")}
        </button>
        {notice && <span role="status" className="text-sm font-bold ni-t-moss">{notice}</span>}
      </div>
      {failure && <p role="alert" className="mt-3 text-sm ni-t-clay">{failure}</p>}
    </div>
  );
}
