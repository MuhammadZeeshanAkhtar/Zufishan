/**
 * Notifications: one place to raise them, and the reader's own controls.
 *
 * `notify()` already existed but was private to `scheduling.ts`, so only two events could ever
 * reach anyone — a trial request and a cancellation. Everything built since (verification and
 * course decisions, booking reschedule/cancel/completion, a new message, a session opening) had no
 * way to tell the person it concerned. This module is that helper, extracted and made honest about
 * two things the original glossed over.
 *
 * First, preferences. `notification_preferences` has existed since the first migration, is seeded
 * for every account by the signup trigger, and was read by nothing at all. Turning off "message
 * notifications" changed nothing. Categories a reader can decline are now checked before the row is
 * written — if someone has switched a category off, the bell stays quiet rather than filling with
 * things they asked not to see.
 *
 * Second, channels. `email_enabled` promises email, and no email provider is configured — the
 * production config reports `notifications: configured=false`. In-app notifications are real and
 * written here; email is not sent and is not pretended. `emailDelivery()` reports that plainly so
 * the UI can show a setup-needed state instead of implying a message went out.
 *
 * Writes use the admin client because a notification is raised *about* someone by the system, not
 * by them: `notifications` has no insert policy, deliberately, so nobody can forge one for
 * themselves or anyone else. Reading and marking read stay on the caller's own client, where
 * `notifications_own` and `notifications_own_update` already scope them correctly.
 */
import { getSupabaseAdminClient } from "./supabase-admin-client";
import { getSupabaseUserClient } from "./supabase-user-client";
import type { SupabaseIdentity } from "./supabase-auth";

type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: "FORBIDDEN" | "NOT_FOUND" | "SETUP_NEEDED" | "VALIDATION" };

/**
 * Which preference switch governs each kind of notification.
 *
 * Anything absent from this map is an account or security event — a verification decision, a
 * cancellation — and is always delivered. Those are not preferences; a reader needs to know that
 * their standing on the platform changed.
 */
const CATEGORY: Record<string, "class_reminders_enabled" | "message_notifications_enabled" | "course_updates_enabled"> = {
  trial_requested: "class_reminders_enabled",
  trial_accepted: "class_reminders_enabled",
  booking_rescheduled: "class_reminders_enabled",
  booking_completed: "class_reminders_enabled",
  session_opened: "class_reminders_enabled",
  message_received: "message_notifications_enabled",
  course_published: "course_updates_enabled",
  course_rejected: "course_updates_enabled",
  enrolment_created: "course_updates_enabled",
};

export type NotifyInput = {
  userId: string;
  type: string;
  title: string;
  body: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  /** Makes a repeated raise a no-op rather than a duplicate row. */
  idempotencyKey: string;
  locale?: string;
};

/**
 * Raises a notification, unless the reader has declined that category.
 *
 * Never throws and never fails its caller: a booking that was cancelled correctly must not report
 * failure because the notification could not be written. Problems are logged, not propagated.
 */
export async function notify(input: NotifyInput): Promise<{ delivered: boolean; reason?: string }> {
  const admin = getSupabaseAdminClient();
  if (!admin) return { delivered: false, reason: "not_configured" };

  const category = CATEGORY[input.type];
  if (category) {
    const { data: preferences } = await admin
      .from("notification_preferences").select(category).eq("user_id", input.userId).maybeSingle();
    // A missing row means the account predates the trigger; default to delivering.
    if (preferences && (preferences as Record<string, unknown>)[category] === false) {
      return { delivered: false, reason: "declined" };
    }
  }

  const { error } = await admin.from("notifications").upsert({
    user_id: input.userId,
    type: input.type,
    title: input.title,
    body: input.body,
    related_entity_type: input.relatedEntityType ?? null,
    related_entity_id: input.relatedEntityId ?? null,
    idempotency_key: input.idempotencyKey,
    locale: input.locale ?? "en",
  }, { onConflict: "user_id,idempotency_key", ignoreDuplicates: true });

  if (error) {
    console.error("[notifications] raise failed:", { type: input.type, code: error.code, message: error.message });
    return { delivered: false, reason: "write_failed" };
  }
  return { delivered: true };
}

/** Whether email can actually be sent. No provider is configured, so this is honest, not hopeful. */
export function emailDelivery(env = process.env): { configured: boolean; missing: string[] } {
  const missing = ["NOTIFICATION_EMAIL_PROVIDER", "NOTIFICATION_EMAIL_FROM"].filter((key) => !env[key]?.trim());
  return { configured: missing.length === 0, missing };
}

/* ------------------------------------------------------------------ reading */

