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
  return zones.map((zone) => ({ value: zone, label: zone.replace(/_/g, " ") })).sort((a, b) => a.value.localeCompare(b.value));
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
