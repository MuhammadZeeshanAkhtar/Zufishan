/**
 * Admin overview — the platform's real state, and nothing else.
 *
 * Every number on this page came from an exact count against a live table in
 * `admin.overview`. There are no placeholder figures, no seeded activity and no
 * illustrative charts. That has one consequence worth stating plainly: on a new
 * installation almost every card reads zero, and that is the correct answer, not
 * a broken screen. The page therefore has to distinguish three things a lesser
 * dashboard collapses into one grey box:
 *
 *   - **zero** — the query succeeded and there is nothing there;
 *   - **unavailable** — that one query failed, so no number is shown at all;
 *   - **the whole payload failed** — forbidden, offline, setup-needed or error,
 *     rendered by the shared `ResultState` rather than as an empty page.
 *
 * A card only becomes a link when its destination has actually been built, so
 * the desk never promises a page that is not there yet.
 */
import { AlertTriangle, ArrowRight, CheckCircle2, CircleDashed, RotateCw, ShieldCheck, Wrench } from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "../contexts/LocaleContextState";
import AdminShell from "./AdminShell";
import ResultState from "./ResultState";
import { resultError, resultState } from "../lib/result-state";
import { useOnlineStatus } from "../lib/use-online-status";
import { adminNavItem, auditIcon } from "../lib/admin-nav";
import type { TranslationKey } from "@/i18n/catalog";
import type { AccountRoleKey } from "@shared/account-roles";

type Metric = { key: string; value: number | null; available: boolean };
type Provider = { key: string; state: "ready" | "setup_needed" | "not_implemented"; requiredEnv: string[] };
type Activity = {
  id: string; action: string; entityType: string; entityId: string | null;
  actorName: string | null; createdAt: string; from: string | null; to: string | null;
};
type AccountRoleTotals = {
  buckets: Array<{ key: AccountRoleKey; value: number | null; available: boolean }>;
  totalAccounts: number | null;
};
type Overview = {
  metrics: Metric[]; accountRoles: AccountRoleTotals; providers: Provider[]; recentActivity: Activity[];
  activityUnavailable: boolean; generatedAt: string;
};

/**
 * Where each metric sends the reader, and whether it is one of the "act on this"
 * figures. `nav` is a key from the navigation model, so a destination that has
 * not been built yet cannot accidentally become a link.
 */
const METRICS: Record<string, { nav: string | null; actionable?: boolean }> = {
  learners:             { nav: "users" },
  instructors:          { nav: "users" },
  // Administrators are their own figure. They used to be counted inside
  // "learners", because the old query counted role ROWS and the administrator
  // account still holds a stale `learner` row from the pre-0023 signup trigger.
  admins:               { nav: "users" },
  courses:              { nav: "courses" },
  publishedCourses:     { nav: "courses" },
  pendingVerifications: { nav: "instructors", actionable: true },
  coursesInReview:      { nav: "courses", actionable: true },
  pendingReviews:       { nav: "reviews", actionable: true },
  upcomingBookings:     { nav: "bookings" },
  openReports:          { nav: "content", actionable: true },
  openCases:            { nav: "content", actionable: true },
};

const PROVIDER_TONE: Record<Provider["state"], { icon: typeof CheckCircle2; border: string; bg: string; fg: string }> = {
  ready:           { icon: CheckCircle2,  border: "var(--ni-sage-line)", bg: "var(--ni-sage-soft)", fg: "var(--ni-moss-deep)" },
  setup_needed:    { icon: Wrench,        border: "var(--ni-gold-mid)",  bg: "var(--ni-gold-soft)", fg: "var(--ni-gold-ink)" },
  not_implemented: { icon: CircleDashed,  border: "var(--ni-sage-line)", bg: "transparent",         fg: "var(--ni-muted)" },
};

