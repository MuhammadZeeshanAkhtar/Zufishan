/**
 * What a teacher is actually looking at when an invite arrives, and what a learner sees of the one
 * they sent.
 *
 * The desks had the rows and almost nothing else. Received invites rendered a count — "3 invites" —
 * and a link somewhere else; Bookings rendered a status word and a raw timestamp. Neither said who,
 * neither said what for, and a teacher deciding whether to teach somebody cannot decide from a
 * number.
 *
 * Three things this adds, and one boundary it has to respect to add them.
 *
 *  - **Who.** `trial_requests` carries a `learner_id` and no name. Names live on `profiles`, and
 *    `profiles_select_own_or_admin` lets an account read exactly one profile — its own. So a
 *    teacher's own client can never resolve the name of the learner inviting them. The lookup is
 *    therefore elevated, bounded by the learner ids that appear in the caller's own requests, and
 *    returns nothing but what a learner already publishes about themselves.
 *  - **What for.** An invite may point at a published learning requirement. That is the fullest
 *    statement of what somebody wants, so it is fetched and returned with the invite.
 *  - **Whether it is still new.** The notification raised when the request was created is matched
 *    to the invite by `related_entity_id`, so the desk can show a teacher which invites they have
 *    not opened, and clear exactly that notice when they do.
 *
 * Read-only. Nothing here decides anything or writes anything; `markInviteSeen` in `notifications`
 * is the one write, and it only ever sets `read_at`.
 */
import { getSupabaseAdminClient } from "./supabase-admin-client";
import { getSupabaseUserClient } from "./supabase-user-client";
import type { SupabaseIdentity } from "./supabase-auth";

type Result<T> = { ok: true; data: T } | { ok: false; error: string; code?: "SETUP_NEEDED" | "VALIDATION" };
const fail = (error: string, code: "SETUP_NEEDED" | "VALIDATION" = "VALIDATION"): Result<never> => ({ ok: false, error, code });

/** What a learner publishes about themselves, and nothing more. */
export type InvitePerson = {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  country: string | null;
  timezone: string | null;
  gender: string | null;
  preferredLanguage: string | null;
};

export type InviteRequirement = {
  id: string; subject: string; level: string; goal: string;
  preferredLanguage: string; timezone: string; availability: string;
};

export type ReceivedInvite = {
  id: string;
  status: string;
  subject: string;
  message: string;
  requestedStartAt: string;
  requestedEndAt: string;
  learnerTimezone: string;
  createdAt: string;
  learner: InvitePerson | null;
  requirement: InviteRequirement | null;
  /** True while the teacher has not opened it. Drives the count on the tab. */
  unseen: boolean;
};

export type SentInvite = {
  id: string; status: string; subject: string; message: string;
  requestedStartAt: string; requestedEndAt: string; createdAt: string;
  instructor: InvitePerson | null;
  instructorResponse: string | null;
};

export type DeskBooking = {
  id: string; status: string; subject: string;
  scheduledStartAt: string; scheduledEndAt: string;
  learnerTimezone: string; instructorTimezone: string;
  person: InvitePerson | null;
};

/**
 * Names and public details for a set of accounts.
 *
 * Elevated, and bounded twice over: the ids come from rows the caller's own client returned, and
 * only the columns a learner already shows on the Find Students desk are read. A learner who has
 * kept their person private still has a name here — they chose to write to this teacher.
 */
export async function peopleByIds(ids: string[]): Promise<Map<string, InvitePerson>> {
  const found = new Map<string, InvitePerson>();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return found;

  const admin = getSupabaseAdminClient();
  if (!admin) return found;

  const { data, error } = await admin
    .from("profiles")
    .select("id,display_name,full_name,avatar_url,country,timezone,gender,preferred_language")
    .in("id", unique);
  if (error) {
    console.error("[invite-desk] person lookup failed:", { code: error.code, message: error.message });
    return found;
  }

  for (const value of data ?? []) {
    const row = value as Record<string, unknown>;
    const name = String(row.display_name ?? row.full_name ?? "").trim();
    found.set(String(row.id), {
      id: String(row.id),
      displayName: name || null,
      avatarUrl: (row.avatar_url as string | null) ?? null,
      country: (row.country as string | null) ?? null,
      timezone: (row.timezone as string | null) ?? null,
      gender: (row.gender as string | null) ?? null,
      preferredLanguage: (row.preferred_language as string | null) ?? null,
    });
  }
  return found;
}

/** Which of these invites still have an unread notification against them. */
async function unseenInviteIds(client: ReturnType<typeof getSupabaseUserClient>, inviteIds: string[]): Promise<Set<string>> {
  const unseen = new Set<string>();
  if (!client || inviteIds.length === 0) return unseen;

  const { data, error } = await client
    .from("notifications")
    .select("related_entity_id")
    .eq("related_entity_type", "trial_request")
    .in("related_entity_id", inviteIds)
    .is("read_at", null);
  if (error) {
    // A desk that cannot read its notices still shows its invites; they simply are not marked new.
    console.error("[invite-desk] unseen lookup failed:", { code: error.code, message: error.message });
    return unseen;
  }
  for (const row of data ?? []) unseen.add(String((row as { related_entity_id: string }).related_entity_id));
  return unseen;
}

