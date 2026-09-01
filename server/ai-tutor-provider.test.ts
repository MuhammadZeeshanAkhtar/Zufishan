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
    expect(result).toEqual({ ok: false, status: "unavailable", message: "The AI Tutor provider did not return an answer." });
    expect(fetchMock).toHaveBeenCalledTimes(AI_TUTOR_PROVIDER_LIMITS.maxAttempts);
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
