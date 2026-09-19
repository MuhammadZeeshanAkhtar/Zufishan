/**
 * Billing and Withdrawal Requests, for a teacher.
 *
 * Both screens used to be fixtures. `EarningsPage` called `getInstructorEarningsSummary("instructor-demo")`
 * and `WithdrawalPage` called `getInstructorWithdrawals("instructor-demo")` — a literal id, so every
 * teacher was shown the same invented figures and the same empty list whatever they had taught.
 *
 * They now read the teacher's own rows. The reference marketplace shapes Billing as one week at a
 * time with a week picker and an amount column explained in a line of copy; Withdrawal Requests as
 * the list of submitted requests beside the payout schedule. That shape is kept, in this project's
 * own cards and tokens, in all three languages and both themes.
 *
 * Two honesty rules run through it. An amount derived from time logged is labelled an estimate and
 * is only shown when both the time and the rate are actually known — never a confident zero. And
 * the withdraw action stays closed while no payment provider is connected, with the reason said out
 * loud, rather than a button that appears to move money and does not.
 */
import { useState } from "react";
import { Link } from "wouter";
import { ChevronLeft, ChevronRight, Clock3, Wallet } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLocale } from "../contexts/LocaleContextState";
import { useOnlineStatus } from "../lib/use-online-status";
import { resultError, resultState } from "../lib/result-state";
import ResultState from "./ResultState";

type WeeklySession = {
  id: string; title: string; sessionType: string; status: string;
  scheduledStartAt: string; scheduledEndAt: string;
  learnerId: string; learnerName: string | null;
  minutesLogged: number | null;
  settledMinor: number | null; settledCurrency: string | null; paymentStatus: string | null;
  estimatedMinor: number | null;
};
type WeeklyEarnings = {
  weekStart: string; weekEnd: string; hourlyRateMinor: number | null; currency: string | null;
  sessions: WeeklySession[];
  totals: { minutesLogged: number; settledMinor: number | null; estimatedMinor: number | null };
};
type WithdrawalRow = {
  id: string; amountMinor: number; currency: string; status: string;
  createdAt: string; expectedPayoutAt: string; providerReference: string | null;
};

/** Monday of the week containing `value`, in UTC — the same normalisation the server applies. */
function weekStartUtc(value: Date) {
  const start = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  const weekday = start.getUTCDay() === 0 ? 7 : start.getUTCDay();
  start.setUTCDate(start.getUTCDate() - (weekday - 1));
  return start;
}

const shell = "mx-auto max-w-6xl px-5 py-6 lg:px-6 lg:py-8";
const head = "px-4 py-3 text-start text-xs font-bold uppercase tracking-[.1em] ni-t-muted";
const cell = "px-4 py-3.5 align-top text-sm ni-t-ink";

/* ------------------------------------------------------------------ billing */

