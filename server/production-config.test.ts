import { describe, expect, it } from "vitest";
import { canUseClientFixtures, getProductionConfigReport } from "./production-config";

describe("production configuration boundaries", () => {
  it("reports only safe readiness metadata", () => {
    const report = getProductionConfigReport({
      NODE_ENV: "production",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "server-secret",
      VITE_SUPABASE_URL: "https://example.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "public-key",
    });
    expect(report.mode).toBe("production");
    expect(report.fixturesEnabled).toBe(false);
    expect(report.integrations.supabaseAuth.configured).toBe(true);
    expect(report.productionBlockers).toContain("aiTutor");
    expect(JSON.stringify(report)).not.toContain("server-secret");
    expect(JSON.stringify(report)).not.toContain("public-key");
  });

  it("requires an explicit non-production flag for fixtures", () => {
    expect(canUseClientFixtures({ NODE_ENV: "development" })).toBe(false);
    expect(canUseClientFixtures({ NODE_ENV: "development", VITE_ENABLE_TEST_FIXTURES: "true" })).toBe(true);
    expect(canUseClientFixtures({ NODE_ENV: "production", VITE_ENABLE_TEST_FIXTURES: "true" })).toBe(false);
  });

  it("marks provider-backed services blocked when no provider contract is configured", () => {
    const report = getProductionConfigReport({ NODE_ENV: "production" });
    expect(report.integrations.aiTutor.configured).toBe(false);
    expect(report.integrations.classroom.configured).toBe(false);
    expect(report.integrations.notifications.configured).toBe(false);
    expect(report.integrations.payments.configured).toBe(false);
    expect(report.integrations.payouts.configured).toBe(false);
    expect(report.productionBlockers).toEqual(expect.arrayContaining(["supabaseAuth", "supabaseDatabase", "privateStorage", "aiTutor", "classroom", "notifications", "payments", "payouts"]));
  });

  it("does not serialize provider secret values in readiness metadata", () => {
    const report = getProductionConfigReport({
      NODE_ENV: "production",
      AI_TUTOR_PROVIDER: "approved",
      AI_TUTOR_MODEL: "model",
      BUILT_IN_FORGE_API_URL: "https://example.invalid",
      BUILT_IN_FORGE_API_KEY: "hidden-ai-secret",
      CLASSROOM_PROVIDER: "approved",
      CLASSROOM_PROVIDER_API_KEY: "hidden-classroom-secret",
      NOTIFICATION_PROVIDER: "approved",
      NOTIFICATION_PROVIDER_API_KEY: "hidden-notification-secret",
      PAYMENT_PROVIDER: "approved",
      PAYMENT_PROVIDER_SECRET: "hidden-payment-secret",
      PAYOUT_PROVIDER: "approved",
      PAYOUT_PROVIDER_SECRET: "hidden-payout-secret",
    });
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("hidden-ai-secret");
    expect(serialized).not.toContain("hidden-classroom-secret");
    expect(serialized).not.toContain("hidden-notification-secret");
    expect(serialized).not.toContain("hidden-payment-secret");
    expect(serialized).not.toContain("hidden-payout-secret");
  });
});
