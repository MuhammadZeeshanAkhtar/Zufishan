/**
 * Gender picker. Two options, so it is a radio group rather than a combobox — the searchable
 * selectors exist for the country and language lists, which run to hundreds of entries.
 *
 * The value written is the lowercase database value (`male` / `female`), never the translated
 * label, so the stored row does not depend on the language the person happened to be using.
 */
import { useId } from "react";
import { useLocale } from "../contexts/LocaleContextState";
import { genderLabelKeys, genderValues } from "../lib/reference-data";

export default function GenderSelect({ value, onChange, required, name }: {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  name?: string;
}) {
  const { t } = useLocale();
  const generated = useId();
  const group = name ?? generated;
  return (
    <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={t("gender.label")} aria-required={required}>
      {genderValues.map((option) => {
        const active = value === option;
        return (
          <label
            key={option}
            className={`cursor-pointer rounded-xl border px-4 py-3 text-sm font-semibold transition ${
              active
                ? "border-[var(--ni-moss)] bg-[var(--ni-moss)] text-[var(--ni-paper)]"
                : "border-[var(--ni-sage-line)] bg-[var(--ni-field)] text-[var(--ni-ink)] hover:border-[var(--ni-moss)]"
            }`}
          >
            <input
              type="radio"
              name={group}
              value={option}
              checked={active}
              required={required}
              onChange={() => onChange(option)}
              className="sr-only"
            />
            {t(genderLabelKeys[option])}
          </label>
        );
      })}
    </div>
  );
}
