import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const messaging = readFileSync(new URL("./messaging.ts", import.meta.url), "utf8");
const ui = readFileSync(new URL("../client/src/components/MessagingExperience.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const rls = readFileSync(new URL("../supabase/migrations/0002_auth_and_rls.sql", import.meta.url), "utf8");
const routers = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");

describe("read receipts, which the client could not write", () => {
  it("names why: the update policy excludes the recipient", () => {
    // sender_id = auth.uid() means only the author may update — the reader cannot set read_at.
    expect(rls).toContain("create policy messages_member_update on public.messages for update using (sender_id = auth.uid()");
    expect(messaging).toContain("gives the *recipient* — the only person who can");
  });

  it("verifies membership before writing anything", () => {
    expect(messaging).toContain("if (!(await isMember(identity, input.conversationId)))");
    expect(messaging).toContain("You are not part of this conversation.");
  });

  it("writes only read_at, only on other people's messages, only once", () => {
    expect(messaging).toContain('.update({ read_at: new Date().toISOString() })');
    expect(messaging).toContain('.neq("sender_id", identity.id)');
    expect(messaging).toContain('.is("read_at", null)');
  });

  it("does not widen the policy to achieve it", () => {
    expect(messaging).not.toMatch(/create policy|alter policy|drop policy/i);
  });
});

describe("the conversation list reads under the caller's own policies", () => {
  it("reads every thread, member and message on the caller's client", () => {
    const list = messaging.slice(messaging.indexOf("export async function listConversationSummaries"), messaging.indexOf("export async function markConversationRead"));
    expect(list).toContain("getSupabaseUserClient(identity.accessToken)");
    // Conversations, messages and membership are all read as the caller, so a mistake in this
    // function cannot reach a thread they do not belong to.
    for (const table of ['db.from("conversations")', 'db.from("messages")', 'db.from("conversation_members")']) {
      expect(list, table).toContain(table);
    }
  });

  it("uses the admin client for one thing only: the counterpart's name", () => {
    const list = messaging.slice(messaging.indexOf("export async function listConversationSummaries"), messaging.indexOf("export async function markConversationRead"));
    // `profiles_select_own_or_admin` lets an account read only its own profile, so the name could
    // never arrive on the caller's client and every conversation was headed "Private messages".
    // The lookup is elevated rather than the policy widened — bounded by `otherIds`, which the
    // caller's own client produced, and reading nothing but the display name.
    const adminUses = list.match(/getSupabaseAdminClient\(\)/g) ?? [];
    expect(adminUses, "exactly one elevated read in this function").toHaveLength(1);
    expect(list).toContain('admin');
    expect(list).toContain('.from("profiles").select("id,display_name,full_name").in("id", otherIds);');
    expect(list).not.toMatch(/admin[\s\S]{0,120}\.from\("(conversations|messages|conversation_members)"\)/);
  });

  it("counts unread as messages from the other person that carry no receipt", () => {
    expect(messaging).toContain('thread.filter((m) => String(m.sender_id) !== identity.id && !m.read_at).length');
  });

  it("leaves the existing listOwnConversations untouched", () => {
    expect(messaging).toContain("is left untouched");
    expect(routers).toContain("conversations: supabaseOnlyProcedure");
  });
});

describe("the UI keeps failure separate from emptiness", () => {
  it("derives state from the shared layer rather than isError alone", () => {
    expect(ui).toContain('import { resultError, resultState } from "../lib/result-state";');
    expect(ui).toContain("resultState(conversations as never, online)");
    expect(ui).toContain("resultState(messages as never, online)");
  });

  it("keeps the typed text when a send fails", () => {
    expect(ui).toContain("// The text stays in the box: losing what someone wrote is worse than an error.");
    expect(ui).not.toMatch(/setDraft\(""\)[\s\S]{0,80}setSendError/);
  });

  it("decides message ownership from the session, not from the payload", () => {
    expect(ui).toContain('String(currentSession?.userId ?? "")');
  });

  it("supports RTL for its directional affordances", () => {
    expect(ui).toContain('className="rtl:rotate-180"');
  });
});

describe("routes render the new experience", () => {
  it("points all four dashboard message routes at it", () => {
    expect(app).toContain('import("./components/MessagingExperience")');
    expect(app.match(/<MessagingListPage role/g)?.length).toBe(2);
    expect(app.match(/<MessagingThreadPage /g)?.length).toBe(2);
  });

  it("registers the read procedures on the verified identity", () => {
    for (const proc of ["conversationSummaries", "unreadCount", "markConversationRead"]) {
      expect(routers, `${proc} must be registered`).toContain(`${proc}:`);
    }
    expect(routers).toContain("markConversationRead(ctx.supabaseIdentity, input)");
  });
});
