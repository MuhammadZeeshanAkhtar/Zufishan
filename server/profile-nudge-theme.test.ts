/**
 * The "complete your profile" notice, read in both themes.
 *
 * Its button was written as `bg-[var(--ni-teal)]` over `text-[var(--ni-paper)]`. Both of those
 * tokens flip with the theme, and in dark they land on #1F1A14 and #241F19 — two dark browns a
 * little over 1:1 apart, so the word "Complete" was simply not there. `--ni-paper` was never the
 * right partner: it names a card *surface*. `--ni-on-dark` is the token the palette declares for
 * text on a dark fill.
 *
 * The percentage bar under it had the same fault read backwards: a near-black fill on a light gold
 * track, so in dark the *unfilled* remainder looked like the progress.
 *
 * This file checks the result as colour rather than as class names — the tokens are resolved out of
 * `index.css` per theme and the ratios are computed, so a later palette edit that re-breaks either
 * one fails here instead of on someone's screen.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const banner = readFileSync(new URL("../client/src/components/ProfileCompletionBanner.tsx", import.meta.url), "utf8");

/**
 * Comments sit between rules and would be read as part of the next selector; runs of whitespace
 * make a selector's spelling ambiguous. Both are flattened once, and every lookup below is then a
 * plain string search rather than a regex built out of a template literal.
 */
const flat = readFileSync(new URL("../client/src/index.css", import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/\s+/g, " ");

/**
 * Last declaration wins, exactly as the cascade resolves it for a stamped `data-theme`.
 *
 * The palette blocks are matched by their own selector rather than by what precedes them: the file
 * opens with Tailwind's at-rules, and anchoring on the previous `}` silently skipped the whole
 * light palette — which is the sort of quiet miss this file exists to catch.
 *
 * `:root:not([data-theme="light"])` inside the `prefers-color-scheme` block is not matched here,
 * and should not be: the app always stamps an explicit theme, so those two rules never apply.
 */
const THEME_BLOCK = /(:root|\[data-theme="light"\]|\[data-theme="dark"\])\s*\{([^{}]*)\}/g;
function tokensFor(theme: "light" | "dark"): Map<string, string> {
  const out = new Map<string, string>();
  for (const block of flat.matchAll(THEME_BLOCK)) {
    if (block[1] !== ":root" && block[1] !== `[data-theme="${theme}"]`) continue;
    for (const decl of block[2].matchAll(/(--[\w-]+)\s*:\s*(#[0-9A-Fa-f]{6})/g)) out.set(decl[1], decl[2]);
  }
  return out;
}

/** A palette that came back nearly empty would make every ratio below vacuously true. */
function paletteOf(theme: "light" | "dark"): Map<string, string> {
  const palette = tokensFor(theme);
  expect(palette.size, `${theme} palette`).toBeGreaterThan(20);
  return palette;
}

const channel = (hex: string, at: number) => {
  const value = parseInt(hex.slice(at, at + 2), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string) => 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
const contrast = (a: string, b: string) => {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
};

/** Reads one declaration off a rule, so the test never restates a value the stylesheet owns. */
function declared(selector: string, property: string): string {
  const at = flat.indexOf(`${selector} {`);
  expect(at, `${selector} must exist in index.css`).toBeGreaterThanOrEqual(0);
  const body = flat.slice(at + selector.length + 2, flat.indexOf("}", at));
  const decl = body.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${property}:`));
  expect(decl, `${selector} must set ${property}`).toBeTruthy();
  return decl!.slice(property.length + 1).trim();
}

/** Resolves a declared value — a literal hex or a `var(--token)` — inside one theme. */
function colour(value: string, theme: "light" | "dark"): string {
  const literal = value.match(/#[0-9A-Fa-f]{6}/);
  if (literal) return literal[0];
  const token = value.match(/var\((--[\w-]+)\)/);
  const resolved = token ? paletteOf(theme).get(token[1]) : undefined;
  expect(resolved, `${value} must resolve in ${theme}`).toBeTruthy();
  return resolved!;
}

/** The button's own rule, per theme, spelled the way the stylesheet spells it. */
const cta = (theme: "light" | "dark") => `[data-theme="${theme}"] .ni-nudge-cta`;

describe("the token flip that hid the label is gone", () => {
  it("no longer paints text on a dark fill with a surface colour", () => {
    // The pairing that caused it. `--ni-paper` is a card ground, never a foreground.
    expect(banner).not.toContain("bg-[var(--ni-teal)]");
    expect(banner).not.toContain("text-[var(--ni-paper)]");
    expect(banner).toContain('className="ni-nudge-cta');
  });

  it("proves the two old values really were indistinguishable in dark", () => {
    const dark = paletteOf("dark");
    // Not a hypothetical: this is what the user was looking at.
    expect(contrast(dark.get("--ni-teal")!, dark.get("--ni-paper")!)).toBeLessThan(1.5);
  });
});

describe("the label reads in both themes", () => {
  for (const theme of ["light", "dark"] as const) {
    it(`carries its text at 4.5:1 or better in ${theme}`, () => {
      const fill = colour(declared(cta(theme), "background"), theme);
      const text = colour(declared(cta(theme), "color"), theme);
      expect(contrast(fill, text), `${theme}: ${text} on ${fill}`).toBeGreaterThanOrEqual(4.5);
    });

    it(`keeps the button visible against the gold banner in ${theme}`, () => {
      const fill = colour(declared(cta(theme), "background"), theme);
      const ground = paletteOf(theme).get("--ni-gold-soft")!;
      // 3:1 is the threshold for a control against the surface behind it.
      expect(contrast(fill, ground), `${theme}: ${fill} on ${ground}`).toBeGreaterThanOrEqual(3);
    });
  }
});

describe("the percentage bar reads forwards", () => {
  for (const theme of ["light", "dark"] as const) {
    it(`fills lighter than its track in ${theme}`, () => {
      const prefix = theme === "dark" ? '[data-theme="dark"] ' : "";
      const track = colour(declared(`${prefix}.ni-nudge-bar`, "background"), theme);
      const fill = colour(declared(`${prefix}.ni-nudge-bar-fill`, "background"), theme);
      // The filled part must be the one that stands out, and "stands out" flips with the theme:
      // darker than the track on a light ground, lighter than it on a dark one. The old bar had a
      // near-black fill on light gold in *both*, so in dark the empty remainder read as progress.
      const fillIsDarker = luminance(fill) < luminance(track);
      expect(fillIsDarker, `${theme}: fill ${fill} vs track ${track}`).toBe(theme === "light");
      expect(contrast(fill, track), `${theme}: fill ${fill} on track ${track}`).toBeGreaterThanOrEqual(3);
    });
  }
});

describe("it is still one component, styled the project's way", () => {
  it("declares the button per theme, as every other button here is", () => {
    for (const theme of ["light", "dark"] as const) {
      expect(flat, theme).toContain(`${cta(theme)} {`);
    }
  });

  it("gives the close control a focus ring that exists in dark", () => {
    expect(banner).toContain("focus-visible:ring-[var(--ni-gold-ink)]");
    const dark = paletteOf("dark");
    expect(contrast(dark.get("--ni-gold-ink")!, dark.get("--ni-gold-soft")!)).toBeGreaterThanOrEqual(3);
  });
});
