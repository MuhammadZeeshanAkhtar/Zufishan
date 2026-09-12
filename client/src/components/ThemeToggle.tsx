/**
 * The theme control, beside the language selector in the header.
 *
 * **Two states: light and dark.** It cycled through "match my system" as a third stop,
 * which was removed deliberately — a reader pressing a theme button wants the theme to
 * change, and a middle state that lands on whichever theme the OS happens to prefer
 * reads as the button doing nothing when the OS already matches.
 *
 * An account may still have "system" stored from before, so the button resolves that to
 * whichever theme is actually on screen and offers the opposite. Pressing it always
 * writes an explicit "light" or "dark", so a stored "system" converts itself the first
 * time anyone uses the control. The storage layer in `lib/theme.ts` still understands
 * "system" — this component simply never chooses it.
 *
 * Because the button both reports and changes state, the accessible name carries the
 * current theme and the tooltip says what pressing it will do.
 */
import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useLocale } from "../contexts/LocaleContextState";
import { readThemeChoice, resolveTheme, setThemeChoice, withThemeTransition, type ResolvedTheme } from "../lib/theme";

const LABEL: Record<ResolvedTheme, string> = { light: "theme.light", dark: "theme.dark" };

export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { t } = useLocale();
  // Resolved, not raw: a stored "system" has to show the theme that is really applied,
  // or the icon would contradict the page on first paint.
  const [theme, setTheme] = useState<ResolvedTheme>(() => resolveTheme(readThemeChoice()));

  const next: ResolvedTheme = theme === "dark" ? "light" : "dark";
  const Icon = theme === "dark" ? Moon : Sun;

  const toggle = () => {
    setTheme(next);
    withThemeTransition(() => setThemeChoice(next));
  };

  return (
    <button
      type="button"
      onClick={toggle}
      // Names the state it is in; the tooltip names the state it moves to.
      aria-label={`${t("theme.label")}: ${t(LABEL[theme] as never)}`}
      title={t(LABEL[next] as never)}
      className={`grid ${compact ? "h-8 w-8" : "h-9 w-9"} shrink-0 place-items-center rounded-full border border-[var(--ni-sage)] bg-[var(--ni-sage-soft)] ni-t-moss-deep outline-none transition-colors hover:bg-[var(--ni-paper)] focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]`}
    >
      <Icon size={compact ? 15 : 16} aria-hidden="true" />
      {/* Announced on change, so a screen reader hears the new theme without re-reading the header. */}
      <span aria-live="polite" className="sr-only">{t(LABEL[theme] as never)}</span>
    </button>
  );
}
