import { describe, expect, it } from "vitest";

type GeminiError = { error?: { status?: string; reason?: string; message?: string; details?: Array<{ reason?: string; domain?: string; metadata?: Record<string, string> }> } };

function safeCategory(payload: GeminiError): string {
  const error = payload.error;
  const raw = [error?.status, error?.reason, ...(error?.details || []).map(detail => detail.reason), ...(error?.details || []).map(detail => detail.domain)].filter(Boolean).join(" ").toUpperCase();
  if (raw.includes("API_KEY_SERVICE_BLOCKED")) return "API_KEY_SERVICE_BLOCKED";
  if (raw.includes("API_KEY_INVALID")) return "API_KEY_INVALID";
  if (raw.includes("PERMISSION_DENIED")) return "PERMISSION_DENIED";
  if (raw.includes("SERVICE_DISABLED")) return "SERVICE_DISABLED";
  if (raw.includes("QUOTA")) return "QUOTA_OR_BILLING";
  if (raw.includes("LOCATION")) return "REGION_OR_LOCATION";
  if (raw.includes("MODEL")) return "MODEL_ACCESS_OR_CAPABILITY";
  return error?.status ? String(error.status).toUpperCase() : "UNCLASSIFIED_403";
}

describe("redacted Gemini permission diagnostic", () => {
  it("records status and an allowlisted error category only", async () => {
    const key = process.env.GEMINI_API_KEY?.trim();
    const model = process.env.GEMINI_MODEL?.trim();
    expect(key).toBeTruthy();
    expect(model).toBeTruthy();
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model || "")}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key || "" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Give one beginner English greeting vocabulary exercise." }] }], generationConfig: { maxOutputTokens: 16, temperature: 0.2 } }),
    });
    const payload = await response.json().catch(() => ({})) as GeminiError;
    const category = safeCategory(payload);
    console.info(`GEMINI_PERMISSION_DIAGNOSTIC status=${response.status} category=${category}`);
    expect(response.status).toBeGreaterThanOrEqual(100);
    expect(category).toMatch(/^[A-Z0-9_]+$/);
  }, 60_000);
});
