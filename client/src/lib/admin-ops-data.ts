export type AdminRole = "moderator" | "support" | "finance_operator" | "admin" | "super_admin";
export type AdminPermission =
  | "overview.read"
  | "users.read"
  | "users.suspend"
  | "users.role_change"
  | "instructors.read"
  | "instructors.moderate"
  | "courses.read"
  | "courses.moderate"
  | "sessions.read"
  | "sessions.adjust"
  | "enrolments.read"
  | "progress.read"
  | "reviews.moderate"
  | "reports.read"
  | "reports.manage"
  | "finance.read"
  | "finance.adjust"
  | "notifications.read"
  | "notifications.retry"
  | "analytics.read"
  | "audit.read"
  | "settings.read"
  | "settings.write"
  | "support.manage";
export type AdminCaseStatus = "open" | "assigned" | "awaiting_information" | "resolved" | "rejected" | "escalated";
export type AdminCaseType = "instructor_verification" | "credential_review" | "course_submission" | "reported_course" | "reported_instructor" | "reported_review" | "reported_message" | "safety" | "payment_issue" | "technical_issue";
export type AdminAction = "approve" | "request_changes" | "hide" | "restore" | "reject" | "resolve" | "escalate" | "suspend" | "assign" | "request_information" | "adjust";
export type AdminEntityType = "user" | "instructor" | "course" | "session" | "enrolment" | "review" | "report" | "notification" | "setting" | "withdrawal";
export type AdminDataStatus = "connected" | "setup_needed" | "empty" | "error";

export type AdminActor = { id: string; email: string; role: AdminRole };
export type AdminMetric = { key: string; label: string; value: number | null; status: AdminDataStatus; detail: string; lastUpdatedAt: string | null };
export type AdminOverview = { metrics: AdminMetric[]; paymentProvider: "connected" | "setup_needed"; notificationProvider: "connected" | "setup_needed"; lastUpdatedAt: string | null; status: AdminDataStatus };
export type AdminUserSummary = { id: string; displayName: string | null; emailMasked: string | null; role: "learner" | "instructor" | "moderator" | "support" | "finance_operator" | "admin" | "super_admin"; accountStatus: "active" | "suspended" | "deactivated" | "pending"; verificationStatus: "verified" | "unverified" | "pending" | "not_applicable"; lastActivityAt: string | null; privateDataVisible: false };
export type ModerationCase = { id: string; entityType: AdminEntityType; entityId: string; caseType: AdminCaseType; assignedTo: string | null; status: AdminCaseStatus; priority: "low" | "normal" | "high" | "urgent"; reason: string; resolutionNote: string | null; createdAt: string; updatedAt: string; isDemo: boolean };
export type ModerationAction = { id: string; caseId: string; actorId: string; action: AdminAction; previousStatus: AdminCaseStatus | null; newStatus: AdminCaseStatus | null; reason: string; createdAt: string; isDemo: boolean };
export type AuditEvent = { id: string; actorId: string | null; actorRole: AdminRole | null; action: string; entityType: AdminEntityType; entityId: string | null; previousSummary: string | null; newSummary: string | null; reason: string | null; requestId: string | null; createdAt: string; immutable: true; privateDataExcluded: true };
export type AdminNotification = { id: string; userId: string; category: "trial_request" | "booking_update" | "session_reminder" | "course_moderation" | "review_report_update" | "payment_status" | "withdrawal_status" | "security_alert"; title: string; body: string; status: "queued" | "sent" | "failed" | "read"; idempotencyKey: string | null; readAt: string | null; createdAt: string; };
export type NotificationPreference = { userId: string; category: AdminNotification["category"]; inAppEnabled: boolean; emailEnabled: boolean; pushEnabled: boolean; updatedAt: string | null };
export type AnalyticsMetric = { key: string; label: string; unit: "count" | "percentage" | "currency" | "duration"; range: "7d" | "30d" | "90d" | "custom"; sourceStatus: AdminDataStatus; value: number | null; lastUpdatedAt: string | null; message: string };
export type AdminSetting = { key: string; valueLabel: string; sensitive: boolean; effectiveAt: string | null; updatedBy: string | null; updatedAt: string | null; status: AdminDataStatus };
export type SupportIssue = { id: string; category: "technical_issue" | "payment_issue" | "safety" | "account" | "other"; status: "open" | "in_progress" | "awaiting_user" | "resolved" | "closed"; priority: "normal" | "high" | "urgent"; subject: string; privateSummary: string | null; assignedTo: string | null; createdAt: string; updatedAt: string; };