export function TutorBillingPage() {
  const { t, locale, formatNumber, formatCurrency } = useLocale();
  const online = useOnlineStatus();
  // The week being read, as an instant inside it. Starts at today's week.
  const [anchor, setAnchor] = useState(() => weekStartUtc(new Date()).toISOString());

  const week = trpc.scheduling.weeklyEarnings.useQuery({ weekStartIso: anchor }, { retry: false });
  const state = resultState(week as never, online);
  const data = week.data?.ok ? (week.data.data as WeeklyEarnings) : null;

  const shift = (weeks: number) => {
    const next = new Date(anchor);
    next.setUTCDate(next.getUTCDate() + weeks * 7);
    setAnchor(weekStartUtc(next).toISOString());
  };

  const dayRange = (from: string, to: string) => {
    const options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" };
    const last = new Date(to); last.setUTCDate(last.getUTCDate() - 1);
    return `${new Intl.DateTimeFormat(locale, options).format(new Date(from))} — ${new Intl.DateTimeFormat(locale, options).format(last)}`;
  };
  const at = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
  };
  const money = (minor: number, currency: string | null) => formatCurrency(minor, currency || data?.currency || "USD");

  return (
    <div className={shell}>
      <h1 className="font-display text-2xl ni-t-ink">{t("tutorBilling.title")}</h1>

      {/* The week picker, as the reference places it: the range between two arrows. */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--ni-sage-line)] bg-[var(--ni-field)] px-4 py-3">
        <span className="ni-label">{t("tutorBilling.weekOf")}</span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => shift(-1)} aria-label={t("tutorBilling.previousWeek")} className="ni-btn ni-btn--outline px-2.5 py-1.5">
            <ChevronLeft size={15} aria-hidden="true" className="rtl:rotate-180" />
          </button>
          <span className="min-w-[13rem] text-center text-sm font-semibold ni-t-ink tabular-nums">
            {data ? dayRange(data.weekStart, data.weekEnd) : "—"}
          </span>
          <button type="button" onClick={() => shift(1)} aria-label={t("tutorBilling.nextWeek")} className="ni-btn ni-btn--outline px-2.5 py-1.5">
            <ChevronRight size={15} aria-hidden="true" className="rtl:rotate-180" />
          </button>
        </div>
        <button type="button" onClick={() => setAnchor(weekStartUtc(new Date()).toISOString())} className="ni-btn ni-btn--quiet text-sm">
          {t("tutorBilling.thisWeek")}
        </button>
      </div>

      <p className="mt-4 max-w-[70ch] text-sm leading-6 ni-t-muted">{t("tutorBilling.amountNote")}</p>
      {data && data.hourlyRateMinor === null && (
        <p className="mt-2 text-sm leading-6 ni-t-clay-ink">
          {t("tutorBilling.rateMissing")}{" "}
          <Link href="/dashboard/instructor/profile" className="ni-link font-bold">{t("dashboard.settings")}</Link>
        </p>
      )}

      {state !== "ready" ? (
        <div className="mt-6">
          <ResultState state={state} message={resultError(week as never)} onRetry={() => week.refetch()} retrying={week.isFetching} />
        </div>
      ) : !data || data.sessions.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-[var(--ni-sage-mid)] bg-[var(--ni-sage-soft)] px-5 py-10 text-center">
          <p className="font-display text-lg ni-t-ink">{t("tutorBilling.noSessions")}</p>
        </div>
      ) : (
        <>
          <div className="mt-6 overflow-x-auto rounded-2xl border border-[var(--ni-sage-line)] bg-[var(--ni-paper)]">
            <table className="w-full min-w-[46rem] border-collapse">
              <thead className="border-b border-[var(--ni-sage-line)] bg-[var(--ni-field)]">
                <tr>
                  <th scope="col" className={head}>{t("tutorBilling.session")}</th>
                  <th scope="col" className={head}>{t("tutorBilling.student")}</th>
                  <th scope="col" className={head}>{t("tutorBilling.scheduled")}</th>
                  <th scope="col" className={head}>{t("tutorBilling.logged")}</th>
                  <th scope="col" className={head}>{t("tutorBilling.amount")}</th>
                  <th scope="col" className={head}>{t("tutorBilling.status")}</th>
                </tr>
              </thead>
              <tbody>
                {data.sessions.map((row) => (
                  <tr key={row.id} className="border-b border-[var(--ni-sage-line)] last:border-b-0">
                    <td className={`${cell} font-semibold`}>{row.title || "—"}</td>
                    <td className={cell}>{row.learnerName || "—"}</td>
                    <td className={`${cell} tabular-nums`}>{at(row.scheduledStartAt)}</td>
                    <td className={`${cell} tabular-nums`}>
                      {row.minutesLogged === null
                        ? <span className="ni-t-muted">{t("tutorBilling.notLogged")}</span>
                        : t("tutorBilling.minutes", { count: formatNumber(row.minutesLogged) })}
                    </td>
                    <td className={`${cell} tabular-nums`}>
                      {row.settledMinor !== null ? (
                        <>
                          <span className="font-bold">{money(row.settledMinor, row.settledCurrency)}</span>
                          <span className="mt-0.5 block text-[11px] ni-t-muted">{t("tutorBilling.settled")}</span>
                        </>
                      ) : row.estimatedMinor !== null ? (
                        <>
                          <span className="font-semibold">{money(row.estimatedMinor, data.currency)}</span>
                          <span className="mt-0.5 block text-[11px] ni-t-muted">{t("tutorBilling.estimated")}</span>
                        </>
                      ) : (
                        <span className="ni-t-muted">—</span>
                      )}
                    </td>
                    <td className={cell}><span className="ni-verify">{row.status.replaceAll("_", " ")}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="ni-ed-card p-5">
              <p className="ni-label">{t("tutorBilling.totalLogged")}</p>
              <p className="mt-2 font-display text-2xl ni-t-ink tabular-nums">
                {t("tutorBilling.minutes", { count: formatNumber(data.totals.minutesLogged) })}
              </p>
            </div>
            <div className="ni-ed-card p-5">
              <p className="ni-label">{t("tutorBilling.totalEstimated")}</p>
              <p className="mt-2 font-display text-2xl ni-t-ink tabular-nums">
                {data.totals.settledMinor !== null
                  ? money(data.totals.settledMinor, data.currency)
                  : data.totals.estimatedMinor !== null
                    ? money(data.totals.estimatedMinor, data.currency)
                    : "—"}
              </p>
            </div>
          </div>
          <p className="mt-3 max-w-[70ch] text-xs leading-6 ni-t-muted">{t("tutorBilling.estimateNote")}</p>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- withdrawals */

export function TutorWithdrawalsPage() {
  const { t, locale, formatCurrency } = useLocale();
  const online = useOnlineStatus();
  const requests = trpc.scheduling.withdrawalRequests.useQuery(undefined, { retry: false });
  const state = resultState(requests as never, online);
  const rows = requests.data?.ok ? (requests.data.data as WithdrawalRow[]) : [];

  const day = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(date);
  };

  return (
    <div className={shell}>
      <h1 className="font-display text-2xl ni-t-ink">{t("tutorWithdraw.title")}</h1>
      <p className="mt-2 max-w-[70ch] text-sm leading-6 ni-t-muted">{t("tutorWithdraw.intro")}</p>

      {/* The schedule, stated before the list, so a teacher knows the rule before reading dates. */}
      <div className="mt-5 flex items-start gap-3 rounded-2xl border border-[var(--ni-gold-mid)] bg-[var(--ni-gold-soft)] px-4 py-3.5 ni-t-gold">
        <Clock3 size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
        <p className="max-w-[72ch] text-sm leading-6">{t("tutorWithdraw.policy")}</p>
      </div>

      {/* No provider, no payout. Said once, plainly, instead of a button that cannot work. */}
      <div className="mt-4 flex items-start gap-3 rounded-2xl border border-[var(--ni-sage-mid)] bg-[var(--ni-sage-soft)] px-4 py-3.5 ni-t-moss-deep">
        <Wallet size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="max-w-[72ch] text-sm leading-6">{t("tutorWithdraw.providerNeeded")}</p>
        </div>
      </div>

      {state !== "ready" ? (
        <div className="mt-6">
          <ResultState state={state} message={resultError(requests as never)} onRetry={() => requests.refetch()} retrying={requests.isFetching} />
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-[var(--ni-sage-mid)] bg-[var(--ni-sage-soft)] px-5 py-10 text-center">
          <p className="font-display text-lg ni-t-ink">{t("tutorWithdraw.none")}</p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-[var(--ni-sage-line)] bg-[var(--ni-paper)]">
          <table className="w-full min-w-[40rem] border-collapse">
            <thead className="border-b border-[var(--ni-sage-line)] bg-[var(--ni-field)]">
              <tr>
                <th scope="col" className={head}>{t("tutorWithdraw.amount")}</th>
                <th scope="col" className={head}>{t("tutorWithdraw.requested")}</th>
                <th scope="col" className={head}>{t("tutorWithdraw.expectedPayout")}</th>
                <th scope="col" className={head}>{t("tutorWithdraw.status")}</th>
                <th scope="col" className={head}>{t("tutorWithdraw.reference")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-[var(--ni-sage-line)] last:border-b-0">
                  <td className={`${cell} font-bold tabular-nums`}>{formatCurrency(row.amountMinor, row.currency || "USD")}</td>
                  <td className={`${cell} tabular-nums`}>{day(row.createdAt)}</td>
                  <td className={`${cell} tabular-nums`}>{day(row.expectedPayoutAt)}</td>
                  <td className={cell}><span className="ni-verify">{row.status.replaceAll("_", " ")}</span></td>
                  <td className={`${cell} ni-t-muted`}>{row.providerReference || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
