/**
 * Audit history, system status and platform settings.
 *
 * Three read surfaces that share one property: none of them may ever carry a
 * secret, and one of them may never be written from a screen at all.
 *
 * **Audit logs are append-only by construction, not by convention.**
 * `audit_logs` has a SELECT policy for admins and no INSERT, UPDATE or DELETE
 * policy whatsoever, so the API role cannot write to it and no UI can edit or
 * remove a row. This module offers reads and filters only — there is no mutation
 * exported here, and that absence is the feature.
 *
 * **System status reports names, never values.** Every integration row says
 * which environment variables it needs and whether they are set. A configured
 * key is reported as `configured: true` and nothing else; the value never leaves
 * the process. Currency/FX and refunds have no provider boundary in this
 * codebase at all, and are reported as not implemented rather than as a
 * configuration gap that leads nowhere.
 *
 * **Settings are read-only for an admin.** `admin_settings` is writable only by
 * `is_super_admin_user()` under RLS, so this reports the rows and says who may
 * change them rather than offering a control that the database would refuse.
 * Any value whose key looks like a credential is redacted before it is returned.
 */
import type { SupabaseIdentity } from "./supabase-auth";
import { clampLimit, clampOffset, displayNameOf, logFailure, requireAdmin, type AdminResult, type Page } from "./admin-guard";
import { getProductionConfigReport } from "./production-config";
import { classroomProviderStatus } from "./classroom-provider";
import { paymentProviderStatus } from "./payment-provider";
import { adminBootstrapStatus } from "./admin-bootstrap";
import { geminiProviderStatus } from "./ai-tutor-provider";

/* --------------------------------------------------------------- audit logs */

export type AuditRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorId: string | null;
  actorName: string | null;
  from: string | null;
  to: string | null;
  note: string | null;
  /** Remaining scalar metadata, flattened. Never a nested object. */
  details: Array<{ key: string; value: string }>;
  createdAt: string;
};

export async function listAuditLogs(
  identity: SupabaseIdentity,
  input: { action?: string; entityType?: string; actorId?: string; since?: string; until?: string; limit?: number; offset?: number },
): Promise<AdminResult<Page<AuditRow> & { actions: string[]; entityTypes: string[] }>> {
  const gate = await requireAdmin(identity);
  if (!gate.ok) return gate.failure;
  const { admin } = gate;

  const limit = clampLimit(input.limit);
  const offset = clampOffset(input.offset);

  let query = admin
    .from("audit_logs")
    .select("id,action,entity_type,entity_id,actor_id,metadata,created_at,profiles:actor_id(display_name,full_name)", { count: "exact" });

  if (input.action && input.action !== "all") query = query.eq("action", input.action);
  if (input.entityType && input.entityType !== "all") query = query.eq("entity_type", input.entityType);
  if (input.actorId) query = query.eq("actor_id", input.actorId);
  if (input.since) query = query.gte("created_at", input.since);
  if (input.until) query = query.lte("created_at", input.until);

  const { data, error, count } = await query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  if (error) {
    logFailure("admin-records", error);
    return { ok: false, error: "The audit history could not be loaded." };
  }

  const rows: AuditRow[] = ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    // from/to/note are the shape every writer in this codebase uses. Anything else
    // is passed through only if it is a scalar, so a nested object cannot smuggle
    // a payload into the browser through a future writer.
    const details = Object.entries(metadata)
      .filter(([key]) => !["from", "to", "note"].includes(key))
      .filter(([, value]) => typeof value === "string" || typeof value === "number" || typeof value === "boolean")
      .map(([key, value]) => ({ key, value: String(value) }))
      .sort((a, b) => a.key.localeCompare(b.key));

    return {
      id: String(row.id),
      action: String(row.action),
      entityType: String(row.entity_type),
      entityId: row.entity_id ? String(row.entity_id) : null,
      actorId: row.actor_id ? String(row.actor_id) : null,
      actorName: displayNameOf(row.profiles),
      from: typeof metadata.from === "string" ? metadata.from : null,
      to: typeof metadata.to === "string" ? metadata.to : null,
      note: typeof metadata.note === "string" ? metadata.note : null,
      details,
      createdAt: String(row.created_at),
    };
  });

  // Filter options come from the rows that exist, not a hardcoded list, so a new
  // audit action becomes filterable the moment something writes one.
  const [{ data: actionRows }, { data: entityRows }] = await Promise.all([
    admin.from("audit_logs").select("action").limit(1000),
    admin.from("audit_logs").select("entity_type").limit(1000),
  ]);
  const actions = Array.from(new Set(((actionRows ?? []) as Array<{ action: string }>).map((row) => row.action))).sort();
  const entityTypes = Array.from(new Set(((entityRows ?? []) as Array<{ entity_type: string }>).map((row) => row.entity_type))).sort();

  return { ok: true, data: { rows, total: count ?? rows.length, limit, offset, actions, entityTypes } };
}

