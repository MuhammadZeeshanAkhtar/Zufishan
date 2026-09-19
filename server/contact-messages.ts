/**
 * The contact form's destination.
 *
 * The page this serves had a form whose submit handler was `setSent(true)` and nothing else — a tick
 * and a thank-you, and the words discarded. So the one thing that matters here is that a message
 * genuinely lands somewhere a person will read it, and that the caller is told the truth either way:
 * saved means saved, and a failure says so rather than showing the same tick.
 *
 * No email provider is involved. A row an administrator can read is a working channel on its own,
 * and waiting for a mail integration would have meant leaving the form broken for longer.
 *
 * TWO BOUNDARIES.
 *
 *  - The insert runs on the anonymous client, because a signed-out visitor is exactly the person
 *    most likely to need to write. `contact_messages_anyone_may_write` is what permits it, and the
 *    reading policy is a reviewer's alone — so nothing here can read back what anybody wrote.
 *  - Where a human-verification provider is configured, the token is checked before the write. It
 *    is not invented when there is no provider: `not_configured` is allowed through and said out
 *    loud elsewhere, the same way Find Students already treats it.
 */
import { randomUUID } from "node:crypto";
import { getSupabaseAdminClient } from "./supabase-admin-client";
import { getSupabasePublicClient } from "./supabase-user-client";
import { verifyHumanToken } from "./human-verification";
import { notifyReviewersOfContactMessage } from "./review-queue";
import type { SupabaseIdentity } from "./supabase-auth";

type Result<T> = { ok: true; data: T } | { ok: false; error: string; code?: "SETUP_NEEDED" | "VALIDATION" | "FORBIDDEN" };
const fail = (error: string, code: "SETUP_NEEDED" | "VALIDATION" | "FORBIDDEN" = "VALIDATION"): Result<never> => ({ ok: false, error, code });

export const CONTACT_ROLES = ["student", "teacher", "other"] as const;
export type ContactRole = (typeof CONTACT_ROLES)[number];

export type ContactMessage = {
  id: string; userId: string | null; senderName: string; senderEmail: string;
  senderRole: ContactRole; subject: string; body: string; status: string; createdAt: string;
};

/** "That table is not there": PostgREST's schema-cache answer, and Postgres's own. */
const MISSING_TABLE = ["42P01", "PGRST205"];

/** Rough shape check only. The address is for replying to, and is never used to identify anyone. */
const looksLikeEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

/**
 * Stores one message from the contact page.
 *
 * `identity` is optional and is used for one thing: recording which account wrote it, when the
 * sender happened to be signed in. It is never used to decide whether the write is allowed — the
 * policy permits anyone — so a visitor and a member follow exactly the same path.
 */
