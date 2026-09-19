/**
 * Marketplace filter panel.
 *
 * Every control here maps to a field on the server-side discovery query, so changing a filter
 * changes the rows the database returns — nothing is filtered in the browser.
 *
 * **Subject and language offer the full curated list, not just what is taught today.** Level still
 * lists only what published listings carry. Subject and spoken language instead offer the whole
 * list the profile forms use, because a learner looking for Fiqh, or for a teacher who speaks
 * Bengali, should be able to ask for it and be told plainly that nobody matches yet — rather than
 * not find the option and conclude Zufishan does not cover it. Any value a listing carries that is
 * not on the curated list is appended, so a reachable result is never unreachable through filters.
 *
 * Both lists are built with the profile forms' own call — `languageOptions()` with no locale
 * argument — so the values sent to the query are the same canonical English names the profiles
 * store. Passing the reader's locale here would send a translated label that matches no row.
 *
 * **No Status filter.** The reference panel opens with an Online/Offline pair. Zufishan records
 * no presence anywhere — no `last_seen_at`, no heartbeat, no realtime presence channel — so that
 * control would filter on a value that does not exist. It is left out rather than shown as a
 * checkbox that quietly does nothing.
 *
 * **Gender stays single-choice.** The reference draws it as checkboxes, but the discovery query
 * takes one gender, so radios describe what the server will actually do. Two checkboxes that can
 * both be ticked would promise an "either" the query cannot honour.
 *
 * Desktop renders a sticky sidebar; below `lg` the same panel opens as a bottom sheet.
 */
import { useEffect, useState, type ReactNode } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { useLocale } from "../contexts/LocaleContextState";
import { countryOptions, genderLabelKeys, genderValues, languageOptions, levelOptions, sectValues, subjectOptions, timezoneOptionsForCountry } from "../lib/reference-data";

export type MarketplaceFilterState = {
  query: string;
  subjects: string[];
  languages: string[];
  levels: string[];
  minRateMinor?: number;
  maxRateMinor?: number;
  minYearsExperience?: number;
  gender?: string;
  country?: string;
  timezone?: string;
  sect?: string;
  hasIjazah?: boolean;
  /** One of the thresholds the server accepts. Unrated instructors never match any of them. */
  minRating?: number;
  sort: string;
};

export const emptyFilters: MarketplaceFilterState = {
  query: "", subjects: [], languages: [], levels: [], sort: "relevance",
};

export type Facets = {
  subjects?: string[];
  languages?: string[];
  levels?: string[];
  rateRangeMinor?: { min: number; max: number } | null;
  /** Instructor counts per rating threshold. Null when the aggregate could not be read. */
  ratingBuckets?: Array<{ minimum: number; count: number }> | null;
};

const toggle = (list: string[], value: string) =>
  list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

/**
 * Every subject Zufishan offers, in the same curated order the learner and instructor profile
 * forms use, so what a student can put on their profile is exactly what they can search for.
 *
 * `subjectOptions` re-exports the one `categories` list, so this adds no second vocabulary.
 * Anything a published listing carries that is not on that list is appended rather than dropped,
 * which keeps every reachable result reachable.
 */
function subjectFilterOptions(fromListings: string[] | undefined): string[] {
  const extra = (fromListings ?? []).filter((subject) => !subjectOptions.includes(subject)).sort();
  return [...subjectOptions, ...extra];
}

/**
 * Every language a profile can claim, by the same call the profile forms make.
 *
 * `languageOptions()` is deliberately called without a locale: the instructor and learner forms
 * call it the same way, so `teaching_languages` always holds canonical English names whatever
 * language its owner filled the form in. Passing the reader's locale would produce a translated
 * label that matches no stored row, and the filter would silently return nothing.
 */
function languageFilterOptions(fromListings: string[] | undefined): string[] {
  const canonical = languageOptions().map((option) => option.value);
  const extra = (fromListings ?? []).filter((language) => !canonical.includes(language)).sort();
  return [...canonical, ...extra];
}

/**
 * Every level a teacher can claim, by the same list the instructor profile form offers.
 *
 * Derived from facets this showed only the levels someone already teaches, so a catalogue
 * with one beginner tutor offered one checkbox — and a learner looking for Advanced could
 * not even ask. "All Levels" is included because it is a value a teacher can actually set;
 * leaving it out would make those teachers unreachable through this filter.
 */
function levelFilterOptions(fromListings: string[] | undefined): string[] {
  const canonical = [...levelOptions] as string[];
  const extra = (fromListings ?? []).filter((level) => !canonical.includes(level)).sort();
  return [...canonical, ...extra];
}

