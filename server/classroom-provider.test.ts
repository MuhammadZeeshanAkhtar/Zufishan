import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classroomProviderStatus, handleClassroomWebhook, resolveClassroomProvider, RECORDING_STATUSES } from "./classroom-provider";

const provider = readFileSync(new URL("./classroom-provider.ts", import.meta.url), "utf8");
const lifecycle = readFileSync(new URL("./class-session-lifecycle.ts", import.meta.url), "utf8");
const ui = readFileSync(new URL("../client/src/components/ClassroomSessionExperience.tsx", import.meta.url), "utf8");
const routers = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const catalog = readFileSync(new URL("../client/src/i18n/catalog.ts", import.meta.url), "utf8");

describe("no provider is selected, and none is faked", () => {
  it("registers no adapters at all", () => {
    expect(provider).toContain("const ADAPTERS: Record<string, () => ClassroomProvider> = {};");
  });

  it("names no vendor anywhere in the boundary", () => {
    expect(provider).not.toMatch(/zoom|twilio|agora|daily\.co|jitsi|whereby|livekit|100ms/i);
    expect(lifecycle).not.toMatch(/zoom|twilio|agora|daily\.co|jitsi|whereby|livekit|100ms/i);
  });

  it("builds no join URL of its own", () => {
    // A grant only ever comes back from an adapter; nothing here constructs one.
    expect(lifecycle).toContain("return resolved.provider.issueJoinGrant({");
    expect(lifecycle).not.toMatch(/joinUrl:\s*[`"']http/);
    expect(ui).not.toMatch(/joinUrl:\s*[`"']http/);
  });
});

describe("the four resolution states stay distinct", () => {
  it("reports not_configured when nothing is set", () => {
    expect(resolveClassroomProvider({} as NodeJS.ProcessEnv)).toEqual({ status: "not_configured", missing: ["CLASSROOM_PROVIDER"] });
    expect(classroomProviderStatus({} as NodeJS.ProcessEnv)).toEqual({ configured: false, reason: "not_configured", provider: null, missing: ["CLASSROOM_PROVIDER"] });
  });

  it("reports unknown_provider when a name has no adapter — a broken setup, not an absent one", () => {
    const resolved = resolveClassroomProvider({ CLASSROOM_PROVIDER: "something" } as NodeJS.ProcessEnv);
    expect(resolved).toMatchObject({ status: "unknown_provider", name: "something" });
    const status = classroomProviderStatus({ CLASSROOM_PROVIDER: "something" } as NodeJS.ProcessEnv);
    expect(status).toMatchObject({ configured: false, reason: "unknown_provider", provider: "something" });
    // This is the failed-provider state, and it must never be reported as not_configured.
    expect(status.reason).not.toBe("not_configured");
  });

  it("trims whitespace rather than treating it as a provider name", () => {
    expect(resolveClassroomProvider({ CLASSROOM_PROVIDER: "   " } as NodeJS.ProcessEnv).status).toBe("not_configured");
  });

  it("never reports configured while no adapter is registered", () => {
    for (const env of [{}, { CLASSROOM_PROVIDER: "x" }, { CLASSROOM_PROVIDER: "x", CLASSROOM_PROVIDER_API_KEY: "y" }]) {
      expect(classroomProviderStatus(env as NodeJS.ProcessEnv).configured).toBe(false);
    }
  });

  it("carries env names only, never a value", () => {
    const status = classroomProviderStatus({} as NodeJS.ProcessEnv);
    expect(status.missing).toEqual(["CLASSROOM_PROVIDER"]);
    expect(JSON.stringify(status)).not.toMatch(/secret|token|key=/i);
  });
});

describe("the webhook boundary refuses rather than inventing an event", () => {
  it("refuses when no provider is configured, because there is no key to verify against", async () => {
    const result = handleClassroomWebhook({ rawBody: "{}", headers: {}, env: {} as NodeJS.ProcessEnv });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("SETUP_NEEDED");
  });

  it("refuses a payload that claims to be an event", () => {
    const forged = JSON.stringify({ type: "recording_ready", externalSessionId: "abc", externalEventId: "1" });
    const result = handleClassroomWebhook({ rawBody: forged, headers: { "x-signature": "anything" }, env: {} as NodeJS.ProcessEnv });
    expect(result.ok).toBe(false);
  });

  it("takes raw bytes, because a signature covers the exact payload", () => {
    expect(provider).toContain("rawBody: Buffer | string");
    expect(provider).toContain("re-serialising JSON");
  });

  it("is not mounted, and says why", () => {
    expect(provider).toContain("Transport-agnostic and unmounted, deliberately.");
    expect(provider).toContain("Events are stored for idempotency");
  });
});

describe("the session record is the platform's own, not the provider's", () => {
  it("stores which provider owns a room, so a later change is visible", () => {
    expect(lifecycle).toContain(".update({ live_provider: resolved.provider.name, external_session_id: externalSessionId, updated_at: new Date().toISOString() })");
  });

  it("creates the room once, on first ask", () => {
    expect(lifecycle).toContain("let externalSessionId = row.external_session_id;");
    expect(lifecycle).toContain("if (!externalSessionId) {");
  });

  it("never advances recording status by guesswork", () => {
    expect(lifecycle).toContain("const live = await resolved.provider.readRecordingStatus({ externalSessionId: session.data.external_session_id });");
    expect(lifecycle).toContain("if (!live.ok) return { ok: true, data: { status: stored, fromProvider: false } };");
    // With no provider there is nothing to ask, so the stored value stands.
    expect(lifecycle).toContain('if (resolved.status !== "ready" || !session.data.external_session_id) {');
  });

  it("keeps a provider failure distinct from a provider never configured", () => {
    expect(lifecycle).toContain('"PROVIDER_FAILED"');
    expect(lifecycle).toContain('return { ok: false, error: "No live classroom provider is connected, so there is no call to join.", code: "SETUP_NEEDED" };');
  });

  it("refuses to join a session that is not open, before asking any provider", () => {
    const body = lifecycle.slice(lifecycle.indexOf("export async function requestJoinGrant"));
    expect(body.indexOf('code: "CONFLICT"')).toBeLessThan(body.indexOf("resolveClassroomProvider()"));
  });
});

describe("the UI reads provider state from the server", () => {
  it("asks rather than assuming", () => {
    expect(ui).toContain("trpc.scheduling.classroomProvider.useQuery");
    // The client-side constant that always answered "not configured" is gone.
    expect(ui.slice(ui.indexOf("*/"))).not.toContain("getClassroomProviderState");
    expect(routers).toContain("classroomProvider: supabaseOnlyProcedure.query(() => ({ ok: true as const, data: classroomProviderStatus() })),");
  });

  it("shows a broken configuration as an error and an absent one as setup", () => {
    expect(ui).toContain('const broken = info.reason === "unknown_provider" || info.reason === "incomplete";');
    expect(ui).toContain('state={broken ? "error" : "setup"}');
  });

  it("offers the call only while the session is open to join", () => {
    expect(ui).toContain("{joinable && (");
    expect(ui).toContain("trpc.scheduling.classroomJoin.useMutation()");
  });

  it("shows the server's own refusal wording", () => {
    expect(ui).toContain("if (!result.ok) { setJoinRefusal(result.error); return; }");
  });

  it("translates every provider state in all three locales", () => {
    for (const key of ["classroom.providerNotConnected", "classroom.providerUnknown", "classroom.providerIncomplete", "classroom.joinCall", "classroom.joinFailed"]) {
      expect(catalog.match(new RegExp(`"${key.replace(/\./g, "\\.")}":`, "g"))?.length, `${key} needs en/ur/ar`).toBe(3);
    }
  });

  it("has a label for every recording status the interface defines", () => {
    for (const status of RECORDING_STATUSES) {
      expect(catalog, `classroom.recording.${status} must exist`).toContain(`"classroom.recording.${status}":`);
    }
  });
});
