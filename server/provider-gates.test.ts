import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const classroom = readFileSync(new URL("../client/src/components/ClassroomExperience.tsx", import.meta.url), "utf8");
const operations = readFileSync(new URL("../client/src/components/RelationshipOpsExperience.tsx", import.meta.url), "utf8");
const admin = readFileSync(new URL("../client/src/components/AdminExperience.tsx", import.meta.url), "utf8");
const aiTutor = readFileSync(new URL("./ai-tutor.ts", import.meta.url), "utf8");
const serverLlm = readFileSync(new URL("./_core/llm.ts", import.meta.url), "utf8");
const serverEnv = readFileSync(new URL("./_core/env.ts", import.meta.url), "utf8");
const productionConfig = readFileSync(new URL("./production-config.ts", import.meta.url), "utf8");

describe("provider readiness gates", () => {
  it("keeps classroom and Realtime actions behind provider/setup boundaries", () => {
    expect(classroom).toMatch(/provider|realtime|setup-needed|setup needed/i);
    expect(classroom).toMatch(/No .*connected|requires|unavailable|setup/i);
  });

  it("does not expose financial or withdrawal success without a provider", () => {
    expect(operations).toContain("Payment provider required");
    expect(operations).toContain("Payout provider required");
    expect(admin).toContain("Payout provider required");
    expect(admin).toContain("Notification provider required");
  });

  it("keeps AI Tutor provider calls server-side and bounded", () => {
    expect(serverLlm).toContain("ENV.forgeApiKey");
    expect(serverEnv).toContain("BUILT_IN_FORGE_API_KEY");
    expect(aiTutor).toMatch(/safety|provider|limit/i);
    expect(aiTutor).not.toContain("VITE_");
  });

  it("reports provider readiness without exposing configuration values", () => {
    expect(productionConfig).toContain("requiredEnv");
    expect(productionConfig).not.toContain("process.env.SUPABASE_SERVICE_ROLE_KEY");
    expect(productionConfig).not.toContain("process.env.SUPABASE_DB_URL");
  });
});
