import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { AI_TUTOR_PROVIDER_LIMITS, configuredGeminiModel, generateGeminiTutorReply, geminiProviderStatus } from "./ai-tutor-provider";

describe("Gemini AI Tutor provider boundary", () => {
  it("remains setup-needed without a server-side key", async () => {
    expect(geminiProviderStatus({})).toBe("setup-needed");
    expect(await generateGeminiTutorReply({ systemPrompt: "system", history: [], userText: "hello" }, {})).toEqual({ ok: false, status: "unavailable", message: "AI Tutor provider setup is required before real answers can be generated." });
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
    const result = await generateGeminiTutorReply({ systemPrompt: "system", history: [], userText: "hello" }, { GEMINI_API_KEY: "server-secret" });
    expect(result).toEqual({ ok: false, status: "unavailable", message: "The AI Tutor provider did not return an answer." });
    expect(fetchMock).toHaveBeenCalledTimes(AI_TUTOR_PROVIDER_LIMITS.maxAttempts);
    vi.unstubAllGlobals();
  });

  it("keeps provider defaults bounded and adapter source server-only", () => {
    expect(configuredGeminiModel({})).toBe("gemini-2.0-flash");
    expect(AI_TUTOR_PROVIDER_LIMITS).toEqual({ requestTimeoutMs: 15_000, maxAttempts: 2, maxOutputTokens: 900 });
    const clientSource = readFileSync(new URL("../client/src/components/AITutorExperience.tsx", import.meta.url), "utf8");
    expect(clientSource).not.toMatch(/GEMINI_API_KEY|x-goog-api-key|generativelanguage\.googleapis\.com/);
  });
});
