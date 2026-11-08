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

// Current flash models spend part of the output budget on reasoning before emitting an answer.
// Measured on a short language-learning prompt: 437 reasoning tokens + 216 answer tokens against
// the old 900 cap, leaving almost no margin — a slightly longer reasoning pass exhausted the
// budget and returned empty text, which the caller could only report as "unavailable".
const MAX_OUTPUT_TOKENS = 2_400;
// Those same models are slow: a short Urdu prompt took 41.6s end to end and English ~21s, so the
// previous 15s budget aborted valid answers and made a working provider look unavailable.
const REQUEST_TIMEOUT_MS = 55_000;
const MAX_ATTEMPTS = 2;

/**
 * AI_PROVIDER selects the backend: "gemini" (default) or "deepseek". Each provider reads its own
 * pair of variables, so switching providers never sends one provider's key to the other.
 */
export type TutorProviderName = "gemini" | "deepseek";

export function activeTutorProvider(env: NodeJS.ProcessEnv = process.env): TutorProviderName {
  return env.AI_PROVIDER?.trim().toLowerCase() === "deepseek" ? "deepseek" : "gemini";
}

function providerEnvNames(env: NodeJS.ProcessEnv) {
  return activeTutorProvider(env) === "deepseek"
    ? { key: "DEEPSEEK_API_KEY", model: "DEEPSEEK_MODEL" } as const
    : { key: "GEMINI_API_KEY", model: "GEMINI_MODEL" } as const;
}

/**
 * Both variables are required. The model is deliberately NOT defaulted: silently falling back to
 * some built-in model name would send traffic to a model the operator never chose, and would hide
 * a missing configuration behind an answer that looks real.
 */
export function geminiProviderStatus(env: NodeJS.ProcessEnv = process.env): TutorProviderStatus {
  return missingGeminiEnv(env).length === 0 ? "configured" : "setup-needed";
}

/** Names the variables that still need a value. Never returns or logs any value. */
export function missingGeminiEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  const names = providerEnvNames(env);
  return [names.key, names.model].filter((name) => !env[name]?.trim());
}

/** The operator-chosen model, or empty when unset. Callers must treat empty as setup-needed. */
export function configuredGeminiModel(env: NodeJS.ProcessEnv = process.env): string {
  return env[providerEnvNames(env).model]?.trim() || "";
}

function boundedText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** Provider errors sometimes echo the request back. The key must never reach a log file. */
function redactKey(text: string, key: string): string {
  return key ? text.split(key).join("[REDACTED_KEY]") : text;
}

/**
 * 429 is deliberately NOT retryable. It means the quota is spent, so an immediate second attempt
 * cannot succeed — it just consumes another request from the same exhausted allowance, which on a
 * 20-per-day free tier means every send costs two. Only genuinely transient statuses retry.
 */
function isRetryable(status: number): boolean {
  return status === 408 || status >= 500;
}

/** Google reports how long to wait, either in a RetryInfo detail or in the message text. */
function retryAfterSeconds(body: string): number | null {
  const detail = body.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
  if (detail) return Math.ceil(Number(detail[1]));
  const inline = body.match(/retry in (\d+(?:\.\d+)?)s/i);
  return inline ? Math.ceil(Number(inline[1])) : null;
}

/**
 * A daily quota and a per-minute burst both arrive as 429 with a short `retryDelay`, but only one
 * of them clears in seconds. Repeating Google's generic hint for a spent daily allowance tells the
 * learner to come back in 20 seconds for a limit that lasts until the quota resets, so the two are
 * separated by the quota id the provider names in the failure detail.
 */
function isDailyQuota(body: string): boolean {
  return /PerDay|per_day|RequestsPerDay/i.test(body);
}

