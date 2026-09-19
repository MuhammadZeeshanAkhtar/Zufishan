/**
 * Messaging reads: the conversation list with unread counts, and read receipts.
 *
 * `messages.read_at` has existed since the first migration but nothing ever set it, and it could
 * not be set from the client: `messages_member_update` is
 *
 *   using (sender_id = auth.uid() or is_moderator_user())
 *
 * which lets a sender edit their own message and gives the *recipient* — the only person who can
 * actually read it — no write at all. So a read receipt is impossible on the caller's client by
 * construction.
 *
 * Rather than widen that policy (it correctly stops people editing each other's words), the receipt
 * is written here on the admin client after membership is verified, the same shape as conversation
 * creation. Only `read_at`, only on messages the caller did not send, only in a conversation they
 * belong to.
 *
 * The existing `listOwnConversations` is left untouched — this adds an enriched read beside it so
 * nothing that already works changes behaviour.
 */
import { getSupabaseAdminClient } from "./supabase-admin-client";
import { getSupabaseUserClient } from "./supabase-user-client";
import type { SupabaseIdentity } from "./supabase-auth";

type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: "FORBIDDEN" | "NOT_FOUND" | "SETUP_NEEDED" };

export type ConversationSummary = {
  id: string;
  subject: string | null;
  updatedAt: string | null;
  unread: number;
  lastMessage: { body: string; createdAt: string; fromMe: boolean } | null;
  counterpart: { id: string; name: string | null } | null;
};

/** Confirms membership using the caller's own client, so RLS is the one deciding. */
async function isMember(identity: SupabaseIdentity, conversationId: string): Promise<boolean> {
  const db = getSupabaseUserClient(identity.accessToken);
  if (!db) return false;
  const { data } = await db
    .from("conversation_members").select("conversation_id")
    .eq("conversation_id", conversationId).eq("user_id", identity.id).maybeSingle();
  return Boolean(data);
}

/**
 * The caller's conversations, each with its unread count, last message and the other person.
 *
 * All reads run on the caller's client: `conversations_member_select` and `messages_member_select`
 * already scope every row to conversations they belong to, so nothing here needs elevating and a
 * mistake in this file cannot leak someone else's thread.
 */
export async function listConversationSummaries(identity: SupabaseIdentity): Promise<Result<ConversationSummary[]>> {
  const db = getSupabaseUserClient(identity.accessToken);
  if (!db) return { ok: false, error: "Supabase persistence unavailable.", code: "SETUP_NEEDED" };

  const { data: memberships, error: memberError } = await db
    .from("conversation_members").select("conversation_id").eq("user_id", identity.id);
  if (memberError) {
    console.error("[messaging] memberships failed:", { code: memberError.code, message: memberError.message });
    return { ok: false, error: "Conversations could not be loaded." };
  }
  const ids = (memberships ?? []).map((row) => String((row as { conversation_id: string }).conversation_id));
  if (!ids.length) return { ok: true, data: [] };

  const [{ data: conversations }, { data: messages }, { data: others }] = await Promise.all([
    db.from("conversations").select("id,subject,updated_at,created_at").in("id", ids),
    db.from("messages").select("id,conversation_id,sender_id,body,read_at,created_at").in("conversation_id", ids).order("created_at", { ascending: false }),
    db.from("conversation_members").select("conversation_id,user_id").in("conversation_id", ids).neq("user_id", identity.id),
  ]);

  /*
   * Counterpart names.
   *
   * This read used to run on the caller's own client, and could never return a row:
   *
   *   profiles_select_own_or_admin ... using (auth.uid() = id or public.is_admin_user())
   *
   * A learner may read exactly one profile — their own. So every name came back null and every
   * conversation in the list was headed "Private messages", whoever it was with.
   *
   * Widening that policy is not the fix; it would let any signed-in account read every profile in
   * the project. The name is resolved here instead, on the admin client, the same shape the read
   * receipt below already uses — and it is bounded by what the caller's *own* client already
   * proved: `ids` are conversations RLS let them list, `others` are the members RLS let them see
   * inside those conversations. Nobody outside that set is looked up, and only the display name
   * leaves this function. A missing profile must not drop the thread, so failure stays null.
   */
  const otherIds = Array.from(new Set((others ?? []).map((row) => String((row as { user_id: string }).user_id))));
  const names = new Map<string, string | null>();
  if (otherIds.length) {
    const admin = getSupabaseAdminClient();
    if (admin) {
      const { data: profiles, error: profileError } = await admin
        .from("profiles").select("id,display_name,full_name").in("id", otherIds);
      if (profileError) {
        console.error("[messaging] counterpart names failed:", { code: profileError.code, message: profileError.message });
      }
      for (const row of profiles ?? []) {
        const profile = row as { id: string; display_name: string | null; full_name: string | null };
        const name = (profile.display_name ?? profile.full_name ?? "").trim();
        names.set(String(profile.id), name || null);
      }
    }
  }

  const summaries: ConversationSummary[] = (conversations ?? []).map((row) => {
    const conversation = row as { id: string; subject: string | null; updated_at: string | null; created_at: string | null };
    const id = String(conversation.id);
    const thread = (messages ?? [])
      .map((m) => m as { conversation_id: string; sender_id: string; body: string; read_at: string | null; created_at: string })
      .filter((m) => String(m.conversation_id) === id);
    const latest = thread[0] ?? null;
    const counterpartId = (others ?? [])
      .map((m) => m as { conversation_id: string; user_id: string })
      .find((m) => String(m.conversation_id) === id)?.user_id;

    return {
      id,
      subject: conversation.subject,
      updatedAt: conversation.updated_at ?? conversation.created_at,
      // Unread means: sent by the other person and not yet receipted.
      unread: thread.filter((m) => String(m.sender_id) !== identity.id && !m.read_at).length,
      lastMessage: latest
        ? { body: latest.body.slice(0, 160), createdAt: latest.created_at, fromMe: String(latest.sender_id) === identity.id }
        : null,
      counterpart: counterpartId ? { id: String(counterpartId), name: names.get(String(counterpartId)) ?? null } : null,
    };
  });

  summaries.sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")));
  return { ok: true, data: summaries };
}

/**
 * Marks everything the other person sent as read.
 *
 * Deliberately narrow: only `read_at`, only where the caller is not the sender, only where it is
 * still null. A receipt cannot rewrite a message, cannot touch the caller's own messages, and
 * cannot be applied twice.
 */
export async function markConversationRead(
  identity: SupabaseIdentity,
  input: { conversationId: string },
): Promise<Result<{ marked: number }>> {
  if (!(await isMember(identity, input.conversationId))) {
    return { ok: false, error: "You are not part of this conversation.", code: "FORBIDDEN" };
  }

  const admin = getSupabaseAdminClient();
  if (!admin) return { ok: false, error: "Supabase administrative access is not configured.", code: "SETUP_NEEDED" };

  const { data, error } = await admin
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("conversation_id", input.conversationId)
    .neq("sender_id", identity.id)
    .is("read_at", null)
    .select("id");

  if (error) {
    console.error("[messaging] read receipt failed:", { code: error.code, message: error.message });
    return { ok: false, error: "Messages could not be marked as read." };
  }
  return { ok: true, data: { marked: (data ?? []).length } };
}

/** Total unread across every conversation, for the header badge. */
export async function countUnread(identity: SupabaseIdentity): Promise<Result<{ unread: number }>> {
  const summaries = await listConversationSummaries(identity);
  if (!summaries.ok) return summaries;
  return { ok: true, data: { unread: summaries.data.reduce((total, row) => total + row.unread, 0) } };
}
