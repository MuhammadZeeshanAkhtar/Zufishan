/**
 * Content and review moderation for the admin desk.
 *
 * Four record types share this module because they are one job: something has
 * been flagged or is awaiting a visibility decision, and an operator resolves it.
 *
 *   reviews            pending → published / rejected / hidden, and back
 *   review_reports     a learner flagged a specific review
 *   reports            a learner flagged any other target
 *   moderation_cases   an operator opened an investigation
 *
 * Migration 0017 already blocks a learner from publishing their own review — the
 * trigger raises unless the session is a moderator or admin. That guarantee is
 * not re-implemented here; this module is the *reviewed* path that was missing,
 * and it runs on the service client only after `requireAdmin` has passed.
 *
 * `moderation_actions` is written alongside `audit_logs` for case decisions,
 * because that table is the case's own history and the audit log is the
 * platform's. Losing either would leave a decision half-recorded.
 */
import type { SupabaseIdentity } from "./supabase-auth";
import {
  clampLimit, clampOffset, displayNameOf, invalid, likeTerm, logFailure,
  notFound, noteFor, recordAudit, requireAdmin, type AdminResult, type Page,
} from "./admin-guard";

export const REVIEW_STATUSES = ["pending", "published", "rejected", "hidden"] as const;
export const REVIEW_FILTERS = ["all", ...REVIEW_STATUSES, "reported"] as const;
export type ReviewFilter = (typeof REVIEW_FILTERS)[number];

export const REVIEW_ACTIONS = ["publish", "reject", "hide", "restore"] as const;
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];

/** Which statuses an action may be applied from, and the status it produces. */
const REVIEW_TRANSITIONS: Record<ReviewAction, { from: readonly string[]; to: string }> = {
  publish: { from: ["pending", "hidden", "rejected"], to: "published" },
  reject:  { from: ["pending", "published", "hidden"], to: "rejected" },
  hide:    { from: ["published"], to: "hidden" },
  restore: { from: ["hidden"], to: "published" },
};

export const REPORT_KINDS = ["content", "review"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];
export const REPORT_OUTCOMES = ["resolved", "dismissed"] as const;
export type ReportOutcome = (typeof REPORT_OUTCOMES)[number];

export const CASE_STATUSES = ["open", "investigating", "resolved", "dismissed"] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

/* ------------------------------------------------------------------ reviews */

export type ReviewRow = {
  id: string;
  rating: number | null;
  body: string;
  status: string;
  reviewerName: string | null;
  instructorName: string | null;
  instructorId: string;
  createdAt: string;
  reportCount: number;
};

export async function listReviews(
  identity: SupabaseIdentity,
  input: { search?: string; status?: ReviewFilter; limit?: number; offset?: number },
): Promise<AdminResult<Page<ReviewRow>>> {
  const gate = await requireAdmin(identity);
  if (!gate.ok) return gate.failure;
  const { admin } = gate;

  const limit = clampLimit(input.limit);
  const offset = clampOffset(input.offset);
  const search = input.search?.trim() ?? "";

  // "reported" is not a status column — it means "has an open report against it",
  // so it is resolved to a set of ids rather than pretended to be a fifth status.
  let reportedIds: string[] | null = null;
  if (input.status === "reported") {
    const { data } = await admin.from("review_reports").select("review_id").eq("status", "open").limit(1000);
    reportedIds = Array.from(new Set(((data ?? []) as Array<{ review_id: string }>).map((row) => row.review_id)));
    if (reportedIds.length === 0) return { ok: true, data: { rows: [], total: 0, limit, offset } };
  }

  let query = admin
    .from("reviews")
    .select("id,rating,body,status,created_at,instructor_id,reviewer:reviewer_id(display_name,full_name),instructor:instructor_id(display_name,full_name)", { count: "exact" });

  if (input.status && input.status !== "all" && input.status !== "reported") query = query.eq("status", input.status);
  if (reportedIds) query = query.in("id", reportedIds);
  if (search) query = query.ilike("body", likeTerm(search));

  const { data, error, count } = await query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  if (error) {
    logFailure("admin-moderation", error);
    return { ok: false, error: "The review list could not be loaded." };
  }

  const raw = (data ?? []) as Array<Record<string, unknown>>;
  const ids = raw.map((row) => String(row.id));
  const counts = new Map<string, number>();
  if (ids.length > 0) {
    const { data: reports } = await admin.from("review_reports").select("review_id").in("review_id", ids).eq("status", "open");
    for (const row of (reports ?? []) as Array<{ review_id: string }>) {
      counts.set(row.review_id, (counts.get(row.review_id) ?? 0) + 1);
    }
  }

  const rows: ReviewRow[] = raw.map((row) => ({
    id: String(row.id),
    rating: row.rating === null || row.rating === undefined ? null : Number(row.rating),
    body: String(row.body ?? ""),
    status: String(row.status),
    reviewerName: displayNameOf(row.reviewer),
    instructorName: displayNameOf(row.instructor),
    instructorId: String(row.instructor_id),
    createdAt: String(row.created_at),
    reportCount: counts.get(String(row.id)) ?? 0,
  }));

  return { ok: true, data: { rows, total: count ?? rows.length, limit, offset } };
}

