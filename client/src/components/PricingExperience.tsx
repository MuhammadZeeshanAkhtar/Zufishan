/**
 * Pricing.
 *
 * A public page that answers one question — what would a month of study cost — without asking anyone
 * to sign in and without taking money. It is deliberately additive: no existing table, procedure,
 * route or module changed to make it work.
 *
 * Three things it refuses to do, and why:
 *
 *  - It does not claim a purchase. No payment provider is connected, so the package buttons say so,
 *    and they learn that from the server rather than from a constant written here.
 *  - It does not invent policy. The FAQ says plainly that the rule for unused credits has not been
 *    decided, instead of borrowing one from somewhere else and presenting it as Zufishan's.
 *  - It does not invent teachers. The rate range comes from `schedulingPublic.instructorFacets`, the
 *    same public procedure the marketplace filters already use, so the figures are the real ones on
 *    the platform. Only when no instructor is published does it fall back to a labelled illustration.
 */
import { useState } from "react";

import { useLocale } from "../contexts/LocaleContextState";
import PricingCalculator from "./PricingCalculator";
import PricingPackages from "./PricingPackages";
import { CREDIT_PACKAGES, DISPLAY_CURRENCIES, PRICING_BASE_CURRENCY } from "../lib/pricing-config";

/** Where the estimator starts, and what "Reset calculator" returns it to. */
const DEFAULT_RATE = 1;
const DEFAULT_HOURS = 1;
import type { CurrencyCode } from "../lib/relationship-ops-data";

export default function PricingExperience() {
  const { t } = useLocale();
  const [currency, setCurrency] = useState<CurrencyCode>(PRICING_BASE_CURRENCY);
  const [hourlyRate, setHourlyRate] = useState(DEFAULT_RATE);
  const [weeklyHours, setWeeklyHours] = useState(DEFAULT_HOURS);
  const [packageId, setPackageId] = useState(CREDIT_PACKAGES[0].id);

  const selected = CREDIT_PACKAGES.find((entry) => entry.id === packageId) ?? CREDIT_PACKAGES[0];
  const choosePackage = (id: string) => setPackageId(id);
  const resetCalculator = () => { setHourlyRate(DEFAULT_RATE); setWeeklyHours(DEFAULT_HOURS); };

  const shownCurrency = DISPLAY_CURRENCIES.find((entry) => entry.code === currency) ?? DISPLAY_CURRENCIES[0];

  return (
    <main className="mx-auto max-w-6xl px-5 py-12 lg:px-8 lg:py-16">
      {/* ---------------------------------------------------------- hero --- */}
      <header className="max-w-3xl">
        <h1 className="font-display text-[clamp(2.1rem,5vw,3.2rem)] leading-tight ni-t-ink text-balance">
          {t("pricing.title")}
        </h1>
        <p className="mt-4 max-w-[62ch] text-base leading-7 ni-t-muted">{t("pricing.subtitle")}</p>
      </header>

      {/* ------------------------------------------------ currency picker --- */}
      <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-[var(--ni-sage)] py-4">
        <label htmlFor="pricing-currency" className="ni-label whitespace-nowrap">{t("pricing.currencyLabel")}</label>
        <select
          id="pricing-currency"
          value={currency}
          onChange={(event) => setCurrency(event.target.value as CurrencyCode)}
          className="rounded-full border border-[var(--ni-sage-line)] bg-[var(--ni-field)] px-4 py-2 text-sm font-semibold ni-t-ink outline-none focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]"
        >
          {DISPLAY_CURRENCIES.map((entry) => (
            <option key={entry.code} value={entry.code}>
              {entry.code} ({entry.symbol}) — {t(entry.nameKey)}
            </option>
          ))}
        </select>
        {/* A pegged currency does not drift, so the caveat is only shown where it is true. */}
        {currency !== PRICING_BASE_CURRENCY && !shownCurrency.pegged && (
          <p className="max-w-[46ch] text-xs leading-5 ni-t-muted">{t("pricing.currencyNote")}</p>
        )}
      </div>

      {/* ------------------------------------ the choice, and what it costs --- */}
      <PricingPackages currency={currency} selected={selected} onSelect={choosePackage}>
        <PricingCalculator
          currency={currency}
          hourlyRate={hourlyRate}
          weeklyHours={weeklyHours}
          onRate={setHourlyRate}
          onHours={setWeeklyHours}
          onReset={resetCalculator}
        />
      </PricingPackages>

      {/* ----------------------------------------------------------- faq --- */}
      <section className="mt-12" aria-labelledby="pricing-faq-title">
        <h2 id="pricing-faq-title" className="font-display text-2xl ni-t-ink">{t("pricing.faqTitle")}</h2>
        <dl className="mt-5 divide-y divide-[var(--ni-sage)] border-y border-[var(--ni-sage)]">
          {([1, 2, 3, 4, 5, 6, 7] as const).map((index) => (
            <div key={index} className="grid gap-1.5 py-4 lg:grid-cols-[18rem_1fr] lg:gap-6">
              <dt className="font-display text-base ni-t-ink">{t(`pricing.faq.q${index}` as const)}</dt>
              <dd className="max-w-[68ch] text-sm leading-7 ni-t-muted">{t(`pricing.faq.a${index}` as const)}</dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  );
}
