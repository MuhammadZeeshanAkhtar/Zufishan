/**
 * Reviews.
 *
 * The three review screens existed but ran entirely on local fixtures. The form posted to an
 * in-memory `submitReview` against a hardcoded `session-101` and never called the real procedure;
 * the lists read a fixture array that is permanently empty, so a learner with genuine reviews saw
 * "nothing connected". Nothing was faked — the fixtures returned honest "not connected" errors — but
 * nothing was real either, and `scheduling.createReview`, `scheduling.myReviews` and
 * `schedulingPublic.instructorReviews` had no caller at all.
 *
 * Eligibility is not decided here. `reviews_eligible_insert` requires a class_sessions row that is
 * the caller's and is 'completed', and `unique(session_id, reviewer_id)` allows exactly one review
 * per session. This screen mirrors those rules so the reader understands them before submitting;
 * the database remains the authority, and a race that slips past the mirror comes back as CONFLICT.
 *
 * What is visible publicly is a separate rule again: reviews are written 'pending' and only a
 * moderator can publish them (0017 closes the hole that let an author publish their own). So a
 * learner's new review will not appear on the tutor's profile straight away, and both screens say
 * so rather than leaving someone to wonder whether it saved.
 */
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { ArrowLeft, Loader2, Star } from "lucide-react";
import { trpc } from "../lib/trpc";
import { useAuth } from "../contexts/AuthContext";
import { useLocale } from "../contexts/LocaleContextState";
import { useHasDashboardChrome } from "../lib/use-dashboard-chrome";
import ResultState from "./ResultState";
import { resultError, resultRows, resultState, type ResultState as State } from "../lib/result-state";
import { useOnlineStatus } from "../lib/use-online-status";

type Role = "learner" | "instructor";

type ReviewRow = { id: string; session_id: string; rating: number | null; body: string; status: string; created_at: string };
type PublicReviewRow = { id: string; rating: number | null; body: string; created_at: string };
type SessionRow = { id: string; learner_id: string; instructor_id: string; status: string; scheduled_start_at: string; scheduled_end_at: string };
type Summary = { reviews: PublicReviewRow[]; count: number; average: number | null };

const panel = "rounded-[1.35rem] border border-[var(--ni-sage)] bg-[var(--ni-paper)] p-6";
const primary = "inline-flex items-center justify-center gap-2 rounded-full bg-[var(--ni-moss)] px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50";
const field = "mt-2 w-full rounded-xl border border-[var(--ni-sage-line)] bg-[var(--ni-field)] px-3 py-3 text-sm outline-none focus:border-[var(--ni-moss)] focus:ring-2 focus:ring-[var(--ni-sage-mid)]";

function Shell({ eyebrow, title, copy, backHref, children }: { eyebrow: string; title: string; copy: string; backHref: string; children: ReactNode }) {
  const { t } = useLocale();
  const hasChrome = useHasDashboardChrome();
  return (
    <div className="min-h-screen bg-[var(--ni-bg)] ni-t-ink">
      <header className="border-b border-[var(--ni-sage)] bg-[var(--ni-paper)]">
        <div className="mx-auto flex min-w-0 max-w-6xl flex-wrap items-center gap-4 px-5 py-4 lg:px-8">
          {/* The dashboard sidebar already offers this; it stays only where there is none. */}
          {!hasChrome && (
            <Link href={backHref} className="inline-flex items-center gap-2 text-sm font-bold ni-t-moss">
              <ArrowLeft size={15} className="rtl:rotate-180" aria-hidden="true" /> {t("dashboard.back")}
            </Link>
          )}
        </div>
      </header>
      <main className="mx-auto w-full min-w-0 max-w-4xl px-5 py-12 lg:px-8 lg:py-16">
        {/* Modules open on their own content. `eyebrow` and `copy` are still accepted so no
            caller had to change, but nothing prints them; the heading stays for screen
            readers, since the sidebar names the module visually. */}
        <h1 className="sr-only">{title}</h1>
        {children}
      </main>
    </div>
  );
}

/* -------------------------------------------------------------------- stars */

