/**
 * Pick a monthly credit package, and see what that month costs.
 *
 * The shape follows the reference layout: the choice and the estimator on the left, the price and
 * its action on the right in a filled panel. The colours are Zufishan's own and are the reverse of
 * the reference — gold for the panel, green for the action.
 *
 * Every figure comes from `CREDIT_PACKAGES` in `pricing-config`; there is no price written here.
 *
 * The action is the careful part. Zufishan has no payment provider connected, and a button that
 * looks purchasable when nothing can be purchased is the one thing this page must not do. So it asks
 * the server — `pricingPublic.paymentAvailability`, which returns that single fact and no vendor
 * detail — and says "coming soon" only because the answer was no. The day a provider is configured
 * the same button becomes live without anyone editing this file.
 */
import { useId } from "react";
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLocale } from "../contexts/LocaleContextState";
import { CREDIT_PACKAGES, PRICING_BASE_CURRENCY, convertFromBase, type CreditPackage } from "../lib/pricing-config";
import type { CurrencyCode } from "../lib/relationship-ops-data";

export default function PricingPackages({ currency, selected, onSelect, children }: {
  currency: CurrencyCode;
  selected: CreditPackage;
  onSelect: (id: string) => void;
  /** The estimator, which belongs under the chooser rather than beside it. */
  children?: React.ReactNode;
}) {
  const { t, formatNumber, formatCurrency } = useLocale();
  const pickerId = useId();
  const availability = trpc.pricingPublic.paymentAvailability.useQuery(undefined, { retry: false, staleTime: 300_000 });
  const payments = availability.data?.ok ? availability.data.data : null;
  const configured = payments?.configured === true;
  const chargeable = configured && payments !== null && payments.chargeableCurrencies.includes(currency);

  const price = formatCurrency(convertFromBase(selected.priceBaseMinor, currency), currency);

  return (
    <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start" aria-labelledby="pricing-packages-title">
      <h2 id="pricing-packages-title" className="sr-only">{t("pricing.packagesTitle")}</h2>

      {/* ------------------------------------------------------ the choice --- */}
      <div className="min-w-0 space-y-6">
        <div>
          <label htmlFor={pickerId} className="block text-sm font-bold ni-t-ink">{t("pricing.chooseLabel")}</label>
          <select
            id={pickerId}
            value={selected.id}
            onChange={(event) => onSelect(event.target.value)}
            className="mt-2.5 w-full rounded-xl border border-[var(--ni-sage-line)] bg-[var(--ni-field)] px-4 py-3 text-sm font-semibold ni-t-ink outline-none focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]"
          >
            {CREDIT_PACKAGES.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {t("pricing.packageOption", { credits: formatNumber(entry.credits) })}
                {" — "}
                {formatCurrency(convertFromBase(entry.priceBaseMinor, currency), currency)}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs ni-t-muted">{t("pricing.packagesCopy")}</p>
        </div>

        {children}
      </div>

      {/* ------------------------------------------------------- the price --- */}
      <aside className="ni-plan-panel rounded-2xl p-6 text-center lg:sticky lg:top-24">
        <p className="text-xs font-bold uppercase tracking-[.16em] opacity-80">{t("pricing.selectedPackage")}</p>
        <p className="mt-1 text-sm font-semibold">
          {t("pricing.packageOption", { credits: formatNumber(selected.credits) })}
        </p>

        <p className="mt-3 font-display text-4xl leading-none ltr-embed" aria-live="polite">{price}</p>
        <p className="mt-1.5 text-xs font-semibold">{t("pricing.perMonth")}</p>
        {currency !== PRICING_BASE_CURRENCY && (
          <p className="mt-1 text-[11px] opacity-80 ltr-embed">
            {formatCurrency(selected.priceBaseMinor, PRICING_BASE_CURRENCY)}
          </p>
        )}

        <div className="mt-5">
          {chargeable ? (
            // A provider is connected and can take this currency: the reader goes to the account
            // area, where the real flow lives. Nothing is charged from this page.
            <Link href="/dashboard/learner/wallet" className="ni-btn ni-btn--go w-full justify-center text-sm">
              {t("pricing.purchase")}
              <ArrowRight size={15} aria-hidden="true" className="rtl:-scale-x-100" />
            </Link>
          ) : (
            <button type="button" disabled className="ni-btn ni-btn--go w-full justify-center text-sm">
              {t("pricing.comingSoon")}
            </button>
          )}
        </div>

        <p className="mt-4 border-t border-[var(--ni-on-gold)]/20 pt-3 text-[11px] leading-5">
          {chargeable ? t("pricing.chargeableIn", { currency: PRICING_BASE_CURRENCY }) : t("pricing.billingNote")}
        </p>
      </aside>
    </section>
  );
}
