/**
 * Starting a conversation.
 *
 * `conversations` and `conversation_members` both restrict writes to moderators, so no learner or
 * instructor could ever open a thread — messaging existed but was inert: `createConversationMessage`
 * requires membership, and nothing could create membership.
 *
 * The obvious fix — letting any authenticated user insert a conversation — would turn messaging into
 * an open channel between any two accounts on the platform, which is a spam and harassment surface.
 * So the RLS policies are left exactly as they are, restrictive, and creation happens here on the
 * admin client *after* the server has proved the two parties already have a working relationship.
 * The relationship check is the authorisation; the admin client is only how the write is performed,
 * the same pattern already used for notifications and audit entries.
 *
 * A relationship means one of: a trial request, a booking, an instructor's response to the learner's
 * requirement, or an enrolment in the instructor's course. Any of those means the two have already
 * met through a deliberate action by one of them.
 */
import { getSupabaseAdminClient } from "./supabase-admin-client";
import type { SupabaseIdentity } from "./supabase-auth";

type Result<T> = { ok: true; data: T } | { ok: false; error: string; code?: "FORBIDDEN" | "NOT_FOUND" | "SETUP_NEEDED" };

/** Every way two accounts can already be connected. Any one of them permits a thread. */
async function relationshipExists(
  admin: ReturnType<typeof getSupabaseAdminClient>,
  a: string,
  b: string,
): Promise<boolean> {
  if (!admin) return false;
  const pair = [a, b];

  // Trials and bookings both name a learner and an instructor directly.
  for (const table of ["trial_requests", "bookings"] as const) {
    const { data } = await admin
      .from(table).select("id").in("learner_id", pair).in("instructor_id", pair).limit(1);
    if ((data ?? []).length) return true;
  }

  // An instructor who answered this learner's requirement.
  const { data: responses } = await admin
    .from("requirement_responses")
    .select("id, instructor_id, learner_requirements!inner(learner_id)")
    .in("instructor_id", pair)
    .limit(50);
  for (const row of responses ?? []) {
    const learner = String(((row as Record<string, unknown>).learner_requirements as Record<string, unknown> | undefined)?.learner_id ?? "");
    const instructor = String((row as { instructor_id: string }).instructor_id);
    if (pair.includes(learner) && pair.includes(instructor) && learner !== instructor) return true;
  }

  // A learner enrolled in a course this instructor owns.
  const { data: enrolments } = await admin
    .from("enrolments")
    .select("id, learner_id, courses!inner(instructor_id)")
    .in("learner_id", pair)
    .limit(50);
  for (const row of enrolments ?? []) {
    const learner = String((row as { learner_id: string }).learner_id);
    const instructor = String(((row as Record<string, unknown>).courses as Record<string, unknown> | undefined)?.instructor_id ?? "");
    if (pair.includes(learner) && pair.includes(instructor) && learner !== instructor) return true;
  }

  return false;
}

/** An existing two-party thread between exactly these accounts, if there is one. */
async function findExistingThread(
  admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  a: string,
  b: string,
): Promise<string | null> {
  const { data: mine } = await admin.from("conversation_members").select("conversation_id").eq("user_id", a);
  const ids = (mine ?? []).map((row) => String((row as { conversation_id: string }).conversation_id));
  if (!ids.length) return null;

  const { data: theirs } = await admin
    .from("conversation_members").select("conversation_id").eq("user_id", b).in("conversation_id", ids);
  const shared = (theirs ?? []).map((row) => String((row as { conversation_id: string }).conversation_id));
  if (!shared.length) return null;

  // Only reuse a thread that is exactly these two, so a group thread is never mistaken for a DM.
  const { data: members } = await admin
    .from("conversation_members").select("conversation_id,user_id").in("conversation_id", shared);
  const byConversation = new Map<string, Set<string>>();
  for (const row of members ?? []) {
    const id = String((row as { conversation_id: string }).conversation_id);
    if (!byConversation.has(id)) byConversation.set(id, new Set());
    byConversation.get(id)!.add(String((row as { user_id: string }).user_id));
  }
  // Array.from keeps this compatible with the project's compilation target.
  for (const [id, set] of Array.from(byConversation.entries())) {
    if (set.size === 2 && set.has(a) && set.has(b)) return id;
  }
  return null;
}

/**
 * Opens the thread between the caller and one other account, or returns the existing one.
 *
 * Idempotent by design: repeated clicks, or both parties starting at once, must not produce two
 * threads for the same pair — duplicate conversations split a history in half and neither side can
 * tell which is current.
 */
export async function startConversation(
  identity: SupabaseIdentity,
  input: { counterpartId: string; subject?: string },
): Promise<Result<{ conversationId: string; created: boolean }>> {
  const admin = getSupabaseAdminClient();
  if (!admin) return { ok: false, error: "Supabase administrative access is not configured.", code: "SETUP_NEEDED" };

  const me = identity.id;
  const other = input.counterpartId;
  if (other === me) return { ok: false, error: "A conversation needs two different people.", code: "FORBIDDEN" };

  const { data: counterpart } = await admin.from("profiles").select("id").eq("id", other).maybeSingle();
  if (!counterpart) return { ok: false, error: "No account with that id.", code: "NOT_FOUND" };

  const existing = await findExistingThread(admin, me, other);
  if (existing) return { ok: true, data: { conversationId: existing, created: false } };

  if (!(await relationshipExists(admin, me, other))) {
    return {
      ok: false,
      code: "FORBIDDEN",
      error: "You can message someone after a trial, booking, requirement response or enrolment connects you.",
    };
  }

  const { data: conversation, error: conversationError } = await admin
    .from("conversations").insert({ subject: input.subject?.trim()?.slice(0, 200) || null }).select("id").single();
  if (conversationError || !conversation) {
    console.error("[conversation] create failed:", { code: conversationError?.code, message: conversationError?.message });
    return { ok: false, error: "The conversation could not be created." };
  }

  const conversationId = String((conversation as { id: string }).id);
  const { error: memberError } = await admin.from("conversation_members").insert([
    { conversation_id: conversationId, user_id: me },
    { conversation_id: conversationId, user_id: other },
  ]);
  if (memberError) {
    // A conversation nobody belongs to is unreachable and unreadable; remove it rather than leave it.
    await admin.from("conversations").delete().eq("id", conversationId);
    console.error("[conversation] membership failed, conversation removed:", { code: memberError.code, message: memberError.message });
    return { ok: false, error: "The conversation could not be created." };
  }

  return { ok: true, data: { conversationId, created: true } };
}