const permissionMatrix: Record<AdminRole, readonly AdminPermission[]> = {
  moderator: ["overview.read", "instructors.read", "instructors.moderate", "courses.read", "courses.moderate", "reviews.moderate", "reports.read", "reports.manage", "audit.read"],
  support: ["overview.read", "users.read", "instructors.read", "courses.read", "sessions.read", "enrolments.read", "reports.read", "reports.manage", "notifications.read", "support.manage", "audit.read"],
  finance_operator: ["overview.read", "sessions.read", "enrolments.read", "finance.read", "notifications.read", "analytics.read", "audit.read"],
  admin: ["overview.read", "users.read", "users.suspend", "instructors.read", "instructors.moderate", "courses.read", "courses.moderate", "sessions.read", "enrolments.read", "progress.read", "reviews.moderate", "reports.read", "reports.manage", "notifications.read", "notifications.retry", "analytics.read", "audit.read", "settings.read", "support.manage"],
  super_admin: ["overview.read", "users.read", "users.suspend", "users.role_change", "instructors.read", "instructors.moderate", "courses.read", "courses.moderate", "sessions.read", "sessions.adjust", "enrolments.read", "progress.read", "reviews.moderate", "reports.read", "reports.manage", "finance.read", "finance.adjust", "notifications.read", "notifications.retry", "analytics.read", "audit.read", "settings.read", "settings.write", "support.manage"],
};

export function getPermissionMatrix() { return permissionMatrix; }
export function hasAdminPermission(role: AdminRole, permission: AdminPermission) { return permissionMatrix[role].includes(permission); }
export function resolveAdminActor(email: string): AdminActor | null {
  const normalized = email.trim().toLowerCase();
  if (normalized === "admin@noorilm.demo") return { id: "admin-demo", email: normalized, role: "admin" };
  if (normalized === "superadmin@noorilm.demo") return { id: "super-admin-demo", email: normalized, role: "super_admin" };
  if (normalized === "moderator@noorilm.demo") return { id: "moderator-demo", email: normalized, role: "moderator" };
  if (normalized === "support@noorilm.demo") return { id: "support-demo", email: normalized, role: "support" };
  if (normalized === "finance@noorilm.demo") return { id: "finance-demo", email: normalized, role: "finance_operator" };
  return null;
}
export function authorizeAdminAction(actor: AdminActor | null, permission: AdminPermission) { if (!actor) return { allowed: false as const, error: "A connected authorised admin identity is required." }; return hasAdminPermission(actor.role, permission) ? { allowed: true as const } : { allowed: false as const, error: "This admin role does not have the required permission." }; }
export function canEnterAdminDesk(email: string | null | undefined) { return resolveAdminActor(email || "") !== null; }
export function canViewAdminData(role: AdminRole, dataType: "financial_detail" | "private_message_body" | "minimal_user_summary" | "audit_log") { if (dataType === "minimal_user_summary" || dataType === "audit_log") return hasAdminPermission(role, "audit.read"); if (dataType === "financial_detail") return hasAdminPermission(role, "finance.read"); return role === "super_admin" || role === "admin"; }
export function isAuditMutationAllowed(action: "insert" | "update" | "delete") { return action === "insert"; }


