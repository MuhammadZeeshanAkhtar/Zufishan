/**
 * The pieces a published instructor is presented with, shared by the discovery card
 * and the public profile page.
 *
 * Both surfaces show the same person, so they build their facts from one function
 * here rather than each assembling its own list. When a listing changes shape — a
 * new fact, a different order, a value that turns out to be absent — it changes in
 * one place and both surfaces follow.
 *
 * Nothing in this module invents a value. Every field is read from the row the
 * server returned, and a fact with no value is dropped rather than rendered blank,
 * so a new instructor shows a short strip instead of a row of dashes and zeroes.
 *
 * There is no presence indicator here, because Zufishan records no presence.
 * `lastActiveAt` is the last time the instructor joined a class, not a login and
 * not an online state.
 */
import { Star } from "lucide-react";
import { useLocale } from "../contexts/LocaleContextState";
import { PRICING_BASE_CURRENCY, creditsPerHour } from "../lib/pricing-config";
import type { CurrencyCode } from "../lib/relationship-ops-data";

export type DiscoveryInstructor = {
  user_id?: string;
  public_slug: string;
  subjects: string[] | null;
  teaching_levels: string[] | null;
  teaching_languages: string[] | null;
  years_experience: number | null;
  teaching_approach: string | null;
  hourly_rate_minor: number | null;
  currency: string | null;
  availability_summary: string | null;
  verification_status: string;
  sect?: string | null;
  has_ijazah?: boolean | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  country?: string | null;
  timezone?: string | null;
  gender?: string | null;
  bio?: string | null;
  profilePublic?: boolean;
  /** Counted from published reviews. Null when nobody has reviewed this instructor yet. */
  ratingAverage?: number | null;
  ratingCount?: number;
  /** Completed class sessions, and the distinct learners across them. */
  sessionsConducted?: number;
  studentsTaught?: number;
  /** Last time the instructor joined a class. Not presence, and not a login. */
  lastActiveAt?: string | null;
};

/**
 * Initials for the fallback avatar. Drawn, never a stock photograph of anybody.
 *
 * Splits on whitespace and separators rather than matching letters by Unicode
 * property, so an Arabic or Urdu name yields its own initials rather than being
 * stripped — and so this compiles without a newer regex target.
 */
export function initialsOf(name: string): string {
  const parts = name.split(/[\s._\-/]+/).filter(Boolean);
  if (parts.length === 0) return "•";
  return (parts[0].charAt(0) + (parts[1]?.charAt(0) ?? "")).toUpperCase();
}

/**
 * "2 minutes ago", in the reader's language.
 *
 * Chooses the largest unit that still describes the gap, so a six-week-old class
 * reads as a month rather than as 42 days.
 */
export function useRelativeTime(iso: string | null | undefined): string | null {
  const { locale } = useLocale();
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;

  const seconds = Math.round((then - Date.now()) / 1000);
  const steps: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 31_536_000], ["month", 2_592_000], ["week", 604_800],
    ["day", 86_400], ["hour", 3_600], ["minute", 60],
  ];
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }
  return format.format(Math.round(seconds), "second");
}

/**
 * One teacher rate, formatted once for the whole site.
 *
 * Four surfaces used to format this themselves and none of them agreed: the discovery card said
 * "7 USD", the tutor listing said "7.00 USD", checkout said "$7.00" and the Pricing page said
 * "USD 7.00" — one teacher, one rate, four spellings. They all come through here now, and the
 * credits half is computed by `creditsPerHour` in `pricing-config`, which is where the credit rule
 * is written down.
 *
 * Returns null when there is no rate to show, so a caller renders nothing rather than a zero.
 */
export function useHourlyRate(rateMinor: number | null | undefined, currency: string | null | undefined) {
  const { formatCurrency } = useLocale();
  if (typeof rateMinor !== "number" || !Number.isFinite(rateMinor)) return null;
  const code = (currency || PRICING_BASE_CURRENCY) as CurrencyCode;
  return { money: formatCurrency(rateMinor, code), credits: creditsPerHour(rateMinor, currency) };
}

export function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-[5px] border border-[var(--ni-sage-line)] bg-[var(--ni-field)] px-2 py-0.5 text-xs ni-t-ink">
      {children}
    </span>
  );
}

/**
 * The star rating, from published reviews only.
 *
 * Rendered as one labelled element rather than five loose icons, so a screen reader
 * hears "Rating: 4.6 / 5 — 38 reviews" instead of five separate stars.
 */
