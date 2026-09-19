/**
 * Everything the Pricing page prices, in one file.
 *
 * Packages, display currencies and the rates between them live here and nowhere else, so changing a
 * price is one edit rather than a search. Nothing in this module talks to a payment provider or
 * claims a charge: it describes what a month of study would cost, and the Pricing page says so.
 *
 * Two rules this file exists to keep:
 *
 *  - **USD is the base and the only figure that is authoritative.** Every package price is stored in
 *    USD minor units. A converted figure is a courtesy for the reader and is labelled as one.
 *  - **A stored amount is never re-converted.** Conversion happens at render time for a price list.
 *    A payment that has already happened keeps the currency and amount it was taken in, which is why
 *    nothing here touches `session_ledger` or `payment_references`.
 *
 * `CurrencyCode` is deliberately the type the finance helpers already use, so the Pricing page and
 * the ledger cannot disagree about which currencies exist.
 */
import type { CurrencyCode } from "./relationship-ops-data";
import type { TranslationKey } from "@/i18n/catalog";

/** Prices are authored in this currency. Everything else on the page is converted from it. */
export const PRICING_BASE_CURRENCY: CurrencyCode = "USD";

/** 52 weeks over 12 months — the real figure, not four weeks, which understates a month by 8%. */
export const WEEKS_PER_MONTH = 52 / 12;

export type DisplayCurrency = {
  code: CurrencyCode;
  symbol: string;
  nameKey: TranslationKey;
  /** Units of this currency per 1 USD. */
  perUsd: number;
  /** A currency pegged to the dollar does not drift; an indicative one needs review before launch. */
  pegged: boolean;
};

/**
 * The currencies the Pricing page can display.
 *
 * `perUsd` for AED and SAR are official pegs and do not move. The rest are INDICATIVE placeholders,
 * set here so the page has something to show, and they are the single place to change when a live
 * rate source is connected: replace `perUsd` here, or have `convertFromBase` read a fetched table.
 * The page tells the reader that a converted figure is a guide, so a stale rate misleads nobody into
 * thinking it is the amount they will be charged.
 */
export const DISPLAY_CURRENCIES: DisplayCurrency[] = [
  { code: "USD", symbol: "$", nameKey: "pricing.currency.USD", perUsd: 1, pegged: true },
  { code: "PKR", symbol: "₨", nameKey: "pricing.currency.PKR", perUsd: 280, pegged: false },
  { code: "GBP", symbol: "£", nameKey: "pricing.currency.GBP", perUsd: 0.79, pegged: false },
  { code: "EUR", symbol: "€", nameKey: "pricing.currency.EUR", perUsd: 0.92, pegged: false },
  { code: "AED", symbol: "د.إ", nameKey: "pricing.currency.AED", perUsd: 3.6725, pegged: true },
  { code: "SAR", symbol: "﷼", nameKey: "pricing.currency.SAR", perUsd: 3.75, pegged: true },
];

export function displayCurrency(code: CurrencyCode): DisplayCurrency {
  return DISPLAY_CURRENCIES.find((entry) => entry.code === code) ?? DISPLAY_CURRENCIES[0];
}

/**
 * A USD amount shown in another currency, in that currency's minor units.
 *
 * Rounded to the minor unit, because a price list with three decimal places reads as a bug. This is
 * a display conversion: it must never be written to a ledger row or compared against one.
 */
export function convertFromBase(baseMinor: number, code: CurrencyCode): number {
  return Math.round(baseMinor * displayCurrency(code).perUsd);
}

/**
 * The inverse of `convertFromBase`: an amount in some currency, expressed in the base.
 *
 * Needed because a teacher stores their hourly rate in THEIR currency, while a credit is defined
 * against the base. Both directions read the same `perUsd` table, so a rate shown on a profile and a
 * package shown on the Pricing page can never be converted at two different rates.
 */
export function convertToBase(amountMinor: number, from: CurrencyCode): number {
  const rate = displayCurrency(from).perUsd;
  return rate > 0 ? Math.round(amountMinor / rate) : amountMinor;
}

/**
 * What an hour with this teacher costs in credits.
 *
 * One credit is one unit of the base currency — the rule the Pricing page states in so many words —
 * so this is the teacher's rate carried into the base and read as whole credits. It is a restatement
 * of the published rule, not a second rule: change `PRICING_BASE_CURRENCY` or a `perUsd` and this
 * follows, because there is nowhere else for it to read from.
 */
export function creditsPerHour(rateMinor: number | null | undefined, currency: string | null | undefined): number | null {
  if (typeof rateMinor !== "number" || !Number.isFinite(rateMinor) || rateMinor < 0) return null;
  const known = DISPLAY_CURRENCIES.find((entry) => entry.code === currency);
  // An unrecognised currency cannot be converted, and a guess here would be a price claim.
  if (!known) return null;
  return Math.round(convertToBase(rateMinor, known.code) / 100);
}

export type CreditPackage = {
  id: string;
  credits: number;
  /** USD minor units. The authored price; everything else on the card is derived from it. */
  priceBaseMinor: number;
};

/**
 * The monthly credit packages.
 *
 * Credits are the unit a learner budgets in; what a lesson actually consumes depends on the
 * teacher's own hourly rate and how long the lesson ran, which is why no package promises hours.
 */
export const CREDIT_PACKAGES: CreditPackage[] = [
  { id: "credits-10", credits: 10, priceBaseMinor: 1_099 },
  { id: "credits-25", credits: 25, priceBaseMinor: 2_699 },
  { id: "credits-50", credits: 50, priceBaseMinor: 5_299 },
  { id: "credits-100", credits: 100, priceBaseMinor: 10_699 },
  { id: "credits-200", credits: 200, priceBaseMinor: 21_199 },
  { id: "credits-500", credits: 500, priceBaseMinor: 52_999 },
  { id: "credits-1000", credits: 1000, priceBaseMinor: 105_999 },
  { id: "credits-2000", credits: 2000, priceBaseMinor: 211_999 },
];

/** The bounds of the calculator's two sliders, in whole USD and whole hours. */
export const RATE_RANGE = { min: 1, max: 50 } as const;
export const HOURS_RANGE = { min: 1, max: 40 } as const;

/**
 * What a month of study is worth, in credits.
 *
 * `rate x weekly hours x 52/12`, rounded. An estimate of value, not a quotation: it does not include
 * any platform fee, because Zufishan has not set one, and it cannot know how long a lesson will
 * actually run.
 */
export function estimateMonthlyCredits(hourlyRate: number, weeklyHours: number): number {
  if (!Number.isFinite(hourlyRate) || !Number.isFinite(weeklyHours) || hourlyRate < 0 || weeklyHours < 0) return 0;
  return Math.round(hourlyRate * weeklyHours * WEEKS_PER_MONTH);
}

/** The smallest package that covers an estimate, or null when the estimate runs past the largest. */
export function suggestedPackage(credits: number): CreditPackage | null {
  return CREDIT_PACKAGES.find((entry) => entry.credits >= credits) ?? null;
}
