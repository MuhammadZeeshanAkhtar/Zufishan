import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ref = readFileSync(new URL("../client/src/lib/reference-data.ts", import.meta.url), "utf8");
const select = readFileSync(new URL("../client/src/components/SearchableSelect.tsx", import.meta.url), "utf8");
const tutor = readFileSync(new URL("../client/src/components/InstructorManagement.tsx", import.meta.url), "utf8");
const learner = readFileSync(new URL("../client/src/components/LearnerProfileEditor.tsx", import.meta.url), "utf8");
const lmsData = readFileSync(new URL("../client/src/lib/lms-data.ts", import.meta.url), "utf8");

const countryCodes = (ref.match(/const COUNTRY_CODES = \[([\s\S]*?)\]/)![1].match(/"[A-Z]{2}"/g) ?? []).map((s) => s.slice(1, -1));

describe("reference data", () => {
  it("ships a complete country list rather than a handful", () => {
    expect(countryCodes.length).toBeGreaterThan(230);
    for (const code of ["PK", "GB", "US", "SA", "EG", "IN", "TR", "ID", "NG", "AU"]) {
      expect(countryCodes).toContain(code);
    }
  });

  it("excludes the configured country from the selector", () => {
    expect(countryCodes).not.toContain("IL");
    expect(ref).toContain('EXCLUDED_COUNTRY_CODES = new Set(["IL"])');
    // The exclusion is applied in the builder, not only by omission from the source array.
    expect(ref).toContain("if (EXCLUDED_COUNTRY_CODES.has(code)) continue;");
  });

  it("takes timezones from the runtime IANA set, not a hand-typed list", () => {
    expect(ref).toContain('supportedValuesOf');
    expect(ref).toContain('supported("timeZone")');
    // The inline list is only a fallback for engines without supportedValuesOf.
    const fallback = ref.slice(ref.indexOf("if (!zones.length)"), ref.indexOf("return zones.map"));
    expect(fallback).toContain("Asia/Karachi");
    expect(fallback).toContain("Europe/London");
  });

  it("stores the standard IANA identifier, not a prettified label", () => {
    // label is prettified for display; value stays the raw identifier.
    expect(ref).toContain('unique.map((zone) => ({ value: zone, label: zone.replace(/_/g, " ") }))');
  });

  it("reuses the project's own subject list instead of inventing one", () => {
    expect(ref).toContain('import { categories } from "./lms-data"');
    expect(ref).toContain("export const subjectOptions: string[] = [...categories];");
    // The canonical list still lives in lms-data and still holds the Zufishan subjects.
    for (const subject of ["Quran Recitation", "Tajweed", "Hifz", "Arabic", "Noorani Qaida"]) {
      expect(lmsData).toContain(subject);
    }
    // No second copy of the subject vocabulary.
    expect(ref).not.toMatch(/"Quran Recitation"\s*,\s*"Tajweed"/);
  });

  it("offers a broad language list covering the platform's audience", () => {
    for (const code of ["ar", "ur", "en", "hi", "bn", "fa", "tr", "fr", "es", "de", "zh", "ja", "ko", "ru", "pt", "it", "ms", "id", "pa", "ps"]) {
      expect(ref).toContain(`"${code}"`);
    }
  });
});

