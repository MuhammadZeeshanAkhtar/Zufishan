/**
 * Payments: the checkout, and the transactions behind it.
 *
 * Nothing here can create money and nothing here pretends to. The two screens exist so that when a
 * provider is connected the UI does not need rebuilding — and so that until then, a learner is told
 * precisely what is missing rather than meeting a dead button.
 *
 * The one rule that shapes every line: **no payment is ever shown as successful unless the ledger
 * says so.** Optimism is a reasonable default for a message or a booking; it is never a reasonable
 * default for money. So there is no local "paid" state, no optimistic transition, and the button
 * reports the server's own refusal rather than a generic failure.
 *
 * Amounts are minor units throughout, formatted once at the edge. A missing part of a quote renders
 * as "not calculated", never as zero — zero is a price, and this system does not know one yet.
 */
import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, CreditCard, Loader2, Receipt, ShieldCheck } from "lucide-react";
import { trpc } from "../lib/trpc";
import { useAuth } from "../contexts/AuthContext";
import { useLocale } from "../contexts/LocaleContextState";
import { useHasDashboardChrome } from "../lib/use-dashboard-chrome";
import ResultState from "./ResultState";
import { resultError, resultRows, resultState, type ResultState as State } from "../lib/result-state";
import { useOnlineStatus } from "../lib/use-online-status";

type ProviderStatus = {
  configured: boolean;
  reason: "not_configured" | "unknown_provider" | "incomplete" | "ready";
  provider: string | null;
  missing: string[];
  supportedCurrencies: string[];
};
type Quote = {
  grossMinor: number | null; feeMinor: number | null; netMinor: number | null;
  currency: string | null; durationMinutes: number;
  missing: Array<"instructor_rate" | "platform_fee">;
};
type LedgerRow = {
  id: string; session_id: string; amount_minor: number | null; currency: string | null;
  payment_status: string; gross_minor: number | null; fee_minor: number | null; net_minor: number | null; created_at: string;
};

const panel = "rounded-[1.35rem] border border-[var(--ni-sage)] bg-[var(--ni-paper)] p-6";
const primary = "inline-flex items-center justify-center gap-2 rounded-full bg-[var(--ni-moss)] px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Formats minor units, or says the amount is not known.
 *
 * Exported because every money screen in this project must format the same way — a total that reads
 * "0" where it means "unknown" is the kind of error nobody notices until it is expensive.
 */
export function formatMinor(amount: number | null | undefined, currency: string | null | undefined, unknown: string): string {
  if (amount === null || amount === undefined || !currency) return unknown;
  const major = amount / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: 2 }).format(major);
  } catch {
    // An unrecognised currency code still deserves a readable amount rather than a thrown page.
    return `${major.toFixed(2)} ${currency}`;
  }
}

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

/** The provider notice, with a broken configuration kept apart from an absent one. */
export function PaymentProviderNotice({ status }: { status: ProviderStatus | null }) {
  const { t } = useLocale();
  if (!status || status.configured) return null;
  const broken = status.reason === "unknown_provider" || status.reason === "incomplete";
  return (
    <ResultState
      state={broken ? "error" : "setup"}
      message={
        status.reason === "unknown_provider" ? t("pay.providerUnknown", { provider: status.provider ?? "" })
        : status.reason === "incomplete" ? t("pay.providerIncomplete", { missing: status.missing.join(", ") })
        : t("pay.providerNotConnected")
      }
    />
  );
}

/** A payment status as words, in the platform's own vocabulary. */
export function PaymentStatusPill({ status }: { status: string }) {
  const { t } = useLocale();
  const tone = status === "succeeded" ? "bg-[var(--ni-sage-soft)] ni-t-moss-deep"
    : status === "failed" || status === "cancelled" ? "bg-[var(--ni-clay-soft)] ni-t-clay"
    : status === "processing" || status === "pending" || status === "requires_action" ? "bg-[var(--ni-gold-soft)] ni-t-gold"
    : "bg-[var(--ni-sage-soft)] ni-t-muted";
  return (
    <span className={`inline-flex shrink-0 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[.14em] ${tone}`}>
      {t(`pay.status.${status}` as never)}
    </span>
  );
}

/* ------------------------------------------------------------------ checkout */

