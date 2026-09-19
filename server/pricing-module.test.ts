/**
 * Pricing.
 *
 * The module is additive by design, so most of what is checked here is what it does NOT do: it
 * writes nothing, it owns no table, it charges nobody, and it invents no policy. The arithmetic is
 * exercised for real, because a price list that is wrong by a rounding rule is wrong everywhere.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CREDIT_PACKAGES, DISPLAY_CURRENCIES, HOURS_RANGE, PRICING_BASE_CURRENCY, RATE_RANGE, WEEKS_PER_MONTH,
  convertFromBase, displayCurrency, estimateMonthlyCredits, suggestedPackage,
} from "../client/src/lib/pricing-config";

const page = readFileSync(new URL("../client/src/components/PricingExperience.tsx", import.meta.url), "utf8");
const packages = readFileSync(new URL("../client/src/components/PricingPackages.tsx", import.meta.url), "utf8");
const calculator = readFileSync(new URL("../client/src/components/PricingCalculator.tsx", import.meta.url), "utf8");
const config = readFileSync(new URL("../client/src/lib/pricing-config.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const nav = readFileSync(new URL("../client/src/components/SiteNav.tsx", import.meta.url), "utf8");
const routers = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const paymentsServer = readFileSync(new URL("./payments.ts", import.meta.url), "utf8");
const catalog = readFileSync(new URL("../client/src/i18n/catalog.ts", import.meta.url), "utf8");

/**
 * Source with its comments removed.
 *
 * Two assertions below are about what the code does, not about what the file says it does — and
 * both of these files explain in prose exactly which tables they stay away from and why a purchase
 * button is not offered. Scanning the raw text would fail on its own documentation, so the prose is
 * stripped first. `//` is only treated as a comment at the start of a line, which leaves URLs alone.
 */
const codeOnly = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

describe("the monthly estimate", () => {
  it("counts a month as 52 weeks over 12, not as four", () => {
    expect(WEEKS_PER_MONTH).toBeCloseTo(4.3333, 4);
    // Four weeks would understate every month by about 8%.
    expect(estimateMonthlyCredits(5, 2)).toBe(43);
    expect(estimateMonthlyCredits(5, 2)).not.toBe(40);
  });

  it("rounds to a whole credit", () => {
    for (const [rate, hours, expected] of [[1, 1, 4], [2, 1, 9], [10, 3, 130], [20, 1, 87], [7, 4, 121]] as const) {
      expect(estimateMonthlyCredits(rate, hours), `${rate} x ${hours}`).toBe(expected);
    }
  });

  it("returns zero rather than NaN for input it cannot use", () => {
    for (const [rate, hours] of [[Number.NaN, 2], [5, Number.NaN], [-1, 2], [5, -1]] as const) {
      expect(estimateMonthlyCredits(rate, hours)).toBe(0);
    }
  });

  it("suggests the smallest package that actually covers the estimate", () => {
    expect(suggestedPackage(43)?.credits).toBe(50);
    expect(suggestedPackage(10)?.credits).toBe(10);
    expect(suggestedPackage(11)?.credits).toBe(25);
    // Past the largest package there is no honest suggestion to make.
    expect(suggestedPackage(5_000)).toBeNull();
  });
});

describe("the price list", () => {
  it("is authored once, in one file", () => {
    expect(CREDIT_PACKAGES).toHaveLength(8);
    // No component may carry a price of its own.
    for (const source of [page, packages, calculator]) {
      expect(source).not.toMatch(/\b(1099|2699|5299|10699|21199|52999|105999|211999)\b/);
    }
  });

  it("holds the agreed packages, in ascending order, priced in minor units", () => {
    expect(CREDIT_PACKAGES.map((entry) => entry.credits)).toEqual([10, 25, 50, 100, 200, 500, 1000, 2000]);
    expect(CREDIT_PACKAGES.map((entry) => entry.priceBaseMinor)).toEqual([1_099, 2_699, 5_299, 10_699, 21_199, 52_999, 105_999, 211_999]);
    for (const entry of CREDIT_PACKAGES) expect(Number.isInteger(entry.priceBaseMinor)).toBe(true);
    expect(new Set(CREDIT_PACKAGES.map((entry) => entry.id)).size).toBe(CREDIT_PACKAGES.length);
  });

  it("keeps the calculator's sliders inside sensible bounds", () => {
    expect(RATE_RANGE.min).toBeGreaterThan(0);
    expect(RATE_RANGE.max).toBeGreaterThan(RATE_RANGE.min);
    expect(HOURS_RANGE.max).toBeLessThanOrEqual(7 * 24);
  });
});

