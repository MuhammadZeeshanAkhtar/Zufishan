/* The surah index lives in its own file because it is 114 rows, but it belongs
   to the same reference layer as countries, languages and subjects. It carries
   names and ayah counts only — never Quran text. */
export { surahs, surahOptions, surahByNumber, surahReference, ayahCount, type Surah } from "./surah-index";

/**
 * Shared reference lists for profile forms — one source for tutor and learner alike.
 *
 * Nothing here duplicates the database: the project has no country/timezone/language lookup tables,
 * and `profiles.country`, `profiles.timezone` and `profiles.supported_languages` are plain columns.
 * Subjects are NOT redefined here — they are re-exported from `categories` in lms-data, which is the
 * list Noor Ilm already recommends across course discovery and instructor profiles.
 *
 * Names come from `Intl.DisplayNames` rather than a hand-typed table, so they stay canonical and can
 * be localised; only the stable identifiers (ISO 3166-1 alpha-2, ISO 639-1, IANA) live in this file.
 */
import { categories } from "./lms-data";

export type Option = { value: string; label: string };

/** Subjects Noor Ilm already supports. Re-exported so there is exactly one list in the project. */
export const subjectOptions: string[] = [...categories];

/** Learner and teaching levels already used across the project. */
export const levelOptions = ["Beginner", "Intermediate", "Advanced", "All Levels"] as const;

/**
 * Gender vocabulary, matching the `profiles_gender_check` constraint. Stored lowercase so the
 * database value never depends on display language; the label is resolved through the catalog.
 *
 * Two values is a short list, so the forms use a plain radio group rather than a searchable
 * combobox — the country and language selectors exist because those lists run to hundreds.
 */
export const genderValues = ["male", "female"] as const;
export type Gender = (typeof genderValues)[number];
export const genderLabelKeys = { male: "gender.male", female: "gender.female" } as const;
export const isGender = (value: unknown): value is Gender =>
  typeof value === "string" && (genderValues as readonly string[]).includes(value);

/**
 * School a tutor declares teaching within, matching the `instructor_profiles_sect_check`
 * constraint. Stored as the displayed word because the values are already plain English nouns and
 * the column is on the tutor listing, not the shared profile. Null or "" means not stated.
 */
export const sectValues = ["Sunni", "Shia", "Other", "Prefer not to say"] as const;
export type Sect = (typeof sectValues)[number];

// ISO 3166-1 alpha-2. Identifiers only — display names are resolved at runtime.
const COUNTRY_CODES = [
  "AD","AE","AF","AG","AI","AL","AM","AO","AQ","AR","AS","AT","AU","AW","AX","AZ",
  "BA","BB","BD","BE","BF","BG","BH","BI","BJ","BL","BM","BN","BO","BQ","BR","BS","BT","BV","BW","BY","BZ",
  "CA","CC","CD","CF","CG","CH","CI","CK","CL","CM","CN","CO","CR","CU","CV","CW","CX","CY","CZ",
  "DE","DJ","DK","DM","DO","DZ","EC","EE","EG","EH","ER","ES","ET",
  "FI","FJ","FK","FM","FO","FR","GA","GB","GD","GE","GF","GG","GH","GI","GL","GM","GN","GP","GQ","GR","GS","GT","GU","GW","GY",
  "HK","HM","HN","HR","HT","HU","ID","IE","IM","IN","IO","IQ","IR","IS","IT",
  "JE","JM","JO","JP","KE","KG","KH","KI","KM","KN","KP","KR","KW","KY","KZ",
  "LA","LB","LC","LI","LK","LR","LS","LT","LU","LV","LY",
  "MA","MC","MD","ME","MF","MG","MH","MK","ML","MM","MN","MO","MP","MQ","MR","MS","MT","MU","MV","MW","MX","MY","MZ",
  "NA","NC","NE","NF","NG","NI","NL","NO","NP","NR","NU","NZ","OM",
  "PA","PE","PF","PG","PH","PK","PL","PM","PN","PR","PS","PT","PW","PY","QA",
  "RE","RO","RS","RU","RW","SA","SB","SC","SD","SE","SG","SH","SI","SJ","SK","SL","SM","SN","SO","SR","SS","ST","SV","SX","SY","SZ",
  "TC","TD","TF","TG","TH","TJ","TK","TL","TM","TN","TO","TR","TT","TV","TW","TZ",
  "UA","UG","UM","US","UY","UZ","VA","VC","VE","VG","VI","VN","VU","WF","WS","YE","YT","ZA","ZM","ZW",
] as const;

/**
 * Country codes deliberately omitted from the selector, as configured for this platform.
 * Kept as an explicit named constant so the choice is visible and reversible in one place.
 */
const EXCLUDED_COUNTRY_CODES = new Set(["IL"]);