const unavailableMetric = (key: string, label: string, detail: string): AdminMetric => ({ key, label, value: null, status: "setup_needed", detail, lastUpdatedAt: null });
export function getAdminOverview(): AdminOverview { return { metrics: [unavailableMetric("learners", "Total learners", "Database connection required"), unavailableMetric("instructors", "Total instructors", "Database connection required"), unavailableMetric("pending_instructor_verification", "Pending instructor verification", "Moderation queue required"), unavailableMetric("courses_awaiting_moderation", "Courses awaiting moderation", "Course moderation queue required"), unavailableMetric("active_enrolments", "Active enrolments", "Database connection required"), unavailableMetric("upcoming_sessions", "Upcoming sessions", "Session ledger required"), unavailableMetric("sessions_attention", "Sessions requiring attention", "Operations query required"), unavailableMetric("open_reports", "Open reports", "Reports service required"), unavailableMetric("pending_reviews", "Pending reviews", "Review moderation queue required"), unavailableMetric("pending_withdrawals", "Pending withdrawals", "Payout provider required")], paymentProvider: "setup_needed", notificationProvider: "setup_needed", lastUpdatedAt: null, status: "setup_needed" }; }
export function getAdminUsers(): AdminUserSummary[] { return []; }
export function getAdminUser(userId: string) { return getAdminUsers().find((user) => user.id === userId) || null; }
export function maskAdminEmail(email: string) { const [local, domain] = email.split("@"); if (!domain) return "Hidden"; return `${local.slice(0, 1)}***@${domain}`; }
export function suspendUser(actor: AdminActor | null, userId: string, reason: string, confirmed: boolean) { const access = authorizeAdminAction(actor, "users.suspend"); if (!access.allowed) return access; if (actor?.id === userId) return { allowed: false as const, error: "You cannot suspend your own admin identity." }; if (!confirmed || !reason.trim()) return { allowed: false as const, error: "Suspension requires confirmation and a reason." }; return { allowed: false as const, error: "User status service is not connected. No account was suspended." }; }
export function changeUserRole(actor: AdminActor | null, targetUserId: string, nextRole: AdminRole, reason: string, confirmed: boolean) { const access = authorizeAdminAction(actor, "users.role_change"); if (!access.allowed) return access; if (actor?.id === targetUserId) return { allowed: false as const, error: "You cannot change your own role." }; if (!reason.trim() || !confirmed) return { allowed: false as const, error: "Role changes require confirmation and a reason." }; return { allowed: false as const, error: `Role change to ${nextRole} requires a connected protected service. No role was changed.` }; }

export function getModerationQueues(): ModerationCase[] { return []; }
export function applyModerationDecision(actor: AdminActor | null, caseId: string, action: AdminAction, reason: string, confirmed: boolean) { const permission = action === "approve" || action === "request_changes" || action === "hide" || action === "restore" || action === "reject" || action === "suspend" ? "courses.moderate" as const : "reports.manage" as const; const access = authorizeAdminAction(actor, permission); if (!access.allowed) return access; if (!confirmed || !reason.trim()) return { allowed: false as const, error: "Moderation decisions require explicit confirmation and a reason." }; return { allowed: false as const, error: "Moderation service is not connected. No decision was applied." }; }
export function getAdminAuditLogs(): AuditEvent[] { return []; }
export function adjustSession(actor: AdminActor | null, sessionId: string, field: "attendance" | "duration" | "status", previousValue: string, nextValue: string, reason: string, confirmed: boolean) { const access = authorizeAdminAction(actor, "sessions.adjust"); if (!access.allowed) return access; if (!sessionId || !previousValue.trim() || !nextValue.trim() || !reason.trim() || !confirmed) return { allowed: false as const, error: "Session adjustments require the session, previous and new values, confirmation, and a reason." }; return { allowed: false as const, error: `Session ${field} adjustment is not connected. Original value was not changed.` }; }
export function appendAuditEvent(actor: AdminActor | null, event: Omit<AuditEvent, "id" | "immutable" | "privateDataExcluded">) { if (!actor) return { ok: false as const, error: "An authorised actor is required." }; return { ok: false as const, error: "Audit storage is not connected. No audit event was written." }; }

