/**
 * "Who am I learning with, and who could I learn with" — the top of the learner's dashboard.
 *
 * Shaped after the reference marketplace desk, which answers three questions on one screen: the
 * teachers you already work with, the teachers being suggested to you, and what happened to the
 * invites you sent. The previous desk answered none of them — it counted courses and linked out —
 * so a learner had to leave the dashboard to see a single teacher.
 *
 * Everything drawn here is real and already reachable:
 *
 *  - Recommended comes from `schedulingPublic.instructors`, the same published-and-approved listing
 *    the marketplace uses, so no teacher appears here who could not be found by searching.
 *  - Sent invites are the learner's own `scheduling.learnerTrials` rows, with the server's status.
 *  - Your teachers and past teachers come from `scheduling.learnerTutors`, which reads the caller's
 *    own bookings.
 *
 * The design is Zufishan's own — its cards, its tokens, its two themes. Only the arrangement and the
 * behaviour follow the reference.
 */
import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowRight, BadgeCheck, Globe2, UserPlus } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLocale } from "../contexts/LocaleContextState";
import ResultState from "./ResultState";
import { resultState } from "../lib/result-state";
import { useOnlineStatus } from "../lib/use-online-status";
import { displayableImageSrc } from "../lib/safe-url";
import {
  Chip, InstructorAvatar, Rating, useHourlyRate, type DiscoveryInstructor,
} from "./InstructorPresentation";

type Tutor = DiscoveryInstructor & { user_id: string; lastLessonAt?: string | null };
type Trial = { id: string; status: string; subject: string | null; requested_start_at: string | null };
type TabKey = "recommended" | "invites" | "past";

/** How many suggestions the desk shows before sending the reader to the full marketplace. */
const SUGGESTION_LIMIT = 4;

