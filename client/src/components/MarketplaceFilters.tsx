/**
 * Marketplace filter panel.
 *
 * Every control here maps to a field on the server-side discovery query, so changing a filter
 * changes the rows the database returns — nothing is filtered in the browser. Options come from
 * facet endpoints derived from real published rows, so a filter is never offered when no result
 * could match it.
 *
 * Desktop renders a sticky sidebar; below `lg` the same panel opens as a bottom sheet.
 */
import { useEffect, useState, type ReactNode } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { useLocale } from "../contexts/LocaleContextState";
import { countryOptions, genderLabelKeys, genderValues, sectValues, timezoneOptionsForCountry } from "../lib/reference-data";

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
};

const toggle = (list: string[], value: string) =>
  list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="border-t border-[var(--ni-sage)] pt-4 first:border-t-0 first:pt-0">
      <legend className="mb-2 text-xs font-bold uppercase tracking-[.14em] text-[var(--ni-gold-ink)]">{title}</legend>
      {children}
    </fieldset>
  );
}

function CheckList({ options, selected, onToggle, name }: {
  options: string[]; selected: string[]; onToggle: (value: string) => void; name: string;
}) {
  const { t } = useLocale();
  if (!options.length) return <p className="text-xs text-[var(--ni-muted-soft)]">{t("marketplace.noOptions")}</p>;
  return (
    <ul className="space-y-1.5">
      {options.map((option) => (
        <li key={option}>
          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-[var(--ni-muted)] hover:text-[var(--ni-ink)]">
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
  const { t } = useLocale();
  const set = (patch: Partial<MarketplaceFilterState>) => onChange({ ...value, ...patch });
  // Rates are stored as integer minor units; the field shows whole currency units.
  const toMinor = (raw: string) => (raw.trim() === "" ? undefined : Math.max(0, Math.round(Number(raw) * 100)));
  const fromMinor = (minor?: number) => (typeof minor === "number" ? String(minor / 100) : "");

  return (
    <div className="space-y-5">
      <Group title={t("marketplace.sortBy")}>
        <select
          aria-label={t("marketplace.sortBy")}
          value={value.sort}
          onChange={(event) => set({ sort: event.target.value })}
          className="w-full rounded-xl border border-[var(--ni-sage-line)] bg-[var(--ni-field)] px-3 py-2 text-sm text-[var(--ni-ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]"
        >
          {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </Group>

      {/* Single-choice, so radios rather than the checkbox lists — and "All" clears the filter. */}
      <Group title={t("marketplace.gender")}>
        <ul className="space-y-1.5">
          {[{ value: "", labelKey: "gender.any" as const }, ...genderValues.map((g) => ({ value: g, labelKey: genderLabelKeys[g] }))].map((option) => (
            <li key={option.value || "any"}>
              <label className="flex cursor-pointer items-center gap-2.5 text-sm text-[var(--ni-muted)] hover:text-[var(--ni-ink)]">
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

      <Group title={t("marketplace.credentials")}>
        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-[var(--ni-muted)] hover:text-[var(--ni-ink)]">
          <input
            type="checkbox"
            checked={Boolean(value.hasIjazah)}
            onChange={(event) => set({ hasIjazah: event.target.checked || undefined })}
            className="h-4 w-4 accent-[var(--ni-moss)]"
          />
          {t("marketplace.ijazah")}
        </label>
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

      {facets.subjects !== undefined && (
        <Group title={t("marketplace.subject")}>
          <CheckList name="subject" options={facets.subjects ?? []} selected={value.subjects} onToggle={(v) => set({ subjects: toggle(value.subjects, v) })} />
        </Group>
      )}

      {facets.languages !== undefined && (
        <Group title={t("marketplace.language")}>
          <CheckList name="language" options={facets.languages ?? []} selected={value.languages} onToggle={(v) => set({ languages: toggle(value.languages, v) })} />
        </Group>
      )}

      {facets.levels !== undefined && (
        <Group title={t("marketplace.level")}>
          <CheckList name="level" options={facets.levels ?? []} selected={value.levels} onToggle={(v) => set({ levels: toggle(value.levels, v) })} />
        </Group>
      )}

      {showRate && (
        <Group title={t("marketplace.hourlyRate")}>
          <div className="flex items-center gap-2">
            <label className="flex-1">
              <span className="sr-only">{t("marketplace.minRate")}</span>
              <input
                type="number" min={0} inputMode="decimal" placeholder={t("marketplace.min")}
                value={fromMinor(value.minRateMinor)}
                onChange={(event) => set({ minRateMinor: toMinor(event.target.value) })}
                className="w-full rounded-xl border border-[var(--ni-sage-line)] bg-[var(--ni-field)] px-3 py-2 text-sm tabular outline-none focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]"
              />
            </label>
            <span aria-hidden="true" className="text-[var(--ni-muted-soft)]">–</span>
            <label className="flex-1">
              <span className="sr-only">{t("marketplace.maxRate")}</span>
              <input
                type="number" min={0} inputMode="decimal" placeholder={t("marketplace.max")}
                value={fromMinor(value.maxRateMinor)}
                onChange={(event) => set({ maxRateMinor: toMinor(event.target.value) })}
                className="w-full rounded-xl border border-[var(--ni-sage-line)] bg-[var(--ni-field)] px-3 py-2 text-sm tabular outline-none focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]"
              />
            </label>
          </div>
        </Group>
      )}

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
        className="w-full rounded-full border border-[var(--ni-sage-mid)] px-4 py-2.5 text-sm font-semibold text-[var(--ni-moss)] outline-none transition-colors hover:bg-[var(--ni-sage-soft)] focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]"
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
        <div className="sticky top-24 rounded-[1.35rem] border border-[var(--ni-sage)] bg-[var(--ni-paper)] p-5">
          <p className="mb-4 font-display text-lg text-[var(--ni-ink)]">{t("marketplace.filters")}</p>
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
        className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[var(--ni-sage-mid)] bg-[var(--ni-paper)] px-4 py-2.5 text-sm font-semibold text-[var(--ni-moss)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)] lg:hidden"
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
              <p className="font-display text-lg text-[var(--ni-ink)]">{t("marketplace.filters")}</p>
              <button type="button" onClick={() => setOpen(false)} aria-label={t("common.close")} className="rounded-full bg-[var(--ni-sage-soft)] p-2 text-[var(--ni-sage-ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]">
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
