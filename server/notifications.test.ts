import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { emailDelivery } from "./notifications";

const notifications = readFileSync(new URL("./notifications.ts", import.meta.url), "utf8");
const booking = readFileSync(new URL("./booking-lifecycle.ts", import.meta.url), "utf8");
const verification = readFileSync(new URL("./instructor-verification.ts", import.meta.url), "utf8");
const courseReview = readFileSync(new URL("./course-review.ts", import.meta.url), "utf8");
const rls = readFileSync(new URL("../supabase/migrations/0002_auth_and_rls.sql", import.meta.url), "utf8");

describe("preferences finally govern something", () => {
  it("checks the reader's switch before writing an optional notification", () => {
    // notification_preferences existed from the first migration and was read by nothing.
    expect(notifications).toContain('.from("notification_preferences").select(category)');
    expect(notifications).toContain('return { delivered: false, reason: "declined" };');
  });

  it("always delivers events that change someone's standing", () => {
    // Absent from CATEGORY means always delivered — a verification outcome is not a preference.
    const map = notifications.slice(notifications.indexOf("const CATEGORY"), notifications.indexOf("export type NotifyInput"));
    expect(map).not.toContain("verification_decided");
    expect(map).not.toContain("class_cancelled");
    expect(map).toContain("message_received");
  });

  it("delivers when no preference row exists rather than staying silent", () => {
    expect(notifications).toContain("// A missing row means the account predates the trigger; default to delivering.");
  });
});

describe("email is not pretended", () => {
  it("reports missing provider configuration honestly", () => {
    expect(emailDelivery({})).toEqual({ configured: false, missing: ["NOTIFICATION_EMAIL_PROVIDER", "NOTIFICATION_EMAIL_FROM"] });
    expect(emailDelivery({ NOTIFICATION_EMAIL_PROVIDER: "x", NOTIFICATION_EMAIL_FROM: "y" })).toEqual({ configured: true, missing: [] });
  });

  it("never claims an email was sent", () => {
    expect(notifications).not.toMatch(/sendEmail|mailer\.send|emailSent: true/);
  });
});

describe("raising a notification cannot break the action it reports", () => {
  it("returns a result instead of throwing", () => {
    expect(notifications).toContain("Promise<{ delivered: boolean; reason?: string }>");
    expect(notifications).toContain('return { delivered: false, reason: "write_failed" };');
  });

  it("is idempotent, so a repeat is a no-op rather than a duplicate row", () => {
    expect(notifications).toContain('{ onConflict: "user_id,idempotency_key", ignoreDuplicates: true }');
  });
});

describe("the modules that were silent now speak", () => {
  it("tells the other party when a booking moves, is cancelled, or is closed", () => {
    expect(booking).toContain('type: "booking_rescheduled"');
    expect(booking).toContain('type: "class_cancelled"');
    expect(booking).toContain('type: "booking_completed"');
    // The actor does not need telling; the counterpart does.
    expect(booking).toContain("const counterpart = (booking: BookingRow, actorId: string) =>");
  });

  it("tells the tutor and the instructor about reviewed decisions", () => {
    expect(verification).toContain('type: "verification_decided"');
    expect(courseReview).toContain('type: input.decision === "published" ? "course_published" : "course_rejected"');
  });

  it("keys every notification so a retry cannot double-send", () => {
    for (const source of [booking, verification, courseReview]) {
      expect(source).toContain("idempotencyKey:");
    }
  });
});

describe("reading and marking stay under the caller's own policies", () => {
  it("reads and marks on the user client, not the admin client", () => {
    const readSide = notifications.slice(notifications.indexOf("export async function listOwnNotifications"));
    expect(readSide).toContain("getSupabaseUserClient(identity.accessToken)");
    expect(readSide).not.toContain("getSupabaseAdminClient");
  });

  it("only ever marks rows that are still unread", () => {
    expect(notifications).toContain('.is("read_at", null)');
  });

  it("relies on the existing own-row policies", () => {
    expect(rls).toContain("create policy notifications_own on public.notifications for select using (user_id = auth.uid());");
    expect(rls).toContain("create policy notifications_own_update on public.notifications for update using (user_id = auth.uid())");
  });

  it("writes through the admin client, since notifications have no insert policy by design", () => {
    expect(rls).not.toMatch(/create policy notifications_\w*insert/);
    const raise = notifications.slice(notifications.indexOf("export async function notify"), notifications.indexOf("export function emailDelivery"));
    expect(raise).toContain("getSupabaseAdminClient()");
  });
});
