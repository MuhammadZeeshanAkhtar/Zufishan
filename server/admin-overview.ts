/**
 * Admin overview — the platform's real numbers, read once, server-side.
 *
 * Three rules shape this module, and they are the reason it exists at all rather
 * than the browser issuing ten queries itself:
 *
 *  1. **The role is checked here, before anything is read.** `readOwnRoles` goes
 *     to `user_roles` on the service client using the server-verified identity,
 *     so a caller cannot claim a role. Only `admin`/`super_admin` pass — the
 *     same boundary the RLS policies draw with `is_admin_user()`, which is what
 *     actually protects `audit_logs` and `profiles`. A moderator is a reviewer,
 *     not an operator of this desk, and is refused here exactly as the database
 *     would refuse them.
 *
 *  2. **A number is either real or absent.** Every count is an `exact`/`head`
 *     query against the live table. Nothing is estimated, defaulted or carried
 *     over. A count that fails comes back as `value: null` with `available:
 *     false`, so the card can say "could not be read" instead of drawing a
 *     confident zero. Zero itself is a real answer and is shown as zero.
 *
 *  3. **Provider status is env NAMES, never env VALUES.** The rows below say
 *     which variables a provider needs and whether they are set. They never
 *     carry a key, a token or a URL, so this payload is safe in a browser.
 *
 * One failed count must not blank the page, so each is awaited independently and
 * failures are recorded per metric rather than thrown.
 */
import { getSupabaseAdminClient } from "./supabase-admin-client";
import type { SupabaseIdentity } from "./supabase-auth";
import { readOwnRoles } from "./supabase-admin-auth";
import { getProductionConfigReport } from "./production-config";
import { ACCOUNT_ROLE_KEYS, type AccountRoleKey } from "@shared/account-roles";

type Result<T> = { ok: true; data: T } | { ok: false; error: string; code?: "FORBIDDEN" | "SETUP_NEEDED" };

const forbidden = <T,>(): Result<T> => ({ ok: false, error: "This desk requires an administrator role.", code: "FORBIDDEN" });

/** A single headline number. `value` is null only when the query itself failed. */
export type AdminMetric = {
  key: string;
  value: number | null;
  /** False when the count could not be read at all — the card must not render a zero. */
  available: boolean;
};

/**
 * Whether an integration is usable.
 *
 * `not_implemented` is deliberately distinct from `setup_needed`: currency/FX and
 * refunds have no provider boundary in this codebase at all, so telling an
 * operator to "configure" them would point at variables that nothing reads.
 */
export type ProviderState = "ready" | "setup_needed" | "not_implemented";

export type ProviderRow = {
  key: string;
  state: ProviderState;
  /** Variable NAMES only. Never a value, and never logged. */
  requiredEnv: string[];
};

export type AuditSummaryRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorName: string | null;
  createdAt: string;
  /** Allow-listed transition fields only; everything else in `metadata` is dropped. */
  from: string | null;
  to: string | null;
};

/**
 * Accounts grouped by their effective role.
 *
 * The buckets are exhaustive and mutually exclusive — every account is in
 * exactly one — so `totalAccounts` is a genuine cross-check rather than a
 * restatement. It is read independently for that reason: if the buckets do not
 * add up to it, the page can say so instead of quietly presenting a picture
 * that has lost somebody.
 */
export type AccountRoleTotals = {
  buckets: Array<{ key: AccountRoleKey; value: number | null; available: boolean }>;
  totalAccounts: number | null;
};

export type AdminOverview = {
  metrics: AdminMetric[];
  /** The full role breakdown, including buckets that have no headline card. */
  accountRoles: AccountRoleTotals;
  providers: ProviderRow[];
  recentActivity: AuditSummaryRow[];
  /** True when the audit read itself failed, so an empty list is not read as "nothing happened". */
  activityUnavailable: boolean;
  generatedAt: string;
};

/** The metrics the overview reports, in display order, each bound to a real table. */
export const METRIC_KEYS = [
  "learners",
  "instructors",
  // Administrators are a headline number of their own. They were previously
  // invisible here and, worse, counted inside "learners" — see the note on the
  // counts below.
  "admins",
  "courses",
  "publishedCourses",
  "pendingVerifications",
  "coursesInReview",
  "pendingReviews",
  "upcomingBookings",
  "openReports",
  "openCases",
] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];

