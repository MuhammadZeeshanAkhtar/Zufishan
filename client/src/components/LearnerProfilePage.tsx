/**
 * One learner's public profile, opened from a Find Students card.
 *
 * The mirror of opening a teacher from Find Quran Teacher, and built the same
 * way: a header with the person, a grid of facts, their own words, and the
 * existing action flows underneath. Nothing about the teacher module is imported
 * or altered — this is the same shape rendered from learner data.
 *
 * WHAT IT WILL NOT DO. It shows only what the server returns, and the server
 * returns only published, public fields. There is no email, phone number, city,
 * budget, role record or moderation field on this page because there is none in
 * the payload to render. A learner who published their learning but kept their
 * person private appears under a neutral label with a drawn avatar, and the page
 * says so rather than leaving it to be guessed at.
 *
 * The human check wraps this page as it wraps the list, because a detail URL can
 * be typed directly and a gate you can walk around is not a gate. The server
 * repeats both the role check and the token check regardless.
 */
import { useRef } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, BookOpenCheck, CalendarClock, Globe2, GraduationCap, Languages, ShieldCheck, UserRound } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLocale } from "../contexts/LocaleContextState";
import type { TranslationKey } from "../i18n/catalog";
import ResultState from "./ResultState";
import { resultError, resultState } from "../lib/result-state";
import { useOnlineStatus } from "../lib/use-online-status";
import { useGsapReveal } from "../lib/use-gsap-reveal";
import { displayableImageSrc } from "../lib/safe-url";
import HumanVerificationGate from "./HumanVerificationGate";
import MessageAction from "./MessageAction";

type Learner = {
  learnerId: string;
  displayName: string | null;
  avatarUrl: string | null;
  country: string | null;
  timezone: string | null;
  subjects: string[];
  level: string | null;
  goal: string | null;
  preferredClassFormat: string | null;
  availability: string | null;
  preferredLanguage: string | null;
  bio: string | null;
  supportedLanguages: string[];
  tutorPreference: string | null;
  profilePublic: boolean;
};

/** Initials for a learner who kept their person private: drawn, never fetched. */
function initialsOf(name: string | null) {
  if (!name) return "•";
  const parts = name.split(/[\s._\-/]+/).filter(Boolean);
  return (parts[0]?.[0] ?? "•").toUpperCase() + (parts[1]?.[0]?.toUpperCase() ?? "");
}

function FactCard({ icon: Icon, label, value }: { icon: typeof Globe2; label: string; value: string }) {
  return (
    <div className="rounded-[11px] border border-[var(--ni-sage-line)] bg-[var(--ni-sage-soft)] p-4">
      <p className="ni-label inline-flex items-center gap-1.5">
        <Icon size={13} aria-hidden="true" className="ni-t-gold" />
        {label}
      </p>
      <p className="mt-1.5 text-sm font-semibold leading-6 ni-t-ink">{value}</p>
    </div>
  );
}

/**
 * What an instructor may do with this learner, decided by the server.
 *
 * The rule is that messaging follows a connection, never discovery. So the
 * screen asks the same procedure that authorises the write — `messagingEligibility`
 * — and draws what that answer allows:
 *
 *   * connected  -> the Message action, and which connection permits it;
 *   * pending    -> what is waiting, and on whom;
 *   * neither    -> the connection action that would start one.
 *
 * Hiding a button is not what enforces the rule: `startConversation` re-checks
 * on every call, so a screen that drew the wrong thing would still be refused.
 * This exists so the refusal is actionable rather than a dead end.
 */
function ConnectionGate({ learnerId }: { learnerId: string }) {
  const { t } = useLocale();
  const eligibility = trpc.supabaseCore.messagingEligibility.useQuery({ counterpartId: learnerId }, { retry: false });
  const verdict = eligibility.data?.ok ? (eligibility.data.data as { eligible: boolean; via: string | null; pending: string | null }) : null;

  if (eligibility.isLoading) return <p className="ni-state" role="status">{t("connect.checking")}</p>;

  if (verdict?.eligible) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <MessageAction counterpartId={learnerId} viewerRole="instructor" tone="standard" label={t("findStudents.message")} className="" />
        {verdict.via && (
          <p className="inline-flex items-center gap-1.5 text-xs ni-t-muted">
            <ShieldCheck size={13} aria-hidden="true" className="ni-t-moss" />
            {t(`connect.connectedVia.${verdict.via}` as TranslationKey)}
          </p>
        )}
      </div>
    );
  }

  const pendingCopy = verdict?.pending === "trial" ? t("connect.pendingTrial")
    : verdict?.pending === "requirement_response" ? t("connect.pendingResponse")
    : verdict?.pending === "enrolment" ? t("connect.pendingEnrolment")
    : null;

  return (
    <div className="ni-banner">
      <p className="font-semibold ni-t-ink">{pendingCopy ? t("connect.pendingTitle") : t("connect.blockedTitle")}</p>
      <p className="mt-1 max-w-[66ch] text-sm leading-6 ni-t-muted">{pendingCopy ?? t("connect.blockedInstructor")}</p>
      <Link href="/dashboard/instructor/requirements" className="ni-btn ni-btn--primary mt-3 text-sm">
        <BookOpenCheck size={14} aria-hidden="true" />
        {t("connect.openRequests")}
      </Link>
    </div>
  );
}