/** A rating as read-only text plus stars, so it is not colour-and-shape alone. */
export function Stars({ value, size = 15 }: { value: number | null; size?: number }) {
  const { t } = useLocale();
  if (value === null) return <span className="text-xs ni-t-muted-soft">{t("reviews.noRating")}</span>;
  return (
    <span className="inline-flex items-center gap-1 ni-t-gold" aria-label={t("reviews.ratingOf", { rating: String(value) })}>
      {[1, 2, 3, 4, 5].map((step) => (
        <Star key={step} size={size} aria-hidden="true" fill={step <= Math.round(value) ? "currentColor" : "none"} className={step <= Math.round(value) ? "" : "ni-t-muted"} />
      ))}
      <span className="ms-1 text-xs font-bold tabular">{value.toFixed(1)}</span>
    </span>
  );
}

/** The rating input: real radio buttons, so it is reachable by keyboard and announced correctly. */
function RatingInput({ value, onChange, disabled }: { value: number; onChange: (next: number) => void; disabled?: boolean }) {
  const { t } = useLocale();
  return (
    <fieldset className="mt-2" disabled={disabled}>
      <legend className="sr-only">{t("reviews.rating")}</legend>
      <div className="flex flex-wrap gap-1">
        {[1, 2, 3, 4, 5].map((step) => (
          <label key={step} className="cursor-pointer rounded-lg p-1 focus-within:ring-2 focus-within:ring-[var(--ni-sage-mid)]">
            <input type="radio" name="rating" value={step} checked={value === step} onChange={() => onChange(step)} className="sr-only" />
            <Star
              size={30}
              aria-hidden="true"
              fill={step <= value ? "currentColor" : "none"}
              className={step <= value ? "ni-t-gold" : "ni-t-muted"}
            />
            <span className="sr-only">{t("reviews.ratingOf", { rating: String(step) })}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const dateOf = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString();
};

function ReviewCard({ rating, body, createdAt, status }: { rating: number | null; body: string; createdAt: string; status?: string }) {
  const { t } = useLocale();
  return (
    <article className={panel}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Stars value={rating} />
        <div className="flex items-center gap-2">
          {/* Status is shown to the author and the instructor, never on a public page. */}
          {status && status !== "published" && (
            <span className="rounded-full bg-[var(--ni-gold-soft)] px-3 py-1 text-[10px] font-bold uppercase tracking-[.14em] ni-t-gold">
              {t(`reviews.status.${status}` as never)}
            </span>
          )}
          <span className="text-xs ni-t-muted-soft tabular">{dateOf(createdAt)}</span>
        </div>
      </div>
      <p className="mt-4 whitespace-pre-wrap text-sm leading-6">{body}</p>
    </article>
  );
}

/* ------------------------------------------------------------ leave a review */

export function ReviewFormPage() {
  const { t } = useLocale();
  const { currentSession } = useAuth();
  const online = useOnlineStatus();
  const signedIn = Boolean(currentSession);

  const sessions = trpc.scheduling.sessions.useQuery(undefined, { enabled: signedIn, retry: false });
  const mine = trpc.scheduling.myReviews.useQuery(undefined, { enabled: signedIn, retry: false });
  const create = trpc.scheduling.createReview.useMutation();

  const [sessionId, setSessionId] = useState("");
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [failure, setFailure] = useState("");
  const [saved, setSaved] = useState(false);

  const reviewed = useMemo(
    () => new Set(resultRows<ReviewRow>(mine as never).map((row) => row.session_id)),
    [mine.data],
  );

  // The database decides eligibility; this is the same rule, shown early so the list explains itself.
  // A session already reviewed is excluded because unique(session_id, reviewer_id) would refuse it.
  const eligible = useMemo(
    () =>
      resultRows<SessionRow>(sessions as never).filter(
        (row) => row.status === "completed" && row.learner_id === currentSession?.userId && !reviewed.has(row.id),
      ),
    [sessions.data, reviewed, currentSession?.userId],
  );

  const listState = resultState(sessions as never, online);
  // `sessions` returns every session; having none *eligible* is a different, more specific emptiness.
  const state: State = listState === "ready" && !eligible.length ? "empty" : listState;

  const submit = async () => {
    setFailure("");
    try {
      const result = await create.mutateAsync({ sessionId, rating, body: body.trim() });
      if (result.ok) {
        setSaved(true);
        setSessionId(""); setRating(0); setBody("");
        await Promise.all([mine.refetch(), sessions.refetch()]);
        return;
      }
      setFailure(result.error);
    } catch {
      setFailure(t("reviews.saveFailed"));
    }
  };

  if (!signedIn) {
    return (
      <Shell eyebrow={t("reviews.newEyebrow")} title={t("reviews.newTitle")} copy={t("reviews.eligibilityCopy")} backHref="/login">
        <div className="mt-8"><ResultState state="forbidden" message={t("messaging.unauthorized")} /></div>
      </Shell>
    );
  }

  const complete = Boolean(sessionId) && rating > 0 && body.trim().length > 0;

  return (
    <Shell eyebrow={t("reviews.newEyebrow")} title={t("reviews.newTitle")} copy={t("reviews.eligibilityCopy")} backHref="/dashboard/learner/reviews">
      <div className="mt-8 space-y-5">
        {saved && (
          // Saying only "saved" would leave someone watching the tutor's profile for a review that
          // is waiting on moderation. The delay is part of the outcome, so it is part of the message.
          <p role="status" className="rounded-2xl border border-[var(--ni-sage-mid)] bg-[var(--ni-sage-soft)] px-5 py-4 text-sm leading-6 ni-t-moss-deep">
            {t("reviews.savedPending")}
          </p>
        )}

        {state !== "ready" && (
          <ResultState
            state={state}
            message={state === "empty" ? t("reviews.noEligible") : resultError(sessions as never)}
            onRetry={() => sessions.refetch()}
            retrying={sessions.isFetching}
          />
        )}

        {state === "ready" && (
          <section className={panel}>
            <label className="block text-sm font-bold ni-t-moss-deep">
              {t("reviews.chooseSession")}
              <select value={sessionId} onChange={(event) => setSessionId(event.target.value)} className={field}>
                <option value="">{t("reviews.chooseSessionPlaceholder")}</option>
                {eligible.map((row) => (
                  <option key={row.id} value={row.id}>{dateOf(row.scheduled_start_at)}</option>
                ))}
              </select>
            </label>

            <div className="mt-5">
              <span className="text-sm font-bold ni-t-moss-deep">{t("reviews.rating")}</span>
              <RatingInput value={rating} onChange={setRating} disabled={create.isPending} />
            </div>

            <label className="mt-5 block text-sm font-bold ni-t-moss-deep">
              {t("reviews.written")}
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={6}
                maxLength={5000}
                disabled={create.isPending}
                className={field}
                placeholder={t("reviews.writtenPlaceholder")}
              />
            </label>
            <p className="mt-1 text-xs ni-t-muted-soft tabular">{body.trim().length}/5000</p>

            <button type="button" onClick={submit} disabled={!complete || create.isPending} aria-busy={create.isPending} className={`${primary} mt-6`}>
              {create.isPending ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Star size={15} aria-hidden="true" />}
              {create.isPending ? t("reviews.saving") : t("reviews.submit")}
            </button>

            {failure && (
              <p role="alert" className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-[var(--ni-clay-soft)] px-4 py-3 text-sm ni-t-clay">
                {failure}
                <button type="button" onClick={submit} className="font-bold underline">{t("common.retry")}</button>
              </p>
            )}
          </section>
        )}
      </div>
    </Shell>
  );
}

/* ------------------------------------------------------------------- lists */

export function ReviewListPage({ role }: { role: Role }) {
  const { t } = useLocale();
  const { currentSession } = useAuth();
  const online = useOnlineStatus();
  const signedIn = Boolean(currentSession);

  // A learner sees what they wrote; an instructor sees what was written about them, at every status.
  const written = trpc.scheduling.myReviews.useQuery(undefined, { enabled: signedIn && role === "learner", retry: false });
  const received = trpc.scheduling.reviewsAboutMe.useQuery(undefined, { enabled: signedIn && role === "instructor", retry: false });

  const query = role === "learner" ? written : received;
  const base = resultState(query as never, online);
  const summary = role === "instructor" && received.data?.ok ? (received.data.data as Summary) : null;
  const rows: ReviewRow[] = role === "learner"
    ? resultRows<ReviewRow>(written as never)
    : ((summary?.reviews ?? []) as unknown as ReviewRow[]);
  // reviewsAboutMe wraps its rows in an object, so emptiness has to be read from the rows themselves.
  const state: State = base === "ready" && !rows.length ? "empty" : base;

  return (
    <Shell
      eyebrow={t(role === "learner" ? "reviews.mineEyebrow" : "reviews.aboutMeEyebrow")}
      title={t(role === "learner" ? "reviews.mineTitle" : "reviews.aboutMeTitle")}
      copy={t("reviews.moderationCopy")}
      backHref={`/dashboard/${role}`}
    >
      <div className="mt-8 space-y-5">
        {role === "instructor" && summary && summary.average !== null && (
          <div className={`${panel} flex flex-wrap items-center justify-between gap-3`}>
            <span className="text-sm font-bold ni-t-moss-deep">{t("reviews.publishedAverage")}</span>
            <Stars value={summary.average} size={18} />
          </div>
        )}

        {state !== "ready" && (
          <ResultState
            state={state}
            message={state === "empty" ? t(role === "learner" ? "reviews.noneWritten" : "reviews.noneReceived") : resultError(query as never)}
            onRetry={() => query.refetch()}
            retrying={query.isFetching}
          />
        )}

        {state === "ready" && rows.map((row) => (
          <ReviewCard key={row.id} rating={row.rating} body={row.body} createdAt={row.created_at} status={row.status} />
        ))}

        {role === "learner" && (
          <Link href="/dashboard/learner/reviews/new" className={primary}>
            <Star size={15} aria-hidden="true" /> {t("reviews.reviewASession")}
          </Link>
        )}
      </div>
    </Shell>
  );
}

/* ------------------------------------------------------- public, by instructor */

/**
 * The rating block embedded on a public tutor profile.
 *
 * Only published reviews are visible to a stranger, and the average is computed from exactly the
 * rows returned, so the number and the reviews under it can never disagree.
 */
export function InstructorRating({ instructorId, compact = false }: { instructorId: string; compact?: boolean }) {
  const { t } = useLocale();
  const online = useOnlineStatus();
  const query = trpc.schedulingPublic.instructorReviews.useQuery({ instructorId }, { retry: false });
  const summary = query.data?.ok ? (query.data.data as Summary) : null;
  const base = resultState(query as never, online);
  const state: State = base === "ready" && !(summary?.reviews.length) ? "empty" : base;

  if (state !== "ready") {
    // On a profile, a missing rating is ordinary — a new tutor has none. Only a real fault is loud.
    if (state === "empty" || state === "loading") {
      return <p className="mt-4 text-sm ni-t-muted">{state === "loading" ? t("common.loading") : t("reviews.noneYet")}</p>;
    }
    return <div className="mt-4"><ResultState state={state} message={resultError(query as never)} onRetry={() => query.refetch()} retrying={query.isFetching} /></div>;
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-3">
        <Stars value={summary!.average} size={18} />
        <span className="text-sm ni-t-muted">{t("reviews.countLabel", { count: summary!.count })}</span>
      </div>
      {!compact && (
        <div className="mt-5 space-y-4">
          {summary!.reviews.slice(0, 5).map((row) => (
            <ReviewCard key={row.id} rating={row.rating} body={row.body} createdAt={row.created_at} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The standalone public reviews page.
 *
 * The route passes a *slug*, not an id, so it is resolved through the public profile procedure
 * first. Course reviews have no data behind them at all — `reviews` keys on a class session and has
 * no course column — so that variant says so instead of showing an empty list that implies a course
 * simply has no reviews yet.
 */
export function PublicReviewsPage({ instructorId, courseId }: { instructorId?: string; courseId?: string }) {
  const { t } = useLocale();
  const profile = trpc.schedulingPublic.instructorBySlug.useQuery({ slug: instructorId ?? "" }, { enabled: Boolean(instructorId), retry: false });
  const resolved = profile.data?.ok ? (profile.data.data as { user_id: string }).user_id : null;

  if (courseId) {
    return (
      <Shell eyebrow={t("reviews.publicEyebrow")} title={t("reviews.publicTitle")} copy={t("reviews.moderationCopy")} backHref={`/courses/${courseId}`}>
        <div className="mt-8"><ResultState state="setup" message={t("reviews.courseNotConnected")} /></div>
      </Shell>
    );
  }

  return (
    <Shell eyebrow={t("reviews.publicEyebrow")} title={t("reviews.publicTitle")} copy={t("reviews.moderationCopy")} backHref={`/teachers/${instructorId ?? ""}`}>
      <div className="mt-8">
        {profile.isLoading && <ResultState state="loading" />}
        {!profile.isLoading && !resolved && (
          <ResultState state="error" message={resultError(profile as never) ?? t("tutorDetail.noVerification")} onRetry={() => profile.refetch()} />
        )}
        {resolved && <InstructorRating instructorId={resolved} />}
      </div>
    </Shell>
  );
}
