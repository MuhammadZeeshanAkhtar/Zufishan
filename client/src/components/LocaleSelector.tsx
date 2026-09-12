/**
 * The language control, beside the theme button in the header.
 *
 * A native `<select>` on purpose: it is one tab stop, opens as the platform's own
 * picker on a phone, and needs no custom keyboard handling. The label is visually
 * hidden rather than absent, so the control is still announced as a language choice.
 *
 * Sized to match the theme button's 36px height so the two read as one group, and the
 * whole control is `shrink-0` and `nowrap` — the header lays out on a single line, and
 * a language name is exactly the kind of text that would otherwise wrap it onto two.
 */
import { Globe2 } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContextState";

export function LocaleSelector({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useLocale();
  return (
    <label
      className={`inline-flex ${compact ? "h-8" : "h-9"} shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full bg-[var(--ni-sage-soft)] px-3 text-xs font-bold ni-t-moss-deep ${compact ? "" : "border border-[var(--ni-sage)]"}`}
    >
      <Globe2 size={15} aria-hidden="true" className="shrink-0" />
      <span className="sr-only">{t("locale.label")}</span>
      <select
        aria-label={t("locale.label")}
        value={locale}
        onChange={(event) => setLocale(event.target.value)}
        className="cursor-pointer bg-transparent pe-1 outline-none"
      >
        <option value="en">{t("locale.english")}</option>
        <option value="ur">{t("locale.urdu")}</option>
        <option value="ar">{t("locale.arabic")}</option>
      </select>
    </label>
  );
}