/**
 * Every account, once, by role — the line that shows the totals adding up.
 *
 * Three of these buckets have a card of their own above; `staff` and
 * `unassigned` do not, and without this line an account in either would simply
 * be missing from the picture. Because the buckets are mutually exclusive and
 * exhaustive, they must sum to the account total, and the line says so. If they
 * ever fail to, it reports the discrepancy rather than presenting a tidy total
 * that has quietly lost somebody.
 */
function AccountRoleBreakdown({ totals }: { totals: AccountRoleTotals }) {
  const { t, formatNumber } = useLocale();
  const readable = totals.buckets.filter((bucket) => bucket.available);
  const sum = readable.reduce((running, bucket) => running + (bucket.value ?? 0), 0);
  const complete = readable.length === totals.buckets.length && totals.totalAccounts !== null;
  const reconciles = complete && sum === totals.totalAccounts;

  return (
    <div className="mt-4 rounded-[9px] border border-[var(--ni-sage-line)] bg-[var(--ni-sage-soft)] px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <p className="ni-label">{t("adminOverview.accountsByRole")}</p>
        <ul className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm ni-t-muted">
          {totals.buckets.map((bucket) => (
            <li key={bucket.key}>
              <span className="ni-t-ink">{t(`adminOverview.role.${bucket.key}` as TranslationKey)}</span>{" "}
              <span className="font-bold tabular-nums ni-t-ink ltr-embed">
                {bucket.available ? formatNumber(bucket.value ?? 0) : t("adminOverview.metricUnavailable")}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-2 text-xs ni-t-muted-soft">
        {complete
          ? reconciles
            ? t("adminOverview.rolesReconcile", { total: formatNumber(totals.totalAccounts ?? 0) })
            : t("adminOverview.rolesMismatch", { sum: formatNumber(sum), total: formatNumber(totals.totalAccounts ?? 0) })
          : t("adminOverview.rolesIncomplete")}
      </p>
    </div>
  );
}

/** A headline number. Renders a real zero, or an explicit "could not be read". */
function MetricCard({ metric }: { metric: Metric }) {
  const { t, formatNumber } = useLocale();
  const config = METRICS[metric.key] ?? { nav: null };
  const destination = config.nav ? adminNavItem(config.nav) : undefined;
  const linked = Boolean(destination?.built);
  const label = t(`adminOverview.metric.${metric.key}` as TranslationKey);
  const needsAttention = Boolean(config.actionable) && metric.available && (metric.value ?? 0) > 0;

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="ni-label min-w-0">{label}</p>
        {needsAttention && (
          <span className="ni-verify shrink-0 border-[var(--ni-gold-mid)] py-0.5 text-[.62rem]" style={{ color: "var(--ni-gold-ink)" }}>
            {t("adminOverview.needsAttention")}
          </span>
        )}
      </div>
      {metric.available ? (
        <p className="mt-3 font-display text-[2.35rem] leading-none tracking-[-0.02em] ni-t-ink ltr-embed">
          {formatNumber(metric.value ?? 0)}
        </p>
      ) : (
        <p className="mt-3 flex items-center gap-1.5 text-sm font-semibold ni-t-clay-ink">
          <AlertTriangle size={15} aria-hidden="true" />
          {t("adminOverview.metricUnavailable")}
        </p>
      )}
      {linked && (
        <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold ni-link">
          {t("adminOverview.open")}
          <ArrowRight size={13} aria-hidden="true" className="rtl:-scale-x-100" />
        </span>
      )}
    </>
  );

  const shell = "ni-ed-card block p-5 outline-none focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]";
  return linked && destination
    ? <Link href={destination.href} className={shell}>{body}</Link>
    : <div className={shell}>{body}</div>;
}

function ProviderRow({ provider }: { provider: Provider }) {
  const { t } = useLocale();
  const tone = PROVIDER_TONE[provider.state];
  const Icon = tone.icon;
  const stateLabel = t(
    provider.state === "ready" ? "adminOverview.providerReady"
      : provider.state === "setup_needed" ? "adminOverview.providerSetup"
      : "adminOverview.providerNotImplemented",
  );

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-[var(--ni-sage)] py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="text-sm font-semibold ni-t-ink">{t(`adminOverview.provider.${provider.key}` as TranslationKey)}</p>
        {provider.requiredEnv.length > 0 && provider.state !== "ready" && (
          // Variable NAMES only. The server never sends a value, and nothing here
          // could render one even if it did.
          <p className="mt-1 text-[11px] leading-4 ni-t-muted-soft ltr-embed">
            {t("adminOverview.providerNeeds")}: {provider.requiredEnv.join(", ")}
          </p>
        )}
      </div>
      <span
        className="ni-verify shrink-0"
        style={{ borderColor: tone.border, background: tone.bg, color: tone.fg }}
      >
        <Icon size={13} aria-hidden="true" />
        {stateLabel}
      </span>
    </li>
  );
}

function ActivityList({ rows, unavailable }: { rows: Activity[]; unavailable: boolean }) {
  const { t, formatDate } = useLocale();
  const Icon = auditIcon;

  if (unavailable) return <ResultState state="error" message={t("adminOverview.activityUnavailable")} />;
  if (rows.length === 0) return <ResultState state="empty" message={t("adminOverview.activityEmpty")} />;

  return (
    <ul className="space-y-0">
      {rows.map((row) => (
        <li key={row.id} className="flex gap-3 border-b border-[var(--ni-sage)] py-3.5 last:border-b-0">
          <Icon size={16} aria-hidden="true" className="mt-0.5 shrink-0 ni-t-gold" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold ni-t-ink ltr-embed">{row.action}</p>
            <p className="mt-1 text-xs leading-5 ni-t-muted">
              {row.actorName || t("adminOverview.actorUnknown")}
              {" · "}
              <span className="ltr-embed">{row.entityType}</span>
              {row.from && row.to && (
                <>
                  {" · "}
                  <span className="ltr-embed">{row.from} → {row.to}</span>
                </>
              )}
            </p>
            <p className="mt-1 text-[11px] ni-t-muted-soft ltr-embed">
              {formatDate(row.createdAt, { dateStyle: "medium", timeStyle: "short" })}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** The queues with something actually waiting. Nothing pending means nothing is listed. */
function QuickActions({ metrics }: { metrics: Metric[] }) {
  const { t, formatNumber } = useLocale();
  const pending = metrics.filter((metric) => {
    const config = METRICS[metric.key];
    return config?.actionable && metric.available && (metric.value ?? 0) > 0;
  });

  if (pending.length === 0) {
    return (
      <div className="rounded-[11px] border border-[var(--ni-sage-line)] bg-[var(--ni-sage-soft)] px-4 py-5 text-sm leading-6 ni-t-muted">
        <ShieldCheck size={17} aria-hidden="true" className="mb-2 ni-t-moss" />
        {t("adminOverview.nothingPending")}
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {pending.map((metric) => {
        const destination = adminNavItem(METRICS[metric.key].nav ?? "");
        const label = t(`adminOverview.action.${metric.key}` as TranslationKey);
        const count = formatNumber(metric.value ?? 0);
        const inner = (
          <>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold ni-t-ink">{label}</span>
              <span className="ni-label mt-0.5 block">
                <span className="ltr-embed">{count}</span> {t("adminOverview.waiting")}
              </span>
            </span>
            <ArrowRight size={15} aria-hidden="true" className="shrink-0 rtl:-scale-x-100" />
          </>
        );
        const shell = "flex items-center justify-between gap-3 rounded-[9px] border border-[var(--ni-sage-line)] bg-[var(--ni-paper)] px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]";
        return (
          <li key={metric.key}>
            {destination?.built
              ? <Link href={destination.href} className={`${shell} ni-link hover:border-[var(--ni-gold-mid)]`}>{inner}</Link>
              : (
                <div className={`${shell} ni-t-muted`}>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold ni-t-ink">{label}</span>
                    <span className="ni-label mt-0.5 block">
                      <span className="ltr-embed">{count}</span> {t("adminOverview.waiting")} · {t("adminDesk.inProgressShort")}
                    </span>
                  </span>
                </div>
              )}
          </li>
        );
      })}
    </ul>
  );
}

export default function AdminOverviewExperience() {
  const { t, formatDate } = useLocale();
  const { user } = useAuth();
  const online = useOnlineStatus();

  const query = trpc.admin.overview.useQuery(undefined, { retry: false });
  const state = resultState(query as never, online);
  const data = query.data?.ok ? (query.data.data as Overview) : null;

  const displayName = user?.name || user?.email?.split("@")[0] || "";

  const refresh = (
    <button
      type="button"
      onClick={() => query.refetch()}
      disabled={query.isFetching}
      className="ni-btn ni-btn--outline text-sm disabled:opacity-50"
    >
      <RotateCw size={14} aria-hidden="true" className={query.isFetching ? "animate-spin" : ""} />
      {t("adminOverview.refresh")}
    </button>
  );

  return (
    <AdminShell
      activeKey="overview"
      eyebrow={t("adminOverview.eyebrow")}
      title={displayName ? t("adminOverview.welcomeNamed", { name: displayName }) : t("adminOverview.title")}
      copy={t("adminOverview.copy")}
      actions={refresh}
    >
      {state !== "ready" ? (
        <ResultState
          state={state}
          message={state === "forbidden" || state === "setup" || state === "error" ? resultError(query as never) : undefined}
          onRetry={() => query.refetch()}
          retrying={query.isFetching}
        />
      ) : (
        <div className="space-y-8">
          <section aria-labelledby="admin-figures">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="admin-figures" className="font-display text-xl ni-t-ink">{t("adminOverview.figures")}</h2>
              {data && (
                <p className="text-[11px] ni-t-muted-soft">
                  {t("adminOverview.asOf")}{" "}
                  <span className="ltr-embed">{formatDate(data.generatedAt, { timeStyle: "short", dateStyle: "medium" })}</span>
                </p>
              )}
            </div>
            <hr className="ni-rule mt-3" />
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {(data?.metrics ?? []).map((metric) => <MetricCard key={metric.key} metric={metric} />)}
            </div>
            {data?.accountRoles && <AccountRoleBreakdown totals={data.accountRoles} />}
          </section>

          <div className="grid gap-6 lg:grid-cols-[1.15fr_.85fr]">
            <section aria-labelledby="admin-activity" className="ni-ed-card p-6">
              <h2 id="admin-activity" className="font-display text-xl ni-t-ink">{t("adminOverview.activity")}</h2>
              <p className="mt-1.5 text-sm leading-6 ni-t-muted">{t("adminOverview.activityCopy")}</p>
              <hr className="ni-rule mt-4" />
              <div className="mt-2">
                <ActivityList rows={data?.recentActivity ?? []} unavailable={Boolean(data?.activityUnavailable)} />
              </div>
            </section>

            <div className="space-y-6">
              <section aria-labelledby="admin-next" className="ni-ed-card p-6">
                <h2 id="admin-next" className="font-display text-xl ni-t-ink">{t("adminOverview.quickActions")}</h2>
                <p className="mt-1.5 text-sm leading-6 ni-t-muted">{t("adminOverview.quickActionsCopy")}</p>
                <div className="mt-4"><QuickActions metrics={data?.metrics ?? []} /></div>
              </section>

              <section aria-labelledby="admin-providers" className="ni-ed-card p-6">
                <h2 id="admin-providers" className="font-display text-xl ni-t-ink">{t("adminOverview.providers")}</h2>
                <p className="mt-1.5 text-sm leading-6 ni-t-muted">{t("adminOverview.providersCopy")}</p>
                <hr className="ni-rule mt-4" />
                <ul className="mt-1">
                  {(data?.providers ?? []).map((provider) => <ProviderRow key={provider.key} provider={provider} />)}
                </ul>
              </section>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
