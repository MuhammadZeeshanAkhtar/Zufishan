import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const lifecycle = readFileSync(new URL("./class-session-lifecycle.ts", import.meta.url), "utf8");
const atomic = readFileSync(new URL("./scheduling-atomic.ts", import.meta.url), "utf8");
const eligibility = readFileSync(new URL("./connection-eligibility.ts", import.meta.url), "utf8");

/** Statements only, so no assertion is satisfied by a comment. */
const code = lifecycle.replace(/\/\*[\s\S]*?\*\//g, " ").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");

describe("a session that ends settles the booking behind it", () => {
  it("mirrors every terminal outcome, and only terminal ones", () => {
    expect(code).toContain("settleBookingWithSession(db, updated as SessionRow, input.status)");
    expect(code).toMatch(/completed:\s*"completed"/);
    expect(code).toMatch(/no_show:\s*"no_show"/);
    expect(code).toMatch(/cancelled:\s*"cancelled"/);
    // waiting_room and live are moments inside a confirmed booking, not outcomes for it.
    expect(code).not.toMatch(/waiting_room:\s*"/);
    expect(code).not.toMatch(/live:\s*"/);
  });

  it("never overwrites a decision already made about the booking", () => {
    const settle = code.slice(code.indexOf("async function settleBookingWithSession"));
    expect(settle.slice(0, 900)).toContain('.eq("status", "confirmed")');
  });

  it("does not report a finished lesson as a failure when the mirror fails", () => {
    const settle = code.slice(code.indexOf("async function settleBookingWithSession"));
    // Logged, not returned: the session already ended and the caller was told so.
    expect(settle.slice(0, 900)).toContain("console.error(");
    expect(settle.slice(0, 900)).not.toMatch(/return \{ ok: false/);
  });
});

describe("the journey either side of it is already joined up", () => {
  it("confirming a trial creates the booking, session and participants together", () => {
    for (const step of ["insert into public.bookings", "insert into public.class_sessions", "insert into public.class_participants", "insert into public.notifications"]) {
      expect(atomic, `${step} must be part of the confirm transaction`).toContain(step);
    }
  });

  it("leaves messaging eligibility untouched", () => {
    // A confirmed booking already connected the two people; completing it keeps them
    // connected, so no thread opens or closes because a lesson finished.
    expect(eligibility).toContain('export const CONNECTED_BOOKING_STATUSES = ["confirmed", "completed", "no_show", "disputed"] as const;');
  });
});
