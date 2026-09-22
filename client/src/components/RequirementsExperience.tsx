/**
 * Learner requirements, and the instructor side that answers them.
 *
 * Most of these screens were already wired to real procedures, but several were displaying things
 * that were not true, and one whole half of the module is blocked at the database:
 *
 * 1. The learner's own listing overwrote every row with `status: "published"` and `responsesCount: 0`.
 *    A draft showed as published, and a learner with responses waiting was told there were none.
 *    Both now come from the record — the count as an embedded aggregate on `listOwnRequirements`.
 *
 * 2. The filter panel collected six filters and applied none of them; the search box and the reset
 *    button did nothing at all. Filtering is real now, and applies to both listings.
 *
 * 3. `ResponseComparison` and `RequirementEditForm` could not load a real requirement. The first
 *    read the learner's own requirement through the *public* endpoint, the second through a demo
 *    fixture. Both now read `supabaseCore.requirements`, which is the learner's own list.
 *
 * 4. Nothing let a learner shortlist, accept or reject. `updateOwnRequirementResponseStatus` filters
 *    on `instructor_id`, so it is the instructor's withdrawal path; three of the five statuses were
 *    unreachable from any screen. `decideOnRequirementResponse` is the learner's side, and 0019
 *    enforces the same split at the database so an instructor cannot accept their own response.
 *
 * 5. `MatchPreview` fell back to `demoRequirements[0]` and rendered fixture instructors. It was
 *    routed nowhere, and it is gone.
 *
 * 6. Nobody but the author could read a *published* requirement. `learner_requirements_own_or_moderator`
 *    permitted `learner_id = auth.uid() or is_moderator_user()` and nothing else, so the instructor
 *    desk and the public marketplace returned zero rows to everyone — a permission being reported as
 *    an empty marketplace. Migration 0020 opens published requirements to signed-in instructors,
 *    verified directly against the database: anonymous 0, non-instructor 0, instructor 1, author 1.
 *
 * Anonymous visitors are still shown nothing, deliberately — publishing means "instructors may
 * approach me", not "put this on the open internet". The public listing and the public detail page
 * therefore still explain the refusal rather than rendering an empty grid, and the instructor's
 * respond form reads through the *authenticated* procedure, because the public one runs on the
 * anonymous client that 0020 does not open.
 */
import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowRight, Check, Loader2, Search, ShieldCheck } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useLocale } from "../contexts/LocaleContextState";
import { useHasDashboardChrome } from "../lib/use-dashboard-chrome";
import { trpc } from "../lib/trpc";
import ResultState from "./ResultState";
import { resultError, resultRows, resultState, type ResultState as State } from "../lib/result-state";
import { useOnlineStatus } from "../lib/use-online-status";

type RequirementRow = {
  id: string; subject: string; level: string; goal: string;
  preferred_language: string; timezone: string; availability: string;
  budget_minor: number | null; currency: string | null; status: string; created_at?: string;
  /** PostgREST returns an embedded aggregate as a one-element array. */
  requirement_responses?: Array<{ count: number }>;
};
type ResponseRow = { id: string; requirement_id: string; instructor_id: string; message: string; status: string; created_at?: string };

const shell = "min-h-screen bg-[var(--ni-bg)] ni-t-ink";
const panel = "rounded-[1.35rem] border border-[var(--ni-sage)] bg-[var(--ni-paper)] p-6";
const primary = "inline-flex items-center justify-center gap-2 rounded-full bg-[var(--ni-moss)] px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50";
const quiet = "inline-flex items-center justify-center gap-2 rounded-full border border-[var(--ni-sage-mid)] px-4 py-2.5 text-sm font-bold ni-t-moss disabled:opacity-50";
const field = "mt-2 w-full rounded-xl border border-[var(--ni-sage-line)] bg-[var(--ni-field)] px-3 py-3 text-sm outline-none focus:border-[var(--ni-moss)] focus:ring-2 focus:ring-[var(--ni-sage-mid)]";

