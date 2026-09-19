import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ar, catalogs, en, localeCodes, missingTranslationKeys, ur } from "../client/src/i18n/catalog";

describe("Zufishan i18n contract", () => {
  it("supports exactly the three launch locales", () => {
    expect(localeCodes).toEqual(["en", "ur", "ar"]);
    expect(Object.keys(catalogs).sort()).toEqual(["ar", "en", "ur"]);
  });

  it("has complete catalogues with the same stable keys", () => {
    expect(missingTranslationKeys(en)).toEqual([]);
    expect(missingTranslationKeys(ur)).toEqual([]);
    expect(missingTranslationKeys(ar)).toEqual([]);
    expect(Object.keys(ur).sort()).toEqual(Object.keys(en).sort());
    expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort());
  });

  it("keeps launch-critical translations non-empty and distinct from English", () => {
    for (const key of ["nav.courses", "nav.tutors", "auth.loginAction", "tutor.setupTitle"] as const) {
      expect(ur[key].trim()).not.toBe("");
      expect(ar[key].trim()).not.toBe("");
      expect(ur[key]).not.toBe(en[key]);
      expect(ar[key]).not.toBe(en[key]);
    }
  });

  it("keeps protected messaging labels translated across launch locales", () => {
    for (const key of ["messaging.setupNeeded", "messaging.title", "messaging.protectedCopy", "messaging.placeholder", "messaging.send"] as const) {
      expect(en[key].trim()).not.toBe("");
      expect(ur[key].trim()).not.toBe("");
      expect(ar[key].trim()).not.toBe("");
      expect(ur[key]).not.toBe(en[key]);
      expect(ar[key]).not.toBe(en[key]);
    }
  });

  it("keeps protected AI Tutor route labels translated across launch locales", () => {
    for (const key of ["tutor.currentLevel", "tutor.practiceTitle", "tutor.startSentence", "tutor.progressMode", "tutor.instructorSetup", "tutor.moderationSetup"] as const) {
      expect(en[key].trim()).not.toBe("");
      expect(ur[key].trim()).not.toBe("");
      expect(ar[key].trim()).not.toBe("");
      expect(ur[key]).not.toBe(en[key]);
      expect(ar[key]).not.toBe(en[key]);
    }
  });

  it("keeps AI Tutor preference and practice options translated across launch locales", () => {
    for (const key of ["tutor.level.beginner", "tutor.level.upper_intermediate", "tutor.correction.gentle", "tutor.difficulty.adaptive", "tutor.goal.exam_preparation", "tutor.mode.translation"] as const) {
      expect(en[key].trim()).not.toBe("");
      expect(ur[key].trim()).not.toBe("");
      expect(ar[key].trim()).not.toBe("");
      expect(ur[key]).not.toBe(en[key]);
      expect(ar[key]).not.toBe(en[key]);
    }
  });

  it("keeps approved technical and brand identifiers intact where required", () => {
    expect(ur["auth.supabaseConfigured"]).toContain("Supabase Auth");
    expect(ar["auth.supabaseConfigured"]).toContain("Supabase Auth");
    expect(en["tutor.setupCopy"]).toContain("Fatwa");
    expect(ur["tutor.setupCopy"]).toContain("فتویٰ");
    expect(ar["tutor.setupCopy"]).toContain("فتوى");
  });

  it("keeps locale provider exports Fast Refresh-safe", () => {
    const provider = readFileSync(resolve(process.cwd(), "client/src/contexts/LocaleContext.tsx"), "utf8");
    const state = readFileSync(resolve(process.cwd(), "client/src/contexts/LocaleContextState.ts"), "utf8");
    expect(provider).toContain("export function LocaleProvider");
    expect(provider).not.toContain("export function useLocale");
    expect(provider).not.toContain("localeCompletenessReport");
    expect(state).toContain("export function useLocale");
  });
});