/* ------------------------------------------------------------ system status */

export type IntegrationRow = {
  key: string;
  state: "ready" | "setup_needed" | "not_implemented";
  /** Variable NAMES only. */
  requiredEnv: string[];
  /** Which of those names are currently unset. Names only, never values. */
  missing: string[];
  /** Extra detail that is safe to show: a resolution reason, never a credential. */
  reason: string | null;
};

export type SystemStatus = {
  mode: "production" | "development";
  fixturesEnabled: boolean;
  integrations: IntegrationRow[];
  adminBootstrapConfigured: boolean;
  blockers: string[];
};

export async function getSystemStatus(identity: SupabaseIdentity): Promise<AdminResult<SystemStatus>> {
  const gate = await requireAdmin(identity);
  if (!gate.ok) return gate.failure;

  const report = getProductionConfigReport();
  const classroom = classroomProviderStatus();
  const payments = paymentProviderStatus();

  const fromReport = (key: string, integration: { configured: boolean; requiredEnv: string[] }): IntegrationRow => ({
    key,
    state: integration.configured ? "ready" : "setup_needed",
    requiredEnv: integration.requiredEnv,
    missing: integration.configured ? [] : integration.requiredEnv.filter((name) => !process.env[name]?.trim()),
    reason: null,
  });

  const integrations: IntegrationRow[] = [
    fromReport("supabaseAuth", report.integrations.supabaseAuth),
    fromReport("supabaseDatabase", report.integrations.supabaseDatabase),
    fromReport("privateStorage", report.integrations.privateStorage),
    fromReport("realtime", report.integrations.realtime),
    {
      key: "classroom",
      state: classroom.configured ? "ready" : "setup_needed",
      requiredEnv: report.integrations.classroom.requiredEnv,
      missing: classroom.missing,
      reason: classroom.reason,
    },
    {
      key: "payments",
      state: payments.configured ? "ready" : "setup_needed",
      requiredEnv: report.integrations.payments.requiredEnv,
      missing: payments.missing,
      reason: payments.reason,
    },
    // No module in this codebase reads an FX or refund variable. Reporting these
    // as "setup needed" would name variables nothing consumes.
    { key: "fx", state: "not_implemented", requiredEnv: [], missing: [], reason: null },
    { key: "refunds", state: "not_implemented", requiredEnv: [], missing: [], reason: null },
    fromReport("payouts", report.integrations.payouts),
    fromReport("withdrawals", report.integrations.payouts),
    fromReport("notifications", report.integrations.notifications),
    {
      key: "aiTutor",
      state: geminiProviderStatus() === "configured" ? "ready" : "setup_needed",
      requiredEnv: report.integrations.aiTutor.requiredEnv,
      missing: report.integrations.aiTutor.requiredEnv.filter((name) => !process.env[name]?.trim()),
      reason: null,
    },
  ];

  return {
    ok: true,
    data: {
      mode: report.mode,
      fixturesEnabled: report.fixturesEnabled,
      integrations,
      adminBootstrapConfigured: adminBootstrapStatus().configured,
      blockers: report.productionBlockers,
    },
  };
}

/* ---------------------------------------------------------------- settings */

export type PlatformSetting = {
  key: string;
  /** A rendered summary. Redacted entirely when the key looks like a credential. */
  value: string;
  redacted: boolean;
  updatedByName: string | null;
  updatedAt: string;
};

export type AdminSettings = {
  /** Whether this caller may change platform settings. RLS reserves that for super_admin. */
  canWritePlatformSettings: boolean;
  settings: PlatformSetting[];
};

/** Any key that reads like a credential is never rendered, whatever it holds. */
const SECRET_LIKE = /secret|key|token|password|credential|signature/i;

export async function getAdminSettings(identity: SupabaseIdentity): Promise<AdminResult<AdminSettings>> {
  const gate = await requireAdmin(identity);
  if (!gate.ok) return gate.failure;
  const { admin, isSuperAdmin } = gate;

  const { data, error } = await admin
    .from("admin_settings").select("key,value,updated_at,profiles:updated_by(display_name,full_name)").order("key", { ascending: true });
  if (error) {
    logFailure("admin-records", error);
    return { ok: false, error: "Platform settings could not be read." };
  }

  const settings: PlatformSetting[] = ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const key = String(row.key);
    const redacted = SECRET_LIKE.test(key);
    return {
      key,
      value: redacted ? "" : JSON.stringify(row.value ?? null).slice(0, 300),
      redacted,
      updatedByName: displayNameOf(row.profiles),
      updatedAt: String(row.updated_at),
    };
  });

  return { ok: true, data: { canWritePlatformSettings: isSuperAdmin, settings } };
}
