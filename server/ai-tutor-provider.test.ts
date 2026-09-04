import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { AI_TUTOR_PROVIDER_LIMITS, configuredGeminiModel, generateGeminiTutorReply, geminiProviderStatus, missingGeminiEnv } from "./ai-tutor-provider";

describe("Gemini AI Tutor provider boundary", () => {
  it("remains setup-needed without a server-side key", async () => {
    expect(geminiProviderStatus({})).toBe("setup-needed");
    // A key alone is not enough: the model must be chosen explicitly.
    expect(geminiProviderStatus({ GEMINI_API_KEY: "server-secret" })).toBe("setup-needed");
    expect(geminiProviderStatus({ GEMINI_MODEL: "approved-model" })).toBe("setup-needed");
    expect(geminiProviderStatus({ GEMINI_API_KEY: "server-secret", GEMINI_MODEL: "approved-model" })).toBe("configured");
    expect(missingGeminiEnv({})).toEqual(["GEMINI_API_KEY", "GEMINI_MODEL"]);
    expect(missingGeminiEnv({ GEMINI_API_KEY: "server-secret" })).toEqual(["GEMINI_MODEL"]);

    const unset = await generateGeminiTutorReply({ systemPrompt: "system", history: [], userText: "hello" }, {});
    expect(unset.ok).toBe(false);
    // The error names the variables but never carries a value.
    expect(unset.ok === false && unset.message).toContain("GEMINI_API_KEY and GEMINI_MODEL");
    expect(unset.ok === false && unset.message).not.toContain("server-secret");
  });

  it("refuses to answer when the model is unset rather than falling back to a built-in name", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await generateGeminiTutorReply({ systemPrompt: "system", history: [], userText: "hello" }, { GEMINI_API_KEY: "server-secret" });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toContain("GEMINI_MODEL");
    // No request may be sent to a model the operator never chose.
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("uses the configured model and server-only header without exposing key in the endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "مرحبا" }] } }] }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await generateGeminiTutorReply({ systemPrompt: "system", history: [{ role: "user", text: "previous" }], userText: "hello" }, { GEMINI_API_KEY: "server-secret", GEMINI_MODEL: "approved-model" });
    expect(result).toEqual({ ok: true, text: "مرحبا", model: "approved-model" });
    const [endpoint, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(endpoint).toContain("models/approved-model:generateContent");
    expect(endpoint).not.toContain("server-secret");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("server-secret");
    expect(JSON.stringify(init.body)).toContain("previous");
    expect(JSON.stringify(init.body)).not.toContain("server-secret");
    vi.unstubAllGlobals();
  });

  it("retries transient provider responses and returns a safe failure after the bounded attempts", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("busy", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await generateGeminiTutorReply({ systemPrompt: "system", history: [], userText: "hello" }, { GEMINI_API_KEY: "server-secret", GEMINI_MODEL: "approved-model" });
    // The message now carries the provider's HTTP status: the old wording was identical for a dead
    // model, an expired key and a quota stop, which made the real cause unreportable.
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ status: "unavailable" });
    expect(!result.ok && result.message).toContain("HTTP 503");
    expect(!result.ok && result.message).not.toContain("server-secret");
    expect(fetchMock).toHaveBeenCalledTimes(AI_TUTOR_PROVIDER_LIMITS.maxAttempts);
    vi.unstubAllGlobals();
  });

  it("logs the provider's real error server-side without ever logging the key", async () => {
    const body = JSON.stringify({ error: { code: 404, message: "models/dead-model is not found", status: "NOT_FOUND" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status: 404 })));
    const logged: unknown[][] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args) => { logged.push(args); });
    const result = await generateGeminiTutorReply({ systemPrompt: "s", history: [], userText: "hi" }, { GEMINI_API_KEY: "server-secret", GEMINI_MODEL: "dead-model" });
    const flat = logged.flat().map(String).join(" ");
    // The cause is recoverable from the log …
    expect(flat).toContain("HTTP 404");
    expect(flat).toContain("models/dead-model is not found");
    // … and the key is not in it, nor in what the learner is shown.
    expect(flat).not.toContain("server-secret");
    expect(!result.ok && result.message).not.toContain("server-secret");
    spy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("does not spend a second request retrying an exhausted quota", async () => {
    // 429 means the allowance is gone; retrying immediately cannot succeed and costs another
    // request, which on a 20-per-day free tier doubles the burn rate of every send.
    const body = JSON.stringify({ error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "quota. Please retry in 29.28s." } });
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await generateGeminiTutorReply({ systemPrompt: "s", history: [], userText: "hi" }, { GEMINI_API_KEY: "k", GEMINI_MODEL: "m" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // A per-minute burst genuinely clears in seconds, so the wait is quoted. 29.28s rounds up: a
    // retry hint must never expire before the window it describes.
    expect(!result.ok && result.message).toContain("busy right now");
    expect(!result.ok && result.message).toContain("30 seconds");
    spy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("tells the learner a daily allowance is spent, not to wait 20 seconds", async () => {
    // Google returns the same short retryDelay for a spent daily quota as for a burst; repeating it
    // would send the learner back in 20 seconds for a limit that lasts until the daily reset.
    const body = JSON.stringify({ error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "quota. Please retry in 20s.",
      details: [{ "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier", quotaValue: "20" }] }] } });
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await generateGeminiTutorReply({ systemPrompt: "s", history: [], userText: "hi" }, { GEMINI_API_KEY: "k", GEMINI_MODEL: "m" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(!result.ok && result.message).toContain("today");
    expect(!result.ok && result.message).not.toContain("20 seconds");
    spy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("still retries a genuinely transient provider outage", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("boom", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await generateGeminiTutorReply({ systemPrompt: "s", history: [], userText: "hi" }, { GEMINI_API_KEY: "k", GEMINI_MODEL: "m" });
    expect(fetchMock).toHaveBeenCalledTimes(AI_TUTOR_PROVIDER_LIMITS.maxAttempts);
    spy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("distinguishes a filtered or truncated answer from a transport failure", async () => {
    const body = JSON.stringify({ candidates: [{ content: { parts: [] }, finishReason: "MAX_TOKENS" }], usageMetadata: { thoughtsTokenCount: 2400 } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status: 200 })));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await generateGeminiTutorReply({ systemPrompt: "s", history: [], userText: "hi" }, { GEMINI_API_KEY: "k", GEMINI_MODEL: "m" });
    // A 200 with no text names why, so a spent token budget is not mistaken for an outage.
    expect(!result.ok && result.message).toContain("MAX_TOKENS");
    spy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("keeps provider defaults bounded and adapter source server-only", () => {
    // The model must come from configuration; no built-in fallback is permitted.
    expect(configuredGeminiModel({})).toBe("");
    expect(configuredGeminiModel({ GEMINI_MODEL: "approved-model" })).toBe("approved-model");
    const adapter = readFileSync(new URL("./ai-tutor-provider.ts", import.meta.url), "utf8");
    expect(adapter).not.toMatch(/gemini-[0-9]/);
    expect(AI_TUTOR_PROVIDER_LIMITS).toEqual({ requestTimeoutMs: 55_000, maxAttempts: 2, maxOutputTokens: 2_400 });
    const clientSource = readFileSync(new URL("../client/src/components/AITutorExperience.tsx", import.meta.url), "utf8");
    expect(clientSource).not.toMatch(/GEMINI_API_KEY|x-goog-api-key|generativelanguage\.googleapis\.com/);
  });
});