export async function getAdminOverview(identity: SupabaseIdentity): Promise<Result<AdminOverview>> {
  const roles = await readOwnRoles(identity);
  if (!roles.ok) return { ok: false, error: roles.error, code: "SETUP_NEEDED" };
  // Admin only. A moderator may review submissions; the operations desk is not theirs.
  if (!roles.isAdmin) return forbidden();

  const admin = getSupabaseAdminClient();
  if (!admin) return { ok: false, error: "Supabase administrative access is not configured.", code: "SETUP_NEEDED" };

  /** One exact count. Returns null on failure rather than throwing, so siblings still render. */
  const count = async (table: string, refine?: (query: any) => any): Promise<number | null> => {
    let query: any = admin.from(table).select("*", { count: "exact", head: true });
    if (refine) query = refine(query);
    const { count: value, error } = await query;
    if (error) {
      // Code and message only: never the row, never the connection string.
      console.error("[admin-overview] count failed:", { table, code: error.code, message: error.message });
      return null;
    }
    return value ?? 0;
  };

  const nowIso = new Date().toISOString();

  /**
   * Role figures count ACCOUNTS, through `account_effective_role`.
   *
   * They used to count rows in `user_roles`, which is a many-to-one table: an
   * account holding both `admin` and `learner` — as every account created
   * before migration 0023 does, because the old signup trigger added a `learner`
   * row unconditionally — was counted in both totals. The administrator was
   * therefore reported as a learner, and the totals overlapped.
   *
   * The view resolves each account to its single highest-privilege role, so the
   * buckets are mutually exclusive at the source. Nothing is subtracted here and
   * no account is excluded by identity: an administrator is simply not a learner
   * because `admin` outranks `learner`. Each bucket is a head count, so no row
   * crosses the wire however large the platform grows.
   */
  const [
    roleBuckets, totalAccounts,
    courses, publishedCourses, pendingVerifications,
    coursesInReview, pendingReviews, upcomingBookings, openReports, openReviewReports, openCases,
  ] = await Promise.all([
    Promise.all(ACCOUNT_ROLE_KEYS.map((key) => count("account_effective_role", (q) => q.eq("effective_role", key)))),
    count("profiles"),
    count("courses"),
    count("courses", (q) => q.eq("status", "published")),
    count("instructor_profiles", (q) => q.eq("verification_status", "verification_pending")),
    count("courses", (q) => q.eq("status", "in_review")),
    count("reviews", (q) => q.eq("status", "pending")),
    count("bookings", (q) => q.eq("status", "confirmed").gte("scheduled_start_at", nowIso)),
    count("reports", (q) => q.eq("status", "open")),
    count("review_reports", (q) => q.eq("status", "open")),
    count("moderation_cases", (q) => q.in("status", ["open", "investigating"])),
  ]);

  // Reported content spans two tables. Summing them is only honest when both were
  // actually read; if either failed the total is unknown, not partial.
  const reportedTotal = openReports === null || openReviewReports === null ? null : openReports + openReviewReports;

  const accountsByRole = Object.fromEntries(
    ACCOUNT_ROLE_KEYS.map((key, index) => [key, roleBuckets[index]]),
  ) as Record<AccountRoleKey, number | null>;

  const values: Record<MetricKey, number | null> = {
    // The three headline role cards read the same buckets as the breakdown
    // below, so a card can never disagree with the total beneath it.
    learners: accountsByRole.learners,
    instructors: accountsByRole.instructors,
    admins: accountsByRole.admins,
    courses, publishedCourses, pendingVerifications,
    coursesInReview, pendingReviews, upcomingBookings,
    openReports: reportedTotal, openCases,
  };

  const accountRoles: AccountRoleTotals = {
    buckets: ACCOUNT_ROLE_KEYS.map((key) => ({
      key,
      value: accountsByRole[key],
      available: accountsByRole[key] !== null,
    })),
    totalAccounts,
  };

  const metrics: AdminMetric[] = METRIC_KEYS.map((key) => ({
    key,
    value: values[key],
    available: values[key] !== null,
  }));

  // The last few recorded decisions. `audit_logs` has a select policy for admins
  // and no write policy at all, so this is a read of an append-only record.
  const { data: auditRows, error: auditError } = await admin
    .from("audit_logs")
    .select("id,action,entity_type,entity_id,metadata,created_at,profiles:actor_id(display_name,full_name)")
    .order("created_at", { ascending: false })
    .limit(8);
  if (auditError) console.error("[admin-overview] audit read failed:", { code: auditError.code, message: auditError.message });

  const recentActivity: AuditSummaryRow[] = (auditRows ?? []).map((row) => {
    const record = row as Record<string, unknown>;
    const actor = (record.profiles ?? null) as { display_name?: string | null; full_name?: string | null } | null;
    // Only the transition is carried across. Reviewer notes and any other free
    // text stay in the table, where the audit page can show them deliberately.
    const metadata = (record.metadata ?? {}) as Record<string, unknown>;
    return {
      id: String(record.id),
      action: String(record.action),
      entityType: String(record.entity_type),
      entityId: record.entity_id ? String(record.entity_id) : null,
      actorName: actor?.display_name || actor?.full_name || null,
      createdAt: String(record.created_at),
      from: typeof metadata.from === "string" ? metadata.from : null,
      to: typeof metadata.to === "string" ? metadata.to : null,
    };
  });

  return {
    ok: true,
    data: {
      metrics,
      accountRoles,
      providers: describeProviders(),
      recentActivity,
      activityUnavailable: Boolean(auditError),
      generatedAt: nowIso,
    },
  };
}

/**
 * Integration readiness, derived from which variables are set.
 *
 * Live Classroom, Payments, Payouts/Withdrawals and Notifications have real
 * provider boundaries in this codebase, so their state is measured. Currency/FX
 * and Refunds do not: no module reads an FX or refund variable, so reporting
 * them as "setup needed" would be an instruction that leads nowhere. They are
 * reported as not implemented, which is the true state.
 */
export function describeProviders(env: NodeJS.ProcessEnv = process.env): ProviderRow[] {
  const report = getProductionConfigReport(env);
  const measured = (key: string, integration: { configured: boolean; requiredEnv: string[] }): ProviderRow => ({
    key,
    state: integration.configured ? "ready" : "setup_needed",
    requiredEnv: integration.requiredEnv,
  });
  return [
    measured("classroom", report.integrations.classroom),
    measured("payments", report.integrations.payments),
    { key: "fx", state: "not_implemented", requiredEnv: [] },
    { key: "refunds", state: "not_implemented", requiredEnv: [] },
    measured("payouts", report.integrations.payouts),
    measured("notifications", report.integrations.notifications),
  ];
}
