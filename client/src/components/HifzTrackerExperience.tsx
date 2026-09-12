/**
 * Hifz — plans, daily records, progress, reminders, and the instructor's review desk.
 *
 * The procedures behind these screens were already real, and nothing here fabricates a record. Two
 * things were missing, and both mattered:
 *
 * First, the module was unreachable. `routeGroups` in lms-data listed no Hifz entry for either
 * role, so every one of these pages could only be found by typing its URL.
 *
 * Second, every screen read its data as `(query.data?.ok ? query.data.data : [])`. A handled
 * `ok: false` arrives over a *successful* request, so that turned any failure — a refusal, a
 * misconfiguration, a dropped connection — into "no plans yet" or "not enough data yet". Someone
 * whose records failed to load was told, in effect, that they had never memorised anything. Every
 * screen now derives its state through the shared helper, so failure, emptiness, refusal and
 * offline stay distinct, and retry is offered where retrying can help.
 *
 * Two routes also discarded the parameter they were given: `/hifz/:planId` and the instructor's
 * `/hifz/:learnerId` both rendered the unfiltered page. They are honoured now.
 *
 * Ownership is the database's: `hifz_plans`, `hifz_records` and `hifz_reviews` are scoped by RLS to
 * the learner who owns them and the instructor assigned to review them. Nothing here re-checks it.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, BookOpen, Loader2, ShieldCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { useLocale } from "@/contexts/LocaleContextState";
import ResultState from "./ResultState";
import { resultError, resultRows, resultState, type ResultState as State } from "../lib/result-state";
import { useOnlineStatus } from "../lib/use-online-status";
import { useGsapReveal } from "../lib/use-gsap-reveal";
import { SearchableSelect } from "./SearchableSelect";
// Reference metadata only — surah names and ayah counts, never Quran text.
import { ayahCount, surahOptions, surahReference } from "../lib/surah-index";

const emptyUuid = "00000000-0000-0000-0000-000000000000";
const sections = ["sabaq", "sabqi", "manzil"] as const;

type Plan = { id: string; title: string; status: string; daily_target_ayahs: number; start_date?: string; target_date?: string | null };
type RecordRow = {
  id: string; record_date: string; section_type: string; status: string;
  self_rating?: number | null; practice_minutes?: number | null; mistake_count?: number | null;
  reference_json?: { surah?: number; ayahFrom?: number; ayahTo?: number; juz?: number };
};
type ReviewRow = { id: string; record_id: string; status: string; feedback_note?: string | null };
type Metrics = {
  totalRecords: number; sabaqCompleted: number; sabqiCompleted: number; manzilCompleted: number;
  practiceMinutes: number; weeklyActivity: number; monthlyActivity: number; completionPercentage: number;
  streakDays: number; submitted: number; reviewed: number; needsRevision: number;
};

const panel = "ni-ed-card p-6";
const primary = "ni-btn ni-btn--primary text-sm disabled:cursor-not-allowed disabled:opacity-50";
const quiet = "ni-btn ni-btn--outline text-sm disabled:cursor-not-allowed disabled:opacity-50";

function Frame({ children, eyebrow, backHref = "/dashboard/learner" }: { children: React.ReactNode; eyebrow?: string; backHref?: string }) {
  const { t } = useLocale();
  return (
    <main className="hifz-shell min-h-screen bg-[var(--ni-bg)] px-5 py-12 ni-t-ink lg:px-8 lg:py-16">
      <div className="mx-auto max-w-6xl">
        <Link href={backHref} className="inline-flex items-center gap-2 text-sm font-bold ni-t-moss">
          <ArrowLeft size={15} className="rtl:rotate-180" aria-hidden="true" /> {t("dashboard.back")}
        </Link>
        {eyebrow && <p className="mt-8 ni-eyebrow">{eyebrow}</p>}
        {children}
      </div>
    </main>
  );
}

function Protected({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { t } = useLocale();
  if (user) return <>{children}</>;
  return (
    <main className="hifz-protected min-h-screen bg-[var(--ni-bg)] px-5 py-16 ni-t-ink">
      <div className="mx-auto max-w-3xl rounded-[1.5rem] border border-[var(--ni-sage)] bg-[var(--ni-paper)] p-8">
        <ShieldCheck className="ni-t-gold" aria-hidden="true" />
        <h1 className="mt-5 font-display text-[clamp(2rem,5vw,3rem)] leading-tight">{t("hifz.protectedTitle")}</h1>
        <p className="mt-4 leading-7 ni-t-muted">{t("hifz.protectedCopy")}</p>
        <Link href="/login" className={`${primary} mt-7`}>{t("hifz.login")}</Link>
      </div>
    </main>
  );
}

/** Labels that would otherwise render a raw database value. */
function useLabels() {
  const { t } = useLocale();
  return {
    section: (value: string) => ({ sabaq: t("hifz.sabaq"), sabqi: t("hifz.sabqi"), manzil: t("hifz.manzil") }[value] ?? value),
    status: (value: string) => ({
      planned: t("hifz.status.planned"), practiced: t("hifz.status.practiced"),
      needs_revision: t("hifz.status.needsRevision"), paused: t("hifz.status.paused"),
      submitted_for_review: t("hifz.status.submitted"), reviewed: t("hifz.status.reviewed"),
      approved: t("hifz.status.approved"),
    }[value] ?? value),
  };
}