export async function listOwnNotifications(identity: SupabaseIdentity): Promise<Result<unknown[]>> {
  const db = getSupabaseUserClient(identity.accessToken);
  if (!db) return { ok: false, error: "Supabase persistence unavailable.", code: "SETUP_NEEDED" };
  const { data, error } = await db
    .from("notifications")
    .select("id,type,title,body,related_entity_type,related_entity_id,read_at,created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    console.error("[notifications] list failed:", { code: error.code, message: error.message });
    return { ok: false, error: "Notifications could not be loaded." };
  }
  return { ok: true, data: data ?? [] };
}

export async function countOwnUnread(identity: SupabaseIdentity): Promise<Result<{ unread: number }>> {
  const db = getSupabaseUserClient(identity.accessToken);
  if (!db) return { ok: false, error: "Supabase persistence unavailable.", code: "SETUP_NEEDED" };
  const { count, error } = await db
    .from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
  if (error) {
    console.error("[notifications] unread count failed:", { code: error.code, message: error.message });
    return { ok: false, error: "Notifications could not be loaded." };
  }
  return { ok: true, data: { unread: count ?? 0 } };
}

/**
 * Marks one notification, or all of them, as read.
 *
 * Runs on the caller's client so `notifications_own_update` scopes it to their own rows, and only
 * ever writes `read_at` on rows where it is still null — marking read is not something that should
 * be able to rewrite a timestamp that already exists.
 */
export async function markNotificationsRead(
  identity: SupabaseIdentity,
  input: { notificationId?: string },
): Promise<Result<{ marked: number }>> {
  const db = getSupabaseUserClient(identity.accessToken);
  if (!db) return { ok: false, error: "Supabase persistence unavailable.", code: "SETUP_NEEDED" };

  let query = db.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  if (input.notificationId) query = query.eq("id", input.notificationId);

  const { data, error } = await query.select("id");
  if (error) {
    console.error("[notifications] mark read failed:", { code: error.code, message: error.message });
    return { ok: false, error: "The notification could not be updated." };
  }
  return { ok: true, data: { marked: (data ?? []).length } };
}

/* -------------------------------------------------------------- preferences */

export async function getOwnPreferences(identity: SupabaseIdentity): Promise<Result<Record<string, unknown>>> {
  const db = getSupabaseUserClient(identity.accessToken);
  if (!db) return { ok: false, error: "Supabase persistence unavailable.", code: "SETUP_NEEDED" };
  const { data, error } = await db
    .from("notification_preferences")
    .select("email_enabled,class_reminders_enabled,message_notifications_enabled,course_updates_enabled")
    .eq("user_id", identity.id)
    .maybeSingle();
  if (error) {
    console.error("[notifications] preferences read failed:", { code: error.code, message: error.message });
    return { ok: false, error: "Preferences could not be loaded." };
  }
  // Every switch defaults on, matching the column defaults, so a missing row reads sensibly.
  return {
    ok: true,
    data: {
      email_enabled: true, class_reminders_enabled: true,
      message_notifications_enabled: true, course_updates_enabled: true,
      ...(data ?? {}),
      emailDelivery: emailDelivery(),
    },
  };
}

export async function updateOwnPreferences(
  identity: SupabaseIdentity,
  input: Partial<Record<"emailEnabled" | "classRemindersEnabled" | "messageNotificationsEnabled" | "courseUpdatesEnabled", boolean>>,
): Promise<Result<{ saved: true }>> {
  const db = getSupabaseUserClient(identity.accessToken);
  if (!db) return { ok: false, error: "Supabase persistence unavailable.", code: "SETUP_NEEDED" };

  const patch: Record<string, unknown> = { user_id: identity.id, updated_at: new Date().toISOString() };
  if (input.emailEnabled !== undefined) patch.email_enabled = input.emailEnabled;
  if (input.classRemindersEnabled !== undefined) patch.class_reminders_enabled = input.classRemindersEnabled;
  if (input.messageNotificationsEnabled !== undefined) patch.message_notifications_enabled = input.messageNotificationsEnabled;
  if (input.courseUpdatesEnabled !== undefined) patch.course_updates_enabled = input.courseUpdatesEnabled;
  if (Object.keys(patch).length === 2) return { ok: false, error: "Nothing to change.", code: "VALIDATION" };

  const { error } = await db.from("notification_preferences").upsert(patch, { onConflict: "user_id" });
  if (error) {
    console.error("[notifications] preferences write failed:", { code: error.code, message: error.message });
    return { ok: false, error: "Preferences could not be saved." };
  }
  return { ok: true, data: { saved: true } };
}
