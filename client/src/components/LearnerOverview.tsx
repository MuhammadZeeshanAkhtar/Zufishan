/**
 * The learner's dashboard overview.
 *
 * Replaces the shared `DashboardOverview` for this role. Three things were wrong
 * with what it showed a learner, and all three were about honesty rather than
 * looks:
 *
 *  - It opened with a **"Demo mode"** banner and a **"Test error"** toggle.
 *    Developer scaffolding, shipped to the person using the product.
 *  - Its figures came from `getLearnerDashboardData()`, a fixture whose metrics
 *    were hardcoded zeros with English-only labels. Only the first was ever
 *    joined to a real query, so the rest could never change however much the
 *    learner did.
 *  - A failed query and an empty account looked identical.
 *
 * Every number here now comes from a procedure this dashboard already called,
 * counted at read time. Nothing is estimated, and a query that fails says so
 * rather than rendering a confident zero.
 *
 * No procedure was added and no route changed. Colour comes only from theme
 * tokens, so light, dark and system follow the existing provider.
 */
import { useRef } from "react";
import { Link } from "wouter";
import {
  ArrowRight, BookOpen, CalendarClock, GraduationCap, ListChecks,
  MessageSquare, Sparkles, UserRoundSearch,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { useLocale } from "../contexts/LocaleContextState";
import ResultState from "./ResultState";
import ProfileCompletionBanner from "./ProfileCompletionBanner";
import { resultState } from "../lib/result-state";
import { profileCompletionFor } from "../lib/profile-completion";
import { useOnlineStatus } from "../lib/use-online-status";
import { useGsapReveal } from "../lib/use-gsap-reveal";
import type { TranslationKey } from "@/i18n/catalog";

type Row = Record<string, unknown>;
const rowsOf = (query: { data?: { ok?: boolean; data?: unknown } }): Row[] => {
  const payload = query.data;
  if (!payload?.ok) return [];
  return Array.isArray(payload.data) ? (payload.data as Row[]) : [];
};

/**
 * One figure.
 *
 * A count is only rendered when its query actually succeeded. While it is in
 * flight the tile shows a skeleton; if it failed it says so. A zero here always
 * means zero, never "we could not tell".
 */
function Figure({ label, value, state, href, cta }: {
  label: string; value: number | null; state: string; href: string; cta: string;
}) {
  const { t, formatNumber } = useLocale();
  return (
    <Link
      href={href}
      className="ni-ed-card group flex flex-col p-5 outline-none focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]"
    >
      <p className="ni-label">{label}</p>
      {state === "loading" ? (
        <span aria-hidden="true" className="ni-skeleton mt-3 block h-9 w-14" />
      ) : state === "ready" && value !== null ? (
        <p className="mt-2 font-display text-4xl leading-none ni-t-ink tabular-nums">{formatNumber(value)}</p>
      ) : (
        <p className="mt-3 text-sm font-semibold ni-t-clay-ink">{t("learnerHome.unavailable")}</p>
      )}
      <span className="mt-auto inline-flex items-center gap-1 pt-4 text-xs font-bold ni-link">
        {cta} <ArrowRight size={12} aria-hidden="true" className="rtl:-scale-x-100" />
      </span>
    </Link>
  );
}

export default function LearnerOverview() {
  const { t } = useLocale();
  const { user } = useAuth();
  const online = useOnlineStatus();
  const root = useRef<HTMLDivElement | null>(null);

  // The same three procedures the previous overview called. Nothing new.
  const enrolments = trpc.supabaseCore.enrolments.useQuery(undefined, { enabled: Boolean(user), retry: false });
  const requirements = trpc.supabaseCore.requirements.useQuery(undefined, { enabled: Boolean(user), retry: false });
  const profiles = trpc.supabaseCore.profiles.useQuery(undefined, { enabled: Boolean(user), staleTime: 30_000, retry: false });

  const enrolmentState = resultState(enrolments as never, online);
  const requirementState = resultState(requirements as never, online);

  const enrolmentRows = rowsOf(enrolments);
  const activeCourses = enrolments.data?.ok
    ? enrolmentRows.filter((row) => row.status === "active" || row.status === "pending").length
    : null;
  const completedCourses = enrolments.data?.ok
    ? enrolmentRows.filter((row) => row.status === "completed").length
    : null;
  const openRequests = requirements.data?.ok
    ? rowsOf(requirements).filter((row) => row.status === "published").length
    : null;

  const profileRows = profiles.data?.ok
    ? (profiles.data.data as { profile?: unknown; learnerProfile?: unknown } | null)
    : null;
  const asRow = (value: unknown) => (value && typeof value === "object" ? (value as Row) : null);
  const completion = profileRows
    ? profileCompletionFor("learner", asRow(profileRows.profile), asRow(profileRows.learnerProfile)).percent
    : null;

  useGsapReveal(root);

  const name = user?.name || user?.email?.split("@")[0] || t("learnerHome.friend");

  const actions: Array<{ icon: typeof BookOpen; labelKey: TranslationKey; copyKey: TranslationKey; href: string }> = [
    { icon: UserRoundSearch, labelKey: "learnerHome.findTeacher", copyKey: "learnerHome.findTeacherCopy", href: "/dashboard/learner/teachers" },
    { icon: BookOpen, labelKey: "learnerHome.browseCourses", copyKey: "learnerHome.browseCoursesCopy", href: "/dashboard/learner/courses" },
    { icon: ListChecks, labelKey: "learnerHome.postRequest", copyKey: "learnerHome.postRequestCopy", href: "/dashboard/learner/requirements/new" },
    { icon: GraduationCap, labelKey: "learnerHome.hifz", copyKey: "learnerHome.hifzCopy", href: "/dashboard/learner/hifz" },
    { icon: CalendarClock, labelKey: "learnerHome.schedule", copyKey: "learnerHome.scheduleCopy", href: "/dashboard/learner/schedule" },
    { icon: MessageSquare, labelKey: "learnerHome.messages", copyKey: "learnerHome.messagesCopy", href: "/dashboard/learner/messages" },
  ];

  return (
    <div ref={root} className="mx-auto max-w-6xl px-5 py-8 lg:px-6 lg:py-10">
      <header data-anim="intro">
        <p className="ni-label">{t("learnerHome.eyebrow")}</p>
        <h1 className="mt-3 font-display text-[clamp(1.8rem,3.6vw,2.5rem)] leading-tight ni-t-ink text-balance">
          {t("learnerHome.greeting", { name })}
        </h1>
        <p className="mt-3 max-w-[62ch] text-sm leading-7 ni-t-muted">{t("learnerHome.copy")}</p>
      </header>

      {/* Kept as-is: it already reads the same rows the profile page writes. */}
      {completion !== null && completion < 100 && (
        <div data-anim="intro" className="mt-6">
          <ProfileCompletionBanner role="learner" />
        </div>
      )}

      {/* ------------------------------------------------------- figures --- */}
      <section data-anim="section" className="mt-9">
        <h2 className="sr-only">{t("learnerHome.figures")}</h2>
        <div data-anim="stagger" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Figure
            label={t("learnerHome.activeCourses")}
            value={activeCourses}
            state={enrolmentState}
            href="/dashboard/learner/courses"
            cta={t("learnerHome.openCourses")}
          />
          <Figure
            label={t("learnerHome.completedCourses")}
            value={completedCourses}
            state={enrolmentState}
            href="/dashboard/learner/certificates"
            cta={t("learnerHome.openCertificates")}
          />
          <Figure
            label={t("learnerHome.openRequests")}
            value={openRequests}
            state={requirementState}
            href="/dashboard/learner/requirements"
            cta={t("learnerHome.openRequests_cta")}
          />
        </div>
      </section>

      {/* --------------------------------------------------- continue on --- */}
      <section data-anim="section" className="mt-10">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="ni-label">{t("learnerHome.continueEyebrow")}</p>
            <h2 className="mt-2 font-display text-xl ni-t-ink">{t("learnerHome.continueTitle")}</h2>
          </div>
          <Link href="/dashboard/learner/courses" className="ni-btn ni-btn--quiet text-sm">{t("learnerHome.allCourses")}</Link>
        </div>

        {enrolmentState !== "ready" || enrolmentRows.length === 0 ? (
          <ResultState
            state={enrolmentState === "ready" ? "empty" : enrolmentState}
            message={enrolmentState === "ready" ? t("learnerHome.noEnrolments") : undefined}
            onRetry={() => enrolments.refetch()}
            retrying={enrolments.isFetching}
          />
        ) : (
          <ul data-anim="stagger" className="grid gap-4 sm:grid-cols-2">
            {enrolmentRows.slice(0, 4).map((row) => (
              <li key={String(row.id)} className="ni-ed-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="ni-label">{t("learnerHome.enrolment")}</p>
                  <span className="ni-verify">{String(row.status ?? "")}</span>
                </div>
                <p className="mt-2.5 font-display text-lg ni-t-ink">{String(row.course_id ?? "").slice(0, 8)}…</p>
                <Link
                  href={`/dashboard/learner/courses/${String(row.course_id ?? "")}`}
                  className="mt-4 inline-flex items-center gap-1 text-sm font-bold ni-link"
                >
                  {t("learnerHome.resume")} <ArrowRight size={13} aria-hidden="true" className="rtl:-scale-x-100" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ------------------------------------------------- quick actions --- */}
      <section data-anim="section" className="mt-10">
        <div className="mb-5">
          <p className="ni-label">{t("learnerHome.actionsEyebrow")}</p>
          <h2 className="mt-2 font-display text-xl ni-t-ink">{t("learnerHome.actionsTitle")}</h2>
        </div>
        <div data-anim="stagger" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.href}
                href={action.href}
                className="ni-ed-card group p-5 outline-none focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]"
              >
                <span className="inline-flex rounded-[9px] border border-[var(--ni-sage-line)] bg-[var(--ni-field)] p-2.5">
                  <Icon size={17} aria-hidden="true" className="ni-t-gold" />
                </span>
                <h3 className="mt-3.5 font-display text-base ni-t-ink group-hover:underline">{t(action.labelKey)}</h3>
                <p className="mt-1.5 text-sm leading-6 ni-t-muted">{t(action.copyKey)}</p>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ------------------------------------------------------- ai tutor --- */}
      <section data-anim="section" className="mt-10">
        <div className="ni-ed-card relative overflow-hidden">
          <div aria-hidden="true" className="ni-stripe" />
          <div className="grid gap-5 p-6 sm:grid-cols-[1.5fr_.5fr] sm:items-center lg:p-8">
            <div className="min-w-0">
              <p className="ni-label">{t("learnerHome.tutorEyebrow")}</p>
              <h2 className="mt-2.5 font-display text-xl ni-t-ink">{t("learnerHome.tutorTitle")}</h2>
              <p className="mt-2.5 max-w-[58ch] text-sm leading-7 ni-t-muted">{t("learnerHome.tutorCopy")}</p>
            </div>
            <div className="sm:justify-self-end">
              <Link href="/dashboard/learner/ai-tutor" className="ni-btn ni-btn--primary">
                <Sparkles size={15} aria-hidden="true" />
                {t("learnerHome.openTutor")}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
