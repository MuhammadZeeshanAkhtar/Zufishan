/**
 * Saving the hours a teacher opens for booking.
 *
 * The public timetable is drawn entirely from `instructor_availability`, so an empty grid on a
 * profile is either a teacher who has set no hours or a save that never worked. It was the second:
 *
 *  - `createAvailabilityInterval` demanded a date for any interval whose `exceptionType` was not
 *    literally "weekly", while the insert two lines below defaulted a missing type TO weekly. The
 *    availability page sent no type, so every weekly interval it saved was refused for want of a
 *    date it had no reason to send.
 *  - `updateAvailabilityInterval` merged a camelCase input over a snake_case row, so an edit wrote
 *    the stored values back over themselves and answered ok.
 *  - The page awaited both results and read neither, so either refusal surfaced as "Draft saved."
 *
 * Each of the three is pinned here.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const scheduling = readFileSync(new URL("./scheduling.ts", import.meta.url), "utf8");
const routers = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../client/src/components/InstructorManagement.tsx", import.meta.url), "utf8");
const editor = page.slice(page.indexOf("export function InstructorAvailability"), page.indexOf("export function InstructorSettings"));

describe("a weekly interval is not asked for a date", () => {
  const create = scheduling.slice(
    scheduling.indexOf("export async function createAvailabilityInterval"),
    scheduling.indexOf("export async function updateAvailabilityInterval"),
  );

  it("reads the type the same way the insert writes it", () => {
    expect(create).toContain('const exceptionType = input.exceptionType ?? "weekly";');
    expect(create).toContain('if (exceptionType !== "weekly" && !input.availableOn)');
    expect(create).toContain("exception_type: exceptionType");
    // The old pair, where the guard and the insert disagreed about a missing type.
    expect(create).not.toContain('input.exceptionType !== "weekly" && !input.availableOn');
    expect(create).not.toContain('exception_type: input.exceptionType ?? "weekly"');
  });

  it("is the branch a default would take, so the two can be compared directly", () => {
    // The guard is pure logic over one field: with no type supplied it must fall to "weekly".
    const asWritten = (exceptionType: string | undefined, availableOn: string | undefined) => {
      const resolved = exceptionType ?? "weekly";
      return resolved !== "weekly" && !availableOn;
    };
    expect(asWritten(undefined, undefined)).toBe(false);
    expect(asWritten("weekly", undefined)).toBe(false);
    expect(asWritten("date_exception", undefined)).toBe(true);
    expect(asWritten("date_exception", "2026-10-01")).toBe(false);
  });
});

describe("an edit changes the row it was given", () => {
  const update = scheduling.slice(
    scheduling.indexOf("export async function updateAvailabilityInterval"),
    scheduling.indexOf("export async function deleteAvailabilityInterval"),
  );

  it("maps each camelCase field onto its column instead of spreading one shape over the other", () => {
    expect(update).not.toContain("const next = { ...existing, ...input };");
    for (const pair of [
      "{ start_local: input.startLocal }",
      "{ end_local: input.endLocal }",
      "{ buffer_minutes: input.bufferMinutes }",
      "{ minimum_notice_minutes: input.minimumNoticeMinutes }",
      "{ exception_type: input.exceptionType }",
      "{ available_on: input.availableOn }",
      "{ is_break: input.isBreak }",
    ]) {
      expect(update, `${pair} must be mapped across`).toContain(pair);
    }
  });

  it("still refuses a weekday outside the week", () => {
    expect(update).toContain("next.weekday < 0 || next.weekday > 6");
  });

  it("stays scoped to the owner on both the read and the write", () => {
    expect(update.match(/\.eq\("instructor_id", identity\.id\)/g)?.length).toBeGreaterThanOrEqual(2);
  });
});

describe("the page says what actually happened", () => {
  it("reads the result instead of treating every answered request as a save", () => {
    expect(editor).toContain("if (!result.ok) { setFailure(result.error || t(\"availability.saveFailed\")); return; }");
    // "Draft saved." belonged to the course builder and was never about availability.
    expect(editor).not.toContain('t("courseStudio.draftSaved")');
    expect(editor).toContain('t("availability.saved")');
  });

  it("names the interval type it is sending", () => {
    expect(editor).toContain('exceptionType: "weekly" as const');
    expect(routers).toContain('exceptionType: z.enum(["weekly", "date_exception", "br');
  });

  it("offers the seven days instead of accepting any word for one", () => {
    // A free-text day fell through `Math.max(0, indexOf(...))` to Sunday whenever it was misspelled,
    // which stored hours on a day the teacher never chose.
    expect(editor).toContain('aria-label={t("availability.day")}');
    expect(editor).toContain("value={Math.max(0, dayNames.indexOf(interval.day))}");
    expect(editor).toContain("dayNames.map((name, index) => (");
  });

  it("saves on the clock the profile advertises, so the timetable matches it", () => {
    expect(editor).toContain("const stored = rows?.profile?.timezone?.trim();");
    expect(editor).toContain("timezone: profileTimezone");
    expect(editor).toContain('t("availability.timezoneNote", { timezone: profileTimezone })');
    // The old default put every new interval in one country's zone whoever the teacher was.
    expect(editor).not.toContain('timezone: "Asia/Karachi"');
  });

  it("gives a draft a key that stays unique after one is removed", () => {
    // `draft-${current.length + 1}` repeated an id as soon as a row was deleted and another added.
    expect(editor).toContain("id: `draft-${Date.now()}-${current.length}`");
  });
});
