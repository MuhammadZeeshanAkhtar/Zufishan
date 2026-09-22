/**
 * The Schedule module, and the reason it was blank.
 *
 * The page read `class_sessions` and nothing else, and drew a pill reading "Calendar view · coming
 * soon" where the calendar was meant to be. Both halves were wrong, but only the first was a bug:
 * a lesson on this project lives in `trial_requests` while it is being arranged, moves to
 * `bookings` when it is agreed, and only reaches `class_sessions` when somebody opens a room. A
 * teacher with three accepted invites therefore had three rows and saw none of them.
 *
 * Reading all three creates the failure mode this file mostly exists to guard: **the same lesson
 * appearing three times**, because a booking and a session both carry the `trial_request_id` they
 * came from. The merge is the one real decision here, so it is a pure function and it is tested as
 * one rather than asserted about as a string.
 *
 * The second guard is the one this project keeps coming back to: a calendar that swallowed a
 * failed read would draw a clear week, and a teacher would believe it. Silence is not an empty
 * schedule.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mergeScheduleRows, type ScheduleEntry, type ScheduleEntryKind } from "./schedule-calendar";

const server = readFileSync(new URL("./schedule-calendar.ts", import.meta.url), "utf8");
const routers = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const calendar = readFileSync(new URL("../client/src/components/ScheduleCalendar.tsx", import.meta.url), "utf8");
const experience = readFileSync(new URL("../client/src/components/SchedulingExperience.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../client/src/index.css", import.meta.url), "utf8");
const catalog = readFileSync(new URL("../client/src/i18n/catalog.ts", import.meta.url), "utf8");

const codeOnly = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, " ");

/** A row of whichever kind, carrying only the fields the merge actually reads. */
function row(kind: ScheduleEntryKind, id: string, trialRequestId: string | null): ScheduleEntry {
  return {
    id, kind, title: `${kind} ${id}`, subject: "Tajweed", status: "confirmed",
    startAt: "2026-10-01T10:00:00.000Z", endAt: "2026-10-01T11:00:00.000Z",
    learnerTimezone: "Asia/Karachi", instructorTimezone: "Europe/London",
    counterpartId: "counterpart", person: null,
    sessionId: kind === "session" ? id : null,
    bookingId: kind === "booking" ? id : null,
    trialRequestId,
  };
}

describe("one lesson is one entry", () => {
  it("collapses the three rows a single agreed lesson leaves behind", () => {
    const merged = mergeScheduleRows([
      row("trial", "t1", "t1"),
      row("booking", "b1", "t1"),
      row("session", "s1", "t1"),
    ]);
    expect(merged).toHaveLength(1);
    // A room beats a confirmation, and a confirmation beats a negotiation.
    expect(merged[0].kind).toBe("session");
  });

  it("does not depend on the order the tables were read in", () => {
    const forwards = mergeScheduleRows([row("session", "s1", "t1"), row("booking", "b1", "t1")]);
    const backwards = mergeScheduleRows([row("booking", "b1", "t1"), row("session", "s1", "t1")]);
    expect(forwards[0].kind).toBe("session");
    expect(backwards[0].kind).toBe("session");
  });

  it("keeps the ids of the rows it displaced, so every link still leads somewhere", () => {
    const [entry] = mergeScheduleRows([
      row("trial", "t1", "t1"),
      row("booking", "b1", "t1"),
      row("session", "s1", "t1"),
    ]);
    expect(entry.sessionId).toBe("s1");
    expect(entry.bookingId).toBe("b1");
    expect(entry.trialRequestId).toBe("t1");
  });

  it("never merges two lessons that only share a kind", () => {
    const merged = mergeScheduleRows([row("trial", "t1", "t1"), row("trial", "t2", "t2")]);
    expect(merged).toHaveLength(2);
  });

  it("leaves a session with no trial behind it standing on its own", () => {
    // A course session scheduled directly has no trial request to be keyed on.
    const merged = mergeScheduleRows([row("session", "s1", null), row("session", "s2", null)]);
    expect(merged.map((entry) => entry.id)).toEqual(["s1", "s2"]);
  });
});

