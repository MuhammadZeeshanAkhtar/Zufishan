import { describe, expect, it } from "vitest";
import { generateGeminiTutorReply } from "./ai-tutor-provider";

const smokeCases = [
  { locale: "en", question: "Give me one beginner English vocabulary exercise about greetings." },
  { locale: "ur", question: "اردو میں سلام کے موضوع پر ایک مختصر ابتدائی زبان سیکھنے کی مشق دیں۔" },
  { locale: "ar", question: "قدّم لي تمرينًا قصيرًا للمبتدئين لتعلّم مفردات التحية باللغة العربية." },
] as const;

describe.skipIf(process.env.RUN_GEMINI_SMOKE !== "true")( "real Gemini AI Tutor smoke", () => {
  for (const sample of smokeCases) {
    it(`returns a provider answer for ${sample.locale}`, async () => {
      const started = Date.now();
      const result = await generateGeminiTutorReply({
        systemPrompt: "You are a language-learning tutor. Answer only the safe language-learning question. Do not provide religious rulings or citations.",
        history: [],
        userText: sample.question,
      });
      const latencyMs = Date.now() - started;
      console.info(`GEMINI_SMOKE locale=${sample.locale} status=${result.ok ? "success" : result.status} model=${result.ok ? result.model : "unavailable"} latencyMs=${latencyMs}`);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.text.length).toBeGreaterThan(0);
    }, 90_000);
  }
});
