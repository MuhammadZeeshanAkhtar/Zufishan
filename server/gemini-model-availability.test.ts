import { describe, expect, it } from "vitest";

describe("configured Gemini text-generation model availability", () => {
  it("lists only accessible generateContent model identifiers", async () => {
    const key = process.env.GEMINI_API_KEY?.trim();
    expect(key).toBeTruthy();
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
      headers: { "x-goog-api-key": key || "" },
    });
    const payload = await response.json().catch(() => ({})) as {
      models?: Array<{ name?: string; baseModelId?: string; supportedGenerationMethods?: string[] }>;
    };
    const models = (payload.models || [])
      .filter(model => model.supportedGenerationMethods?.includes("generateContent"))
      .map(model => model.baseModelId || model.name?.replace(/^models\//, ""))
      .filter((model): model is string => Boolean(model));
    console.info(`GEMINI_AVAILABLE_GENERATION_MODELS count=${models.length} identifiers=${models.join(",")}`);
    expect(response.ok).toBe(true);
    expect(models.length).toBeGreaterThan(0);
  }, 20_000);
});