function Layout({ children }: { children: React.ReactNode }) {
  const { t } = useLocale();
  // Requirements is both a public page and a dashboard module. The public marketplace bar is
  // drawn only when there is no dashboard chrome already carrying navigation.
  const hasChrome = useHasDashboardChrome();
  if (hasChrome) return <div className={shell}>{children}</div>;
  return (
    <div className={shell}>
      <header className="border-b border-[var(--ni-sage)] bg-[var(--ni-field)]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-5 lg:px-8">
          <Link href="/" className="font-display text-2xl">{t("brand.name")}</Link>
          <nav className="flex gap-4 text-sm font-semibold ni-t-sage-ink">
            <Link href="/courses">{t("nav.courses")}</Link>
            <Link href="/teachers">{t("nav.tutors")}</Link>
            <Link href="/requirements">{t("nav.requirements")}</Link>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}

/** A status badge that reads as words, not as a database value. */
function Status({ status }: { status: string }) {
  const { t } = useLocale();
  const label = {
    draft: t("reqStatus.draft"), published: t("reqStatus.published"), matched: t("reqStatus.matched"),
    closed: t("reqStatus.closed"), cancelled: t("reqStatus.cancelled"),
    pending: t("reqStatus.pending"), shortlisted: t("reqStatus.shortlisted"),
    accepted: t("reqStatus.accepted"), rejected: t("reqStatus.rejected"), withdrawn: t("reqStatus.withdrawn"),
  }[status] ?? status.replaceAll("_", " ");
  return <span className="inline-flex rounded-full bg-[var(--ni-gold-soft)] px-3 py-1 text-[11px] font-bold uppercase tracking-[.12em] ni-t-gold">{label}</span>;
}

function PrivacyNote() {
  const { t } = useLocale();
  return (
    <div className="flex gap-3 rounded-2xl border border-[var(--ni-sage)] bg-[var(--ni-sage-soft)] p-4 text-sm leading-6 ni-t-sage-ink">
      <ShieldCheck className="mt-1 shrink-0 ni-t-moss" size={18} aria-hidden="true" />
      <span>{t("requirementsExp.privacy")}</span>
    </div>
  );
}

/**
 * Shown on the two anonymous surfaces, where a published requirement is still unreadable.
 *
 * An empty list here would be a lie: the rows may well exist, and the reader is simply not permitted
 * to see them. Signing in as an instructor is what changes that, so the copy says so.
 */
function VisibilityBlocker() {
  const { t } = useLocale();
  return <ResultState state="forbidden" message={t("requirementsExp.notVisibleYet")} />;
}

const responseCount = (row: RequirementRow) => row.requirement_responses?.[0]?.count ?? 0;

/* ------------------------------------------------------------------ listings */

export function RequirementListing({ dashboard = false }: { dashboard?: boolean }) {
  const { t } = useLocale();
  const online = useOnlineStatus();
  const [filters, setFilters] = useState({ query: "", subject: "", level: "", language: "", timezone: "", status: "" });

  const ownRequirements = trpc.supabaseCore.requirements.useQuery(undefined, { enabled: dashboard, retry: false });
  const publicRequirements = trpc.schedulingPublic.publishedRequirements.useQuery(undefined, { enabled: !dashboard, retry: false });
  const query = dashboard ? ownRequirements : publicRequirements;

  const rows = resultRows<RequirementRow>(query as never);

  // Every filter actually narrows the list. They used to be collected and ignored.
  const filtered = useMemo(() => rows.filter((row) => {
    const text = `${row.subject} ${row.level} ${row.goal}`.toLowerCase();
    if (filters.query && !text.includes(filters.query.toLowerCase())) return false;
    if (filters.subject && row.subject !== filters.subject) return false;
    if (filters.level && row.level !== filters.level) return false;
    if (filters.language && row.preferred_language !== filters.language) return false;
    if (filters.timezone && row.timezone !== filters.timezone) return false;
    if (filters.status && row.status !== filters.status) return false;
    return true;
  }), [rows, filters]);

  const unique = (pick: (row: RequirementRow) => string) => Array.from(new Set(rows.map(pick).filter(Boolean))).sort();
  const base = resultState(query as never, online);
  const state: State | null = base === "ready" ? (filtered.length ? null : "empty") : base;
  const filtering = Object.values(filters).some(Boolean);
  const reset = () => setFilters({ query: "", subject: "", level: "", language: "", timezone: "", status: "" });

  return (
    <Layout>
      <main className="mx-auto max-w-7xl px-5 py-14 lg:px-8 lg:py-20">
        {/* The learner's own desk drops this intro: the dashboard already names the
            module, so it was a heading above a heading. The PUBLIC marketplace keeps
            it — a visitor arrives here cold and the page has to introduce itself. */}
        {!dashboard && (
          <>
            <p className="ni-eyebrow">{t("requirementsExp.open")}</p>
            <h1 className="mt-4 max-w-3xl font-display text-[clamp(2.1rem,5vw,3.2rem)] leading-tight">
              {t("requirementsExp.marketTitle")}
            </h1>
            <p className="mt-4 max-w-[62ch] text-base leading-7 ni-t-muted">{t("requirementsExp.publicCopy")}</p>
          </>
        )}

        {/* The public marketplace cannot read anyone's requirement; say so above the empty grid. */}
        {!dashboard && base === "ready" && rows.length === 0 && <div className="mt-8"><VisibilityBlocker /></div>}

        <div className="mt-8 grid gap-3 rounded-[1.5rem] border border-[var(--ni-sage)] bg-[var(--ni-paper)] p-5 md:grid-cols-4">
          <label className="md:col-span-2">
            <span className="sr-only">{t("requirementsExp.searchLabel")}</span>
            <div className="flex items-center gap-2 rounded-xl bg-[var(--ni-sage-soft)] px-3">
              <Search size={16} aria-hidden="true" />
              <input
                value={filters.query}
                onChange={(event) => setFilters({ ...filters, query: event.target.value })}
                placeholder={t("requirementsExp.searchPlaceholder")}
                className="w-full bg-transparent px-2 py-3 text-sm outline-none"
              />
            </div>
          </label>
          <label><span className="sr-only">{t("requirementsExp.filterSubject")}</span>
            <select value={filters.subject} onChange={(event) => setFilters({ ...filters, subject: event.target.value })} className={field}>
              <option value="">{t("requirementsExp.filterSubject")}</option>
              {unique((row) => row.subject).map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label><span className="sr-only">{t("requirementsExp.filterLevel")}</span>
            <select value={filters.level} onChange={(event) => setFilters({ ...filters, level: event.target.value })} className={field}>
              <option value="">{t("requirementsExp.filterLevel")}</option>
              {unique((row) => row.level).map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label><span className="sr-only">{t("requirementsExp.filterLanguage")}</span>
            <select value={filters.language} onChange={(event) => setFilters({ ...filters, language: event.target.value })} className={field}>
              <option value="">{t("requirementsExp.filterLanguage")}</option>
              {unique((row) => row.preferred_language).map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label><span className="sr-only">{t("requirementsExp.filterTimezone")}</span>
            <select value={filters.timezone} onChange={(event) => setFilters({ ...filters, timezone: event.target.value })} className={field}>
              <option value="">{t("requirementsExp.filterTimezone")}</option>
              {unique((row) => row.timezone).map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          {dashboard && (
            <label><span className="sr-only">{t("requirementsExp.filterStatus")}</span>
              <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })} className={field}>
                <option value="">{t("requirementsExp.filterStatus")}</option>
                {unique((row) => row.status).map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm ni-t-muted">
          <span>{t("requirementsExp.permitted", { count: filtered.length, suffix: filtered.length === 1 ? "" : "s" })}</span>
          {filtering && <button type="button" onClick={reset} className="font-bold ni-t-moss underline">{t("requirementsExp.reset")}</button>}
        </div>

        {state && (
          <div className="mt-6">
            <ResultState
              state={state}
              // Filtering something down to nothing is not the same as having nothing.
              message={state === "empty" ? (filtering ? t("requirementsExp.noMatch") : dashboard ? t("requirementsExp.noPublishedRequirements") : t("requirementsExp.notVisibleYet")) : resultError(query as never)}
              onRetry={() => query.refetch()}
              retrying={query.isFetching}
            />
          </div>
        )}

        <div className="mt-6 grid gap-5 lg:grid-cols-3">
          {filtered.map((item) => (
            <article key={item.id} className={panel}>
              <div className="flex items-start justify-between gap-3">
                <span className="ni-eyebrow">{t(dashboard ? "requirementsExp.learnerRequirement" : "requirementsExp.publicRequirement")}</span>
                {/* The record's own status, not a hardcoded "published". */}
                <Status status={item.status} />
              </div>
              <h2 className="mt-5 font-display text-2xl">{item.subject}</h2>
              <p className="mt-1 text-sm font-semibold ni-t-sage-ink">{item.level}</p>
              <p className="mt-4 text-sm leading-6 ni-t-muted">{item.goal}</p>
              <div className="mt-5 space-y-1.5 border-t border-[var(--ni-sage-soft)] pt-4 text-xs ni-t-muted">
                <p><strong>{t("requirementsExp.language")}:</strong> {item.preferred_language}</p>
                <p><strong>{t("requirements.timezone")}:</strong> {item.timezone}</p>
                <p><strong>{t("requirementsExp.schedule")}:</strong> {item.availability}</p>
                {dashboard && <p><strong>{t("requirementsExp.responses")}:</strong> <span className="tabular">{responseCount(item)}</span></p>}
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link href={dashboard ? `/dashboard/learner/requirements/${item.id}` : `/requirements/${item.id}`} className={quiet}>
                  {t("requirementsExp.view")} <ArrowRight size={15} className="icon-directional" aria-hidden="true" />
                </Link>
                {dashboard && (
                  <Link href={`/dashboard/learner/requirements/${item.id}/responses`} className={quiet}>
                    {t("requirementsExp.viewResponses")}
                  </Link>
                )}
              </div>
            </article>
          ))}
        </div>
      </main>
    </Layout>
  );
}

/* -------------------------------------------------------------------- detail */

export function RequirementDetail({ id }: { id: string }) {
  const { t } = useLocale();
  const online = useOnlineStatus();
  const query = trpc.schedulingPublic.publishedRequirementById.useQuery({ id }, { retry: false });
  const item = query.data?.ok ? (query.data.data as RequirementRow | null) : null;
  const state = resultState(query as never, online);

  return (
    <Layout>
      <main className="mx-auto max-w-5xl px-5 py-14 lg:px-8 lg:py-20">
        <Link href="/requirements" className="text-sm font-bold ni-t-moss">← {t("common.back")}</Link>

        {(state !== "ready" || !item) && (
          <div className="mt-8 space-y-4">
            {state === "ready" || state === "empty"
              // A successful read that returns nothing is the permission, not a missing record.
              ? <VisibilityBlocker />
              : <ResultState state={state} message={resultError(query as never)} onRetry={() => query.refetch()} retrying={query.isFetching} />}
          </div>
        )}

        {item && (
          <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_.72fr]">
            <section>
              <div className="flex flex-wrap items-center gap-3">
                <span className="ni-eyebrow">{t("requirementsExp.publicRequirement")}</span>
                <Status status={item.status} />
              </div>
              <h1 className="mt-5 font-display text-[clamp(2rem,5vw,3rem)] leading-tight">{item.goal}</h1>
              <p className="mt-3 text-sm font-semibold ni-t-sage-ink">{item.subject} · {item.level}</p>
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {([
                  [t("catalogue.subject"), item.subject],
                  [t("requirements.level"), item.level],
                  [t("requirements.language"), item.preferred_language],
                  [t("requirements.timezone"), item.timezone],
                  [t("requirements.schedule"), item.availability],
                  [t("requirements.budget"), item.budget_minor && item.currency ? `${item.budget_minor} ${item.currency}` : t("requirementsExp.rateToAgree")],
                ] as Array<[string, string]>).map(([name, value]) => (
                  <div key={name} className="rounded-xl bg-[var(--ni-sage-soft)] p-4">
                    <p className="text-xs font-bold uppercase tracking-[.13em] ni-t-muted-soft">{name}</p>
                    <p className="mt-1 text-sm font-semibold">{value}</p>
                  </div>
                ))}
              </div>
            </section>
            <aside className="space-y-5">
              <PrivacyNote />
              <Link href={`/dashboard/instructor/requirements/${id}/respond`} className={primary}>{t("requirements.respond")}</Link>
            </aside>
          </div>
        )}
      </main>
    </Layout>
  );
}

/* ---------------------------------------------------------------------- form */

export function RequirementForm() {
  const { t } = useLocale();
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const createRequirement = trpc.supabaseCore.createRequirement.useMutation();

  const [subject, setSubject] = useState("Quran Recitation");
  const [goal, setGoal] = useState("");
  const [level, setLevel] = useState("Beginner");
  const [preferredLanguage, setPreferredLanguage] = useState("English");
  const [timezone, setTimezone] = useState("Asia/Karachi");
  const [availability, setAvailability] = useState("Flexible");
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!isAuthenticated) { setError(t("requirementsExp.signInPublish")); return; }
    try {
      const result = await createRequirement.mutateAsync({ subject, level, goal, preferredLanguage, timezone, availability });
      if (!result.ok) { setError(result.error); return; }
      setLocation("/dashboard/learner/requirements");
    } catch {
      setError(t("requirementsExp.serviceError"));
    }
  };

  return (
    <Layout>
      <main className="mx-auto max-w-3xl px-5 py-14 lg:px-8 lg:py-20">
        <h1 className="sr-only">{t("requirements.post")}</h1>

        <form onSubmit={submit} className={`${panel} mt-8 space-y-5`}>
          <label className="block text-sm font-bold ni-t-moss-deep">{t("catalogue.subject")}
            <input value={subject} onChange={(event) => setSubject(event.target.value)} required maxLength={120} className={field} />
          </label>
          <label className="block text-sm font-bold ni-t-moss-deep">{t("requirementsExp.currentLevel")}
            <input value={level} onChange={(event) => setLevel(event.target.value)} required maxLength={80} className={field} />
          </label>
          <label className="block text-sm font-bold ni-t-moss-deep">{t("requirementsExp.learningGoal")}
            <textarea value={goal} onChange={(event) => setGoal(event.target.value)} required rows={5} maxLength={5000} className={field} placeholder={t("requirementsExp.topicGoal")} />
          </label>
          <label className="block text-sm font-bold ni-t-moss-deep">{t("requirementsExp.preferredLanguage")}
            <input value={preferredLanguage} onChange={(event) => setPreferredLanguage(event.target.value)} required maxLength={80} className={field} />
          </label>
          <label className="block text-sm font-bold ni-t-moss-deep">{t("requirements.timezone")}
            <input value={timezone} onChange={(event) => setTimezone(event.target.value)} required maxLength={80} className={field} />
          </label>
          <label className="block text-sm font-bold ni-t-moss-deep">{t("requirementsExp.availableTimes")}
            <input value={availability} onChange={(event) => setAvailability(event.target.value)} required maxLength={200} className={field} />
          </label>

          <PrivacyNote />
          {/* A requirement is created as a draft; publishing is a separate decision the schema keeps. */}
          <p className="text-xs leading-5 ni-t-muted">{t("requirementsExp.draftSetup")}</p>

          <button type="submit" disabled={createRequirement.isPending} aria-busy={createRequirement.isPending} className={primary}>
            {createRequirement.isPending && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
            {t("requirementsExp.saveDraft")}
          </button>
          {error && <p role="alert" className="rounded-xl bg-[var(--ni-clay-soft)] px-4 py-3 text-sm ni-t-clay">{error}</p>}
        </form>
      </main>
    </Layout>
  );
}

/* ----------------------------------------------------------------- edit goal */

export function RequirementEditForm({ id }: { id: string }) {
  const { t } = useLocale();
  const online = useOnlineStatus();
  const { isAuthenticated } = useAuth();
  const updateGoal = trpc.supabaseCore.updateRequirementGoal.useMutation();

  // The learner's own list, not a fixture: this screen could never load a real requirement before.
  const query = trpc.supabaseCore.requirements.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  const item = resultRows<RequirementRow>(query as never).find((row) => row.id === id);

  const [goal, setGoal] = useState("");
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState("");
  const [failure, setFailure] = useState("");
  const state = resultState(query as never, online);

  const save = async () => {
    setNotice(""); setFailure("");
    try {
      const result = await updateGoal.mutateAsync({ requirementId: id, goal: goal || item?.goal || "" });
      if (!result.ok) { setFailure(result.error); return; }
      setDirty(false); setNotice(t("requirementsExp.goalSaved"));
      void query.refetch();
    } catch { setFailure(t("requirementsExp.goalSaveError")); }
  };

  if (!isAuthenticated) {
    return <Layout><main className="mx-auto max-w-3xl px-5 py-20"><ResultState state="forbidden" message={t("requirementsExp.notOwned")} /></main></Layout>;
  }

  return (
    <Layout>
      <main className="mx-auto max-w-3xl px-5 py-14 lg:px-8 lg:py-20">
        <h1 className="sr-only">{t("requirementsExp.editOwner")}</h1>

        {(state !== "ready" || !item) && (
          <div className="mt-8">
            <ResultState
              // Absent from the caller's own list means it is not theirs — a refusal, not a fault.
              state={state === "ready" || state === "empty" ? "forbidden" : state}
              message={state === "ready" || state === "empty" ? t("requirementsExp.ownerChecks") : resultError(query as never)}
              onRetry={() => query.refetch()}
              retrying={query.isFetching}
            />
          </div>
        )}

        {item && (
          <div className={`${panel} mt-8`}>
            <label className="block text-sm font-bold ni-t-moss-deep">{t("requirementsExp.learningGoal")}
              <textarea
                value={goal || item.goal}
                onChange={(event) => { setGoal(event.target.value); setDirty(true); setNotice(""); }}
                rows={6}
                maxLength={5000}
                className={field}
              />
            </label>
            {dirty && <p role="status" className="mt-4 rounded-xl bg-[var(--ni-gold-soft)] px-4 py-3 text-xs ni-t-gold">{t("requirementsExp.unsaved")}</p>}
            {notice && <p role="status" className="mt-4 text-sm font-bold ni-t-moss">{notice}</p>}
            {failure && (
              <p role="alert" className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-[var(--ni-clay-soft)] px-4 py-3 text-sm ni-t-clay">
                {failure}
                <button type="button" onClick={save} className="font-bold underline">{t("common.retry")}</button>
              </p>
            )}
            <div className="mt-6 flex flex-wrap gap-3">
              <button type="button" onClick={save} disabled={!dirty || updateGoal.isPending} aria-busy={updateGoal.isPending} className={primary}>
                {updateGoal.isPending && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
                {t("common.save")}
              </button>
              <Link href={`/dashboard/learner/requirements/${id}`} className={quiet}>{t("requirementsExp.cancel")}</Link>
            </div>
          </div>
        )}
      </main>
    </Layout>
  );
}

/* ------------------------------------------------------ compare and decide */

export function ResponseComparison({ id }: { id: string }) {
  const { t } = useLocale();
  const online = useOnlineStatus();
  const { isAuthenticated } = useAuth();

  // Own list, not the public endpoint: a draft requirement has responses too, and the public
  // endpoint returns nothing to anyone at all.
  const requirements = trpc.supabaseCore.requirements.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  const item = resultRows<RequirementRow>(requirements as never).find((row) => row.id === id);
  const responsesQuery = trpc.supabaseCore.requirementResponses.useQuery({ requirementId: id }, { enabled: isAuthenticated && Boolean(item), retry: false });
  const decide = trpc.supabaseCore.decideOnRequirementResponse.useMutation();

  const [failure, setFailure] = useState("");
  const [busyId, setBusyId] = useState("");

  const responses = resultRows<ResponseRow>(responsesQuery as never);
  const requirementState = resultState(requirements as never, online);
  const base = resultState(responsesQuery as never, online);
  const state: State | null = base === "ready" ? (responses.length ? null : "empty") : base;

  const setDecision = async (responseId: string, status: "shortlisted" | "accepted" | "rejected") => {
    setFailure(""); setBusyId(responseId);
    try {
      const result = await decide.mutateAsync({ responseId, status });
      if (!result.ok) { setFailure(result.error); return; }
      await responsesQuery.refetch();
    } catch { setFailure(t("requirementsExp.decisionFailed")); } finally { setBusyId(""); }
  };

  if (!isAuthenticated) {
    return <Layout><main className="mx-auto max-w-6xl px-5 py-20"><ResultState state="forbidden" message={t("requirementsExp.notOwned")} /></main></Layout>;
  }

  return (
    <Layout>
      <main className="mx-auto max-w-6xl px-5 py-14 lg:px-8 lg:py-20">
        <h1 className="sr-only">{t("requirementsExp.responseDesk")}</h1>

        {(requirementState !== "ready" || !item) && (
          <div className="mt-8">
            <ResultState
              state={requirementState === "ready" || requirementState === "empty" ? "forbidden" : requirementState}
              message={requirementState === "ready" || requirementState === "empty" ? t("requirementsExp.ownerChecks") : resultError(requirements as never)}
              onRetry={() => requirements.refetch()}
              retrying={requirements.isFetching}
            />
          </div>
        )}

        {item && state && (
          <div className="mt-8">
            <ResultState
              state={state}
              message={state === "empty" ? t("requirementsExp.noResponsesConnected") : resultError(responsesQuery as never)}
              onRetry={() => responsesQuery.refetch()}
              retrying={responsesQuery.isFetching}
            />
          </div>
        )}

        {failure && <p role="alert" className="mt-6 rounded-xl bg-[var(--ni-clay-soft)] px-4 py-3 text-sm ni-t-clay">{failure}</p>}

        {item && (
          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            {responses.map((response) => (
              <article key={response.id} className={panel}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    {/* Instructor identity stays private until the learner takes it further; the
                        response is distinguished by its own words, not by a repeated placeholder. */}
                    <h2 className="font-display text-xl">{t("requirementsExp.connectedInstructor")}</h2>
                    <p className="mt-1 text-xs ni-t-muted">{item.preferred_language} · {item.timezone}</p>
                  </div>
                  <Status status={response.status} />
                </div>

                <p className="mt-4 whitespace-pre-wrap text-sm leading-6">{response.message}</p>

                {/* Shortlist, accept and reject are the learner's; 0019 enforces that at the database. */}
                {response.status !== "withdrawn" && (
                  <div className="mt-5 flex flex-wrap gap-2">
                    {(["shortlisted", "accepted", "rejected"] as const).map((status) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => void setDecision(response.id, status)}
                        disabled={decide.isPending || response.status === status}
                        aria-busy={busyId === response.id}
                        className={status === "accepted" ? primary : quiet}
                      >
                        {busyId === response.id && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
                        {t(status === "shortlisted" ? "requirementsExp.shortlist" : status === "accepted" ? "requirementsExp.accept" : "requirementsExp.reject")}
                      </button>
                    ))}
                  </div>
                )}

                {response.status === "accepted" && (
                  <div className="mt-4">
                    <TrialCTA context={{ requirementId: id, instructorId: response.instructor_id }} label={t("requirementsExp.prepareFromResponse")} />
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </main>
    </Layout>
  );
}

/* ----------------------------------------------------------------- trial CTA */

export function TrialCTA({ context, label }: { context: { requirementId?: string; instructorId?: string; instructorSlug?: string; courseSlug?: string }; label?: string }) {
  const { t } = useLocale();
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const ctaLabel = label ?? t("requirementsExp.prepareTrial");
  const prepare = () => {
    const params = new URLSearchParams();
    Object.entries(context).forEach(([key, value]) => { if (value) params.set(key, value); });
    const target = `/trial/request${params.toString() ? `?${params.toString()}` : ""}`;
    if (!isAuthenticated) { setLocation(`/login?returnTo=${encodeURIComponent(target)}`); return; }
    setLocation(target);
  };
  return <div><button type="button" onClick={prepare} className={quiet}>{ctaLabel}</button></div>;
}

/* ------------------------------------------------------------ instructor side */

/**
 * Find Students.
 *
 * Two sources, deliberately kept side by side: published REQUESTS ("respond to
 * this specific thing"), and published learner PROFILES ("I am open to being
 * approached"). Both are the learner's own choice; neither passes through an
 * administrator.
 */
export function InstructorRequirementsDesk() {
  const { t } = useLocale();
  const online = useOnlineStatus();
  const [query, setQuery] = useState("");
  const requirementsQuery = trpc.supabaseCore.publishedRequirements.useQuery(undefined, { retry: false });

  const rows = resultRows<RequirementRow>(requirementsQuery as never);
  const filtered = rows.filter((item) => `${item.subject} ${item.goal} ${item.level}`.toLowerCase().includes(query.toLowerCase()));
  const base = resultState(requirementsQuery as never, online);

  return (
    <Layout>
      <main className="mx-auto max-w-6xl px-5 py-14 lg:px-8 lg:py-20">
        <h1 className="sr-only">{t("requirementsExp.instructorDesk")}</h1>

        {/* 0020 lets a signed-in instructor read published requirements, so an empty list here is
            now genuinely empty rather than a permission being misreported. */}
        {base === "ready" && rows.length === 0 && (
          <div className="mt-7"><ResultState state="empty" message={t("requirementsExp.noPublishedRequirements")} /></div>
        )}

        <div className="mt-7 flex items-center gap-3 rounded-2xl border border-[var(--ni-sage)] bg-[var(--ni-paper)] p-3">
          <Search size={17} aria-hidden="true" />
          <input
            aria-label={t("requirementsExp.searchLabel")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("requirementsExp.searchPlaceholder")}
            className="w-full bg-transparent p-2 outline-none"
          />
        </div>

        {base !== "ready" && (
          <div className="mt-6">
            <ResultState
              state={base}
              message={resultError(requirementsQuery as never)}
              onRetry={() => requirementsQuery.refetch()}
              retrying={requirementsQuery.isFetching}
            />
          </div>
        )}

        <div className="mt-8 grid gap-5 lg:grid-cols-3" data-testid="published-requirements">
          {filtered.map((item) => (
            <article key={item.id} className={panel}>
              <div className="flex items-center justify-between gap-3">
                <span className="ni-eyebrow">{t("requirementsExp.publicRequirement")}</span>
                <Status status={item.status} />
              </div>
              <h2 className="mt-4 font-display text-2xl">{item.subject}</h2>
              <p className="mt-1 text-sm font-semibold ni-t-sage-ink">{item.level}</p>
              <p className="mt-4 text-sm leading-6 ni-t-muted">{item.goal}</p>
              <Link href={`/dashboard/instructor/requirements/${item.id}/respond`} className={`${quiet} mt-5`}>
                {t("requirementsExp.respondInstructor")} <ArrowRight size={15} className="icon-directional" aria-hidden="true" />
              </Link>
            </article>
          ))}
        </div>
        {/*
         * `<DiscoverableLearners />` stood here and is gone.
         *
         * It was added when Find Students had no page of its own, so this desk carried both lists
         * at once. Find Students has had its own route since, and the copy left behind turned this
         * module into a duplicate of it — and worse than a duplicate: with no published
         * requirements in the project, the grid above renders empty and the only thing left on the
         * page was the other module's list. Opening Requirements showed you Find Students.
         *
         * The two answer different questions. This desk is the learning requests people have
         * posted — what somebody wants taught. Find Students is the learners who have made their
         * profile discoverable. A teacher choosing between them needs them to look different.
         */}
      </main>
    </Layout>
  );
}

export function InstructorResponse({ id }: { id: string }) {
  const { t } = useLocale();
  const online = useOnlineStatus();
  // Read as the instructor, not through the public endpoint: `getPublicPublishedRequirement` runs
  // on the anonymous client, and 0020 opens published requirements to signed-in instructors only.
  const query = trpc.supabaseCore.publishedRequirements.useQuery(undefined, { retry: false });
  const submitResponse = trpc.supabaseCore.respondToRequirement.useMutation();

  const item = resultRows<RequirementRow>(query as never).find((row) => row.id === id) ?? null;
  const state = resultState(query as never, online);

  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFailure("");
    try {
      const result = await submitResponse.mutateAsync({ requirementId: id, message });
      if (!result.ok) { setFailure(result.error); return; }
      setSubmitted(true);
    } catch { setFailure(t("requirementsExp.serviceError")); }
  };

  return (
    <Layout>
      <main className="mx-auto max-w-3xl px-5 py-14 lg:px-8 lg:py-20">
        <h1 className="sr-only">{t("requirementsExp.instructorResponse")}</h1>

        {(state !== "ready" || !item) && (
          <div className="mt-8">
            <ResultState
              state={state === "ready" || state === "empty" ? "empty" : state}
              message={state === "ready" || state === "empty" ? t("requirementsExp.noPublishedRequirements") : resultError(query as never)}
              onRetry={() => query.refetch()}
              retrying={query.isFetching}
            />
          </div>
        )}

        {item && !submitted && (
          <>
            <div className="mt-6 rounded-2xl bg-[var(--ni-sage-soft)] p-5">
              <p className="text-xs font-bold uppercase tracking-[.13em] ni-t-muted-soft">{t("requirementsExp.summary")}</p>
              <p className="mt-2 font-display text-2xl">{item.goal}</p>
              <p className="mt-2 text-sm ni-t-muted">{item.subject} · {item.level} · {item.timezone}</p>
            </div>
            <form onSubmit={submit} className={`${panel} mt-6 space-y-5`}>
              <label className="block text-sm font-bold ni-t-moss-deep">{t("requirementsExp.introMessage")}
                <textarea required value={message} onChange={(event) => setMessage(event.target.value)} rows={6} maxLength={5000} className={field} />
              </label>
              <PrivacyNote />
              <button type="submit" disabled={submitResponse.isPending} aria-busy={submitResponse.isPending} className={primary}>
                {submitResponse.isPending && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
                {t("requirementsExp.submitResponse")}
              </button>
              {failure && (
                <p role="alert" className="flex flex-wrap items-center gap-2 rounded-xl bg-[var(--ni-clay-soft)] px-4 py-3 text-sm ni-t-clay">
                  {failure}
                </p>
              )}
            </form>
          </>
        )}

        {submitted && (
          <p role="status" className="mt-8 flex items-center gap-2 rounded-2xl border border-[var(--ni-sage-mid)] bg-[var(--ni-sage-soft)] px-5 py-4 text-sm font-bold ni-t-moss-deep">
            <Check size={16} aria-hidden="true" /> {t("requirementsExp.responseSubmitted")}
          </p>
        )}
      </main>
    </Layout>
  );
}