export async function decideReview(
  identity: SupabaseIdentity,
  input: { reviewId: string; action: ReviewAction; note?: string },
): Promise<AdminResult<{ reviewId: string; status: string }>> {
  const gate = await requireAdmin(identity);
  if (!gate.ok) return gate.failure;
  const { admin } = gate;

  const transition = REVIEW_TRANSITIONS[input.action];
  if (!transition) return invalid("Unknown review action.");

  const { data: review, error } = await admin
    .from("reviews").select("id,status,reviewer_id,instructor_id").eq("id", input.reviewId).maybeSingle();
  if (error) {
    logFailure("admin-moderation", error);
    return { ok: false, error: "The review could not be read." };
  }
  if (!review) return notFound("review");

  const row = review as { status: string; reviewer_id: string; instructor_id: string };
  // An operator must not moderate a review they wrote or one written about them.
  if (row.reviewer_id === identity.id || row.instructor_id === identity.id) {
    return { ok: false, code: "FORBIDDEN", error: "You cannot moderate a review you are party to." };
  }
  if (!transition.from.includes(row.status)) {
    return { ok: false, code: "CONFLICT", error: `That action needs a review in ${transition.from.join(" or ")}; this one is "${row.status}".` };
  }

  const { error: writeError } = await admin
    .from("reviews").update({ status: transition.to }).eq("id", input.reviewId).eq("status", row.status);
  if (writeError) {
    logFailure("admin-moderation", writeError);
    return { ok: false, error: "The moderation decision could not be saved." };
  }

  await recordAudit(admin, {
    actorId: identity.id,
    action: "review.moderated",
    entityType: "reviews",
    entityId: input.reviewId,
    metadata: { from: row.status, to: transition.to, ...noteFor(input.note) },
  });

  return { ok: true, data: { reviewId: input.reviewId, status: transition.to } };
}

/* ------------------------------------------------------------------ reports */

export type ReportRow = {
  id: string;
  kind: ReportKind;
  targetType: string;
  targetId: string;
  reason: string;
  status: string;
  reporterName: string | null;
  createdAt: string;
};

export async function listReports(
  identity: SupabaseIdentity,
  input: { kind?: ReportKind | "all"; status?: string; limit?: number; offset?: number },
): Promise<AdminResult<Page<ReportRow>>> {
  const gate = await requireAdmin(identity);
  if (!gate.ok) return gate.failure;
  const { admin } = gate;

  const limit = clampLimit(input.limit);
  const offset = clampOffset(input.offset);
  const kind = input.kind ?? "all";

  const collect = async (which: ReportKind): Promise<ReportRow[]> => {
    if (which === "content") {
      let query = admin.from("reports").select("id,target_type,target_id,reason,status,created_at,profiles:reporter_id(display_name,full_name)");
      if (input.status && input.status !== "all") query = query.eq("status", input.status);
      const { data, error } = await query.order("created_at", { ascending: false }).limit(200);
      logFailure("admin-moderation", error);
      return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: String(row.id), kind: "content" as const,
        targetType: String(row.target_type), targetId: String(row.target_id),
        reason: String(row.reason), status: String(row.status),
        reporterName: displayNameOf(row.profiles), createdAt: String(row.created_at),
      }));
    }
    let query = admin.from("review_reports").select("id,review_id,reason,status,created_at,profiles:reporter_id(display_name,full_name)");
    if (input.status && input.status !== "all") query = query.eq("status", input.status);
    const { data, error } = await query.order("created_at", { ascending: false }).limit(200);
    logFailure("admin-moderation", error);
    return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id), kind: "review" as const,
      targetType: "review", targetId: String(row.review_id),
      reason: String(row.reason), status: String(row.status),
      reporterName: displayNameOf(row.profiles), createdAt: String(row.created_at),
    }));
  };

  // Two tables, one list. They are merged in memory and sorted by time, which is
  // sound at this scale and honest about the total.
  const all = kind === "all"
    ? [...(await collect("content")), ...(await collect("review"))]
    : await collect(kind);
  all.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return { ok: true, data: { rows: all.slice(offset, offset + limit), total: all.length, limit, offset } };
}

