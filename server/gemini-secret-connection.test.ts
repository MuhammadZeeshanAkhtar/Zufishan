import { describe, expect, it } from "vitest";

describe("configured Gemini secret boundary", () => {
  it("reaches the configured model endpoint without exposing the key", async () => {
    const key = process.env.GEMINI_API_KEY?.trim();
    const model = process.env.GEMINI_MODEL?.trim();
    expect(key).toBeTruthy();
    expect(model).toBeTruthy();
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model || "")}`, {
      headers: { "x-goog-api-key": key || "" },
    });
    expect(response.ok, `Gemini model endpoint returned HTTP ${response.status}`).toBe(true);
  }, 60_000);
});