export async function generateGeminiTutorReply(request: TutorProviderRequest, env: NodeJS.ProcessEnv = process.env): Promise<TutorProviderResult> {
  if (activeTutorProvider(env) === "deepseek") return generateDeepSeekTutorReply(request, env);
  const key = env.GEMINI_API_KEY?.trim();
  const model = request.model?.trim() || configuredGeminiModel(env);
  // Report which variable is missing by NAME only — never a value, never a partial value.
  const missing = missingGeminiEnv(env);
  if (!key || !model) {
    return {
      ok: false,
      status: "unavailable",
      message: missing.length
        ? `AI Tutor provider setup is required. Set ${missing.join(" and ")} in the server environment before real answers can be generated.`
        : "AI Tutor provider setup is required before real answers can be generated.",
    };
  }

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
        // The provider's own explanation is the only thing that identifies a bad model, an expired
        // key, a quota stop or a malformed request. It never reaches the learner — it is logged
        // here, with the key stripped in case the provider echoes it back — and the learner gets
        // the status code alone, which is enough to tell the two apart when reporting a problem.
        const body = await response.text().catch(() => "");
        console.error(`[ai-tutor] provider HTTP ${response.status} ${response.statusText} model=${model}`,
          redactKey(body, key).slice(0, 1500));
        if (attempt < MAX_ATTEMPTS && isRetryable(response.status)) continue;
        // A quota stop is not a fault the learner can act on by retrying, so it says so plainly and
        // passes on the provider's own wait time instead of a bare status code.
        if (response.status === 429) {
          if (isDailyQuota(body)) {
            return { ok: false, status: "unavailable", message: "The AI Tutor has used up today's question allowance. It becomes available again after the daily limit resets." };
          }
          const wait = retryAfterSeconds(body);
          return { ok: false, status: "unavailable", message: wait
            ? `The AI Tutor is busy right now. Please try again in about ${wait < 60 ? `${wait} seconds` : `${Math.ceil(wait / 60)} minutes`}.`
            : "The AI Tutor is busy right now. Please try again shortly." };
        }
        return { ok: false, status: response.status >= 500 ? "unavailable" : "failed", message: `The AI Tutor provider rejected the request (HTTP ${response.status}). The server log has the details.` };
      }
      const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>; promptFeedback?: { blockReason?: string }; usageMetadata?: Record<string, number> };
      const candidate = payload.candidates?.[0];
      const text = boundedText(candidate?.content?.parts?.map(part => part.text || "").join("\n"), 12_000);
      if (!text) {
        // A 200 with no text is a real outcome, not a transport failure: the answer was filtered,
        // or the token budget was spent on reasoning before any output was produced. Both are
        // worth distinguishing, because only one of them is fixed by raising the budget.
        const reason = candidate?.finishReason ?? payload.promptFeedback?.blockReason ?? "unknown";
        console.error(`[ai-tutor] provider returned 200 with no text. finishReason=${reason} model=${model}`, payload.usageMetadata ?? {});
        return { ok: false, status: "unavailable", message: `The AI Tutor provider returned no answer (${reason}).` };
      }
      return { ok: true, text, model };
    } catch (cause) {
      // A timeout means the model was still working, not that the request was lost. Retrying just
      // doubles the learner's wait, so only genuine transport errors get a second attempt.
      const abortedByTimeout = cause instanceof Error && cause.name === "AbortError";
      if (abortedByTimeout) {
        console.error(`[ai-tutor] provider timed out after ${REQUEST_TIMEOUT_MS}ms model=${model}`);
        return { ok: false, status: "unavailable", message: `The AI Tutor provider did not answer within ${Math.round(REQUEST_TIMEOUT_MS / 1000)}s.` };
      }
      console.error(`[ai-tutor] provider transport error (attempt ${attempt}/${MAX_ATTEMPTS}) model=${model}:`,
        cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause));
      if (attempt < MAX_ATTEMPTS) continue;
      return { ok: false, status: "unavailable", message: "The AI Tutor provider is temporarily unavailable." };
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, status: "unavailable", message: "The AI Tutor provider is temporarily unavailable." };
}

/** DeepSeek speaks the OpenAI chat-completions protocol. Same limits and failure wording as Gemini. */
async function generateDeepSeekTutorReply(request: TutorProviderRequest, env: NodeJS.ProcessEnv): Promise<TutorProviderResult> {
  const key = env.DEEPSEEK_API_KEY?.trim();
  const model = request.model?.trim() || configuredGeminiModel(env);
  const missing = missingGeminiEnv(env);
  if (!key || !model) {
    return { ok: false, status: "unavailable", message: `AI Tutor provider setup is required. Set ${missing.join(" and ") || "DEEPSEEK_API_KEY and DEEPSEEK_MODEL"} in the server environment before real answers can be generated.` };
  }
  const baseUrl = (env.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com").replace(/\/+$/, "");
  const messages = [
    { role: "system", content: boundedText(request.systemPrompt, 8000) },
    ...request.history.slice(-12).map(message => ({ role: message.role === "model" ? "assistant" : "user", content: boundedText(message.text, 4000) })),
    { role: "user", content: boundedText(request.userText, 4000) },
  ];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, messages, max_tokens: MAX_OUTPUT_TOKENS, temperature: 0.35, stream: false }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        console.error(`[ai-tutor] provider HTTP ${response.status} ${response.statusText} model=${model}`, redactKey(body, key).slice(0, 1500));
        if (attempt < MAX_ATTEMPTS && isRetryable(response.status)) continue;
        if (response.status === 429) return { ok: false, status: "unavailable", message: "The AI Tutor is busy right now. Please try again shortly." };
        if (response.status === 402) return { ok: false, status: "unavailable", message: "The AI Tutor provider account has no remaining balance." };
        return { ok: false, status: response.status >= 500 ? "unavailable" : "failed", message: `The AI Tutor provider rejected the request (HTTP ${response.status}). The server log has the details.` };
      }
      const payload = await response.json() as { choices?: Array<{ message?: { content?: string }; finish_reason?: string }>; usage?: Record<string, unknown> };
      const choice = payload.choices?.[0];
      const text = boundedText(choice?.message?.content, 12_000);
      if (!text) {
        const reason = choice?.finish_reason ?? "unknown";
        console.error(`[ai-tutor] provider returned 200 with no text. finishReason=${reason} model=${model}`, payload.usage ?? {});
        return { ok: false, status: "unavailable", message: `The AI Tutor provider returned no answer (${reason}).` };
      }
      return { ok: true, text, model };
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") {
        console.error(`[ai-tutor] provider timed out after ${REQUEST_TIMEOUT_MS}ms model=${model}`);
        return { ok: false, status: "unavailable", message: `The AI Tutor provider did not answer within ${Math.round(REQUEST_TIMEOUT_MS / 1000)}s.` };
      }
      console.error(`[ai-tutor] provider transport error (attempt ${attempt}/${MAX_ATTEMPTS}) model=${model}:`, cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause));
      if (attempt < MAX_ATTEMPTS) continue;
      return { ok: false, status: "unavailable", message: "The AI Tutor provider is temporarily unavailable." };
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, status: "unavailable", message: "The AI Tutor provider is temporarily unavailable." };
}

export const AI_TUTOR_PROVIDER_LIMITS = { requestTimeoutMs: REQUEST_TIMEOUT_MS, maxAttempts: MAX_ATTEMPTS, maxOutputTokens: MAX_OUTPUT_TOKENS } as const;
