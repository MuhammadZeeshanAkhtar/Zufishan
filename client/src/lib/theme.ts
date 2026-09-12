/**
 * Theme selection — browser only.
 *
 * Three states, not two. "System" is a real choice and the default one: a reader
 * who has set their operating system to dark at night should get dark without
 * ever finding this control, and should keep following the system when it
 * changes. Collapsing that into a boolean forces a first-visit guess and then
 * ignores the answer the reader already gave their OS.
 *
 * An explicit choice is stored and always wins afterwards, in both directions —
 * choosing light on a dark-set machine has to stick, which is why the CSS uses
 * `:root:not([data-theme="light"])` under the media query rather than a bare
 * `prefers-color-scheme` block.
 *
 * No backend, no procedure, no database column: `localStorage` on the reader's
 * own device, which is where a display preference belongs.
 */

export type ThemeChoice = "light" | "dark" | "system";
/** What is actually painted, once "system" has been resolved. */
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "noor-ilm-theme";

/** Reads the stored choice. Falls back to "system" whenever storage is unusable. */
export function readThemeChoice(): ThemeChoice {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    // Private windows and blocked site data both throw here; the default stands.
  }
  return "system";
}

export function systemPrefersDark(): boolean {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

export function resolveTheme(choice: ThemeChoice): ResolvedTheme {
  if (choice === "system") return systemPrefersDark() ? "dark" : "light";
  return choice;
}

/**
 * Puts the choice on the document.
 *
 * The attribute is ALWAYS written with a resolved value — "light" or "dark" —
 * including for the "system" choice. "system" remains what is stored and is
 * re-resolved by the toggle's media listener when the OS changes.
 */
export function applyThemeChoice(choice: ThemeChoice): ResolvedTheme {
  const root = document.documentElement;
  const resolved = resolveTheme(choice);
  // Always explicit, even for "system". Leaving the attribute off made the CSS
  // depend on `:not([data-theme=...])` interacting with a prefers-color-scheme
  // media query, and those two were observed resolving to opposite themes on the
  // same element. One unambiguous attribute removes the interaction entirely;
  // "system" remains the stored choice and is re-resolved when the OS changes.
  root.setAttribute("data-theme", resolved);
  // Keeps the browser's own chrome — form controls, scrollbars — in step.
  root.style.colorScheme = resolved;
  return resolved;
}

/** Applies and persists. Persistence failing must never stop the theme changing. */
export function setThemeChoice(choice: ThemeChoice): ResolvedTheme {
  const resolved = applyThemeChoice(choice);
  try {
    localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Preference is lost on reload, but this session still honours the choice.
  }
  return resolved;
}

/**
 * Runs before React mounts, from an inline script, so the first paint is already
 * the right theme. Without this the page paints light and then corrects itself —
 * a flash that is worst for exactly the people who chose dark.
 */
export function bootTheme(): void {
  applyThemeChoice(readThemeChoice());
}

/**
 * Brief colour-only transition on the surfaces that change most.
 *
 * Scoped to a class that is added for the length of the change and removed
 * after, so the transition never applies to ordinary interaction — a permanent
 * transition on `background-color` makes every hover feel sluggish.
 */
export function withThemeTransition(change: () => void): void {
  const root = document.documentElement;
  let reduced = false;
  try {
    reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    reduced = false;
  }
  if (reduced) { change(); return; }

  root.classList.add("ni-theme-changing");
  change();
  window.setTimeout(() => root.classList.remove("ni-theme-changing"), 260);
}
