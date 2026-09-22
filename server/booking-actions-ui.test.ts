import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const actions = readFileSync(new URL("../client/src/components/BookingActions.tsx", import.meta.url), "utf8");
const scheduling = readFileSync(new URL("../client/src/components/SchedulingExperience.tsx", import.meta.url), "utf8");
const lifecycle = readFileSync(new URL("./booking-lifecycle.ts", import.meta.url), "utf8");
const catalog = readFileSync(new URL("../client/src/i18n/catalog.ts", import.meta.url), "utf8");
const calendar = readFileSync(new URL("../client/src/components/ScheduleCalendar.tsx", import.meta.url), "utf8");

describe("the controls reach the real procedures", () => {
  it("calls each lifecycle procedure, none of them faked", () => {
    for (const proc of ["rescheduleBooking", "cancelBooking", "completeBooking"]) {
      expect(actions, `${proc} must be called`).toContain(`trpc.scheduling.${proc}.useMutation()`);
    }
    expect(actions).not.toMatch(/setTimeout\(.*ok: true|mockResolved|fakeBooking/);
  });

  it("is mounted on the booking screen for both roles", () => {
    expect(scheduling).toContain("<BookingActions booking={booking} isInstructor={instructor} onDone={() => query.refetch()} />");
  });

  it("refreshes the list after a change rather than guessing the new state", () => {
    expect(actions).toContain("onDone: () => void;");
    expect(scheduling).toContain("onDone={() => query.refetch()}");
  });
});

describe("the buttons mirror the server's own rules", () => {
  it("shows nothing for a booking that is not confirmed", () => {
    // Every procedure refuses a non-confirmed booking; the UI does not offer the action.
    expect(actions).toContain('if (booking.status !== "confirmed") return null;');
    expect(lifecycle).toContain('Only a confirmed booking can be moved');
  });

  it("offers the outcome only to the instructor, and only after the end time", () => {
    expect(actions).toContain("const finished = new Date(booking.scheduled_end_at).getTime() <= Date.now();");
    expect(actions).toContain("{isInstructor && finished && (");
    expect(lifecycle).toContain("Only the instructor can record how a session went.");
    expect(lifecycle).toContain("This session has not finished yet.");
  });

  it("says plainly that hiding a button is not the security boundary", () => {
    expect(actions).toContain("hiding a button");
  });
});

describe("destructive actions confirm, and validate before submitting", () => {
  it("puts cancel and reschedule behind a dialog", () => {
    expect(actions.match(/role="dialog"/g)?.length).toBe(1); // one shared Dialog component
    expect(actions).toContain('open === "cancel"');
    expect(actions).toContain('open === "reschedule"');
    expect(actions).toContain('open === "complete"');
  });

  it("keeps cancel disabled until a reason exists, because the procedure requires one", () => {
    expect(actions).toContain("disabled={pending || !reason.trim()}");
    expect(lifecycle).toContain("A cancellation reason is required.");
  });

  it("keeps reschedule disabled until both times are set", () => {
    expect(actions).toContain("disabled={pending || !startAt || !endAt}");
  });

  it("sends an instant, not a local-clock string, to the server", () => {
    expect(actions).toContain("startAt: new Date(startAt).toISOString()");
    expect(actions).toContain("endAt: new Date(endAt).toISOString()");
  });
});

describe("failure is shown, not swallowed", () => {
  it("surfaces the server's message in an alert and keeps the dialog open", () => {
    expect(actions).toContain('<p role="alert"');
    expect(actions).toContain("setFailure(failureMessage(result, t as never));");
    // Only a success closes the dialog and refreshes.
    expect(actions).toContain("if (result.ok) { setOpen(null); setFailure(\"\"); onDone(); return; }");
  });

  it("shows a pending state on every submit", () => {
    expect(actions).toContain("const pending = reschedule.isPending || cancel.isPending || complete.isPending;");
    // `{14}` is a regex quantifier, so match on the class alone rather than the JSX.
    expect(actions.match(/animate-spin/g)?.length).toBe(3);
  });
});

describe("the booking list no longer reads a failure as emptiness", () => {
  it("derives its state through the shared helper", () => {
    expect(scheduling).toContain("const state = resultState(query as never, online);");
    expect(scheduling).toContain("resultRows<");
    // The old pattern is gone.
    expect(scheduling).not.toContain("const safeBookings = bookings ?? [];");
  });

  it("offers retry on a failed load", () => {
    expect(scheduling).toContain("onRetry={() => query.refetch()}");
  });
});

describe("accessibility and direction", () => {
  it("closes on Escape and moves focus into the dialog", () => {
    expect(actions).toContain('if (event.key === "Escape") onClose();');
    expect(actions).toContain('panel.current?.querySelector<HTMLElement>("textarea, input, button")?.focus();');
  });

  it("mirrors the directional icon and isolates the time inputs", () => {
    // This used to point at the booking card's classroom link. That link passed a *booking* id
    // into the classroom route, which is a different record, so it was replaced by
    // OpenClassroomAction. The schedule's link — which does carry a real session id — still
    // carries the mirrored icon, and that is what this asserts. It moved with the Schedule
    // module when that module became a calendar, so it is read from there now.
    expect(calendar).toContain('<Video size={13} aria-hidden="true" className="icon-directional"/>');
    expect(scheduling).toContain('<OpenClassroomAction bookingId={booking.id} status={booking.status} />');
    expect(actions.match(/className="input ltr-embed"/g)?.length).toBe(2);
  });

  it("translates every control in all three locales", () => {
    for (const key of ["booking.reschedule", "booking.cancel", "booking.recordOutcome", "booking.confirmCancel", "booking.markCompleted"]) {
      expect(catalog.match(new RegExp(`"${key.replace(".", "\.")}":`, "g"))?.length, `${key} needs en/ur/ar`).toBe(3);
    }
  });
});