export function CheckoutPage({ bookingId }: { bookingId: string }) {
  const { t } = useLocale();
  const { currentSession } = useAuth();
  const online = useOnlineStatus();
  const signedIn = Boolean(currentSession);

  const query = trpc.scheduling.checkoutQuote.useQuery({ bookingId }, { enabled: signedIn, retry: false });
  const start = trpc.scheduling.startCheckout.useMutation();
  const [refusal, setRefusal] = useState("");

  const payload = query.data?.ok ? (query.data.data as unknown as { quote: Quote; provider: ProviderStatus; ledger: LedgerRow | null }) : null;
  const state = resultState(query as never, online);
  const unknown = t("pay.notCalculated");

  const pay = async () => {
    setRefusal("");
    try {
      const result = await start.mutateAsync({ bookingId });
      // There is deliberately no success branch that marks anything paid locally. A payment is
      // complete when the ledger says so, and the ledger is written by a verified provider event.
      if (!result.ok) { setRefusal(result.error); return; }
      await query.refetch();
    } catch {
      setRefusal(t("pay.checkoutFailed"));
    }
  };

  if (!signedIn) {
    return (
      <Shell backHref="/login" eyebrow={t("pay.checkoutEyebrow")} title={t("pay.checkoutTitle")}>
        <div className="mt-8"><ResultState state="forbidden" message={t("messaging.unauthorized")} /></div>
      </Shell>
    );
  }

  return (
    <Shell backHref="/dashboard/learner/bookings" eyebrow={t("pay.checkoutEyebrow")} title={t("pay.checkoutTitle")} copy={t("pay.checkoutCopy")}>
      <div className="mt-8 space-y-5">
        {state !== "ready" && (
          <ResultState
            state={state === "empty" ? "error" : state}
            message={resultError(query as never)}
            onRetry={() => query.refetch()}
            retrying={query.isFetching}
          />
        )}

        {payload && (
          <>
            <PaymentProviderNotice status={payload.provider} />

            <div className={panel}>
              <h2 className="font-display text-xl">{t("pay.summary")}</h2>
              <dl className="mt-4 divide-y divide-[var(--ni-sage)]">
                {([
                  [t("pay.duration"), t("pay.minutes", { count: payload.quote.durationMinutes })],
                  [t("pay.gross"), formatMinor(payload.quote.grossMinor, payload.quote.currency, unknown)],
                  [t("pay.fee"), formatMinor(payload.quote.feeMinor, payload.quote.currency, unknown)],
                  [t("pay.net"), formatMinor(payload.quote.netMinor, payload.quote.currency, unknown)],
                ] as Array<[string, string]>).map(([name, value]) => (
                  <div key={name} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <dt className="text-sm ni-t-muted">{name}</dt>
                    <dd className="text-sm font-bold tabular ltr-embed">{value}</dd>
                  </div>
                ))}
              </dl>

              {/* Each missing part names who resolves it, because they are different people. */}
              {payload.quote.missing.includes("instructor_rate") && (
                <p className="mt-4 text-xs leading-5 ni-t-gold">{t("pay.missingRate")}</p>
              )}
              {payload.quote.missing.includes("platform_fee") && (
                <p className="mt-2 text-xs leading-5 ni-t-gold">{t("pay.missingFee")}</p>
              )}
            </div>

            {payload.ledger && (
              <div className={panel}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-display text-xl">{t("pay.existingCharge")}</h2>
                  <PaymentStatusPill status={payload.ledger.payment_status} />
                </div>
                <p className="mt-2 text-sm tabular ltr-embed">{formatMinor(payload.ledger.amount_minor, payload.ledger.currency, unknown)}</p>
              </div>
            )}

            <div className={panel}>
              <button
                type="button"
                onClick={pay}
                disabled={start.isPending || !payload.provider.configured || payload.quote.missing.length > 0}
                aria-busy={start.isPending}
                className={primary}
              >
                {start.isPending ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <CreditCard size={15} aria-hidden="true" />}
                {start.isPending ? t("pay.starting") : t("pay.payNow")}
              </button>
              {refusal && (
                <p role="status" className="mt-3 max-w-[56ch] rounded-xl border border-[var(--ni-gold-mid)] bg-[var(--ni-gold-soft)] px-4 py-3 text-xs leading-5 ni-t-gold">
                  {refusal}
                </p>
              )}
              <p className="mt-4 flex items-start gap-2 text-xs leading-5 ni-t-muted-soft">
                <ShieldCheck size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                {t("pay.noCardHere")}
              </p>
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}

/* ------------------------------------------------------- transaction history */

export function TransactionsPage({ role }: { role: "learner" | "instructor" }) {
  const { t } = useLocale();
  const { currentSession } = useAuth();
  const online = useOnlineStatus();
  const signedIn = Boolean(currentSession);

  const query = trpc.scheduling.myTransactions.useQuery(undefined, { enabled: signedIn, retry: false });
  const setup = trpc.scheduling.paymentsSetup.useQuery(undefined, { enabled: signedIn, retry: false });
  const [filter, setFilter] = useState("");

  const rows = resultRows<LedgerRow>(query as never);
  const filtered = filter ? rows.filter((row) => row.payment_status === filter) : rows;
  const statuses = Array.from(new Set(rows.map((row) => row.payment_status))).sort();
  const provider = setup.data?.ok ? (setup.data.data as { provider: ProviderStatus }).provider : null;

  const base = resultState(query as never, online);
  const state: State | null = base === "ready" ? (filtered.length ? null : "empty") : base;
  const unknown = t("pay.notCalculated");

  if (!signedIn) {
    return (
      <Shell backHref="/login" eyebrow={t("pay.historyEyebrow")} title={t("pay.historyTitle")}>
        <div className="mt-8"><ResultState state="forbidden" message={t("messaging.unauthorized")} /></div>
      </Shell>
    );
  }

  return (
    <Shell backHref={`/dashboard/${role}`} eyebrow={t("pay.historyEyebrow")} title={t("pay.historyTitle")} copy={t("pay.historyCopy")}>
      <div className="mt-8 space-y-5">
        <PaymentProviderNotice status={provider} />

        {statuses.length > 1 && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setFilter("")} aria-pressed={filter === ""} className={`rounded-full px-4 py-2 text-xs font-bold ${filter === "" ? "bg-[var(--ni-moss)] text-white" : "border border-[var(--ni-sage-mid)] ni-t-moss"}`}>
              {t("pay.allStatuses")}
            </button>
            {statuses.map((status) => (
              <button key={status} type="button" onClick={() => setFilter(status)} aria-pressed={filter === status} className={`rounded-full px-4 py-2 text-xs font-bold ${filter === status ? "bg-[var(--ni-moss)] text-white" : "border border-[var(--ni-sage-mid)] ni-t-moss"}`}>
                {t(`pay.status.${status}` as never)}
              </button>
            ))}
          </div>
        )}

        {state && (
          <ResultState
            state={state}
            // A filter that matches nothing is not the same as having no transactions.
            message={state === "empty" ? (filter ? t("pay.noneMatch") : t("pay.none")) : resultError(query as never)}
            onRetry={() => query.refetch()}
            retrying={query.isFetching}
          />
        )}

        {filtered.map((row) => (
          <article key={row.id} className={panel}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Receipt size={16} className="ni-t-muted-soft" aria-hidden="true" />
                  <h2 className="font-display text-lg tabular ltr-embed">{formatMinor(row.amount_minor, row.currency, unknown)}</h2>
                </div>
                <p className="mt-1 text-xs ni-t-muted ltr-embed">{new Date(row.created_at).toLocaleString()}</p>
              </div>
              <PaymentStatusPill status={row.payment_status} />
            </div>
            <dl className="mt-4 grid gap-2 sm:grid-cols-3">
              {([
                [t("pay.gross"), formatMinor(row.gross_minor, row.currency, unknown)],
                [t("pay.fee"), formatMinor(row.fee_minor, row.currency, unknown)],
                [t("pay.net"), formatMinor(row.net_minor, row.currency, unknown)],
              ] as Array<[string, string]>).map(([name, value]) => (
                <div key={name} className="rounded-xl bg-[var(--ni-sage-soft)] p-3">
                  <dt className="text-[10px] font-bold uppercase tracking-[.13em] ni-t-muted-soft">{name}</dt>
                  <dd className="mt-1 text-sm font-semibold tabular ltr-embed">{value}</dd>
                </div>
              ))}
            </dl>
          </article>
        ))}

        <p className="text-xs leading-5 ni-t-muted-soft">{t("pay.readOnlyNote")}</p>
      </div>
    </Shell>
  );
}