export default function LearnerTutorDesk() {
  const { t, formatNumber, formatDate } = useLocale();
  const online = useOnlineStatus();
  const [tab, setTab] = useState<TabKey>("recommended");

  const suggestions = trpc.schedulingPublic.instructors.useQuery({ limit: SUGGESTION_LIMIT }, { retry: false, staleTime: 60_000 });
  const tutors = trpc.scheduling.learnerTutors.useQuery(undefined, { retry: false });
  const trials = trpc.scheduling.learnerTrials.useQuery(undefined, { retry: false });

  const suggestionState = resultState(suggestions as never, online);
  const tutorState = resultState(tutors as never, online);
  const trialState = resultState(trials as never, online);

  const suggested = useMemo(() => {
    // `schedulingPublic.instructors` answers `{ instructors, total, limit, offset }` — the same shape
    // the marketplace page reads. Naming the key wrong here would show an empty tab, not an error.
    const payload = suggestions.data?.ok ? (suggestions.data.data as { instructors?: Tutor[] }) : null;
    return (payload?.instructors ?? []).slice(0, SUGGESTION_LIMIT);
  }, [suggestions.data]);

  const mine = tutors.data?.ok ? (tutors.data.data as { current: Tutor[]; past: Tutor[] }) : { current: [], past: [] };
  const invites = (trials.data?.ok && Array.isArray(trials.data.data) ? trials.data.data : []) as Trial[];

  const TABS: Array<{ key: TabKey; label: string; count?: number }> = [
    { key: "recommended", label: t("learnerHome.tabRecommended") },
    { key: "invites", label: t("learnerHome.tabInvites"), count: invites.length },
    { key: "past", label: t("learnerHome.tabPast"), count: mine.past.length },
  ];

  return (
    <>
      {/* ------------------------------------------------------------- tip --- */}
      <section className="mt-6 rounded-2xl border border-[var(--ni-gold-mid)] bg-[var(--ni-gold-soft)] px-5 py-4 ni-t-gold">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold">{t("learnerHome.tipTitle")}</p>
            <p className="mt-0.5 max-w-[62ch] text-xs leading-5">{t("learnerHome.tipCopy")}</p>
          </div>
          <Link href="/dashboard/learner/teachers" className="ni-btn ni-btn--primary shrink-0 text-xs">
            {t("learnerHome.findATutor")}
            <ArrowRight size={14} aria-hidden="true" className="rtl:-scale-x-100" />
          </Link>
        </div>
      </section>

      {/* -------------------------------------------------- your teachers --- */}
      <section className="mt-8" aria-labelledby="learner-tutors-title">
        <h2 id="learner-tutors-title" className="font-display text-xl ni-t-ink">{t("learnerHome.currentTutors")}</h2>
        {tutorState !== "ready" && tutorState !== "empty" ? (
          <div className="mt-4"><ResultState state={tutorState} onRetry={() => tutors.refetch()} retrying={tutors.isFetching} /></div>
        ) : mine.current.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-[var(--ni-sage-mid)] bg-[var(--ni-sage-soft)] px-5 py-5 text-sm ni-t-muted">
            {t("learnerHome.noTutorsYet")}
          </p>
        ) : (
          <ul className="mt-4 grid gap-4 md:grid-cols-2">
            {mine.current.map((tutor) => <li key={tutor.user_id}><TutorCard tutor={tutor} /></li>)}
          </ul>
        )}
      </section>

      {/* -------------------------------------------------- find a teacher --- */}
      <section className="mt-9" aria-labelledby="learner-find-title">
        <h2 id="learner-find-title" className="font-display text-xl ni-t-ink">{t("learnerHome.findATutor")}</h2>

        <div role="tablist" aria-labelledby="learner-find-title" className="ni-tabs mt-3 flex-wrap gap-5">
          {TABS.map((item) => (
            <button
              key={item.key}
              role="tab"
              type="button"
              aria-selected={tab === item.key}
              onClick={() => setTab(item.key)}
              className="ni-tab inline-flex items-center gap-2"
            >
              {item.label}
              {typeof item.count === "number" && item.count > 0 && (
                <span className="rounded-[5px] border border-[var(--ni-sage-line)] bg-[var(--ni-field)] px-1.5 text-[11px] font-bold tabular-nums ni-t-ink">
                  {formatNumber(item.count)}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="mt-5" role="tabpanel">
          {tab === "recommended" && (
            <>
              <p className="mb-4 text-sm leading-6 ni-t-muted">{t("learnerHome.recommendedCopy")}</p>
              {suggestionState !== "ready" && suggestionState !== "empty" ? (
                <ResultState state={suggestionState} onRetry={() => suggestions.refetch()} retrying={suggestions.isFetching} />
              ) : suggested.length === 0 ? (
                <ResultState state="empty" message={t("marketplace.noMatches")} />
              ) : (
                <>
                  <ul className="grid gap-4 md:grid-cols-2">
                    {suggested.map((tutor) => <li key={tutor.public_slug}><TutorCard tutor={tutor} invite /></li>)}
                  </ul>
                  <Link href="/dashboard/learner/teachers" className="ni-btn ni-btn--outline mt-4 text-sm">
                    {t("learnerHome.browseAllTeachers")}
                    <ArrowRight size={14} aria-hidden="true" className="rtl:-scale-x-100" />
                  </Link>
                </>
              )}
            </>
          )}

          {tab === "invites" && (
            trialState !== "ready" && trialState !== "empty" ? (
              <ResultState state={trialState} onRetry={() => trials.refetch()} retrying={trials.isFetching} />
            ) : invites.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-[var(--ni-sage-mid)] bg-[var(--ni-sage-soft)] px-5 py-5 text-sm ni-t-muted">
                {t("learnerHome.noInvitesYet")}
              </p>
            ) : (
              <ul className="space-y-3">
                {invites.map((invite) => (
                  <li key={invite.id} className="ni-ed-card flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="font-display text-base ni-t-ink">{invite.subject || t("learnerHome.tabInvites")}</p>
                      {invite.requested_start_at && (
                        <p className="mt-1 text-xs ni-t-muted ltr-embed">
                          {formatDate(invite.requested_start_at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="ni-verify">{String(invite.status).replaceAll("_", " ")}</span>
                      <Link href={`/dashboard/learner/trial-lessons/${invite.id}`} className="text-xs font-bold ni-link">
                        {t("learnerHome.openInvite")}
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )
          )}

          {tab === "past" && (
            mine.past.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-[var(--ni-sage-mid)] bg-[var(--ni-sage-soft)] px-5 py-5 text-sm ni-t-muted">
                {t("learnerHome.noPastTutors")}
              </p>
            ) : (
              <ul className="grid gap-4 md:grid-cols-2">
                {mine.past.map((tutor) => <li key={tutor.user_id}><TutorCard tutor={tutor} /></li>)}
              </ul>
            )
          )}
        </div>
      </section>
    </>
  );
}

/**
 * One teacher, as the desk shows them.
 *
 * Not the marketplace card: that one is a single link, and this needs a button inside it — a control
 * cannot sit inside an anchor. The name is the link, the invite is the button, and the facts between
 * them are read from the same helpers the marketplace card uses so the two never disagree.
 */
function TutorCard({ tutor, invite = false }: { tutor: Tutor; invite?: boolean }) {
  const { t, formatDate } = useLocale();
  const [, setLocation] = useLocation();
  const name = tutor.displayName?.trim() || tutor.public_slug;
  const rate = useHourlyRate(tutor.hourly_rate_minor, tutor.currency);
  const subjects = tutor.subjects ?? [];
  const languages = tutor.teaching_languages ?? [];
  const href = `/dashboard/learner/teachers/${tutor.public_slug}`;

  return (
    <article className="ni-ed-card flex h-full flex-col p-5">
      <div className="flex items-start gap-4">
        <InstructorAvatar name={name} src={displayableImageSrc(tutor.avatarUrl)} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <Link href={href} className="min-w-0 truncate font-display text-lg ni-t-ink hover:underline">{name}</Link>
            {tutor.verification_status === "approved" && (
              <span className="inline-flex shrink-0 items-center gap-1 ni-label" style={{ color: "var(--ni-moss-deep)" }}>
                <BadgeCheck size={13} aria-hidden="true" />
                {t("marketplace.verified")}
              </span>
            )}
            {typeof tutor.ratingAverage === "number" && (
              <Rating average={tutor.ratingAverage} count={tutor.ratingCount ?? 0} />
            )}
          </div>
          {tutor.country && (
            <p className="mt-1 inline-flex items-center gap-1 text-xs ni-t-muted">
              <Globe2 size={11} aria-hidden="true" />
              {tutor.country}
            </p>
          )}
        </div>
      </div>

      <dl className="mt-3.5 space-y-1.5 text-xs">
        {subjects.length > 0 && (
          <Row label={t("discovery.canTeach")}>
            <span className="flex flex-wrap gap-1.5">{subjects.slice(0, 3).map((s) => <Chip key={s}>{s}</Chip>)}</span>
          </Row>
        )}
        {languages.length > 0 && (
          <Row label={t("marketplace.spokenLanguages")}>
            <span className="flex flex-wrap gap-1.5">{languages.slice(0, 3).map((l) => <Chip key={l}>{l}</Chip>)}</span>
          </Row>
        )}
        {tutor.timezone && (
          <Row label={t("discovery.timezone")}><span className="ltr-embed ni-t-ink">{tutor.timezone}</span></Row>
        )}
        {rate && (
          <Row label={t("marketplace.hourlyRate")}>
            <span className="ltr-embed font-semibold ni-t-moss-deep">{rate.money}</span>
          </Row>
        )}
        {tutor.lastLessonAt && (
          <Row label={t("learnerHome.lastLesson")}>
            <span className="ltr-embed ni-t-ink">{formatDate(tutor.lastLessonAt, { day: "numeric", month: "short", year: "numeric" })}</span>
          </Row>
        )}
      </dl>

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
        {invite ? (
          <button
            type="button"
            // The invite flow already exists and already checks everything that matters; the card
            // only carries the chosen teacher into it.
            onClick={() => setLocation(`/trial/request?instructorSlug=${encodeURIComponent(tutor.public_slug)}`)}
            className="ni-btn ni-btn--primary text-xs"
          >
            <UserPlus size={14} aria-hidden="true" />
            {t("learnerHome.inviteToTeach")}
          </button>
        ) : (
          <Link href={href} className="ni-btn ni-btn--primary text-xs">
            {t("learnerHome.viewProfile")}
            <ArrowRight size={13} aria-hidden="true" className="rtl:-scale-x-100" />
          </Link>
        )}
        {invite && <Link href={href} className="text-xs font-bold ni-link">{t("learnerHome.viewProfile")}</Link>}
      </div>
    </article>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <dt className="ni-label shrink-0">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}
