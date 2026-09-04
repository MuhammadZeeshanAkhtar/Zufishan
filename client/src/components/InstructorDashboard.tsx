/**
 * Tutor dashboard.
 *
 * Structure follows the reference tutor dashboard: a wallet strip and a training strip across the
 * top, then a two-column body — tabbed Recommended / Received Invites / Bookings on the left, and a
 * "Current Students" panel on the right. Rendered in Noor Ilm's own tokens.
 *
 * Learner-side rendering is untouched: this component is only mounted for the instructor role, and
 * DashboardOverview still serves learner and admin exactly as before.
 */
import { useState } from "react";
import { Link } from "wouter";
import { Inbox, MessageSquare, UserSearch, Wallet } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { useLocale } from "../contexts/LocaleContextState";
import ProfileCompletionBanner from "./ProfileCompletionBanner";

type RequirementRow = {
  id: string;
  subject: string | null;
  level: string | null;
  goal: string | null;
  preferred_language: string | null;
  timezone: string | null;
  availability: string | null;
};

type TabKey = "recommended" | "invites" | "bookings";

function Banner({ tone, children }: { tone: "wallet" | "training"; children: React.ReactNode }) {
  const base = "rounded-xl px-4 py-3 text-sm leading-6";
  return (
    <div className={`${base} ${tone === "wallet"
      ? "border border-[var(--ni-sage-mid)] bg-[var(--ni-sage-soft)] text-[var(--ni-moss-deep)]"
      : "border border-[var(--ni-gold-mid)] bg-[var(--ni-gold-soft)] text-[var(--ni-gold-ink)]"}`}>
      {children}
    </div>
  );
}

