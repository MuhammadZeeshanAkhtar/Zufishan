/**
 * The week of open times a learner sees on a teacher's public profile.
 *
 * Two things are checked here. The slot math is exercised directly, because it was wrong: only the
 * window starting at the interval's first minute was ever offered, while `slotWithinAvailability`
 * — the check that runs when the invite is submitted — accepts any window inside the interval. A
 * learner could therefore be shown one time on a three-hour evening and be refused nothing if they
 * asked for another. The rest is the boundary: the profile reads a public procedure, that procedure
 * returns times and nothing else, and the page still refuses to claim a presence it does not track.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { slotStartsInInterval } from "./scheduling";

const scheduling = readFileSync(new URL("./scheduling.ts", import.meta.url), "utf8");
const routers = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const calendar = readFileSync(new URL("../client/src/components/InstructorAvailabilityCalendar.tsx", import.meta.url), "utf8");
const profile = readFileSync(new URL("../client/src/components/InstructorManagement.tsx", import.meta.url), "utf8");

const clock = (value: Date, timezone: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false }).format(value);

describe("open times inside one availability interval", () => {
  it("offers every window that fits, not only the first", () => {
    const starts = slotStartsInInterval("2026-09-16", "18:00", "21:00", "Asia/Karachi", 30);
    expect(starts.map((start) => clock(start, "Asia/Karachi"))).toEqual([
      "18:00", "18:30", "19:00", "19:30", "20:00", "20:30",
    ]);
  });

  it("stops where a lesson would run past the end of the interval", () => {
    // 18:00-19:00 holds one 45-minute lesson; a second would end at 19:30.
    expect(slotStartsInInterval("2026-09-16", "18:00", "19:00", "Asia/Karachi", 45)).toHaveLength(1);
    // And an interval shorter than the lesson holds none at all, rather than one that overruns.
    expect(slotStartsInInterval("2026-09-16", "18:00", "18:30", "Asia/Karachi", 60)).toHaveLength(0);
  });

  it("keeps the instructor's wall clock across a daylight-saving change", () => {
    // Europe/London moves to GMT on 25 October 2026. The evening still reads 18:00 locally, and
    // each step is an hour of the clock the instructor keeps, not a fixed offset from UTC.
    const starts = slotStartsInInterval("2026-10-25", "18:00", "20:00", "Europe/London", 60);
    expect(starts.map((start) => clock(start, "Europe/London"))).toEqual(["18:00", "19:00"]);
    expect(starts[0].toISOString()).toBe("2026-10-25T18:00:00.000Z");
  });

  it("returns nothing for an interval it cannot read", () => {
    expect(slotStartsInInterval("2026-09-16", "not-a-time", "21:00", "Asia/Karachi", 30)).toHaveLength(0);
  });
});

describe("the public schedule boundary", () => {
  it("is reachable without an account, because the profile that carries it is", () => {
    expect(routers).toContain("instructorSchedule: publicProcedure");
    expect(scheduling).toContain("export async function getPublicInstructorSchedule");
  });

  it("serves only a published, approved instructor", () => {
    const fn = scheduling.slice(scheduling.indexOf("export async function getPublicInstructorSchedule"));
    expect(fn).toContain('data.public_profile_status !== "published"');
    expect(fn).toContain('"FORBIDDEN"');
  });

  it("returns times, and nothing about who holds the rest of the calendar", () => {
    const fn = scheduling.slice(
      scheduling.indexOf("async function openSlotsWithin"),
      scheduling.indexOf("function checkSlotWindow"),
    );
    // Bookings are counted so free/busy is true, but no booking, learner or session leaves here.
    expect(fn).toContain("scheduled_start_at,scheduled_end_at,status");
    expect(fn).not.toContain("learner_id");
    expect(fn).not.toMatch(/slots\.push\([^)]*\bid\b/);
  });

  it("caps the range, so one request cannot ask the server to walk a year", () => {
    expect(scheduling).toContain("checkSlotWindow(input, 31)");
    expect(scheduling).toContain("const SLOT_CAP = 2000;");
  });
});

describe("the calendar a learner reads", () => {
  it("draws the whole grid on the teacher's own clock, the one printed on the profile", () => {
    // Not a control the reader operates: the timetable and the TIME ZONE line on the same page
    // would otherwise be free to disagree about which clock the week is written on.
    expect(calendar).toContain("const timezone = validZone(instructorTimezone) ?? \"UTC\";");
    expect(calendar).not.toContain("setTimezone");
    expect(calendar).not.toContain("SearchableSelect");
    // Week, rows and cells all follow that one zone.
    expect(calendar).toContain("}, [timezone, weekOffset]);");
    expect(calendar).toContain("}, [slots, days, timezone]);");
  });

  it("falls back to UTC rather than rendering a week against a zone the runtime cannot read", () => {
    const fn = calendar.slice(calendar.indexOf("function validZone"));
    expect(fn.slice(0, 400)).toContain("catch { return null; }");
  });

  it("names the zone the times are written in, and says when it is the reader's own", () => {
    const catalog = readFileSync(new URL("../client/src/i18n/catalog.ts", import.meta.url), "utf8");
    expect(catalog).toContain('"tutorSchedule.timezoneNote": "Times are shown in {timezone}."');
    expect(calendar).toContain('timezone === ownTimezone ? ` · ${t("tutorSchedule.yourTimezone")}` : ""');
    // And the reader's own clock appears on the slot they pick, where they need it to decide.
    expect(calendar).toContain('t("tutorSchedule.yourClock"');
    expect(calendar).toContain("{ownTimezone !== timezone && (");
  });

  it("prepares the invite on the reader's clock, since the invite is theirs", () => {
    expect(calendar).toContain("tz: ownTimezone");
    const flow = readFileSync(new URL("../client/src/components/SchedulingExperience.tsx", import.meta.url), "utf8");
    expect(flow).toContain('const zone = validZone(params.get("tz")) ?? viewerTimezone();');
    expect(flow).toContain("learnerTimezone: valid ? zone : current.learnerTimezone");
  });

  it("draws the whole day, so the week reads as a timetable rather than a shortlist", () => {
    expect(calendar).toContain('Array.from({ length: 48 }, (_, index) =>');
    // A 45-minute lesson starts at 18:45, which is not on the half hour; it still gets a row.
    expect(calendar).toContain("if (Number(time.slice(3)) % 30 !== 0) extra.add(time);");
  });

  it("asks for a day either side of the week, because the server walks the teacher's dates", () => {
    expect(calendar).toContain("startDate: shiftDays(days[0], -1), endDate: shiftDays(days[6], 1)");
    expect(calendar).toContain("if (!visible.has(day)) continue;");
  });

  it("renders an empty week as empty rather than as a grid of open cells", () => {
    expect(calendar).toContain('t("tutorSchedule.none")');
    // The row list is always 48 long now, so emptiness is a question about the cells.
    expect(calendar).toContain("byCell.size === 0");
  });

  it("carries the chosen time into the invite instead of starting the form blank", () => {
    expect(calendar).toContain("startAt: picked.slot.startAt, durationMinutes: String(picked.slot.durationMinutes)");
    expect(calendar).toContain("/trial/request?");
    // Signing in is a step on the way to the same time, not a dead end.
    expect(calendar).toContain("/login?returnTo=");
  });

  it("shows the hour under the pointer without asking for a click", () => {
    expect(calendar).toContain('onPointerEnter={(event) => { if (event.pointerType === "mouse") openAt(slot, event.currentTarget); }}');
    // Touch has no hover and a keyboard has no pointer, so neither is left without a way in.
    expect(calendar).toContain("onFocus={(event) => openAt(slot, event.currentTarget)}");
    expect(calendar).toContain("onClick={(event) => { openAt(slot, event.currentTarget); setPinned(true); }}");
  });

  it("opens above the hour, and flips below only where there is no room", () => {
    expect(calendar).toContain("const above = rect.top - box.top > CARD_CLEARANCE;");
    expect(calendar).toContain("top: above ? rect.top - box.top - 6 : rect.bottom - box.top + 6,");
    expect(calendar).toContain('picked.above ? "-translate-y-full" : ""');
  });

  it("does not make the gap between an hour and its card a trap", () => {
    // Leaving the cell starts a short timer rather than closing at once, and entering the card
    // cancels it, so the pointer can cross the six pixels between them.
    expect(calendar).toContain("const CLOSE_DELAY = 160;");
    expect(calendar).toContain("onPointerEnter={cancelClose}");
    expect(calendar).toContain("closing.current = window.setTimeout(");
    // A click holds it open; hovering away no longer closes what someone deliberately opened.
    expect(calendar).toContain("if (event.pointerType === \"mouse\" && !pinned) closeSoon();");
    // And the timer cannot outlive the component.
    expect(calendar).toContain("useEffect(() => () => { if (closing.current !== null) window.clearTimeout(closing.current); }, []);");
  });

  it("opens the details on the cell that was clicked, not somewhere else on the page", () => {
    // The card is placed from the cell's own rectangle, so the time it names and the cell it came
    // from are one thing rather than two to match up by eye.
    expect(calendar).toContain("const rect = cell.getBoundingClientRect();");
    // Placement itself is covered above; what matters here is that it is measured from the cell.
    expect(calendar).toContain("const centre = rect.left - box.left + rect.width / 2;");
    // Clamped, so a Sunday cell at the edge does not push the card off the page.
    expect(calendar).toContain("Math.min(Math.max(centre, 132)");
    // It sits outside the sideways scroller, which has overflow set and would clip it.
    expect(calendar).toContain('<div ref={frame} className="relative">');
  });

  it("closes the card rather than letting it drift away from its cell", () => {
    for (const trigger of ['node?.addEventListener("scroll", close', 'window.addEventListener("resize", close)', 'window.addEventListener("keydown", onKey)']) {
      expect(calendar, `${trigger} should close the card`).toContain(trigger);
    }
    expect(calendar).toContain('if (event.key === "Escape") close();');
    // And every listener is taken off again when the card closes.
    expect(calendar).toContain('node?.removeEventListener("scroll", close);');
  });

  it("lets the timetable run its full height instead of hiding hours in a second scrollbar", () => {
    expect(calendar).not.toContain("max-h-[32rem]");
    expect(calendar).toContain('className="mt-5 overflow-x-auto rounded-2xl border border-[var(--ni-sage)]"');
  });
});

describe("what the profile page shows a learner", () => {
  it("mounts the calendar on the public profile", () => {
    expect(profile).toContain("<InstructorAvailabilityCalendar slug={slug} instructorName={name} instructorTimezone={profile.timezone} />");
  });

  it("lists the stored teaching details rather than a paragraph about them", () => {
    for (const key of ["tutorProfile.courses", "marketplace.level", "discovery.languages", "gender.label", "discovery.sect", "discovery.ijazah"]) {
      expect(profile, `${key} should appear in the detail rows`).toContain(`t("${key}")`);
    }
  });

  it("drops a detail with nothing behind it instead of printing a dash", () => {
    expect(profile).toContain("if (profile.has_ijazah) details.push");
    expect(profile).toContain("if (profile.availability_summary) details.push");
  });

  it("does not dress a learner's page in the instructor's own desk navigation", () => {
    const body = profile.slice(profile.indexOf("export function PublicInstructorProfile"));
    expect(body).not.toContain("<Frame>");
  });

  it("claims no presence, because none is recorded", () => {
    expect(profile).not.toMatch(/\bOnline\b/);
    expect(calendar).not.toMatch(/\bOnline\b/);
  });
});

describe("the timetable reads as a timetable in both themes", () => {
  const css = readFileSync(new URL("../client/src/index.css", import.meta.url), "utf8");

  it("draws one grid from the theme's own border token", () => {
    expect(calendar).toContain('className="ni-timetable min-w-[720px] text-center"');
    expect(css).toContain(".ni-timetable th, .ni-timetable td { border: 1px solid var(--ni-sage); padding: 0; }");
    // Head and time column share the recessed ground, so the week frames its own data.
    expect(css).toContain(".ni-timetable thead th {");
    expect(css).toContain(".ni-timetable tbody th {");
  });

  it("fills an open hour with gold, taken from tokens rather than written as a colour", () => {
    const slot = css.slice(css.indexOf(".ni-slot {"), css.indexOf(".ni-slot:hover"));
    expect(slot).toContain("background: var(--ni-gold)");
    expect(slot).toContain("color: var(--ni-on-gold)");
    // A literal hex here would be right in one theme and wrong in the other.
    expect(slot).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });

  it("keeps the label readable on that gold in every theme the tokens define", () => {
    const values = (name: string) =>
      [...css.matchAll(new RegExp(`--ni-${name}: *(#[0-9A-Fa-f]{6})`, "g"))].map((m) => m[1]);
    const golds = [...new Set(values("gold"))];
    const inks = [...new Set(values("on-gold"))];
    expect(golds.length).toBeGreaterThanOrEqual(2);
    expect(inks.length).toBeGreaterThanOrEqual(1);

    const channel = (hex: string, at: number) => {
      const value = parseInt(hex.slice(at, at + 2), 16) / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };
    const luminance = (hex: string) =>
      0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
    const contrast = (a: string, b: string) => {
      const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (high + 0.05) / (low + 0.05);
    };

    // Every gold the file defines against every ink it defines: whichever pairing a theme picks,
    // the label clears the 4.5 body-text threshold.
    for (const gold of golds) {
      for (const ink of inks) {
        expect(contrast(gold, ink), `${gold} on ${ink}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("gives an empty half hour the same height as a busy one", () => {
    // Without a stated minimum the empty span has no line of text to stand on, and the grid steps.
    expect(css).toContain(".ni-slot, .ni-slot-empty { display: block; width: 100%; min-height: 1.65rem;");
    expect(calendar).toContain('<span aria-hidden="true" className="ni-slot-empty" />');
  });

  it("marks the chosen cell without a colour that flips between themes", () => {
    expect(css).toContain('.ni-slot[aria-expanded="true"] { box-shadow: inset 0 0 0 2px var(--ni-on-gold);');
    expect(calendar).toContain('aria-expanded={Boolean(chosen)}');
  });
});