describe("country drives timezone", () => {
  // Mirrors the runtime logic so the mapping itself is exercised, not just the source text.
  const codes = countryCodes;
  const modern = Object.fromEntries(
    [...ref.matchAll(/"([A-Za-z_/]+)":\s*"([A-Za-z_/]+)"/g)].filter((m) => m[1].includes("/")).map((m) => [m[1], m[2]]),
  );
  const canon = (z: string) => modern[z] ?? z;
  const nameOf = (c: string) => new Intl.DisplayNames(["en"], { type: "region" }).of(c) ?? c;
  const byName = new Map(codes.filter((c) => c !== "IL").map((c) => [nameOf(c), c]));
  const zonesFor = (name: string) => {
    const code = byName.get(name);
    if (!code) return [];
    const locale = new Intl.Locale(`und-${code}`) as Intl.Locale & { getTimeZones?: () => string[] };
    const zones = typeof locale.getTimeZones === "function" ? locale.getTimeZones() ?? [] : [];
    return [...new Set(zones.map(canon))].sort();
  };

  it("returns only that country's zones, for the cases in the brief", () => {
    expect(zonesFor("Pakistan")).toEqual(["Asia/Karachi"]);
    expect(zonesFor("United Arab Emirates")).toEqual(["Asia/Dubai"]);
    expect(zonesFor("United Kingdom")).toEqual(["Europe/London"]);
    expect(zonesFor("Saudi Arabia")).toEqual(["Asia/Riyadh"]);
  });

  it("normalises deprecated identifiers to the current IANA name", () => {
    // Some ICU builds still report Asia/Calcutta as canonical.
    expect(zonesFor("India")).toEqual(["Asia/Kolkata"]);
    expect(ref).toContain('"Asia/Calcutta": "Asia/Kolkata"');
    expect(ref).toContain("export function canonicalZone");
  });

  it("keeps multi-zone countries multi-zone rather than collapsing them", () => {
    const us = zonesFor("United States");
    expect(us.length).toBeGreaterThan(5);
    for (const zone of ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles"]) {
      expect(us).toContain(zone);
    }
    expect(zonesFor("Indonesia")).toContain("Asia/Jakarta");
    expect(zonesFor("Indonesia").length).toBeGreaterThan(1);
  });

  it("never offers the whole world once a country is chosen", () => {
    const all = Intl.supportedValuesOf("timeZone").length;
    for (const country of ["Pakistan", "India", "United Kingdom", "United States", "Indonesia"]) {
      expect(zonesFor(country).length).toBeLessThan(all);
    }
  });

  it("auto-selects when there is one zone, and clears a stale zone when there are many", () => {
    expect(ref).toContain("export function nextTimezoneForCountry");
    expect(ref).toContain("if (zones.length === 1) return zones[0].value;");
    expect(ref).toContain("return zones.some((zone) => zone.value === currentTimezone) ? currentTimezone : \"\";");
    // Unknown country must not wipe a value the user already had.
    expect(ref).toContain("if (!zones.length) return currentTimezone;");
  });

  it("falls back to the full list when no country is chosen or the country has no data", () => {
    expect(ref).toContain("export function timezoneOptionsForCountry");
    expect(ref).toContain("return scoped.length ? scoped : timezoneOptions();");
  });

  it("is wired into both profile forms", () => {
    expect(tutor).toContain("timezoneOptionsForCountry(profile.countryRegion)");
    expect(tutor).toContain("const updateCountry");
    expect(tutor).toContain("timezone: nextTimezoneForCountry(value, current.timezone)");
    expect(learner).toContain("timezoneOptionsForCountry(country)");
    expect(learner).toContain("setTimezone((current) => nextTimezoneForCountry(value, current))");
  });
});

describe("searchable select", () => {
  it("follows the combobox pattern and is keyboard operable", () => {
    expect(select).toContain('role="combobox"');
    expect(select).toContain('role="listbox"');
    expect(select).toContain('role="option"');
    expect(select).toContain("aria-expanded={open}");
    for (const key of ["ArrowDown", "ArrowUp", "Enter", "Escape"]) expect(select).toContain(`"${key}"`);
  });

  it("closes on outside click and tears its listener down", () => {
    expect(select).toContain('document.addEventListener("mousedown", onPointer)');
    expect(select).toContain('document.removeEventListener("mousedown", onPointer)');
  });

  it("is built on what the project already has — no new package pulled in", () => {
    // Every import must resolve to react, lucide-react, or a file inside this project.
    const imports = [...select.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
    expect(imports.length).toBeGreaterThan(0);
    for (const source of imports) {
      const allowed = source === "react" || source === "lucide-react" || source.startsWith(".");
      expect(allowed, `unexpected import source: ${source}`).toBe(true);
    }
  });
});

describe("profile forms use the shared lists", () => {
  it("wires the tutor onboarding fields", () => {
    expect(tutor).toContain('from "../lib/reference-data"');
    expect(tutor).toContain("options={countryOptions()}");
    expect(tutor).toContain("options={timezoneOptionsForCountry(profile.countryRegion)}");
    expect(tutor).toContain("options={languageOptions()}");
    expect(tutor).toContain("subjectOptions.map((subject) => ({ value: subject, label: subject }))");
    // The old free-text comma inputs for these fields are gone.
    expect(tutor).not.toContain('update("countryRegion", e.target.value)');
    expect(tutor).not.toContain('update("timezone", e.target.value)');
  });

  it("wires the learner profile fields and keeps them relevant to students", () => {
    expect(learner).toContain('from "../lib/reference-data"');
    expect(learner).toContain("options={countryOptions()}");
    expect(learner).toContain("options={timezoneOptionsForCountry(country)}");
    expect(learner).toContain("options={languageOptions()}");
    expect(learner).toContain("const SUBJECT_OPTIONS = subjectOptions;");
    // Tutor-only fields must not have been copied across.
    for (const tutorOnly of ["publicSlug", "hourlyRate", "teachingApproach", "availabilitySummary"]) {
      expect(learner).not.toContain(tutorOnly);
    }
  });

  it("saves and reloads the selected values through the existing procedures", () => {
    expect(learner).toContain("supportedLanguages: languages,");
    expect(learner).toContain("country: country || undefined,");
    expect(learner).toContain("timezone: timezone || undefined,");
    // Load path seeds state from the persisted row.
    expect(learner).toContain('setCountry(String(p.country ?? ""));');
    expect(learner).toContain('setTimezone(String(p.timezone ?? ""));');
    expect(learner).toContain("setLanguages(((p.supported_languages as string[] | null) ?? []));");
  });
});
