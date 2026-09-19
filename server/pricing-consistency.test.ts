/**
 * One teacher rate, one spelling, one credit rule.
 *
 * Four surfaces used to format the same stored rate, and no two agreed: the discovery card said
 * "7 USD", the tutor listing said "7.00 USD", checkout said "$7.00", and the Pricing page said
 * "USD 7.00". Nothing was wrong with any of them on its own; together they read as four different
 * prices for one teacher.
 *
 * They now all go through `useHourlyRate`, and the credit half of it through `creditsPerHour` in
 * `pricing-config` — the module that is the source of truth for what a credit is. This file holds
 * that arrangement in place: the maths is exercised for real, and the surfaces are checked for
 * having no formula of their own.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DISPLAY_CURRENCIES, PRICING_BASE_CURRENCY,
  convertFromBase, convertToBase, creditsPerHour,
} from "../client/src/lib/pricing-config";

const presentation = readFileSync(new URL("../client/src/components/InstructorPresentation.tsx", import.meta.url), "utf8");
const profile = readFileSync(new URL("../client/src/components/InstructorManagement.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const payments = readFileSync(new URL("../client/src/components/PaymentsExperience.tsx", import.meta.url), "utf8");

describe("a rate carried into credits", () => {
  it("reads one credit as one unit of the base currency", () => {
    // The rule the Pricing page states in words, checked as a number.
    expect(creditsPerHour(700, "USD")).toBe(7);
    expect(creditsPerHour(1_250, "USD")).toBe(13);
    expect(creditsPerHour(0, "USD")).toBe(0);
  });

  it("converts a rate stored in another currency before counting credits", () => {
    // A teacher who prices in rupees is worth the same credits as one who prices in dollars.
    const pkr = DISPLAY_CURRENCIES.find((entry) => entry.code === "PKR")!;
    expect(creditsPerHour(Math.round(5 * 100 * pkr.perUsd), "PKR")).toBe(5);
    const sar = DISPLAY_CURRENCIES.find((entry) => entry.code === "SAR")!;
    expect(creditsPerHour(Math.round(8 * 100 * sar.perUsd), "SAR")).toBe(8);
  });

  it("refuses to guess rather than inventing a conversion", () => {
    for (const bad of [null, undefined, Number.NaN, -1]) {
      expect(creditsPerHour(bad as number, "USD")).toBeNull();
    }
    // A currency the rate table does not know has no honest credit value.
    expect(creditsPerHour(700, "JPY")).toBeNull();
    expect(creditsPerHour(700, null)).toBeNull();
  });

  it("round-trips through the one rate table, in both directions", () => {
    for (const entry of DISPLAY_CURRENCIES) {
      const there = convertFromBase(10_000, entry.code);
      const back = convertToBase(there, entry.code);
      // Rounding to the minor unit costs at most a unit or two; nothing may drift further.
      expect(Math.abs(back - 10_000), entry.code).toBeLessThanOrEqual(2);
    }
    expect(convertToBase(1_000, PRICING_BASE_CURRENCY)).toBe(1_000);
  });
});

describe("no surface spells a price its own way", () => {
  it("formats the rate in exactly one place", () => {
    expect(presentation).toContain("export function useHourlyRate(");
    expect(presentation).toContain("creditsPerHour(rateMinor, currency)");
    // The four old formulas, each of which produced a different string for the same rate.
    for (const [name, source] of [["presentation", presentation], ["profile", profile], ["app", app]] as const) {
      expect(source, `${name} must not divide a rate by 100 itself`).not.toMatch(/hourly_rate_minor \/ 100/);
      expect(source, `${name} must not build a rate string by hand`).not.toMatch(/\(minor \/ 100\)\.toFixed/);
    }
  });

  it("gives the profile and the discovery card the same source", () => {
    expect(profile).toContain("useHourlyRate(profile.hourly_rate_minor, profile.currency)");
    expect(presentation).toContain("useHourlyRate(instructor.hourly_rate_minor, instructor.currency)");
  });

  it("shows the credit value of an hour beside its price", () => {
    expect(presentation).toContain('t("pricing.creditsPerHour")');
    const catalog = readFileSync(new URL("../client/src/i18n/catalog.ts", import.meta.url), "utf8");
    expect(catalog.match(/"pricing\.creditsPerHour":/g)).toHaveLength(3);
  });

  it("spells a booked amount the way the rest of the site spells money", () => {
    expect(payments).toContain('currencyDisplay: "code"');
    // The browser's locale is not the app's locale; the caller passes the one the reader chose.
    expect(payments).not.toContain("new Intl.NumberFormat(undefined,");
    expect(payments).toContain("const { t, locale } = useLocale();");
  });

  it("never re-converts an amount that was already quoted or charged", () => {
    // Checkout and the ledger read stored amounts. Converting one at today's rate would show a
    // number that is not the number on the record.
    const fn = payments.slice(payments.indexOf("export function formatMinor"), payments.indexOf("export function PaymentProviderNotice"));
    expect(fn).not.toContain("convertFromBase");
    expect(fn).not.toContain("convertToBase");
  });
});