describe("currency is display-only, and says so", () => {
  it("offers exactly the six currencies the finance types already know", () => {
    expect(DISPLAY_CURRENCIES.map((entry) => entry.code).sort()).toEqual(["AED", "EUR", "GBP", "PKR", "SAR", "USD"]);
    // Reusing CurrencyCode rather than declaring a second list is what keeps the page and the
    // ledger from disagreeing about which currencies exist.
    expect(config).toContain('import type { CurrencyCode } from "./relationship-ops-data";');
  });

  it("converts from one base and rounds to the minor unit", () => {
    expect(PRICING_BASE_CURRENCY).toBe("USD");
    expect(convertFromBase(1_099, "USD")).toBe(1_099);
    expect(convertFromBase(1_000, "SAR")).toBe(3_750);
    for (const entry of DISPLAY_CURRENCIES) {
      expect(Number.isInteger(convertFromBase(1_099, entry.code)), entry.code).toBe(true);
    }
  });

  it("falls back to the base currency rather than throwing on an unknown code", () => {
    expect(displayCurrency("ZZZ" as never).code).toBe("USD");
  });

  it("warns only where a rate can actually drift", () => {
    // AED and SAR are official pegs; telling a reader those are indicative would be noise.
    expect(DISPLAY_CURRENCIES.filter((entry) => entry.pegged).map((entry) => entry.code).sort()).toEqual(["AED", "SAR", "USD"]);
    expect(page).toContain("!shownCurrency.pegged");
  });

  it("does not recalculate anything that has already been paid", () => {
    // The Pricing module never reads or writes a financial row.
    for (const source of [page, packages, calculator, config]) {
      for (const table of ["session_ledger", "payment_references", "withdrawal_requests", "bookings", "class_sessions"]) {
        expect(codeOnly(source), `Pricing must not touch ${table}`).not.toContain(table);
      }
    }
  });
});