export function getAdminNotifications(): AdminNotification[] { return []; }
export function getNotificationPreferences(userId: string): NotificationPreference[] { return []; }
export function queueNotification(input: Pick<AdminNotification, "userId" | "category" | "title" | "body" | "idempotencyKey">) { if (!input.title.trim() || !input.body.trim()) return { ok: false as const, error: "Notification title and body are required." }; if (!input.idempotencyKey) return { ok: false as const, error: "An idempotency key is required." }; return { ok: false as const, error: "Notification provider is not connected. Nothing was queued." }; }
export function markNotificationRead(notificationId: string, userId: string) { return { ok: false as const, error: "Notification storage is not connected. Nothing was marked read." }; }
export function retryNotification(actor: AdminActor | null, notificationId: string, confirmed: boolean) { const access = authorizeAdminAction(actor, "notifications.retry"); if (!access.allowed) return access; if (!confirmed) return { allowed: false as const, error: "Retry requires confirmation." }; return { allowed: false as const, error: "Notification provider is not connected. Nothing was retried." }; }

export function getAdminAnalytics(): AnalyticsMetric[] { return ["learner_registrations", "instructor_onboarding", "course_publication", "enrolments", "lesson_completion", "trial_to_booking", "attendance", "reviews", "report_resolution"].map((key) => ({ key, label: key.replaceAll("_", " "), unit: key === "lesson_completion" || key === "trial_to_booking" ? "percentage" : "count", range: "30d", sourceStatus: "setup_needed", value: null, lastUpdatedAt: null, message: "Not enough connected data yet. Demo charts are intentionally not fabricated." })); }
export function getAdminSettings(): AdminSetting[] { return [{ key: "supported_currencies", valueLabel: "Not configured", sensitive: false, effectiveAt: null, updatedBy: null, updatedAt: null, status: "setup_needed" }, { key: "platform_fee_bps", valueLabel: "Product decision needed", sensitive: true, effectiveAt: null, updatedBy: null, updatedAt: null, status: "setup_needed" }, { key: "withdrawal_minimum", valueLabel: "Product decision needed", sensitive: true, effectiveAt: null, updatedBy: null, updatedAt: null, status: "setup_needed" }, { key: "notification_preferences", valueLabel: "Provider required", sensitive: false, effectiveAt: null, updatedBy: null, updatedAt: null, status: "setup_needed" }]; }
export function updateAdminSetting(actor: AdminActor | null, key: string, value: string, reason: string, confirmed: boolean) { const access = authorizeAdminAction(actor, "settings.write"); if (!access.allowed) return access; if (!value.trim() || !reason.trim() || !confirmed) return { allowed: false as const, error: "Settings changes require a value, confirmation, and a reason." }; return { allowed: false as const, error: `Setting ${key} was not changed because the protected admin service is not connected.` }; }

export function getSupportIssues(): SupportIssue[] { return []; }
export function updateSupportIssue(actor: AdminActor | null, issueId: string, status: SupportIssue["status"], note: string, confirmed: boolean) { const access = authorizeAdminAction(actor, "support.manage"); if (!access.allowed) return access; if (!confirmed || !note.trim()) return { allowed: false as const, error: "Support status changes require confirmation and a private note." }; return { allowed: false as const, error: "Support issue service is not connected. No issue was changed." }; }
export function processWithdrawal(actor: AdminActor | null, withdrawalId: string, action: "approve" | "reject" | "mark_paid" | "cancel", previousStatus: string, nextStatus: string, reason: string, confirmed: boolean) { const access = authorizeAdminAction(actor, "finance.adjust"); if (!access.allowed) return access; if (!withdrawalId || !previousStatus.trim() || !nextStatus.trim() || !reason.trim() || !confirmed) return { allowed: false as const, error: "Withdrawal operations require previous and new status, confirmation, and a reason." }; if (action === "mark_paid") return { allowed: false as const, error: "A verified payout reconciliation is required before any withdrawal can be marked paid." }; return { allowed: false as const, error: `Withdrawal ${action} is not connected. No payout status was changed.` }; }
export function getAdminFinanceStatus() { return { paymentProvider: "setup_needed" as const, payoutProvider: "setup_needed" as const, reconciliation: "setup_needed" as const, currencyAggregation: "separated_by_currency" as const, message: "Payment and payout integration required. No financial totals are presented as real." }; }