describe("it reads all three tables, which is the whole fix", () => {
  it("asks each of them, not just the one the page used to read", () => {
    for (const table of ["class_sessions", "bookings", "trial_requests"]) {
      expect(server, table).toContain(`.from("${table}")`);
    }
  });

  it("matches the caller by the column their role puts them in", () => {
    expect(server).toContain('const own = role === "learner" ? "learner_id" : "instructor_id";');
    expect(server).toContain('const other = role === "learner" ? "instructor_id" : "learner_id";');
    expect(server).toContain(".eq(own, identity.id)");
  });

  it("uses the offered time for a trial once one was proposed", () => {
    expect(server).toContain("String(value.proposed_start_at ?? value.requested_start_at ?? \"\")");
    // A rejected or cancelled invite is not a plan, and a draft was never sent.
    expect(server).toContain('const LIVE_TRIAL_STATUSES = ["pending", "proposed", "accepted"];');
    for (const dead of ["rejected", "cancelled", "expired"]) {
      expect(server.slice(server.indexOf("const LIVE_SESSION_STATUSES"), server.indexOf("const CONCRETENESS")), dead)
        .not.toContain(`"${dead}"`);
    }
  });
});

describe("the boundaries it reads inside", () => {
  it("reads every table on the caller's own client", () => {
    expect(server).toContain("const client = getSupabaseUserClient(identity.accessToken);");
    // The admin client appears nowhere; the one elevated read is the shared, bounded name lookup.
    expect(codeOnly(server)).not.toContain("getSupabaseAdminClient");
    expect(server).toContain('import { peopleByIds, type InvitePerson } from "./invite-desk";');
  });

  it("writes nothing", () => {
    for (const write of [".insert(", ".update(", ".delete(", ".upsert(", ".rpc("]) {
      expect(codeOnly(server), `schedule-calendar must not ${write}`).not.toContain(write);
    }
  });

  it("refuses a range wide enough to be a history rather than a calendar", () => {
    expect(server).toContain("const MAX_RANGE_DAYS = 186;");
    expect(server).toContain("if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * 86_400_000) return null;");
    expect(server).toContain('if (!window) return fail("Choose a valid date range.");');
  });

  it("asks for a teacher's weekly hours, and does not ask a learner for hours they do not have", () => {
    expect(server).toContain('role === "instructor"');
    expect(server).toContain('client.from("instructor_availability")');
  });
});

describe("silence is not an empty schedule", () => {
  it("reports a failed table instead of drawing a clear week", () => {
    const guard = server.slice(server.indexOf("for (const [label, result] of"), server.indexOf("if (availability.error)"));
    expect(guard).toContain('return fail("Your schedule could not be loaded.");');
    for (const table of ["sessions", "bookings", "trials"]) {
      expect(guard, table).toContain(`"${table}"`);
    }
  });

  it("lets the weekly pattern fail without losing the month", () => {
    // The pattern is context beside the entries; the entries are the page.
    const guard = server.slice(server.indexOf("if (availability.error)"), server.indexOf("const rows: ScheduleEntry[]"));
    expect(guard).toContain("console.error");
    expect(guard).not.toContain("return fail");
  });
});

