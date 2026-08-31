import { Globe2 } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContextState";

export function LocaleSelector({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useLocale();
  return <label className={`inline-flex items-center gap-2 rounded-full bg-[#edf2ea] px-3 py-2 text-xs font-bold text-[#315d50] ${compact ? "" : "border border-[#dce8de]"}`}>
    <Globe2 size={15} aria-hidden="true" />
    <span className="sr-only">{t("locale.label")}</span>
    <select aria-label={t("locale.label")} value={locale} onChange={event => setLocale(event.target.value)} className="cursor-pointer bg-transparent outline-none">
      <option value="en">{t("locale.english")}</option>
      <option value="ur">{t("locale.urdu")}</option>
      <option value="ar">{t("locale.arabic")}</option>
    </select>
  </label>;
}