/** The invites a teacher has been sent, with who sent them and what they asked for. */
export async function listReceivedInvites(identity: SupabaseIdentity): Promise<Result<ReceivedInvite[]>> {
  const client = getSupabaseUserClient(identity.accessToken);
  if (!client) return fail("Scheduling persistence is not configured.", "SETUP_NEEDED");

  const { data, error } = await client
    .from("trial_requests")
    .select("id,learner_id,requirement_id,status,subject,learner_message,requested_start_at,requested_end_at,learner_timezone,created_at")
    .eq("instructor_id", identity.id)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[invite-desk] received invites failed:", { code: error.code, message: error.message });
    return fail("Invites could not be loaded.");
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  const inviteIds = rows.map((row) => String(row.id));
  const requirementIds = rows.map((row) => row.requirement_id).filter(Boolean).map(String);

  const [people, unseen, requirements] = await Promise.all([
    peopleByIds(rows.map((row) => String(row.learner_id))),
    unseenInviteIds(client, inviteIds),
    requirementIds.length
      ? client.from("learner_requirements").select("id,subject,level,goal,preferred_language,timezone,availability").in("id", requirementIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);

  const byRequirement = new Map<string, InviteRequirement>();
  for (const value of (requirements.data ?? []) as Record<string, unknown>[]) {
    byRequirement.set(String(value.id), {
      id: String(value.id), subject: String(value.subject ?? ""), level: String(value.level ?? ""),
      goal: String(value.goal ?? ""), preferredLanguage: String(value.preferred_language ?? ""),
      timezone: String(value.timezone ?? ""), availability: String(value.availability ?? ""),
    });
  }

  return {
    ok: true,
    data: rows.map((row) => ({
      id: String(row.id),
      status: String(row.status ?? ""),
      subject: String(row.subject ?? ""),
      message: String(row.learner_message ?? ""),
      requestedStartAt: String(row.requested_start_at ?? ""),
      requestedEndAt: String(row.requested_end_at ?? ""),
      learnerTimezone: String(row.learner_timezone ?? ""),
      createdAt: String(row.created_at ?? ""),
      learner: people.get(String(row.learner_id)) ?? null,
      requirement: row.requirement_id ? byRequirement.get(String(row.requirement_id)) ?? null : null,
      unseen: unseen.has(String(row.id)),
    })),
  };
}

/** The invites a learner has sent, with who they went to and how each was answered. */
export async function listSentInvites(identity: SupabaseIdentity): Promise<Result<SentInvite[]>> {
  const client = getSupabaseUserClient(identity.accessToken);
  if (!client) return fail("Scheduling persistence is not configured.", "SETUP_NEEDED");

  const { data, error } = await client
    .from("trial_requests")
    .select("id,instructor_id,status,subject,learner_message,instructor_response,requested_start_at,requested_end_at,created_at")
    .eq("learner_id", identity.id)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[invite-desk] sent invites failed:", { code: error.code, message: error.message });
    return fail("Invites could not be loaded.");
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  const people = await peopleByIds(rows.map((row) => String(row.instructor_id)));

  return {
    ok: true,
    data: rows.map((row) => ({
      id: String(row.id),
      status: String(row.status ?? ""),
      subject: String(row.subject ?? ""),
      message: String(row.learner_message ?? ""),
      requestedStartAt: String(row.requested_start_at ?? ""),
      requestedEndAt: String(row.requested_end_at ?? ""),
      createdAt: String(row.created_at ?? ""),
      instructor: people.get(String(row.instructor_id)) ?? null,
      instructorResponse: (row.instructor_response as string | null) ?? null,
    })),
  };
}

/** The caller's own bookings, with the other person named rather than an id printed. */
export async function listDeskBookings(identity: SupabaseIdentity, role: "learner" | "instructor"): Promise<Result<DeskBooking[]>> {
  const client = getSupabaseUserClient(identity.accessToken);
  if (!client) return fail("Scheduling persistence is not configured.", "SETUP_NEEDED");

  const own = role === "learner" ? "learner_id" : "instructor_id";
  const other = role === "learner" ? "instructor_id" : "learner_id";

  const { data, error } = await client
    .from("bookings")
    .select("id,status,subject,scheduled_start_at,scheduled_end_at,learner_timezone,instructor_timezone,learner_id,instructor_id")
    .eq(own, identity.id)
    .order("scheduled_start_at", { ascending: false });
  if (error) {
    console.error("[invite-desk] bookings failed:", { code: error.code, message: error.message });
    return fail("Bookings could not be loaded.");
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  const people = await peopleByIds(rows.map((row) => String(row[other])));

  return {
    ok: true,
    data: rows.map((row) => ({
      id: String(row.id),
      status: String(row.status ?? ""),
      subject: String(row.subject ?? ""),
      scheduledStartAt: String(row.scheduled_start_at ?? ""),
      scheduledEndAt: String(row.scheduled_end_at ?? ""),
      learnerTimezone: String(row.learner_timezone ?? ""),
      instructorTimezone: String(row.instructor_timezone ?? ""),
      person: people.get(String(row[other])) ?? null,
    })),
  };
}