export async function submitContactMessage(
  input: { name: string; email: string; role: ContactRole; subject: string; body: string; humanToken?: string },
  identity?: SupabaseIdentity | null,
): Promise<Result<{ id: string }>> {
  const client = getSupabasePublicClient();
  if (!client) return fail("Messaging is not configured on this deployment.", "SETUP_NEEDED");

  const name = input.name.trim();
  const email = input.email.trim();
  const subject = input.subject.trim();
  const body = input.body.trim();
  if (!name || !email || !subject || !body) return fail("Please fill in every field.");
  if (!looksLikeEmail(email)) return fail("That email address does not look right.");
  if (!(CONTACT_ROLES as readonly string[]).includes(input.role)) return fail("Choose who you are writing as.");

  // Where a provider is configured the token must check out. Where none is, nothing is faked.
  const human = await verifyHumanToken(input.humanToken);
  if (human.outcome === "failed") return fail("That verification did not pass. Please try again.", "FORBIDDEN");

  /*
   * The id is made here rather than read back.
   *
   * `.insert().select()` asks PostgREST for a RETURNING clause, and RETURNING is a read: Postgres
   * applies the SELECT policy to the row it hands back. Reading `contact_messages` is a reviewer's
   * alone — deliberately, because every row carries a name, an address and whatever somebody chose
   * to confide — so a sender's own insert was refused with 42501 for wanting its own row back.
   *
   * Generating the id removes the read entirely. Nothing about the policies changes, the write is
   * still the anonymous client's under `contact_messages_anyone_may_write`, and the notification
   * below still has an id to key itself on.
   */
  const id = randomUUID();
  const { error } = await client
    .from("contact_messages")
    .insert({
      id,
      user_id: identity?.id ?? null,
      sender_name: name.slice(0, 120),
      sender_email: email.slice(0, 200),
      sender_role: input.role,
      subject: subject.slice(0, 160),
      body: body.slice(0, 4000),
    });

  if (error) {
    console.error("[contact] message insert failed:", { code: error.code, message: error.message });
    /*
     * "Please try again" is the wrong advice for a table that is not there — trying again will fail
     * in exactly the same way, and the person retyping their message has no idea why. PostgREST
     * answers PGRST205 when a relation is missing from its schema cache and Postgres itself raises
     * 42P01, so both are recognised and reported as what they are: a migration nobody has applied.
     */
    if (MISSING_TABLE.includes(String(error.code))) {
      return fail("Contact messages are not set up on this project yet. Nothing was saved.", "SETUP_NEEDED");
    }
    // Said plainly rather than shown as a tick: the whole point of replacing the old form.
    return fail("Your message could not be sent. Please try again.");
  }
  /*
   * The row exists; now somebody is told about it.
   *
   * Without this the message waits for an administrator to think of opening the support desk. The
   * notice goes to whoever currently holds a reviewing role, through the bell the admin desk
   * already has — no email, and no single configured address to keep up to date.
   *
   * Raised after the write and never allowed to fail it: the sender's message is saved either way,
   * and telling them otherwise because a notification could not be written would be a lie about
   * their message rather than about the notice.
   */
  await notifyReviewersOfContactMessage({ messageId: id, subject, senderName: name, senderRole: input.role });
  return { ok: true, data: { id } };
}

/**
 * The messages, for a reviewer.
 *
 * Read on the admin client after the caller's role is checked, because `user_roles` is not public
 * and the reading policy is a reviewer's. The check here produces a readable refusal; the policy is
 * what makes it true.
 */
export async function listContactMessages(
  identity: SupabaseIdentity,
  input: { status?: string; limit?: number; offset?: number } = {},
): Promise<Result<{ messages: ContactMessage[]; total: number }>> {
  const admin = getSupabaseAdminClient();
  if (!admin) return fail("Administrative access is not configured.", "SETUP_NEEDED");

  const { data: roles, error: roleError } = await admin
    .from("user_roles").select("role").eq("user_id", identity.id).in("role", ["admin", "super_admin", "moderator"]);
  if (roleError) {
    console.error("[contact] role check failed:", { code: roleError.code, message: roleError.message });
    return fail("Messages could not be loaded.");
  }
  if (!roles || roles.length === 0) return fail("Only a reviewer may read contact messages.", "FORBIDDEN");

  const limit = Math.min(Math.max(input.limit ?? 25, 1), 100);
  const offset = Math.max(input.offset ?? 0, 0);

  let query = admin
    .from("contact_messages")
    .select("id,user_id,sender_name,sender_email,sender_role,subject,body,status,created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (input.status && input.status !== "all") query = query.eq("status", input.status);

  const { data, error, count } = await query;
  if (error) {
    console.error("[contact] list failed:", { code: error.code, message: error.message });
    return fail("Messages could not be loaded.");
  }

  const messages = (data ?? []).map((value) => {
    const row = value as Record<string, unknown>;
    return {
      id: String(row.id),
      userId: (row.user_id as string | null) ?? null,
      senderName: String(row.sender_name ?? ""),
      senderEmail: String(row.sender_email ?? ""),
      senderRole: String(row.sender_role ?? "other") as ContactRole,
      subject: String(row.subject ?? ""),
      body: String(row.body ?? ""),
      status: String(row.status ?? "open"),
      createdAt: String(row.created_at ?? ""),
    };
  });
  return { ok: true, data: { messages, total: count ?? messages.length } };
}
