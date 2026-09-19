/**
 * No regex literal in the source may carry a doubled backslash before a character class.
 *
 * `/^\\d{2}:\\d{2}$/` is a valid regular expression and matches nothing anybody types: it asks for a
 * literal backslash followed by "d". Inside a string `"\\d"` is the correct way to write it, which
 * is why the mistake survives review — and why it is worth a scan rather than an eye.
 *
 * It cost this project three working features. `createAvailability` and `updateAvailability` both
 * validated their times with it, so every hour a teacher tried to open was refused before the
 * server function ran: the availability table was empty for every instructor, and the timetable on
 * every public profile therefore showed an empty week. `validIsoDate` in supabase-core carried the
 * same pattern, so creating a Hifz plan or logging a memorisation record failed the same way.
 *
 * The scan is cheap and the false-positive rate is zero today, so it stays strict: any new one fails
 * here rather than in a user's hands months later.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const SOURCE_ROOTS = ["server", join("client", "src"), "shared"];

/** A JavaScript regex literal: not a division, not a comment, with classes and escapes skipped. */
const LITERAL = /(?<![A-Za-z0-9_)\]])\/(?!\/|\*)(?:\\.|\[[^\]\n]*\]|[^/\\\n])+\/[gimsuy]*/g;
/** A doubled backslash in front of a class letter — the shape that matches a backslash, not a digit. */
const DOUBLED = /\\\\[dwsSWDbB]/;

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) { found.push(...sourceFiles(path)); continue; }
    if (/\.tsx?$/.test(entry) && !entry.includes(".test.")) found.push(path);
  }
  return found;
}

describe("regex literals escape their character classes once", () => {
  const files = SOURCE_ROOTS.flatMap((root) => sourceFiles(join(ROOT, root)));

  it("scans a real body of source, so a pass means something", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("finds no doubled backslash inside any regex literal", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(LITERAL)) {
        if (!DOUBLED.test(match[0])) continue;
        const line = text.slice(0, match.index).split("\n").length;
        offenders.push(`${file.slice(ROOT.length)}:${line} ${match[0].slice(0, 60)}`);
      }
    }
    expect(offenders, `doubled escapes match a backslash, not a class:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("would still catch the three that shipped", () => {
    // The scan is only worth keeping if it fails on the exact strings that got through.
    for (const shipped of [
      "z.string().regex(/^\\\\d{2}:\\\\d{2}$/)",
      "/^\\\\d{4}-\\\\d{2}-\\\\d{2}$/.test(value)",
    ]) {
      const found = [...shipped.matchAll(LITERAL)].some((match) => DOUBLED.test(match[0]));
      expect(found, `${shipped} should be caught`).toBe(true);
    }
    // And leaves a correctly written one alone, in a literal and in a string.
    expect([...'const ok = /^\\d{2}:\\d{2}$/;'.matchAll(LITERAL)].some((m) => DOUBLED.test(m[0]))).toBe(false);
    expect([...'const inString = "\\\\d";'.matchAll(LITERAL)].some((m) => DOUBLED.test(m[0]))).toBe(false);
  });
});

describe("the two validators that were broken by it", () => {
  const routers = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
  const core = readFileSync(new URL("./supabase-core.ts", import.meta.url), "utf8");

  it("accepts a time an <input type=\"time\"> actually produces", () => {
    const pattern = /^\d{2}:\d{2}$/;
    expect(routers.match(/z\.string\(\)\.regex\(\/\^\\d\{2\}:\\d\{2\}\$\/\)/g)).toHaveLength(4);
    for (const value of ["22:30", "00:00", "09:05", "23:59"]) expect(pattern.test(value)).toBe(true);
    for (const value of ["9:05", "10:30 PM", "", "22:30:00"]) expect(pattern.test(value)).toBe(false);
  });

  it("accepts a date a <input type=\"date\"> actually produces", () => {
    expect(core).toContain("/^\\d{4}-\\d{2}-\\d{2}$/.test(value)");
    const pattern = /^\d{4}-\d{2}-\d{2}$/;
    expect(pattern.test("2026-09-17")).toBe(true);
    expect(pattern.test("17/09/2026")).toBe(false);
  });
});