function Profile({ learnerId, humanToken }: { learnerId: string; humanToken?: string }) {
  const { t } = useLocale();
  const online = useOnlineStatus();
  const reveal = useRef<HTMLDivElement | null>(null);
  useGsapReveal(reveal);

  const query = trpc.supabaseCore.discoverableLearner.useQuery({ learnerId, humanToken }, { retry: false });
  const state = resultState(query as never, online);
  const learner = query.data?.ok ? (query.data.data as Learner) : null;

  if (state !== "ready" || !learner) {
    return (
      <ResultState
        state={state === "ready" ? "empty" : state}
        message={state === "ready" ? t("findStudents.notAvailable") : resultError(query as never)}
        onRetry={() => query.refetch()}
        retrying={query.isFetching}
      />
    );
  }

  const name = learner.profilePublic && learner.displayName ? learner.displayName : t("findStudents.anonymousLearner");
  const avatar = learner.profilePublic ? displayableImageSrc(learner.avatarUrl) : null;

  const facts: Array<{ icon: typeof Globe2; label: string; value: string }> = [];
  if (learner.level) facts.push({ icon: GraduationCap, label: t("findStudents.level"), value: learner.level });
  if (learner.preferredLanguage) facts.push({ icon: Languages, label: t("onboarding.preferredLanguage"), value: learner.preferredLanguage });
  if (learner.supportedLanguages.length) facts.push({ icon: Languages, label: t("findStudents.speaks"), value: learner.supportedLanguages.join(", ") });
  if (learner.timezone) facts.push({ icon: CalendarClock, label: t("findStudents.timezone"), value: learner.timezone });
  if (learner.availability) facts.push({ icon: CalendarClock, label: t("findStudents.availability"), value: learner.availability });
  if (learner.preferredClassFormat) facts.push({ icon: BookOpenCheck, label: t("findStudents.format"), value: learner.preferredClassFormat });
  if (learner.country && learner.profilePublic) facts.push({ icon: Globe2, label: t("adminUsers.colCountry"), value: learner.country });

  return (
    <div ref={reveal} data-anim="section">
      <header className="flex flex-wrap items-start gap-4 border-b border-[var(--ni-sage)] pb-6">
        {avatar ? (
          <img src={avatar} alt="" className="h-20 w-20 shrink-0 rounded-full object-cover" />
        ) : (
          <span
            aria-hidden="true"
            className="grid h-20 w-20 shrink-0 place-items-center rounded-full border border-[var(--ni-sage-mid)] bg-[var(--ni-sage-soft)] font-display text-2xl ni-t-moss-deep"
          >
            {initialsOf(learner.displayName)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="ni-label">
            <UserRound size={13} aria-hidden="true" className="me-1.5 inline align-[-2px]" />
            {t("findStudents.eyebrow")}
          </p>
          <h1 className="mt-1.5 font-display text-3xl leading-tight ni-t-ink">{name}</h1>
          {learner.subjects.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="ni-label">{t("findStudents.wantsToLearn")}</span>
              {learner.subjects.map((subject) => (
                <span key={subject} className="rounded-[5px] border border-[var(--ni-sage-line)] bg-[var(--ni-field)] px-2 py-0.5 text-xs ni-t-ink">
                  {subject}
                </span>
              ))}
            </div>
          )}
        </div>
      </header>

      {learner.bio && (
        <section className="mt-6">
          <h2 className="ni-label">{t("findStudents.about")}</h2>
          <p className="mt-2 max-w-[68ch] text-sm leading-7 ni-t-ink">{learner.bio}</p>
        </section>
      )}

      {learner.goal && (
        <section className="mt-6">
          <h2 className="ni-label">{t("findStudents.goal")}</h2>
          <p className="mt-2 max-w-[68ch] text-sm leading-7 ni-t-muted">{learner.goal}</p>
        </section>
      )}

      {learner.tutorPreference && (
        <section className="mt-6">
          <h2 className="ni-label">{t("findStudents.tutorPreference")}</h2>
          <p className="mt-2 max-w-[68ch] text-sm leading-7 ni-t-muted">{learner.tutorPreference}</p>
        </section>
      )}

      {facts.length > 0 && (
        <section className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {facts.map((fact) => <FactCard key={fact.label} {...fact} />)}
        </section>
      )}

      <section className="mt-8 border-t border-[var(--ni-sage)] pt-6">
        <ConnectionGate learnerId={learner.learnerId} />
      </section>

      {!learner.profilePublic && (
        <p className="mt-5 inline-flex items-start gap-1.5 text-xs leading-5 ni-t-muted-soft">
          <ShieldCheck size={13} aria-hidden="true" className="mt-0.5 shrink-0" />
          {t("findStudents.personPrivate")}
        </p>
      )}
    </div>
  );
}

export default function LearnerProfilePage({ learnerId }: { learnerId: string }) {
  const { t } = useLocale();
  const [, setLocation] = useLocation();

  return (
    <div className="mx-auto max-w-4xl px-5 py-6 lg:px-6 lg:py-8">
      <button
        type="button"
        onClick={() => setLocation("/dashboard/instructor/students")}
        className="ni-btn ni-btn--quiet mb-5 text-sm"
      >
        <ArrowLeft size={14} aria-hidden="true" className="rtl:-scale-x-100" />
        {t("findStudents.backToList")}
      </button>

      <HumanVerificationGate>
        {(token) => <Profile learnerId={learnerId} humanToken={token} />}
      </HumanVerificationGate>
    </div>
  );
}
