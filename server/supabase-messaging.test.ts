import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const core = readFileSync(new URL("./supabase-core.ts", import.meta.url), "utf8");
const router = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");

describe("Supabase messaging boundaries", () => {
  it("checks conversation membership before reading messages", () => {
    expect(core).toContain('from("conversation_members")');
    expect(core).toContain('.eq("conversation_id", conversationId).eq("user_id", identity.id)');
    expect(core).toContain('from("messages")');
  });

  it("writes the authenticated identity as the message sender", () => {
    expect(core).toContain('sender_id: identity.id');
    expect(core).toContain('body.length > 12000');
  });

  it("exposes messaging only through the Supabase-only router", () => {
    expect(router).toContain("conversations: supabaseOnlyProcedure");
    expect(router).toContain("messages: supabaseOnlyProcedure");
    expect(router).toContain("createMessage: supabaseOnlyProcedure");
  });
});
