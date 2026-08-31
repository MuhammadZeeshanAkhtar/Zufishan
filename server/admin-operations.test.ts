import { describe, expect, it } from "vitest";
import {
  adjustSession,
  applyModerationDecision,
  appendAuditEvent,
  authorizeAdminAction,
  canEnterAdminDesk,
  canViewAdminData,
  changeUserRole,
  getAdminAnalytics,
  getAdminFinanceStatus,
  getAdminOverview,
  getPermissionMatrix,
  hasAdminPermission,
  isAuditMutationAllowed,
  queueNotification,
  resolveAdminActor,
  processWithdrawal,
  suspendUser,
  updateAdminSetting,
  updateSupportIssue,
} from "../client/src/lib/admin-ops-data";

describe("Prompt 12 admin operations boundaries", () => {
  it("resolves only reserved admin identities and normalizes email", () => {
    expect(resolveAdminActor(" ADMIN@NOORILM.DEMO ")?.role).toBe("admin");
    expect(resolveAdminActor("learner@example.com")).toBeNull();
  });

  it("keeps the role matrix least-privilege", () => {
    expect(hasAdminPermission("moderator", "courses.moderate")).toBe(true);
    expect(hasAdminPermission("moderator", "finance.adjust")).toBe(false);
    expect(hasAdminPermission("finance_operator", "finance.read")).toBe(true);
    expect(hasAdminPermission("finance_operator", "users.role_change")).toBe(false);
    expect(getPermissionMatrix().super_admin).toContain("settings.write");
  });

  it("rejects missing actors and self-suspension or self-role changes", () => {
    expect(authorizeAdminAction(null, "overview.read").allowed).toBe(false);
    const admin = resolveAdminActor("admin@noorilm.demo");
    const superAdmin = resolveAdminActor("superadmin@noorilm.demo");
    expect(suspendUser(admin, "admin-demo", "Risk", true).error).toMatch(/your own/i);
    expect(changeUserRole(superAdmin, "super-admin-demo", "admin", "Escalation", true).error).toMatch(/your own/i);
  });

  it("requires confirmation and reasons for sensitive actions", () => {
    const moderator = resolveAdminActor("moderator@noorilm.demo");
    expect(applyModerationDecision(moderator, "case-1", "reject", "", false).error).toMatch(/reason/i);
    expect(suspendUser(resolveAdminActor("admin@noorilm.demo"), "user-1", "", true).error).toMatch(/confirmation and a reason/i);
    expect(updateAdminSetting(resolveAdminActor("finance@noorilm.demo"), "platform_fee_bps", "100", "Change", true).error).toMatch(/permission/i);
  });

  it("does not claim connected moderation, audit, or support mutations in demo mode", () => {
    const admin = resolveAdminActor("admin@noorilm.demo");
    expect(applyModerationDecision(admin, "case-1", "approve", "Reviewed", true).error).toMatch(/not connected/i);
    expect(appendAuditEvent(admin, { actorId: admin!.id, actorRole: admin!.role, action: "review", entityType: "review", entityId: "r-1", previousSummary: null, newSummary: "approved", reason: "Reviewed", requestId: "req-1", createdAt: new Date().toISOString() }).error).toMatch(/not connected/i);
    expect(updateSupportIssue(admin, "issue-1", "resolved", "Handled", true).error).toMatch(/not connected/i);
  });

  it("protects the admin route, private data, and append-only audit semantics", () => {
    expect(canEnterAdminDesk("admin@noorilm.demo")).toBe(true);
    expect(canEnterAdminDesk("learner@example.com")).toBe(false);
    expect(canViewAdminData("support", "private_message_body")).toBe(false);
    expect(canViewAdminData("finance_operator", "financial_detail")).toBe(true);
    expect(isAuditMutationAllowed("insert")).toBe(true);
    expect(isAuditMutationAllowed("update")).toBe(false);
    expect(isAuditMutationAllowed("delete")).toBe(false);
  });

  it("requires audited session and withdrawal operations", () => {
    const superAdmin = resolveAdminActor("superadmin@noorilm.demo");
    expect(adjustSession(superAdmin, "session-1", "attendance", "", "present", "Correction", true).error).toMatch(/previous and new values/i);
    expect(adjustSession(superAdmin, "session-1", "attendance", "absent", "present", "Correction", true).error).toMatch(/not connected/i);
    expect(processWithdrawal(superAdmin, "withdrawal-1", "approve", "pending", "approved", "Verified", true).error).toMatch(/not connected/i);
    expect(processWithdrawal(superAdmin, "withdrawal-1", "mark_paid", "approved", "paid", "Verified", true).error).toMatch(/reconciliation/i);
  });

  it("requires safe idempotent notification inputs", () => {
    expect(queueNotification({ userId: "u-1", category: "security_alert", title: "", body: "Body", idempotencyKey: "k" }).error).toMatch(/title/i);
    expect(queueNotification({ userId: "u-1", category: "security_alert", title: "Title", body: "Body", idempotencyKey: null }).error).toMatch(/idempotency/i);
    expect(queueNotification({ userId: "u-1", category: "security_alert", title: "Title", body: "Body", idempotencyKey: "k" }).error).toMatch(/not connected/i);
  });

  it("keeps overview and analytics values unavailable instead of fabricating business metrics", () => {
    const overview = getAdminOverview();
    expect(overview.status).toBe("setup_needed");
    expect(overview.metrics.every((metric) => metric.value === null)).toBe(true);
    expect(getAdminAnalytics().every((metric) => metric.value === null && metric.sourceStatus === "setup_needed")).toBe(true);
    expect(getAdminFinanceStatus().currencyAggregation).toBe("separated_by_currency");
  });
});