/** A titled section with the reference's hairline rule above it. */
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="border-t border-[var(--ni-sage)] pt-4 first:border-t-0 first:pt-0">
      <legend className="mb-2.5 text-sm font-bold ni-t-ink">{title}</legend>
      {children}
    </fieldset>
  );
}

function CheckList({ options, selected, onToggle, name, scroll = false }: {
  options: string[]; selected: string[]; onToggle: (value: string) => void; name: string;
  /** Bounds a long list to its own scroller, so one group cannot push the rest of the panel away. */
  scroll?: boolean;
}) {
  const { t } = useLocale();
  if (!options.length) return <p className="text-xs ni-t-muted-soft">{t("marketplace.noOptions")}</p>;
  return (
    <ul className={scroll ? "max-h-56 space-y-1.5 overflow-y-auto pe-1" : "space-y-1.5"}>
      {options.map((option) => (
        <li key={option}>
          <label className="flex cursor-pointer items-center gap-2.5 text-sm ni-t-muted hover:text-[var(--ni-ink)]">
            <input
              type="checkbox"
              name={name}
              value={option}
              checked={selected.includes(option)}
              onChange={() => onToggle(option)}
              className="h-4 w-4 shrink-0 accent-[var(--ni-moss)]"
            />
            <span className="truncate">{option}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}

/** Top of the rate scale unless a real rate exceeds it. Whole currency units. */
const RATE_CEILING = 50;

/**
 * Two-handle rate range.
 *
 * Built from two native range inputs rather than a custom widget, so it keeps keyboard
 * support and the platform's own accessibility for free. The handles are clamped against
 * each other so the low value can never cross the high one.
 */
function RateRange({ bounds, value, onChange }: {
  bounds: { min: number; max: number };
  value: MarketplaceFilterState;
  onChange: (patch: Partial<MarketplaceFilterState>) => void;
}) {
  const { t, formatNumber } = useLocale();
  // Whole currency units: a slider stepping through minor units would need 2,500 stops to
  // cover a $25 range, and no one is dragging for one cent of precision.
  //
  // The scale starts at 1 and runs to a usable ceiling rather than hugging the rates that
  // happen to exist today. Derived bounds collapsed the moment the catalogue was small:
  // with a single instructor charging 7-8 the slider had two stops and could not filter
  // anything, while reading like a broken control. A learner also thinks in absolute
  // money — "under 10" — not in the range the current teachers occupy.
  //
  // The ceiling still grows past RATE_CEILING if someone charges more, so a high rate is
  // never unreachable.
  const min = 1;
  const max = Math.max(Math.ceil(bounds.max / 100), RATE_CEILING);
  const low = typeof value.minRateMinor === "number" ? Math.round(value.minRateMinor / 100) : min;
  const high = typeof value.maxRateMinor === "number" ? Math.round(value.maxRateMinor / 100) : max;
  const span = max - min || 1;
  const pct = (n: number) => ((n - min) / span) * 100;

  return (
    <div>
      <p className="mb-2 text-sm font-semibold ni-t-moss">
        <span className="ltr-embed">{formatNumber(low)} – {formatNumber(high)}</span>
      </p>
      <div className="ni-range">
        <span aria-hidden="true" className="ni-range__track" />
        <span
          aria-hidden="true"
          className="ni-range__fill"
          style={{ insetInlineStart: `${pct(low)}%`, width: `${Math.max(pct(high) - pct(low), 0)}%` }}
        />
        <input
          type="range" min={min} max={max} step={1} value={low}
          aria-label={t("marketplace.minRate")}
          onChange={(event) => {
            const next = Math.min(Number(event.target.value), high);
            onChange({ minRateMinor: next <= min ? undefined : next * 100 });
          }}
        />
        <input
          type="range" min={min} max={max} step={1} value={high}
          aria-label={t("marketplace.maxRate")}
          onChange={(event) => {
            const next = Math.max(Number(event.target.value), low);
            onChange({ maxRateMinor: next >= max ? undefined : next * 100 });
          }}
        />
      </div>
    </div>
  );
}

type PanelProps = {
  value: MarketplaceFilterState;
  onChange: (next: MarketplaceFilterState) => void;
  facets: Facets;
  sortOptions: Array<{ value: string; label: string }>;
  showRate?: boolean;
  showExperience?: boolean;
  resultCount?: number;
};

function PanelBody({ value, onChange, facets, sortOptions, showRate, showExperience }: PanelProps) {
  const { t, formatNumber } = useLocale();
  const set = (patch: Partial<MarketplaceFilterState>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-5">
      <Group title={t("marketplace.sortBy")}>
        <select
          aria-label={t("marketplace.sortBy")}
          value={value.sort}
          onChange={(event) => set({ sort: event.target.value })}
          className="w-full rounded-xl border border-[var(--ni-sage-line)] bg-[var(--ni-field)] px-3 py-2 text-sm ni-t-ink outline-none focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]"
        >
          {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </Group>

      <Group title={t("marketplace.credentials")}>
        <label className="flex cursor-pointer items-center gap-2.5 text-sm ni-t-muted hover:text-[var(--ni-ink)]">
          <input
            type="checkbox"
            checked={Boolean(value.hasIjazah)}
            onChange={(event) => set({ hasIjazah: event.target.checked || undefined })}
            className="h-4 w-4 shrink-0 accent-[var(--ni-moss)]"
          />
          {t("marketplace.ijazah")}
        </label>
      </Group>

      {/* Always rendered: the curated list exists whether or not anyone teaches from it yet. */}
      <Group title={t("marketplace.subject")}>
        <CheckList name="subject" options={subjectFilterOptions(facets.subjects)} selected={value.subjects} onToggle={(v) => set({ subjects: toggle(value.subjects, v) })} />
      </Group>

      {/* The full list, in its own scroller: 47 languages would otherwise bury every group below. */}
      <Group title={t("marketplace.spokenLanguages")}>
        <CheckList scroll name="language" options={languageFilterOptions(facets.languages)} selected={value.languages} onToggle={(v) => set({ languages: toggle(value.languages, v) })} />
      </Group>

      {/* Single-choice, so radios rather than the checkbox lists — and "All" clears the filter. */}
      <Group title={t("marketplace.gender")}>
        <ul className="space-y-1.5">
          {[{ value: "", labelKey: "gender.any" as const }, ...genderValues.map((g) => ({ value: g, labelKey: genderLabelKeys[g] }))].map((option) => (
            <li key={option.value || "any"}>
              <label className="flex cursor-pointer items-center gap-2.5 text-sm ni-t-muted hover:text-[var(--ni-ink)]">
                <input
                  type="radio"
                  name="tutor-gender"
                  checked={(value.gender ?? "") === option.value}
                  onChange={() => set({ gender: option.value || undefined })}
                  className="h-4 w-4 accent-[var(--ni-moss)]"
                />
                {t(option.labelKey)}
              </label>
            </li>
          ))}
        </ul>
      </Group>

      {showRate && facets.rateRangeMinor && (
        <Group title={t("marketplace.hourlyRate")}>
          <RateRange bounds={facets.rateRangeMinor} value={value} onChange={set} />
        </Group>
      )}

      {/* Counts are of instructors, so the number beside a threshold is how many listings it
          would return. Absent when the aggregate could not be read — never a guessed figure. */}
      {facets.ratingBuckets && facets.ratingBuckets.length > 0 && (
        <Group title={t("marketplace.feedbackRating")}>
          <ul className="space-y-1.5">
            <li>
              <label className="flex cursor-pointer items-center gap-2.5 text-sm ni-t-muted hover:text-[var(--ni-ink)]">
                <input
                  type="radio" name="tutor-rating"
                  checked={value.minRating === undefined}
                  onChange={() => set({ minRating: undefined })}
                  className="h-4 w-4 shrink-0 accent-[var(--ni-moss)]"
                />
                {t("marketplace.anyRating")}
              </label>
            </li>
            {facets.ratingBuckets.map((bucket) => (
              <li key={bucket.minimum}>
                <label className="flex cursor-pointer items-center gap-2.5 text-sm ni-t-muted hover:text-[var(--ni-ink)]">
                  <input
                    type="radio" name="tutor-rating"
                    checked={value.minRating === bucket.minimum}
                    onChange={() => set({ minRating: bucket.minimum })}
                    className="h-4 w-4 shrink-0 accent-[var(--ni-moss)]"
                  />
                  <span className="truncate">
                    {t("marketplace.ratingAndAbove", { rating: formatNumber(bucket.minimum) })}
                  </span>
                  <span className="ms-auto text-xs ni-t-muted-soft tabular">({formatNumber(bucket.count)})</span>
                </label>
              </li>
            ))}
          </ul>
        </Group>
      )}

      <Group title={t("marketplace.country")}>
        <select
          value={value.country ?? ""}
          onChange={(event) => set({ country: event.target.value || undefined, timezone: undefined })}
          aria-label={t("marketplace.country")}
          className="w-full rounded-xl border border-[var(--ni-sage-line)] bg-[var(--ni-field)] px-3 py-2 text-sm"
        >
          <option value="">{t("marketplace.anyCountry")}</option>
          {countryOptions().map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </Group>

      <Group title={t("marketplace.timezone")}>
        {/* Scoped to the chosen country, the same dependency the profile forms use. */}
        <select
          value={value.timezone ?? ""}
          onChange={(event) => set({ timezone: event.target.value || undefined })}
          aria-label={t("marketplace.timezone")}
          className="w-full rounded-xl border border-[var(--ni-sage-line)] bg-[var(--ni-field)] px-3 py-2 text-sm"
        >
          <option value="">{t("marketplace.anyTimezone")}</option>
          {timezoneOptionsForCountry(value.country ?? "").map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </Group>

      <Group title={t("marketplace.sect")}>
        <select
          value={value.sect ?? ""}
          onChange={(event) => set({ sect: event.target.value || undefined })}
          aria-label={t("marketplace.sect")}
          className="w-full rounded-xl border border-[var(--ni-sage-line)] bg-[var(--ni-field)] px-3 py-2 text-sm"
        >
          <option value="">{t("marketplace.anySect")}</option>
          {sectValues.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </Group>

      {/* Always rendered: the curated list exists whether or not anyone teaches at that level yet. */}
      <Group title={t("marketplace.level")}>
        <CheckList name="level" options={levelFilterOptions(facets.levels)} selected={value.levels} onToggle={(v) => set({ levels: toggle(value.levels, v) })} />
      </Group>

      {showExperience && (
        <Group title={t("marketplace.minExperience")}>
          <input
            type="number" min={0} max={80} inputMode="numeric"
            aria-label={t("marketplace.minExperience")}
            value={typeof value.minYearsExperience === "number" ? String(value.minYearsExperience) : ""}
            onChange={(event) => set({ minYearsExperience: event.target.value.trim() === "" ? undefined : Math.max(0, Number(event.target.value)) })}
            className="w-full rounded-xl border border-[var(--ni-sage-line)] bg-[var(--ni-field)] px-3 py-2 text-sm tabular outline-none focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]"
          />
        </Group>
      )}

      <button
        type="button"
        onClick={() => onChange({ ...emptyFilters, query: value.query })}
        className="w-full rounded-full border border-[var(--ni-sage-mid)] px-4 py-2.5 text-sm font-semibold ni-t-moss outline-none transition-colors hover:bg-[var(--ni-sage-soft)] focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]"
      >
        {t("marketplace.clearFilters")}
      </button>
    </div>
  );
}

/**
 * `variant` keeps this out of the layout's way: "trigger" is the compact mobile control and belongs
 * beside the search field, "sidebar" is the desktop column and belongs inside the results grid.
 * Both share the same value/onChange, so the two never disagree.
 */
export default function MarketplaceFilters(props: PanelProps & { variant?: "trigger" | "sidebar" }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const variant = props.variant ?? "sidebar";
  const active =
    props.value.subjects.length + props.value.languages.length + props.value.levels.length +
    (props.value.minRateMinor !== undefined ? 1 : 0) +
    (props.value.maxRateMinor !== undefined ? 1 : 0) +
    (props.value.minRating !== undefined ? 1 : 0) +
    (props.value.minYearsExperience !== undefined ? 1 : 0);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  if (variant === "sidebar") {
    return (
      <aside className="hidden lg:block">
        <div className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto rounded-[1.35rem] border border-[var(--ni-sage)] bg-[var(--ni-paper)] p-5">
          <p className="mb-4 font-display text-lg ni-t-moss">{t("marketplace.searchBy")}</p>
          <PanelBody {...props} />
        </div>
      </aside>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[var(--ni-sage-mid)] bg-[var(--ni-paper)] px-4 py-2.5 text-sm font-semibold ni-t-moss outline-none focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)] lg:hidden"
      >
        <SlidersHorizontal size={16} />
        {t("marketplace.filters")}
        {active > 0 && <span className="rounded-full bg-[var(--ni-moss)] px-1.5 text-[11px] font-bold text-white tabular">{active}</span>}
      </button>

      {/* Mobile bottom sheet */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label={t("common.close")} onClick={() => setOpen(false)} className="absolute inset-0 h-full w-full bg-[var(--ni-teal)]/40" />
          <div role="dialog" aria-modal="true" aria-label={t("marketplace.filters")} className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-[1.5rem] border-t border-[var(--ni-sage)] bg-[var(--ni-paper)] p-5 pb-8 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <p className="font-display text-lg ni-t-ink">{t("marketplace.searchBy")}</p>
              <button type="button" onClick={() => setOpen(false)} aria-label={t("common.close")} className="rounded-full bg-[var(--ni-sage-soft)] p-2 ni-t-sage-ink outline-none focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]">
                <X size={18} />
              </button>
            </div>
            <PanelBody {...props} />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-5 w-full rounded-full bg-[var(--ni-moss)] px-4 py-3 text-sm font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]"
            >
              {typeof props.resultCount === "number"
                ? t("marketplace.showResults", { count: String(props.resultCount) })
                : t("common.done")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
