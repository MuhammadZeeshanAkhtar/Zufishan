import { describe, expect, it } from "vitest";
import {
  calculateGrossSessionAmount,
  calculateInstructorNetAmount,
  calculatePlatformFee,
  canSubmitReview,
  createCheckoutSession,
  createPayoutRequest,
  createWithdrawalRequest,
  getConversation,
  moderateReview,
  getConversations,
  getProviderBoundary,
  getWalletDecisionState,
  isDuplicateReview,
  markConversationRead,
  reportConversation,
  resolveOpsActorId,
  sendMessage,
  submitReport,
  submitReview,
  verifyCheckoutResult,
} from "../client/src/lib/relationship-ops-data";

describe("Prompt 11 relationship operation boundaries", () => {
  it("resolves only seeded demo identities and is case insensitive", () => {
    expect(resolveOpsActorId("LEARNER@NOORILM.DEMO", "learner")).toBe("learner-demo");
    expect(resolveOpsActorId("unknown@example.com", "learner")).toBeNull();
    expect(resolveOpsActorId("instructor@noorilm.demo", "learner")).toBeNull();
  });

  it("returns conversations only for authorised members", () => {
    expect(getConversations("learner-demo")).toHaveLength(1);
    expect(getConversations("arbitrary-user")).toHaveLength(0);
    expect(getConversation("conversation-trial-101", "arbitrary-user").ok).toBe(false);
    expect(getConversation("conversation-trial-101", "learner-demo").ok).toBe(true);
  });

  it("keeps message writes behind membership, validation, and a connected service", () => {
    expect(sendMessage("conversation-trial-101", "arbitrary-user", "Hello").error).toMatch(/authorised/i);
    expect(sendMessage("conversation-trial-101", "learner-demo", "  ").error).toMatch(/empty/i);
    expect(sendMessage("conversation-trial-101", "learner-demo", "Hello").error).toMatch(/not connected/i);
    expect(sendMessage("conversation-trial-101", "learner-demo", "x".repeat(2001)).error).toMatch(/2,000/i);
    expect(markConversationRead("conversation-trial-101", "arbitrary-user").error).toMatch(/authorised/i);
  });

  it("requires private report fields and never claims submission in demo mode", () => {
    expect(reportConversation("conversation-trial-101", "arbitrary-user", "spam").error).toMatch(/authorised/i);
    expect(submitReport({ reporterId: "learner-demo", targetType: "conversation", targetId: "conversation-trial-101", reason: "spam", description: "" }).error).toMatch(/description/i);
    expect(submitReport({ reporterId: "learner-demo", targetType: "conversation", targetId: "conversation-trial-101", reason: "spam", description: "Relevant context" }).error).toMatch(/not connected/i);
  });

  it("allows review eligibility only for the eligible learner after an attended completion", () => {
    const base = { id: "session-eligible", learnerId: "learner-demo", instructorId: "instructor-demo", sessionId: "session-eligible", status: "completed" as const, attendanceStatus: "present" as const };
    expect(canSubmitReview(base, "arbitrary-user").eligible).toBe(false);
    expect(canSubmitReview({ ...base, status: "scheduled" }, "learner-demo").eligible).toBe(false);
    expect(canSubmitReview(base, "learner-demo").eligible).toBe(true);
    expect(submitReview({ event: base, reviewerId: "learner-demo", rating: 5, reviewText: "Clear and useful.", publicConsent: false }).error).toMatch(/not connected/i);
  });

  it("keeps duplicate-review prevention and moderation reasons server-bound", () => {
    const event = { id: "session-duplicate", learnerId: "learner-demo", instructorId: "instructor-demo", sessionId: "session-duplicate", status: "completed" as const, attendanceStatus: "present" as const };
    expect(canSubmitReview(event, "learner-demo").eligible).toBe(true);
    expect(isDuplicateReview(event, "learner-demo", [{ reviewerId: "learner-demo", sessionId: "session-duplicate" }])).toBe(true);
    expect(isDuplicateReview(event, "learner-demo", [])).toBe(false);
    expect(moderateReview("review-missing", "hide", "").error).toMatch(/reason/i);
    expect(moderateReview("review-missing", "publish", "").error).toMatch(/not found/i);
    expect(submitReview({ event, reviewerId: "learner-demo", rating: 6, reviewText: "Not valid.", publicConsent: false }).error).toMatch(/1 to 5/i);
  });

  it("calculates integer minor-unit amounts only when configuration is approved", () => {
    const gross = calculateGrossSessionAmount(2700, 2400);
    expect(gross.amountCents).toBe(1800);
    const fee = calculatePlatformFee({ ...gross, currency: "PKR" }, { platformFeeBps: 1000, currency: "PKR", approved: true });
    expect(fee.amountCents).toBe(180);
    expect(calculateInstructorNetAmount({ ...gross, currency: "PKR" }, fee).amountCents).toBe(1620);
    expect(calculatePlatformFee(gross, { platformFeeBps: null, currency: null, approved: false }).amountCents).toBeNull();
  });

  it("keeps checkout, payout, wallet, and withdrawal actions honest until providers are connected", () => {
    expect(createCheckoutSession().error).toMatch(/not connected/i);
    expect(verifyCheckoutResult().error).toMatch(/verified provider/i);
    expect(createPayoutRequest().error).toMatch(/required/i);
    expect(getProviderBoundary().status).toBe("setup_needed");
    expect(getWalletDecisionState().status).toBe("product_decision_needed");
    expect(createWithdrawalRequest("instructor-demo", 0, "PKR").error).toMatch(/valid/i);
    expect(createWithdrawalRequest("instructor-demo", 1000, "PKR").error).toMatch(/payout integration/i);
  });
});