describe("the page that draws it", () => {
  it("replaced the promise rather than sitting beside it", () => {
    // Stripped of comments: the route's own doc comment names the pill it replaced.
    expect(codeOnly(experience)).not.toContain("Calendar view · coming soon");
    expect(experience).toContain('<ScheduleCalendar role={instructor ? "instructor" : "learner"}/>');
    // The one read the page used to make, now made by the calendar through its own procedure.
    expect(routers).toContain("scheduleCalendar: supabaseOnlyProcedure");
    expect(routers).toContain("listScheduleEntries(ctx.supabaseIdentity, input.role, input)");
  });

  it("draws the month even when nothing is on it", () => {
    /*
     * `resultState` calls an empty list "empty", and a panel that renders an empty state instead
     * of a grid hides the one thing somebody opened Schedule to see. Only a real failure, a
     * missing configuration or a refusal may replace the calendar.
     */
    expect(calendar).toContain('const broken = state === "loading" || state === "error" || state === "offline" || state === "setup" || state === "forbidden";');
    expect(calendar).toContain('t("schedule.nothingOnDay")');
  });

  it("places a day in the reader's own calendar, not in UTC", () => {
    expect(calendar).toContain("const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;");
    expect(calendar).toContain('t("schedule.inYourZone")');
    // And prints the other person's time beside it, so nobody does the subtraction themselves.
    expect(calendar).toContain('t("schedule.theirTime")');
  });

  it("starts the week on Monday and keeps the grid one height", () => {
    expect(calendar).toContain("return addDays(date, -((date.getDay() + 6) % 7));");
    expect(calendar).toContain("Array.from({ length: 42 }, (_, index) => addDays(first, index));");
  });

  it("says a weekday has published hours without claiming the day is free", () => {
    expect(calendar).toContain('role === "instructor" && openWeekdays.has(day.getDay()) && items.length === 0');
    expect(calendar).toContain('t("schedule.noWeeklyHours")');
  });

  it("reads weekday 0 as Sunday, the way the availability editor writes it", () => {
    /*
     * `instructor_availability.weekday` uses `getDay()` numbering — the editor's day list starts
     * at Sunday — while this grid starts on Monday. Getting the rotation wrong would shift every
     * published hour by a day, which nobody would notice until a learner booked the wrong one.
     */
    expect(calendar).toContain("openWeekdays.has(day.getDay())");
    expect(calendar).toContain("weekdayNames[(slot.weekday + 6) % 7]");
  });
});

describe("colour means the same thing here as it does on the rail", () => {
  it("takes its tones from the shared tokens instead of its own hexes", () => {
    expect(codeOnly(calendar)).not.toMatch(/#[0-9a-fA-F]{6}\b/);
    for (const tone of ["learn", "people", "room", "money", "account"]) {
      expect(css, tone).toContain(`--ni-tone-${tone}-bg:`);
      expect(css, tone).toContain(`--ni-tone-${tone}-fill:`);
    }
    // Declared for both themes, so neither renders one theme's ink on the other's ground.
    expect(css.match(/--ni-tone-learn-bg:/g)).toHaveLength(2);
  });

  it("still tints the sidebar from the same tokens", () => {
    expect(css).toContain(".ni-rail-tile--learn   { background: var(--ni-tone-learn-bg);   color: var(--ni-tone-learn-ink); }");
    expect(css).toContain(".ni-rail-item--active .ni-rail-tile--room    { background: var(--ni-tone-room-fill);    color: var(--ni-tone-room-on); }");
  });

  it("gives each kind a chip, a swatch and an edge in the same tone", () => {
    for (const tone of ["session", "booking", "trial"]) {
      expect(css, tone).toContain(`.ni-cal-chip--${tone}`);
      expect(css, tone).toContain(`.ni-cal-swatch--${tone}`);
      expect(css, tone).toContain(`.ni-cal-edge--${tone}`);
    }
  });
});

describe("it is written in all three languages", () => {
  const KEYS = [
    "schedule.titleInstructor", "schedule.titleLearner", "schedule.today", "schedule.prevMonth",
    "schedule.nextMonth", "schedule.inYourZone", "schedule.kindSession", "schedule.kindBooking",
    "schedule.kindTrial", "schedule.more", "schedule.nothingOnDay", "schedule.openRoom",
    "schedule.openInvite", "schedule.theirTime", "schedule.status", "schedule.weeklyHours",
    "schedule.noWeeklyHours", "schedule.setHours", "schedule.findTeacher",
  ];

  it("has every key in en, ur and ar", () => {
    for (const key of KEYS) {
      expect(catalog.match(new RegExp(`"${key.replace(/\./g, "\\.")}":`, "g")), key).toHaveLength(3);
    }
  });

  it("keeps the count placeholder in every language", () => {
    const more = catalog.match(/"schedule\.more": "((?:[^"\\]|\\.)*)"/g) ?? [];
    expect(more).toHaveLength(3);
    for (const line of more) expect(line, line).toContain("{count}");
  });

  it("hardcodes no English in the calendar itself", () => {
    // Every visible string goes through `t`. The only literals left are class names and ids.
    expect(calendar).not.toMatch(/>[A-Z][a-z]+ [a-z]+</);
  });
});