describe("nothing here pretends to take money", () => {
  it("asks the server whether a provider exists instead of hardcoding the answer", () => {
    expect(packages).toContain("trpc.pricingPublic.paymentAvailability.useQuery");
    expect(routers).toContain("paymentAvailability: publicProcedure.query(() => getPublicPaymentAvailability())");
    expect(paymentsServer).toContain("export function getPublicPaymentAvailability()");
  });

  it("keeps the vendor and its missing configuration out of a public answer", () => {
    const fn = paymentsServer.slice(paymentsServer.indexOf("export function getPublicPaymentAvailability"));
    const body = fn.slice(0, fn.indexOf("export async function getPaymentsSetup"));
    expect(body).toContain("configured: status.configured");
    expect(body).not.toContain("provider: status.provider");
    expect(body).not.toContain("missing");
  });

  it("disables the button rather than showing a purchase that cannot happen", () => {
    expect(packages).toContain('t("pricing.comingSoon")');
    expect(packages).toContain("<button type=\"button\" disabled");
    // No fabricated success anywhere on the page.
    for (const source of [page, packages, calculator]) {
      expect(codeOnly(source)).not.toMatch(/succeeded|purchased|payment successful/i);
    }
  });

  it("carries the plan panel in gold and its action in green", () => {
    const css = readFileSync(new URL("../client/src/index.css", import.meta.url), "utf8");
    expect(packages).toContain('className="ni-plan-panel');
    expect(packages).toContain("ni-btn ni-btn--go");
    expect(css).toContain(".ni-plan-panel { background: var(--ni-gold); color: var(--ni-on-gold); }");
    // The action is a fixed green because the panel behind it is gold in BOTH themes; a token that
    // flipped light in the dark theme would put a pale control on a pale ground.
    expect(css).toContain(".ni-btn--go { background: #0B4A41;");
    expect(css).toContain("color: #F5F0E4;");
  });

  it("puts the green on a ground it can be seen against, in either theme", () => {
    const css = readFileSync(new URL("../client/src/index.css", import.meta.url), "utf8");
    const golds = [...new Set([...css.matchAll(/--ni-gold: *(#[0-9A-Fa-f]{6})/g)].map((m) => m[1]))];
    const channel = (hex: string, at: number) => {
      const value = parseInt(hex.slice(at, at + 2), 16) / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };
    const luminance = (hex: string) => 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
    const contrast = (a: string, b: string) => {
      const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (high + 0.05) / (low + 0.05);
    };
    const green = "#0B4A41";
    // 3:1 is the threshold for a control against its background.
    for (const gold of golds) expect(contrast(green, gold), `green on ${gold}`).toBeGreaterThanOrEqual(3);
    // And 4.5:1 for the label on the control.
    expect(contrast(green, "#F5F0E4")).toBeGreaterThanOrEqual(4.5);
  });

  it("offers the packages as one chooser rather than a wall of cards", () => {
    expect(packages).toContain('t("pricing.chooseLabel")');
    expect(packages).toContain("CREDIT_PACKAGES.map((entry) => (");
    expect(packages).toContain('t("pricing.packageOption"');
    // The panel names the package that is selected, so the two halves cannot disagree.
    expect(packages).toContain('t("pricing.selectedPackage")');
  });

  it("uses its own slider, not the marketplace's two-thumb filter", () => {
    const css = readFileSync(new URL("../client/src/index.css", import.meta.url), "utf8");
    // `.ni-range` positions its inputs absolutely over separate track and fill elements, because it
    // is the rate FILTER with two thumbs. Reusing it here laid the thumb across the label and drew
    // no bar at all, since this card has no track element for it to find.
    expect(calculator).not.toContain('"ni-range"');
    expect(calculator).toContain('className="ni-price-slider mt-2.5"');
    expect(css).toContain(".ni-price-slider {");
    // The label stacks above the bar: neither is positioned, so they cannot overlap.
    expect(css).toContain(".ni-price-slider::-webkit-slider-runnable-track");
    expect(css).toContain(".ni-price-slider::-moz-range-track");
    expect(css.slice(css.indexOf(".ni-price-slider {"))).not.toContain("position: absolute");
  });

  it("starts both sliders at one, as the estimator's floor", () => {
    expect(page).toContain("const DEFAULT_RATE = 1;");
    expect(page).toContain("const DEFAULT_HOURS = 1;");
    expect(RATE_RANGE.min).toBe(1);
    expect(HOURS_RANGE.min).toBe(1);
    expect(estimateMonthlyCredits(1, 1)).toBe(4);
  });

  it("lets the estimator be put back where it started", () => {
    expect(calculator).toContain('onClick={onReset}');
    expect(calculator).toContain('t("pricing.reset")');
    expect(page).toContain("const resetCalculator = () => { setHourlyRate(DEFAULT_RATE); setWeeklyHours(DEFAULT_HOURS); };");
  });

  it("states the unsettled policy instead of borrowing one", () => {
    expect(catalog).toContain('"pricing.faq.a6": "This has not been decided yet.');
    expect(catalog).toContain('"pricing.faq.a7": "Payments are not connected yet.');
  });
});

describe("it joins the site without disturbing it", () => {
  it("is one public route, built like the other public pages", () => {
    expect(app).toContain('<Route path="/pricing">{() => <><Header/><PricingPage/><Footer/></>}</Route>');
    expect(app).toContain('const PricingPage = lazy(() => import("./components/PricingExperience"));');
  });

  it("adds one navigation item to the navigation that already exists", () => {
    expect(nav).toContain('<Link href="/pricing" className={triggerClass}>{t("nav.pricing")}</Link>');
    expect(nav).toContain('<Link href="/pricing" onClick={onNavigate} className="ni-t-ink">{t("nav.pricing")}</Link>');
    // Desktop and mobile, from the one component — not a second navigation.
    expect(nav.match(/nav\.pricing/g)).toHaveLength(2);
  });

  it("invents no tutor and quotes no rate of its own", () => {
    // The page carried two explanation cards — what a credit is, and that every teacher sets their own
    // rate — which were removed. Both questions are still answered, in the FAQ below, so the page
    // lost the prose and none of the meaning. What must stay true is that it names no tutor and no
    // rate it made up.
    expect(page).not.toContain('t("pricing.ratesRange"');
    expect(page).not.toContain('t("pricing.ratesExamples"');
    expect(catalog).toContain('"pricing.faq.q5": "Does every teacher charge the same?"');
    expect(catalog).toContain('"pricing.faq.q1": "What are credits?"');
  });

  it("is translated in all three locales, like every other surface", () => {
    for (const key of ["nav.pricing", "pricing.title", "pricing.faq.a7", "pricing.currency.PKR"]) {
      expect(catalog.match(new RegExp(`"${key.replace(".", "\\.")}":`, "g")), key).toHaveLength(3);
    }
  });
});