/** One panel's non-ready state, or null when it has rows to show. Never returns "ready". */
function usePanelState(query: { isLoading: boolean; isError: boolean; data?: unknown }, hasRows: boolean, online: boolean): Exclude<State, "ready"> | null {
  const base = resultState(query as never, online);
  if (base === "ready") return hasRows ? null : "empty";
  return base;
}

/* ------------------------------------------------------------------ tracker */

export function HifzTrackerPage({ planId }: { planId?: string } = {}) {
  const { user } = useAuth();
  const { t } = useLocale();
  const online = useOnlineStatus();
  const label = useLabels();
  // Calm entrance only: the shared hook fades sections in, never animates a
  // progress value, and clears itself if the animation clock is not running.
  const reveal = useRef<HTMLDivElement | null>(null);
  useGsapReveal(reveal);

  const plans = trpc.supabaseCore.advancedHifzPlans.useQuery(undefined, { enabled: Boolean(user), retry: false });
  const createPlan = trpc.supabaseCore.createAdvancedHifzPlan.useMutation();

  const [selectedId, setSelectedId] = useState(planId ?? "");
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("5");
  const [notice, setNotice] = useState("");
  const [failure, setFailure] = useState("");

  const planRows = resultRows<Plan>(plans as never);
  const selected = planRows.find((plan) => plan.id === selectedId) ?? planRows[0];

  // A plan named in the route wins, once the list it belongs to has arrived.
  useEffect(() => { if (planId && planRows.some((plan) => plan.id === planId)) setSelectedId(planId); }, [planId, planRows]);

  const recordQuery = trpc.supabaseCore.hifzRecords.useQuery({ planId: selected?.id ?? emptyUuid }, { enabled: Boolean(user && selected), retry: false });
  const progress = trpc.supabaseCore.hifzProgress.useQuery({ planId: selected?.id ?? emptyUuid }, { enabled: Boolean(user && selected), retry: false });
  const createRecord = trpc.supabaseCore.createHifzRecord.useMutation();
  const submitRecord = trpc.supabaseCore.submitHifzRecordForReview.useMutation();

  const [recordDate, setRecordDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [section, setSection] = useState<(typeof sections)[number]>("sabaq");
  const [sessionType, setSessionType] = useState<"new_memorisation" | "revision" | "assessment">("new_memorisation");
  const [surah, setSurah] = useState("1");
  const [ayahFrom, setAyahFrom] = useState("1");
  const [ayahTo, setAyahTo] = useState("1");
  const [rating, setRating] = useState("3");
  const [minutes, setMinutes] = useState("0");
  const [mistakes, setMistakes] = useState("0");
  const [note, setNote] = useState("");

  const records = resultRows<RecordRow>(recordQuery as never);
  const metrics = (progress.data as { ok?: boolean; data?: Metrics } | undefined)?.ok ? (progress.data as { data: Metrics }).data : null;

  const planState = usePanelState(plans, planRows.length > 0, online);
  const recordState = usePanelState(recordQuery, records.length > 0, online);

  const savePlan = async () => {
    setNotice(""); setFailure("");
    try {
      const result = await createPlan.mutateAsync({ title, dailyTarget: { ayahs: Number(target) }, currentReference: { surah: Number(surah) } });
      if (!result.ok) { setFailure(result.error); return; }
      setTitle(""); setNotice(t("hifz.planSaved"));
      void plans.refetch();
    } catch { setFailure(t("common.error")); }
  };

  const saveRecord = async () => {
    if (!selected) { setFailure(t("hifz.selectPlan")); return; }
    setNotice(""); setFailure("");
    try {
      const result = await createRecord.mutateAsync({
        planId: selected.id, recordDate,
        reference: { surah: Number(surah), ayahFrom: Number(ayahFrom), ayahTo: Number(ayahTo) },
        sessionType, sectionType: section, status: "practiced",
        selfRating: Number(rating), mistakeCount: Number(mistakes), practiceMinutes: Number(minutes),
        learnerNote: note || undefined,
      });
      if (!result.ok) { setFailure(result.error); return; }
      setNote(""); setNotice(t("hifz.reviewSaved"));
      void recordQuery.refetch(); void progress.refetch();
    } catch { setFailure(t("common.error")); }
  };

  const submit = async (recordId: string) => {
    setNotice(""); setFailure("");
    try {
      const result = await submitRecord.mutateAsync({ recordId });
      if (!result.ok) { setFailure(result.error); return; }
      setNotice(t("hifz.reviewSaved"));
      void recordQuery.refetch();
    } catch { setFailure(t("common.error")); }
  };

  const busy = createPlan.isPending || createRecord.isPending || submitRecord.isPending;

  return (
    <Protected>
      <Frame eyebrow={t("hifz.eyebrow")}>
        <div ref={reveal}>
        <div data-anim="intro" className="mt-3 flex flex-wrap items-end justify-between gap-5">
          <div className="min-w-0">
            <p className="max-w-[62ch] leading-7 ni-t-muted">{t("hifz.copy")} {t("hifz.selfAssessment")}.</p>
          </div>
          <BookOpen className="h-12 w-12 shrink-0 ni-t-gold" aria-hidden="true" />
        </div>

        {/* The Quran text boundary, stated once rather than on every panel. */}
        <div className="mt-6"><ResultState state="setup" message={t("hifz.setupNeeded")} /></div>

        {notice && <p role="status" className="mt-4 rounded-xl border border-[var(--ni-sage-mid)] bg-[var(--ni-sage-soft)] px-4 py-3 text-sm font-bold ni-t-moss-deep">{notice}</p>}
        {failure && (
          <p role="alert" className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-[var(--ni-clay-soft)] px-4 py-3 text-sm ni-t-clay">
            {failure}
            <button type="button" onClick={() => { void plans.refetch(); void recordQuery.refetch(); }} className="font-bold underline">{t("common.retry")}</button>
          </p>
        )}

        <div className="mt-8 grid gap-6 lg:grid-cols-[.7fr_1.3fr]">
          <section className={`hifz-panel ${panel}`}>
            <p className="ni-eyebrow">{t("hifz.plans")}</p>
            <h2 className="mt-3 font-display text-2xl">{t("hifz.createPlan")}</h2>
            <div className="mt-5 space-y-3">
              <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t("hifz.planTitle")} maxLength={160} className="input w-full" />
              <input type="number" min="1" max="100" value={target} onChange={(event) => setTarget(event.target.value)} aria-label={t("hifz.dailyTarget")} className="input w-full ltr-embed" />
              <button type="button" onClick={() => void savePlan()} disabled={!title.trim() || busy} aria-busy={createPlan.isPending} className={primary}>
                {createPlan.isPending && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
                {t("hifz.savePlan")}
              </button>
            </div>

            <div className="mt-7 space-y-2">
              {planState ? (
                <ResultState
                  state={planState}
                  message={planState === "empty" ? t("hifz.noPlans") : resultError(plans as never)}
                  onRetry={() => plans.refetch()}
                  retrying={plans.isFetching}
                />
              ) : planRows.map((plan) => (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => setSelectedId(plan.id)}
                  aria-current={selected?.id === plan.id}
                  className={`w-full rounded-xl p-4 text-start ${selected?.id === plan.id ? "bg-[var(--ni-teal)] text-white" : "bg-[var(--ni-sage-soft)]"}`}
                >
                  <strong>{plan.title}</strong>
                  <span className="mt-1 block text-xs opacity-75">{plan.daily_target_ayahs} · {label.status(plan.status)}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-6">
            <div className={`hifz-panel ${panel}`}>
              <h2 className="font-display text-2xl">{t("hifz.recordReview")}</h2>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-bold ni-t-moss-deep">{t("hifz.recordDate")}
                  <input type="date" value={recordDate} onChange={(event) => setRecordDate(event.target.value)} className="input mt-2 w-full ltr-embed" />
                </label>
                <label className="text-sm font-bold ni-t-moss-deep">{t("hifz.sessionType")}
                  <select value={sessionType} onChange={(event) => setSessionType(event.target.value as typeof sessionType)} className="input mt-2 w-full">
                    <option value="new_memorisation">{t("hifz.sabaq")}</option>
                    <option value="revision">{t("hifz.sabqi")}</option>
                    <option value="assessment">{t("hifz.manzil")}</option>
                  </select>
                </label>
                <label className="text-sm font-bold ni-t-moss-deep">{t("hifz.reference")}
                  <select value={section} onChange={(event) => setSection(event.target.value as (typeof sections)[number])} className="input mt-2 w-full">
                    {sections.map((value) => <option key={value} value={value}>{label.section(value)}</option>)}
                  </select>
                </label>
                <label className="text-sm font-bold ni-t-moss-deep">{t("hifz.surah")}
                  <div className="mt-2"><SearchableSelect options={surahOptions()} value={surah} onChange={setSurah} required /></div>
                </label>
                <label className="text-sm font-bold ni-t-moss-deep">{t("hifz.ayahFrom")}
                  <input type="number" min="1" max={ayahCount(surah)} value={ayahFrom} onChange={(event) => setAyahFrom(event.target.value)} className="input mt-2 w-full ltr-embed" />
                </label>
                <label className="text-sm font-bold ni-t-moss-deep">{t("hifz.ayahTo")}
                  <input type="number" min={ayahFrom || 1} max={ayahCount(surah)} value={ayahTo} onChange={(event) => setAyahTo(event.target.value)} className="input mt-2 w-full ltr-embed" />
                  <span className="mt-1 block text-xs font-normal ni-t-muted-soft ltr-embed">{surahReference(surah)} · {ayahCount(surah)}</span>
                </label>
                <label className="text-sm font-bold ni-t-moss-deep">{t("hifz.quality")}
                  <input type="number" min="1" max="5" value={rating} onChange={(event) => setRating(event.target.value)} className="input mt-2 w-full ltr-embed" />
                </label>
                <label className="text-sm font-bold ni-t-moss-deep">{t("hifz.practiceMinutes")}
                  <input type="number" min="0" value={minutes} onChange={(event) => setMinutes(event.target.value)} className="input mt-2 w-full ltr-embed" />
                </label>
                <label className="text-sm font-bold ni-t-moss-deep">{t("hifz.mistakes")}
                  <input type="number" min="0" value={mistakes} onChange={(event) => setMistakes(event.target.value)} className="input mt-2 w-full ltr-embed" />
                </label>
              </div>
              <label className="mt-3 block text-sm font-bold ni-t-moss-deep">{t("hifz.learnerNote")}
                <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={5000} className="input mt-2 w-full" />
              </label>
              <button type="button" onClick={() => void saveRecord()} disabled={!selected || busy} aria-busy={createRecord.isPending} className={`${primary} mt-4`}>
                {createRecord.isPending && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
                {t("hifz.saveRecord")}
              </button>
              {!selected && planState !== "loading" && <p className="mt-2 text-xs ni-t-muted">{t("hifz.selectPlan")}</p>}
            </div>

            <div className={`hifz-panel ${panel}`}>
              <h2 className="font-display text-2xl">{t("hifz.reviewLog")}</h2>
              <div className="mt-4 space-y-3">
                {recordState ? (
                  <ResultState
                    state={recordState}
                    message={recordState === "empty" ? t("hifz.noRecords") : resultError(recordQuery as never)}
                    onRetry={() => recordQuery.refetch()}
                    retrying={recordQuery.isFetching}
                  />
                ) : records.map((row) => (
                  <div key={row.id} className="rounded-xl border border-[var(--ni-sage)] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong className="ltr-embed">{row.record_date}</strong>
                      <span className="rounded-full bg-[var(--ni-sage-soft)] px-3 py-1 text-[10px] font-bold uppercase tracking-[.14em] ni-t-moss-deep">{label.status(row.status)}</span>
                    </div>
                    <p className="mt-2 text-sm ni-t-muted">
                      {label.section(row.section_type)}
                      {row.reference_json?.surah ? <span className="ltr-embed"> · {surahReference(row.reference_json.surah, row.reference_json.ayahFrom, row.reference_json.ayahTo)}</span> : null}
                    </p>
                    {/* Only a practised record can go for review; the server refuses the rest. */}
                    {row.status === "practiced" && (
                      <button type="button" onClick={() => void submit(row.id)} disabled={busy} className={`${quiet} mt-3`}>
                        {submitRecord.isPending && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
                        {t("hifz.submitRecord")}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {metrics && (
              <div className={`hifz-panel ${panel}`}>
                <h2 className="font-display text-2xl">{t("hifz.progress")}</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {([[t("hifz.reviewedCount"), metrics.reviewed], [t("hifz.submittedCount"), metrics.submitted], [t("hifz.needsRevisionCount"), metrics.needsRevision]] as Array<[string, number]>).map(([name, value]) => (
                    <div key={name} className="rounded-xl bg-[var(--ni-sage-soft)] p-4">
                      <p className="text-xs ni-t-muted">{name}</p>
                      <p className="mt-1 text-2xl font-bold tabular">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
        </div>
      </Frame>
    </Protected>
  );
}

/* ----------------------------------------------------------------- progress */

export function HifzProgressPage() {
  const { user } = useAuth();
  const { t } = useLocale();
  const online = useOnlineStatus();

  const plans = trpc.supabaseCore.advancedHifzPlans.useQuery(undefined, { enabled: Boolean(user), retry: false });
  const planRows = resultRows<Plan>(plans as never);
  const [selectedId, setSelectedId] = useState("");
  const plan = planRows.find((row) => row.id === selectedId) ?? planRows[0];

  const progress = trpc.supabaseCore.hifzProgress.useQuery({ planId: plan?.id ?? emptyUuid }, { enabled: Boolean(user && plan), retry: false });
  const data = (progress.data as { ok?: boolean; data?: Metrics } | undefined)?.ok ? (progress.data as { data: Metrics }).data : null;

  const planState = usePanelState(plans, planRows.length > 0, online);
  // Progress only has meaning once a plan exists; report the plan problem rather than "no data".
  const rawProgress = plan ? resultState(progress as never, online) : "empty";
  const progressState: Exclude<State, "ready"> | null =
    planState ?? (rawProgress === "ready" ? (data ? null : "empty") : rawProgress);

  const metrics: Array<[string, string | number]> = data ? [
    [t("hifz.completion"), `${data.completionPercentage}%`],
    [t("hifz.streak"), data.streakDays],
    [t("hifz.weeklyActivity"), data.weeklyActivity],
    [t("hifz.monthlyActivity"), data.monthlyActivity],
    [t("hifz.practiceMinutes"), data.practiceMinutes],
    [t("hifz.reviewedCount"), data.reviewed],
    [t("hifz.submittedCount"), data.submitted],
    [t("hifz.needsRevisionCount"), data.needsRevision],
  ] : [];

  return (
    <Protected>
      <Frame eyebrow={t("hifz.progress")}>
        {planRows.length > 1 && (
          <label className="mt-6 block max-w-sm text-sm font-bold ni-t-moss-deep">{t("hifz.plans")}
            <select value={plan?.id ?? ""} onChange={(event) => setSelectedId(event.target.value)} className="input mt-2 w-full">
              {planRows.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}
            </select>
          </label>
        )}

        <div className="mt-8">
          {progressState ? (
            <ResultState
              state={progressState}
              message={progressState === "empty" ? (planRows.length ? t("hifz.noData") : t("hifz.noPlans")) : resultError(plans as never) ?? resultError(progress as never)}
              onRetry={() => { void plans.refetch(); void progress.refetch(); }}
              retrying={plans.isFetching || progress.isFetching}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {metrics.map(([name, value]) => (
                <div key={name} className="rounded-xl border border-[var(--ni-sage)] bg-[var(--ni-paper)] p-5">
                  <p className="text-xs ni-t-muted">{name}</p>
                  <p className="mt-2 text-3xl font-bold tabular">{value}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </Frame>
    </Protected>
  );
}

/* ---------------------------------------------------------------- reminders */

export function HifzRemindersPage() {
  const { user } = useAuth();
  const { t } = useLocale();
  const online = useOnlineStatus();

  const reminders = trpc.supabaseCore.hifzReminders.useQuery(undefined, { enabled: Boolean(user), retry: false });
  const rows = resultRows<{ id: string; reminder_type: string; scheduled_for: string; timezone: string; status: string }>(reminders as never);
  const state = usePanelState(reminders, rows.length > 0, online);

  return (
    <Protected>
      <Frame eyebrow={t("hifz.reminders")}>
        {/* Reminders are stored; no delivery channel is connected, and that is said, not implied. */}
        <div className="mt-6"><ResultState state="setup" message={t("notifPrefs.emailNotConnected")} /></div>

        <div className="mt-8 space-y-3">
          {state ? (
            <ResultState
              state={state}
              message={state === "empty" ? t("hifz.noData") : resultError(reminders as never)}
              onRetry={() => reminders.refetch()}
              retrying={reminders.isFetching}
            />
          ) : rows.map((row) => (
            <div key={row.id} className="rounded-xl border border-[var(--ni-sage)] bg-[var(--ni-paper)] p-5">
              <strong>{row.reminder_type}</strong>
              <p className="mt-1 text-sm ni-t-muted">
                <span className="ltr-embed">{row.scheduled_for}</span> · {row.timezone} · {row.status}
              </p>
            </div>
          ))}
        </div>
      </Frame>
    </Protected>
  );
}

/* --------------------------------------------------------- instructor desk */

export function InstructorHifzPage({ learnerId }: { learnerId?: string } = {}) {
  const { user } = useAuth();
  const { t } = useLocale();
  const online = useOnlineStatus();
  const label = useLabels();

  const input = useMemo(() => (learnerId ? { learnerId } : {}), [learnerId]);
  const records = trpc.supabaseCore.assignedHifzRecords.useQuery(input, { enabled: Boolean(user), retry: false });
  const reviews = trpc.supabaseCore.assignedHifzReviews.useQuery(input, { enabled: Boolean(user), retry: false });
  const reviewMutation = trpc.supabaseCore.reviewHifzRecord.useMutation();

  const [feedback, setFeedback] = useState("");
  const [notice, setNotice] = useState("");
  const [failure, setFailure] = useState("");
  const [busyId, setBusyId] = useState("");

  const rows = resultRows<RecordRow>(records as never);
  const reviewRows = resultRows<ReviewRow>(reviews as never);
  const state = usePanelState(records, rows.length > 0, online);
  const reviewFor = (recordId: string) => reviewRows.find((item) => item.record_id === recordId);

  const submitReview = async (reviewId: string, status: "reviewed" | "needs_revision" | "approved") => {
    setNotice(""); setFailure(""); setBusyId(reviewId);
    try {
      const result = await reviewMutation.mutateAsync({ reviewId, status, feedbackNote: feedback.trim() || undefined });
      if (!result.ok) { setFailure(result.error); return; }
      setFeedback(""); setNotice(t("hifz.reviewUpdated"));
      void records.refetch(); void reviews.refetch();
    } catch { setFailure(t("common.error")); } finally { setBusyId(""); }
  };

  return (
    <Protected>
      <Frame eyebrow={t("hifz.teacherDesk")} backHref="/dashboard/instructor">
        <h1 className="mt-3 font-display text-[clamp(2.1rem,5vw,3.1rem)] leading-tight">{t("hifz.teacherDesk")}</h1>
        <p className="mt-4 max-w-[62ch] leading-7 ni-t-muted">{t("hifz.learnerReferencePrivate")}</p>

        {notice && <p role="status" className="mt-4 rounded-xl border border-[var(--ni-sage-mid)] bg-[var(--ni-sage-soft)] px-4 py-3 text-sm font-bold ni-t-moss-deep">{notice}</p>}
        {failure && <p role="alert" className="mt-4 rounded-xl bg-[var(--ni-clay-soft)] px-4 py-3 text-sm ni-t-clay">{failure}</p>}

        <h2 className="mt-8 font-display text-2xl">{t("hifz.assignedRecords")}</h2>
        <div className="mt-4 space-y-4">
          {state ? (
            <ResultState
              state={state}
              message={state === "empty" ? t("hifz.noRecords") : resultError(records as never)}
              onRetry={() => { void records.refetch(); void reviews.refetch(); }}
              retrying={records.isFetching}
            />
          ) : rows.map((row) => {
            const review = reviewFor(row.id);
            return (
              <article key={row.id} className={panel}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="ltr-embed">{row.record_date}</strong>
                  <span className="rounded-full bg-[var(--ni-sage-soft)] px-3 py-1 text-[10px] font-bold uppercase tracking-[.14em] ni-t-moss-deep">{label.status(row.status)}</span>
                </div>
                <p className="mt-2 text-sm ni-t-muted">{label.section(row.section_type)}</p>

                {review ? (
                  <div className="mt-4">
                    <label className="block text-sm font-bold ni-t-moss-deep">{t("hifz.feedback")}
                      <textarea
                        value={feedback}
                        onChange={(event) => setFeedback(event.target.value)}
                        rows={3}
                        maxLength={10000}
                        placeholder={t("hifz.feedbackPlaceholder")}
                        className="input mt-2 w-full"
                      />
                    </label>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(["reviewed", "needs_revision", "approved"] as const).map((status) => (
                        <button
                          key={status}
                          type="button"
                          onClick={() => void submitReview(review.id, status)}
                          disabled={reviewMutation.isPending}
                          aria-busy={busyId === review.id}
                          className={quiet}
                        >
                          {busyId === review.id && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
                          {status === "reviewed" ? t("hifz.markReviewed") : status === "needs_revision" ? t("hifz.requestRevision") : t("hifz.approve")}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  // A record only becomes reviewable once the learner submits it for review.
                  <p className="mt-3 text-xs ni-t-muted">{t("hifz.noReviews")}</p>
                )}
              </article>
            );
          })}
        </div>
      </Frame>
    </Protected>
  );
}

/* Route wrappers that honour the parameter each route already carries. */
export function InstructorHifzLearnerPage({ learnerId }: { learnerId?: string } = {}) { return <InstructorHifzPage learnerId={learnerId} />; }
export function InstructorHifzReviewsPage() { return <InstructorHifzPage />; }
export function HifzPlanDetailPage({ planId }: { planId?: string } = {}) { return <HifzTrackerPage planId={planId} />; }
export function HifzNewPlanPage() { return <HifzTrackerPage />; }
