/**
 * "How many credits do I need?" — two sliders and an honest answer.
 *
 * The figure it produces is a budget estimate and is named as one on screen. It is not a quotation
 * and not a charge: it cannot know which teacher will be booked, how long a lesson will actually run,
 * or what a platform fee will be once one is set. The two caveats that matter are stated where the
 * reader meets the consequence rather than crowding this card — the plan panel says nothing has been
 * charged, and "What is a credit?" below explains that a credit is not an hour.
 *
 * The arithmetic lives in `pricing-config`, not here, so the page and any future checkout cannot
 * disagree about what a month holds.
 */
import { useId } from "react";
import { useLocale } from "../contexts/LocaleContextState";
import { HOURS_RANGE, RATE_RANGE, convertFromBase, estimateMonthlyCredits } from "../lib/pricing-config";
import type { CurrencyCode } from "../lib/relationship-ops-data";

export default function PricingCalculator({
  currency, hourlyRate, weeklyHours, onRate, onHours, onReset,
}: {
  currency: CurrencyCode;
  hourlyRate: number;
  weeklyHours: number;
  onRate: (value: number) => void;
  onHours: (value: number) => void;
  onReset: () => void;
}) {
  const { t, formatNumber } = useLocale();
  const rateId = useId();
  const hoursId = useId();

  const credits = estimateMonthlyCredits(hourlyRate, weeklyHours);
  // The label already carries the currency in brackets, so the value beside it is a bare number.
  // It is converted from the base only to be shown, never to be stored.
  const shownRate = formatNumber(convertFromBase(hourlyRate * 100, currency) / 100, { maximumFractionDigits: 2 });

  return (
    <section className="ni-ed-card ni-price-card p-6 lg:p-7" aria-labelledby="pricing-calc-title">
      <h2 id="pricing-calc-title" className="text-center font-display text-xl ni-t-ink">
        {t("pricing.calcTitle")}
      </h2>

      <div className="mt-6 space-y-5">
        <Slider
          id={rateId}
          label={t("pricing.rateLabel", { currency })}
          value={shownRate}
          raw={hourlyRate}
          min={RATE_RANGE.min}
          max={RATE_RANGE.max}
          onChange={onRate}
        />
        <Slider
          id={hoursId}
          label={t("pricing.hoursLabel")}
          value={formatNumber(weeklyHours)}
          raw={weeklyHours}
          min={HOURS_RANGE.min}
          max={HOURS_RANGE.max}
          onChange={onHours}
        />
      </div>

      <p aria-live="polite" className="mt-7 text-center font-display text-lg ni-t-ink">
        {t("pricing.estimateSentence", { credits: formatNumber(credits) })}
      </p>

      <button type="button" onClick={onReset} className="mx-auto mt-3 block text-xs font-bold ni-link">
        {t("pricing.reset")}
      </button>
    </section>
  );
}

/** One slider, with its current value read out beside its own label, as the reference card does. */
function Slider({ id, label, value, raw, min, max, onChange }: {
  id: string; label: string; value: string; raw: number; min: number; max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-bold ni-t-ink">
        {label}: <span className="ni-t-moss-deep ltr-embed">{value}</span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={1}
        value={raw}
        onChange={(event) => onChange(Number(event.target.value))}
        className="ni-price-slider mt-2.5"
      />
    </div>
  );
}