export async function resolveReport(
  identity: SupabaseIdentity,
  input: { reportId: string; kind: ReportKind; outcome: ReportOutcome; note?: string },
): Promise<AdminResult<{ reportId: string; status: ReportOutcome }>> {
  const gate = await requireAdmin(identity);
  if (!gate.ok) return gate.failure;
  const { admin } = gate;

  if (!(REPORT_OUTCOMES as readonly string[]).includes(input.outcome)) return invalid("Unknown outcome.");
  if (!(REPORT_KINDS as readonly string[]).includes(input.kind)) return invalid("Unknown report kind.");

  const table = input.kind === "content" ? "reports" : "review_reports";
  const { data: report, error } = await admin.from(table).select("id,status").eq("id", input.reportId).maybeSingle();
  if (error) {
    logFailure("admin-moderation", error);
    return { ok: false, error: "The report could not be read." };
  }
  if (!report) return notFound("report");

  const previous = String((report as { status: string }).status);
  if (previous === input.outcome) return { ok: false, code: "CONFLICT", error: `That report is already "${previous}".` };

  const { error: writeError } = await admin.from(table).update({ status: input.outcome }).eq("id", input.reportId);
  if (writeError) {
    logFailure("admin-moderation", writeError);
    return { ok: false, error: "The report decision could not be saved." };
  }

  await recordAudit(admin, {
    actorId: identity.id,
    action: "report.resolved",
    entityType: table,
    entityId: input.reportId,
    metadata: { from: previous, to: input.outcome, ...noteFor(input.note) },
  });

  return { ok: true, data: { reportId: input.reportId, status: input.outcome } };
}

/* --------------------------------------------------------- moderation cases */

export type CaseRow = {
  id: string;
  targetType: string;
  targetId: string;
  status: string;
  priority: string;
  openedByName: string | null;
  createdAt: string;
  updatedAt: string;
  actionCount: number;
};

export async function listCases(
  identity: SupabaseIdentity,
  input: { status?: CaseStatus | "all"; limit?: number; offset?: number },
): Promise<AdminResult<Page<CaseRow>>> {
  const gate = await requireAdmin(identity);
  if (!gate.ok) return gate.failure;
  const { admin } = gate;

  const limit = clampLimit(input.limit);
  const offset = clampOffset(input.offset);

  let query = admin
    .from("moderation_cases")
    .select("id,target_type,target_id,status,priority,created_at,updated_at,profiles:opened_by(display_name,full_name)", { count: "exact" });
  if (input.status && input.status !== "all") query = query.eq("status", input.status);

  const { data, error, count } = await query.order("updated_at", { ascending: false }).range(offset, offset + limit - 1);
  if (error) {
    logFailure("admin-moderation", error);
    return { ok: false, error: "The moderation cases could not be loaded." };
  }

  const raw = (data ?? []) as Array<Record<string, unknown>>;
  const ids = raw.map((row) => String(row.id));
  const actions = new Map<string, number>();
  if (ids.length > 0) {
    const { data: actionRows } = await admin.from("moderation_actions").select("case_id").in("case_id", ids);
    for (const row of (actionRows ?? []) as Array<{ case_id: string }>) {
      actions.set(row.case_id, (actions.get(row.case_id) ?? 0) + 1);
    }
  }

  const rows: CaseRow[] = raw.map((row) => ({
    id: String(row.id),
    targetType: String(row.target_type),
    targetId: String(row.target_id),
    status: String(row.status),
    priority: String(row.priority),
    openedByName: displayNameOf(row.profiles),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    actionCount: actions.get(String(row.id)) ?? 0,
  }));

  return { ok: true, data: { rows, total: count ?? rows.length, limit, offset } };
}