export function Rating({ average, count, showCount = false }: { average: number; count: number; showCount?: boolean }) {
  const { t, formatNumber } = useLocale();
  const rounded = Math.round(average);
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1"
      aria-label={`${t("discovery.rating")}: ${formatNumber(average)} / 5 — ${t("discovery.ratingCount", { count: String(count) })}`}
    >
      <span aria-hidden="true" className="flex items-center gap-px">
        {[1, 2, 3, 4, 5].map((position) => (
          <Star
            key={position}
            size={13}
            className={position <= rounded ? "ni-t-gold" : "ni-t-muted-soft"}
            fill={position <= rounded ? "currentColor" : "none"}
            strokeWidth={position <= rounded ? 0 : 1.5}
          />
        ))}
      </span>
      <span aria-hidden="true" className="text-xs font-semibold ni-t-muted tabular">{formatNumber(average)}</span>
      {showCount && (
        <span aria-hidden="true" className="text-xs ni-t-muted-soft">
          {t("discovery.ratingCount", { count: formatNumber(count) })}
        </span>
      )}
    </span>
  );
}

/** One cell of the fact strip. Rendered only when there is a real value behind it. */
export function Fact({ label, value, unit }: { label: string; value: React.ReactNode; unit?: string }) {
  return (
    <div className="min-w-0 border-s border-[var(--ni-sage)] px-4 first:border-s-0 first:ps-0">
      <p className="ni-label whitespace-nowrap">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold ni-t-moss-deep">
        {value}
        {unit && <span className="ms-1 text-xs font-normal ni-t-muted-soft">{unit}</span>}
      </p>
    </div>
  );
}

export type InstructorFact = { label: string; value: React.ReactNode; unit?: string };

/**
 * The bottom strip, in the reference's order: rate, sessions, activity, learners,
 * time zone, sect — then the two facts Zufishan carries that the reference does not.
 *
 * A zero count is treated as "nothing to say yet" rather than as a fact worth a cell:
 * an instructor who has taught no classes shows no Conducted figure instead of a
 * prominent 0, which reads as a judgement rather than as a new listing.
 */
export function useInstructorFacts(instructor: DiscoveryInstructor): InstructorFact[] {
  const { t, formatNumber } = useLocale();
  const lastActive = useRelativeTime(instructor.lastActiveAt);
  const rate = useHourlyRate(instructor.hourly_rate_minor, instructor.currency);

  const facts: InstructorFact[] = [];
  if (rate) facts.push({ label: t("marketplace.hourlyRate"), value: <span className="ltr-embed">{rate.money}</span> });
  // The same hour, in the unit the Pricing page sells. Shown only when the stored currency is one
  // the rate table knows, so nothing here guesses at a conversion.
  if (rate?.credits !== null && rate?.credits !== undefined) {
    facts.push({ label: t("pricing.creditsPerHour"), value: <span className="ltr-embed">{formatNumber(rate.credits)}</span> });
  }
  if (instructor.sessionsConducted) {
    facts.push({ label: t("discovery.conducted"), value: formatNumber(instructor.sessionsConducted), unit: t("discovery.sessions") });
  }
  if (lastActive) facts.push({ label: t("discovery.lastActive"), value: lastActive });
  if (instructor.studentsTaught) {
    facts.push({ label: t("discovery.taught"), value: formatNumber(instructor.studentsTaught), unit: t("discovery.students") });
  }
  if (instructor.timezone) facts.push({ label: t("discovery.timezone"), value: <span className="ltr-embed">{instructor.timezone}</span> });
  if (instructor.sect) facts.push({ label: t("discovery.sect"), value: instructor.sect });
  if (typeof instructor.years_experience === "number") {
    facts.push({ label: t("discovery.experience"), value: <span className="ltr-embed">{formatNumber(instructor.years_experience)}</span> });
  }
  if (instructor.has_ijazah) facts.push({ label: t("discovery.ijazah"), value: t("adminUI.yes") });
  return facts;
}

/** The round avatar, or drawn initials when there is no photograph to show. */
export function InstructorAvatar({ name, src, size = "h-16 w-16" }: { name: string; src: string | null; size?: string }) {
  if (src) {
    return <img src={src} alt="" loading="lazy" className={`${size} shrink-0 rounded-full border-2 border-[var(--ni-moss)] object-cover`} />;
  }
  return (
    <span aria-hidden="true" className={`${size} flex shrink-0 items-center justify-center rounded-full border-2 border-[var(--ni-moss)] bg-[var(--ni-sage-soft)] font-display text-xl ni-t-moss-deep`}>
      {initialsOf(name)}
    </span>
  );
}
