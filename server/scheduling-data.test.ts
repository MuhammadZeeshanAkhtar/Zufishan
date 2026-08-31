import { describe, expect, it } from "vitest";
import { canJoinWaitingRoom, getClassroomProviderState, prepareEmailEvent, respondToTrialRequest, validateTrialSlot } from "../client/src/lib/scheduling-data";

describe("scheduling boundaries", () => {
  it("rejects past and inverted trial slots", () => {
    expect(validateTrialSlot("2026-08-22T10:00:00Z", "2026-08-22T09:00:00Z").ok).toBe(false);
    expect(validateTrialSlot("2026-09-01T10:00:00Z", "2026-09-01T11:00:00Z").ok).toBe(true);
  });
  it("keeps instructor actions honest in demo mode", () => {
    expect(respondToTrialRequest("trial-101", "accept").message).toContain("no session was persisted");
    expect(respondToTrialRequest("missing", "reject").ok).toBe(false);
  });
  it("does not claim email or live classroom delivery", () => {
    expect(prepareEmailEvent("class_reminder", "session-101").sent).toBe(false);
    expect(getClassroomProviderState().configured).toBe(false);
  });
  it("allows only eligible waiting-room statuses", () => {
    expect(canJoinWaitingRoom({ status: "waiting_room" } as never)).toBe(true);
    expect(canJoinWaitingRoom({ status: "completed" } as never)).toBe(false);
  });
});