function EmptyPanel({ title, copy, action }: { title: string; copy: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--ni-sage-mid)] bg-[var(--ni-sage-soft)] px-5 py-10 text-center">
      <p className="font-display text-xl text-[var(--ni-ink)]">{title}</p>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[var(--ni-muted)]">{copy}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export default function InstructorDashboard() {
  const { t } = useLocale();
  const { user } = useAuth();
  const [tab, setTab] = useState<TabKey>("recommended");

  // Real data only. Published learner requirements are the tutor's genuine "suggested students".
  const requirementsQuery = trpc.supabaseCore.publishedRequirements.useQuery(undefined, { retry: false });
  // Trial requests are what a learner actually sends a tutor, so they are the real "invites".
  const responsesQuery = trpc.scheduling.instructorTrials.useQuery(undefined, { retry: false });
  const bookingsQuery = trpc.scheduling.instructorBookings.useQuery(undefined, { retry: false });

  const rows = <T,>(q: { data?: { ok: boolean; data?: unknown } }) =>
    q.data?.ok && Array.isArray(q.data.data) ? (q.data.data as T[]) : [];

  const suggested = rows<RequirementRow>(requirementsQuery);
  const invites = rows<{ id: string }>(responsesQuery);
  const bookings = rows<{ id: string; scheduled_start_at?: string; status?: string }>(bookingsQuery);

  const displayName = user?.name || user?.email?.split("@")[0] || "";

  const TABS: Array<{ key: TabKey; label: string; count?: number }> = [
    { key: "recommended", label: t("tutorDesk.recommended") },
    { key: "invites", label: t("tutorDesk.receivedInvites"), count: invites.length },
    { key: "bookings", label: t("tutorDesk.bookings"), count: bookings.length },
  ];

  return (
    <div className="mx-auto max-w-6xl px-5 py-6 lg:px-6 lg:py-8">
      <ProfileCompletionBanner role="instructor" />
      {/* Wallet and training strips, as on the reference dashboard. */}
      <div className="space-y-3">
        <Banner tone="wallet">
          <Wallet size={15} className="me-2 inline" aria-hidden="true" />
          {t("tutorDesk.walletSetupNeeded")}{" "}
          <Link href="/dashboard/instructor/withdrawals" className="font-bold underline">{t("tutorDesk.withdrawalRequests")}</Link>
        </Banner>
        <Banner tone="training">
          {t("tutorDesk.trainingFirst")}{" "}
          <Link href="/dashboard/instructor/training" className="font-bold underline">{t("tutorDesk.trainingArea")}</Link>
        </Banner>
      </div>

      <div className="mt-7 grid gap-7 lg:grid-cols-[1.6fr_1fr]">
        {/* Left: tabbed opportunity lists */}
        <div className="min-w-0">
          <div role="tablist" aria-label={t("tutorDesk.opportunities")} className="flex flex-wrap gap-2 border-b border-[var(--ni-sage)] pb-3">
            {TABS.map((item) => (
              <button
                key={item.key}
                role="tab"
                type="button"
                aria-selected={tab === item.key}
                onClick={() => setTab(item.key)}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)] ${
                  tab === item.key
                    ? "bg-[var(--ni-moss)] text-white"
                    : "bg-[var(--ni-sage-soft)] text-[var(--ni-moss-deep)] hover:bg-[var(--ni-sage)]"
                }`}
              >
                {item.label}
                {typeof item.count === "number" && (
                  <span className={`rounded-full px-1.5 text-[11px] font-bold tabular ${tab === item.key ? "bg-white/20" : "bg-[var(--ni-sage)]"}`}>{item.count}</span>
                )}
              </button>
            ))}
          </div>

          <div className="mt-5" role="tabpanel">
            {tab === "recommended" && <>
              <p className="mb-4 text-sm leading-6 text-[var(--ni-muted)]">{t("tutorDesk.recommendedCopy")}</p>
              {requirementsQuery.isLoading && <p aria-live="polite" className="rounded-2xl bg-[var(--ni-sage-soft)] p-5 text-sm text-[var(--ni-muted)]">{t("dashboard.loading")}</p>}
              {requirementsQuery.isError && <p role="alert" className="rounded-2xl bg-[var(--ni-clay-soft)] p-5 text-sm text-[var(--ni-clay)]">{t("common.error")}</p>}
              {!requirementsQuery.isLoading && !requirementsQuery.isError && (
                suggested.length ? (
                  <ul className="stagger space-y-3">
                    {suggested.slice(0, 10).map((row) => (
                      <li key={row.id} className="rounded-2xl border border-[var(--ni-sage)] bg-[var(--ni-paper)] p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-display text-lg text-[var(--ni-moss)]">{row.subject || t("tutorDesk.learner")}</p>
                            <dl className="mt-2 space-y-1 text-xs text-[var(--ni-muted)]">
                              <div><dt className="inline font-semibold text-[var(--ni-ink)]">{t("tutorDesk.wantsToLearn")}: </dt><dd className="inline">{row.subject || "—"}{row.level ? ` · ${row.level}` : ""}</dd></div>
                              <div><dt className="inline font-semibold text-[var(--ni-ink)]">{t("tutorDesk.spokenLanguages")}: </dt><dd className="inline">{row.preferred_language || "—"}</dd></div>
                              <div><dt className="inline font-semibold text-[var(--ni-ink)]">{t("tutorDesk.timeZone")}: </dt><dd className="inline ltr-embed">{row.timezone || "—"}</dd></div>
                            </dl>
                          </div>
                          <Link
                            href={`/dashboard/instructor/requirements/${row.id}`}
                            aria-label={t("tutorDesk.respond")}
                            className="shrink-0 rounded-full bg-[var(--ni-sage-soft)] p-2.5 text-[var(--ni-moss)] outline-none hover:bg-[var(--ni-sage)] focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]"
                          >
                            <MessageSquare size={17} />
                          </Link>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyPanel
                    title={t("tutorDesk.noSuggestions")}
                    copy={t("tutorDesk.noSuggestionsCopy")}
                    action={<Link href="/dashboard/instructor/requirements" className="inline-flex items-center gap-2 rounded-full bg-[var(--ni-moss)] px-5 py-2.5 text-sm font-semibold text-white"><UserSearch size={16}/>{t("tutorDesk.findStudents")}</Link>}
                  />
                )
              )}
            </>}

            {tab === "invites" && (
              invites.length
                ? <p className="rounded-2xl border border-[var(--ni-sage)] bg-[var(--ni-paper)] p-5 text-sm text-[var(--ni-muted)]">
                    <Inbox size={15} className="me-2 inline"/>{t("tutorDesk.invitesCount", { count: String(invites.length) })}{" "}
                    <Link href="/dashboard/instructor/requirements" className="font-bold text-[var(--ni-moss)] underline">{t("tutorDesk.openRequirements")}</Link>
                  </p>
                : <EmptyPanel title={t("tutorDesk.noInvites")} copy={t("tutorDesk.noInvitesCopy")}/>
            )}

            {tab === "bookings" && (
              bookings.length
                ? <ul className="space-y-3">
                    {bookings.slice(0, 10).map((row) => (
                      <li key={row.id} className="rounded-2xl border border-[var(--ni-sage)] bg-[var(--ni-paper)] p-4 text-sm">
                        <span className="font-semibold text-[var(--ni-ink)]">{row.status || "—"}</span>
                        {row.scheduled_start_at && <span className="ms-2 text-[var(--ni-muted)] ltr-embed">{new Date(row.scheduled_start_at).toLocaleString()}</span>}
                      </li>
                    ))}
                  </ul>
                : <EmptyPanel title={t("tutorDesk.noBookings")} copy={t("tutorDesk.noBookingsCopy")}/>
            )}
          </div>
        </div>

        {/* Right: current students */}
        <aside className="min-w-0">
          <h2 className="mb-4 flex items-center gap-2 border-b border-[var(--ni-sage)] pb-3 font-display text-lg text-[var(--ni-ink)]">
            <MessageSquare size={17} className="text-[var(--ni-moss)]" aria-hidden="true"/>
            {t("tutorDesk.currentStudents")}
          </h2>
          <EmptyPanel
            title={t("tutorDesk.nobodyHired")}
            copy={t("tutorDesk.nobodyHiredCopy")}
            action={<Link href="/dashboard/instructor/requirements" className="inline-flex items-center gap-2 rounded-full bg-[var(--ni-moss)] px-5 py-2.5 text-sm font-semibold text-white"><UserSearch size={16}/>{t("tutorDesk.findStudents")}</Link>}
          />
          {displayName && <p className="mt-4 text-center text-xs text-[var(--ni-muted-soft)]">{t("tutorDesk.signedInAs", { name: displayName })}</p>}
        </aside>
      </div>
    </div>
  );
}