export async function decideCase(
  identity: SupabaseIdentity,
  input: { caseId: string; status: CaseStatus; reason: string },
): Promise<AdminResult<{ caseId: string; status: CaseStatus }>> {
  const gate = await requireAdmin(identity);
  if (!gate.ok) return gate.failure;
  const { admin } = gate;

  if (!(CASE_STATUSES as readonly string[]).includes(input.status)) return invalid("Unknown case status.");
  if (!input.reason?.trim()) return invalid("A reason is required to move a case.");

  const { data: existing, error } = await admin
    .from("moderation_cases").select("id,status").eq("id", input.caseId).maybeSingle();
  if (error) {
    logFailure("admin-moderation", error);
    return { ok: false, error: "The case could not be read." };
  }
  if (!existing) return notFound("case");

  const previous = String((existing as { status: string }).status);
  if (previous === input.status) return { ok: false, code: "CONFLICT", error: `That case is already "${previous}".` };

  const { error: writeError } = await admin
    .from("moderation_cases").update({ status: input.status, updated_at: new Date().toISOString() }).eq("id", input.caseId);
  if (writeError) {
    logFailure("admin-moderation", writeError);
    return { ok: false, error: "The case could not be saved." };
  }

  // The case's own history, alongside the platform-wide audit row. Both, because
  // either alone leaves the decision half-recorded.
  const { error: actionError } = await admin.from("moderation_actions").insert({
    case_id: input.caseId,
    actor_id: identity.id,
    action_type: input.status,
    reason: input.reason.trim().slice(0, 2000),
    prior_value: { status: previous },
    new_value: { status: input.status },
  });
  if (actionError) logFailure("admin-moderation", actionError);

  await recordAudit(admin, {
    actorId: identity.id,
    action: "moderation_case.decided",
    entityType: "moderation_cases",
    entityId: input.caseId,
    metadata: { from: previous, to: input.status, ...noteFor(input.reason) },
  });

  return { ok: true, data: { caseId: input.caseId, status: input.status } };
}

/* -------------------------------------------------------- content inventory */

export type ContentInventory = {
  courses: Array<{ status: string; count: number }>;
  modules: Array<{ status: string; count: number }>;
  lessons: Array<{ status: string; count: number }>;
  assignments: number;
  quizzes: number;
  reviews: Array<{ status: string; count: number }>;
};

/**
 * What content exists, grouped by status.
 *
 * PostgREST has no GROUP BY, so each bucket is its own exact count. That is more
 * requests than a SQL aggregate, but every number is measured rather than
 * derived from a sample.
 */
export async function getContentInventory(identity: SupabaseIdentity): Promise<AdminResult<ContentInventory>> {
  const gate = await requireAdmin(identity);
  if (!gate.ok) return gate.failure;
  const { admin } = gate;

  const countOf = async (table: string, column?: string, value?: string) => {
    let query = admin.from(table).select("*", { count: "exact", head: true });
    if (column && value) query = query.eq(column, value);
    const { count, error } = await query;
    logFailure("admin-moderation", error);
    return count ?? 0;
  };

  const bucket = async (table: string, statuses: readonly string[]) =>
    Promise.all(statuses.map(async (status) => ({ status, count: await countOf(table, "status", status) })));

  const [courses, modules, lessons, assignments, quizzes, reviews] = await Promise.all([
    bucket("courses", ["draft", "in_review", "published", "rejected", "archived"]),
    bucket("course_modules", ["draft", "published"]),
    bucket("lessons", ["draft", "published", "archived"]),
    countOf("assignments"),
    countOf("quizzes"),
    bucket("reviews", REVIEW_STATUSES),
  ]);

  return { ok: true, data: { courses, modules, lessons, assignments, quizzes, reviews } };
}
