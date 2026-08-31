export type TutorProviderStatus = "configured" | "setup-needed";

export type TutorProviderRequest = {
  systemPrompt: string;
  history: Array<{ role: "user" | "model"; text: string }>;
  userText: string;
  model?: string;
};

export type TutorProviderResult =
  | { ok: true; text: string; model: string }
  | { ok: false; status: "unavailable" | "failed"; message: string };

const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash";
const MAX_OUTPUT_TOKENS = 900;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 2;

export function geminiProviderStatus(env: NodeJS.ProcessEnv = process.env): TutorProviderStatus {
  return env.GEMINI_API_KEY?.trim() ? "configured" : "setup-needed";
}

export function configuredGeminiModel(env: NodeJS.ProcessEnv = process.env): string {
  return env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
}

function boundedText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function isRetryable(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

export async function generateGeminiTutorReply(request: TutorProviderRequest, env: NodeJS.ProcessEnv = process.env): Promise<TutorProviderResult> {
  const key = env.GEMINI_API_KEY?.trim();
  const model = request.model?.trim() || configuredGeminiModel(env);
  if (!key) return { ok: false, status: "unavailable", message: "AI Tutor provider setup is required before real answers can be generated." };

  const contents = [
    ...request.history.slice(-12).map(message => ({ role: message.role, parts: [{ text: boundedText(message.text, 4000) }] })),
    { role: "user" as const, parts: [{ text: boundedText(request.userText, 4000) }] },
  ];
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: boundedText(request.systemPrompt, 8000) }] }, contents, generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS, temperature: 0.35 } }),
        signal: controller.signal,
      });
      if (!response.ok) {
        if (attempt < MAX_ATTEMPTS && isRetryable(response.status)) continue;
        return { ok: false, status: response.status >= 500 || response.status === 429 ? "unavailable" : "failed", message: "The AI Tutor provider did not return an answer." };
      }
      const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      const text = boundedText(payload.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("\n"), 12_000);
      if (!text) return { ok: false, status: "unavailable", message: "The AI Tutor provider returned no answer." };
      return { ok: true, text, model };
    } catch {
      if (attempt < MAX_ATTEMPTS) continue;
      return { ok: false, status: "unavailable", message: "The AI Tutor provider is temporarily unavailable." };
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, status: "unavailable", message: "The AI Tutor provider is temporarily unavailable." };
}

export const AI_TUTOR_PROVIDER_LIMITS = { requestTimeoutMs: REQUEST_TIMEOUT_MS, maxAttempts: MAX_ATTEMPTS, maxOutputTokens: MAX_OUTPUT_TOKENS } as const;
