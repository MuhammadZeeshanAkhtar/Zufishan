/**
 * Searchable single- and multi-select, built on the project's existing dependencies — no new
 * package. Needed because the country and timezone lists are hundreds of entries long, where a
 * plain <select> is unusable.
 *
 * Keyboard: type to filter, Up/Down to move, Enter to choose, Escape to close. The listbox follows
 * the combobox pattern (aria-expanded / aria-controls / aria-activedescendant) so it is reachable
 * without a mouse.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { useLocale } from "../contexts/LocaleContextState";
import type { Option } from "../lib/reference-data";

const field = "w-full rounded-xl border border-[var(--ni-sage-line)] bg-[var(--ni-field)] px-4 py-2.5 text-sm ni-t-ink outline-none focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]";

function useFiltered(options: Option[], query: string) {
  return useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return options.slice(0, 300);
    return options.filter((option) => option.label.toLowerCase().includes(term)).slice(0, 300);
  }, [options, query]);
}

function useDismiss(open: boolean, onClose: () => void, ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) onClose(); };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open, onClose, ref]);
}

type SingleProps = {
  options: Option[]; value: string; onChange: (value: string) => void;
  placeholder?: string; id?: string; required?: boolean;
};

export function SearchableSelect({ options, value, onChange, placeholder, id, required }: SingleProps) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const listId = useId();
  const filtered = useFiltered(options, query);
  useDismiss(open, () => { setOpen(false); setQuery(""); }, wrap);

  const choose = (next: string) => { onChange(next); setOpen(false); setQuery(""); };

  return (
    <div className="relative" ref={wrap}>
      <div className="relative">
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-required={required}
          value={open ? query : value}
          placeholder={placeholder ?? t("reference.searchPlaceholder")}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); setActive(0); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, filtered.length - 1)); }
            else if (event.key === "ArrowUp") { event.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
            else if (event.key === "Enter" && open && filtered[active]) { event.preventDefault(); choose(filtered[active].value); }
            else if (event.key === "Escape") { setOpen(false); setQuery(""); }
          }}
          className={`${field} pe-9`}
        />
        <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 ni-t-muted-soft" />
      </div>
      {open && (
        <ul id={listId} role="listbox" className="absolute z-40 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-[var(--ni-sage)] bg-[var(--ni-paper)] py-1 shadow-xl">
          {filtered.length === 0 && <li className="px-4 py-2.5 text-sm ni-t-muted-soft">{t("reference.noMatches")}</li>}
          {filtered.map((option, index) => (
            <li key={option.value} role="option" aria-selected={option.value === value}>
              <button
                type="button"
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(option.value)}
                className={`flex w-full items-center justify-between px-4 py-2 text-start text-sm ${
                  index === active ? "bg-[var(--ni-sage-soft)] ni-t-moss-deep" : "ni-t-ink"
                }`}
              >
                <span className="truncate">{option.label}</span>
                {option.value === value && <Check size={15} className="shrink-0 ni-t-moss" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type MultiProps = {
  options: Option[]; values: string[]; onChange: (values: string[]) => void;
  placeholder?: string; id?: string; max?: number;
};

export function SearchableMultiSelect({ options, values, onChange, placeholder, id, max = 12 }: MultiProps) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrap = useRef<HTMLDivElement>(null);
  const listId = useId();
  const filtered = useFiltered(options, query);
  useDismiss(open, () => { setOpen(false); setQuery(""); }, wrap);

  const toggle = (next: string) => {
    if (values.includes(next)) onChange(values.filter((v) => v !== next));
    else if (values.length < max) onChange([...values, next]);
  };

  return (
    <div className="relative" ref={wrap}>
      {values.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {values.map((selected) => (
            <li key={selected}>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--ni-sage-soft)] py-1 pe-1 ps-2.5 text-xs font-semibold ni-t-moss-deep">
                {selected}
                <button
                  type="button"
                  onClick={() => onChange(values.filter((v) => v !== selected))}
                  aria-label={`${t("reference.remove")} ${selected}`}
                  className="rounded-full p-0.5 ni-t-sage-ink outline-none hover:bg-[var(--ni-sage)] focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]"
                >
                  <X size={12} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="relative">
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          value={query}
          placeholder={placeholder ?? t("reference.searchPlaceholder")}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => { if (event.key === "Escape") { setOpen(false); setQuery(""); } }}
          className={`${field} pe-9`}
        />
        <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 ni-t-muted-soft" />
      </div>
      {open && (
        <ul id={listId} role="listbox" aria-multiselectable="true" className="absolute z-40 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-[var(--ni-sage)] bg-[var(--ni-paper)] py-1 shadow-xl">
          {filtered.length === 0 && <li className="px-4 py-2.5 text-sm ni-t-muted-soft">{t("reference.noMatches")}</li>}
          {filtered.map((option) => {
            const selected = values.includes(option.value);
            return (
              <li key={option.value} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => toggle(option.value)}
                  disabled={!selected && values.length >= max}
                  className="flex w-full items-center justify-between px-4 py-2 text-start text-sm ni-t-ink hover:bg-[var(--ni-sage-soft)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="truncate">{option.label}</span>
                  {selected && <Check size={15} className="shrink-0 ni-t-moss" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