function displayName(code: string, type: "region" | "language", locale = "en"): string {
  try {
    const names = new Intl.DisplayNames([locale], { type });
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * Full world country list, minus the configured exclusions, sorted by display name.
 * The stored value is the resolved country name, matching the existing free-text
 * `profiles.country` column so no migration or data rewrite is needed.
 */
export function countryOptions(locale = "en"): Option[] {
  const options: Option[] = [];
  for (const code of COUNTRY_CODES) {
    if (EXCLUDED_COUNTRY_CODES.has(code)) continue;
    const name = displayName(code, "region", locale);
    // If the runtime cannot resolve a name it returns the code itself; skip rather than
    // offering a bare two-letter code the user cannot recognise.
    if (!name || name === code) continue;
    options.push({ value: name, label: name });
  }
  return options.sort((a, b) => a.label.localeCompare(b.label, locale));
}

/**
 * Deprecated IANA names some ICU builds still report as canonical, mapped to the current names.
 * Both forms resolve to the same offset at runtime; storing the modern name keeps the value stable
 * regardless of which ICU version produced it. Applying this to an already-modern name is a no-op,
 * so it is safe on engines that already return the new names.
 */
const MODERN_ZONE_NAMES: Record<string, string> = {
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Rangoon": "Asia/Yangon",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Asia/Thimbu": "Asia/Thimphu",
  "Europe/Kiev": "Europe/Kyiv",
  "Europe/Uzhgorod": "Europe/Kyiv",
  "Europe/Zaporozhye": "Europe/Kyiv",
  "Atlantic/Faeroe": "Atlantic/Faroe",
  "America/Buenos_Aires": "America/Argentina/Buenos_Aires",
  "America/Godthab": "America/Nuuk",
  "Pacific/Ponape": "Pacific/Pohnpei",
  "Pacific/Truk": "Pacific/Chuuk",
};

/** Normalises a zone identifier to its current IANA name. */
export function canonicalZone(zone: string): string {
  return MODERN_ZONE_NAMES[zone] ?? zone;
}

/** Country name -> ISO alpha-2, built from the same source the selector uses. */
function countryCodeByName(locale = "en"): Map<string, string> {
  const map = new Map<string, string>();
  for (const code of COUNTRY_CODES) {
    if (EXCLUDED_COUNTRY_CODES.has(code)) continue;
    const name = displayName(code, "region", locale);
    if (name && name !== code) map.set(name, code);
  }
  return map;
}

/**
 * Timezones for one country, from the runtime's own CLDR data via `Intl.Locale.getTimeZones()`.
 *
 * Returns an empty array when the country is unknown, has no zone data (a couple of uninhabited
 * territories) or the engine lacks the API — callers treat empty as "fall back to the full list"
 * rather than showing the user an empty dropdown.
 */
export function timezonesForCountry(countryName: string, locale = "en"): Option[] {
  const code = countryCodeByName(locale).get(countryName.trim());
  if (!code) return [];
  let zones: string[] = [];
  try {
    const withTimeZones = new Intl.Locale(`und-${code}`) as Intl.Locale & { getTimeZones?: () => string[] };
    zones = typeof withTimeZones.getTimeZones === "function" ? withTimeZones.getTimeZones() ?? [] : [];
  } catch { zones = []; }
  const unique = Array.from(new Set(zones.map(canonicalZone)));
  return unique
    .map((zone) => ({ value: zone, label: zone.replace(/_/g, " ") }))
    .sort((a, b) => a.value.localeCompare(b.value));
}

/**
 * The timezone options to offer for a country: its own zones, or the full list when the country is
 * empty or has no zone data. Keeps both profile forms behaving identically.
 */
export function timezoneOptionsForCountry(countryName: string, locale = "en"): Option[] {
  const scoped = countryName.trim() ? timezonesForCountry(countryName, locale) : [];
  return scoped.length ? scoped : timezoneOptions();
}

/**
 * The timezone to hold after a country change.
 *  - one zone  -> select it automatically
 *  - many      -> keep the current value if it belongs to the new country, otherwise clear it so
 *                 the user picks rather than silently keeping a zone from the previous country
 *  - unknown   -> leave the current value alone; the full list is still on offer
 */
export function nextTimezoneForCountry(countryName: string, currentTimezone: string, locale = "en"): string {
  const zones = timezonesForCountry(countryName, locale);
  if (!zones.length) return currentTimezone;
  if (zones.length === 1) return zones[0].value;
  return zones.some((zone) => zone.value === currentTimezone) ? currentTimezone : "";
}

/**
 * Every IANA zone the runtime knows about. `Intl.supportedValuesOf` avoids shipping and ageing a
 * hand-maintained list; the short fallback only applies on engines that lack it.
 */
export function timezoneOptions(): Option[] {
  let zones: string[] = [];
  try {
    const supported = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    if (typeof supported === "function") zones = supported("timeZone");
  } catch { zones = []; }
  if (!zones.length) {
    zones = [
      "Africa/Cairo", "Africa/Lagos", "America/Chicago", "America/Los_Angeles", "America/New_York",
      "Asia/Dhaka", "Asia/Dubai", "Asia/Istanbul", "Asia/Jakarta", "Asia/Karachi", "Asia/Kolkata",
      "Asia/Riyadh", "Australia/Sydney", "Europe/Berlin", "Europe/London", "Europe/Paris", "UTC",
    ];
  }
  const unique = Array.from(new Set(zones.map(canonicalZone)));
  return unique.map((zone) => ({ value: zone, label: zone.replace(/_/g, " ") })).sort((a, b) => a.value.localeCompare(b.value));
}

// ISO 639-1 for languages commonly taught or spoken across the platform's audience.
const LANGUAGE_CODES = [
  "ar","bn","zh","nl","en","fa","fr","de","gu","ha","hi","id","it","ja","jv","kk","km","ko","ku","ms",
  "ml","mr","ne","no","ps","fa-AF","pl","pt","pa","ro","ru","sd","si","so","es","sw","sv","ta","te",
  "th","tr","uk","ur","uz","vi","yo","zu",
] as const;

/** Broad language list for teaching and spoken languages, resolved to readable names. */
export function languageOptions(locale = "en"): Option[] {
  const seen = new Set<string>();
  const options: Option[] = [];
  for (const code of LANGUAGE_CODES) {
    const label = displayName(code, "language", locale);
    if (!label || label === code || seen.has(label)) continue;
    seen.add(label);
    options.push({ value: label, label });
  }
  return options.sort((a, b) => a.label.localeCompare(b.label, locale));
}
