/**
 * Naming a conversation.
 *
 * Every thread in the list was headed "Private messages" — the page's own title — whoever it was
 * with. The cause was not the component, which already preferred a counterpart name: it was that
 * the name could never arrive. `listConversationSummaries` read `profiles` on the caller's own
 * client, and
 *
 *   profiles_select_own_or_admin ... using (auth.uid() = id or public.is_admin_user())
 *
 * lets a learner read exactly one profile — their own. So the lookup returned nothing, every time.
 *
 * The fix had to name the person without widening that policy, which would expose every profile in
 * the project to every signed-in account. This file holds both halves in place: the name is
 * resolved on the admin client, bounded by what the caller's own client already proved they may
 * see; and the policy is still the one quoted above.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const messaging = readFileSync(new URL("./messaging.ts", import.meta.url), "utf8");
const ui = readFileSync(new URL("../client/src/components/MessagingExperience.tsx", import.meta.url), "utf8");
const catalog = readFileSync(new URL("../client/src/i18n/catalog.ts", import.meta.url), "utf8");
const rlsFix = readFileSync(new URL("../supabase/migrations/0003_conversation_membership_rls_fix.sql", import.meta.url), "utf8");
const baseRls = readFileSync(new URL("../supabase/migrations/0002_auth_and_rls.sql", import.meta.url), "utf8");

/** The summaries function alone, so a later function cannot satisfy an assertion about it. */
const summaries = messaging.slice(
  messaging.indexOf("export async function listConversationSummaries"),
  messaging.indexOf("export async function markConversationRead"),
);

describe("the name is resolved, and only that", () => {
  it("no longer asks the caller's client for a profile it may never read", () => {
    expect(summaries).not.toContain('db.from("profiles")');
    expect(summaries).toContain("const admin = getSupabaseAdminClient();");
    // Two assertions, not one multi-line string: these sources are CRLF, so an embedded newline would never match.
    expect(summaries).toContain("const { data: profiles, error: profileError } = await admin");
    expect(summaries).toContain('.from("profiles").select("id,display_name,full_name").in("id", otherIds);');
  });

  it("looks up nobody the caller's own client did not already return", () => {
    // `otherIds` comes from `others`, which is read on the caller's client and so is RLS-bounded.
    expect(summaries).toContain('const otherIds = Array.from(new Set((others ?? []).map((row) => String((row as { user_id: string }).user_id))));');
    expect(summaries).toContain('.in("id", otherIds)');
    // The memberships that produced it were the caller's own.
    expect(summaries).toContain('.from("conversation_members").select("conversation_id").eq("user_id", identity.id)');
  });

  it("carries a name out and nothing else", () => {
    for (const column of ["email", "phone", "address", "date_of_birth", "*"]) {
      expect(summaries, `profiles select must not read ${column}`).not.toContain(`select("id,display_name,full_name,${column}`);
    }
    expect(summaries).toContain("names.set(String(profile.id), name || null);");
  });

  it("is read-only, and survives a profile that is not there", () => {
    for (const write of [".insert(", ".update(", ".delete(", ".upsert("]) {
      expect(summaries, `listConversationSummaries must not ${write}`).not.toContain(write);
    }
    // A failed lookup logs and leaves the name null rather than dropping the conversation.
    expect(summaries).toContain('console.error("[messaging] counterpart names failed:"');
  });
});

describe("the policy it worked around is untouched", () => {
  it("still lets an account read only its own profile", () => {
    expect(baseRls).toContain("create policy profiles_select_own_or_admin on public.profiles for select using (auth.uid() = id or public.is_admin_user());");
  });

  it("adds no migration and no policy of its own", () => {
    for (const forbidden of ["create policy", "alter policy", "drop policy", "alter table", "grant "]) {
      expect(messaging.toLowerCase(), `messaging.ts must not ${forbidden}`).not.toContain(forbidden);
    }
    // The membership fix is the only place these policies are defined, and it is unchanged.
    expect(rlsFix).toContain("create policy conversation_members_member_select on public.conversation_members for select using (user_id = auth.uid() or public.is_conversation_member(conversation_id) or public.is_moderator_user());");
  });
});

describe("what the reader sees", () => {
  it("heads a row with the person, not with the page's title", () => {
    expect(ui).toContain("{chatTitle(row.counterpart?.name, row.subject)}");
    expect(ui).not.toContain('{row.counterpart?.name || row.subject || t("messaging.title")}');
  });

  it("names the thread as well as the list", () => {
    expect(ui).toContain("const heading = chatTitle(summary?.counterpart?.name, summary?.subject);");
    expect(ui).toContain("<Head role={role} title={heading} />");
    // Inside the dashboard `Head` is screen-reader only, so it is drawn visibly too.
    expect(ui).toContain('<p className="mt-2 font-display text-xl ni-t-ink">{heading}</p>');
  });

  it("adds no procedure to do it", () => {
    expect(ui).toContain("trpc.supabaseCore.conversationSummaries.useQuery(undefined, { retry: false, staleTime: 60_000 })");
  });

  it("keeps an explicit subject rather than overwriting it", () => {
    expect(ui).toContain("const subjectText = subject?.trim();");
    expect(ui).toContain("if (subjectText) return subjectText;");
  });

  it("says who the thread is with by role when there is no name at all", () => {
    expect(ui).toContain('return role === "learner" ? t("messaging.chatWithTeacher") : t("messaging.chatWithStudent");');
  });

  it("is written in all three languages", () => {
    for (const key of ["messaging.chatWith", "messaging.chatWithTeacher", "messaging.chatWithStudent"]) {
      expect(catalog.match(new RegExp(`"${key.replace(".", "\.")}":`, "g")), key).toHaveLength(3);
    }
    // The name is interpolated, not concatenated, so word order stays correct in ur and ar.
    expect(catalog).toContain('"messaging.chatWith": "Chat with {name}"');
  });
});
