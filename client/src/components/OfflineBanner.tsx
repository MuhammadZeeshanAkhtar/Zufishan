/**
 * A single, quiet indication that the connection has dropped.
 *
 * Without it, every panel on the page fails separately and the reader is left guessing whether the
 * site is broken or their wifi is. One banner answers that once. It appears only while the browser
 * reports offline and removes itself the moment the connection returns — no dismiss control, because
 * a dismissed banner would hide a condition that is still true.
 */
import { CloudOff } from "lucide-react";
import { useLocale } from "../contexts/LocaleContextState";
import { useOnlineStatus } from "../lib/use-online-status";

export default function OfflineBanner() {
  const { t } = useLocale();
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-40 flex items-center justify-center gap-2 border-b border-[var(--ni-gold-mid)] bg-[var(--ni-gold-soft)] px-4 py-2 text-xs font-semibold ni-t-gold"
    >
      <CloudOff size={14} aria-hidden="true" />
      {t("state.offlineBanner")}
    </div>
  );
}
