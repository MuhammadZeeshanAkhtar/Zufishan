/**
 * Filing a report, and reading the ones you filed.
 *
 * The Reports module on both dashboards asked for a reason and a description and then called an
 * in-memory `submitReport` that stored nothing. Somebody describing a safety problem was shown a
 * confirmation and their account of it was thrown away — which is worse than having no form, because
 * a person who has reported something stops looking for another way to be heard.
 *
 * `public.reports` was always the right destination and its policies were always right for this:
 * `reports_own_insert` permits exactly your own row, `reports_own_or_moderator` lets you read your
 * own and a moderator read all. Nothing about them changes here. The only schema change is
 * migration 0038, which adds the `description` column the form had nowhere to put.
 *
 * TWO THINGS WORTH STATING.
 *
 *  - **The insert asks for nothing back.** `.insert().select()` requests RETURNING, and RETURNING is
 *    a read — Postgres applies the SELECT policy to it. Reading is permitted here (you may read your
 *    own report), so it would in fact work; it is still not asked for, because the id is generated
 *    here and a write that needs no read should not perform one. The contact form learned this the
 *    hard way with a 42501.
 *  - **A missing column is reported as a missing migration**, not as "please try again" — advice
 *    that would send somebody to retype a description that will fail again for the same reason.
 */
import { randomUUID } from "node:crypto";
import { getSupabaseUserClient } from "./supabase-user-client";
import type { SupabaseIdentity } from "./supabase-auth";

type Result<T> = { ok: true; data: T } | { ok: false; error: string; code?: "SETUP_NEEDED" | "VALIDATION" };
const fail = (error: string, code: "SETUP_NEEDED" | "VALIDATION" = "VALIDATION"): Result<never> => ({ ok: false, error, code });

/** What somebody can be reporting. Kept in step with what the two desks can link from. */
export const REPORT_TARGETS = ["conversation", "review", "session", "booking", "profile"] as const;
export type ReportTarget = (typeof REPORT_TARGETS)[number];

export const REPORT_REASONS = [
  "technical_issue", "schedule_problem", "missed_class", "inappropriate_behaviour",
  "payment_concern", "safety_concern", "other",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export type OwnReport = {
  id: string; targetType: string; targetId: string;
  reason: string; description: string | null; status: string; createdAt: string;
};

/** "That column is not there" and "that table is not there": PostgREST's answers, and Postgres's. */
const MISSING_SCHEMA = ["42P01", "42703", "PGRST204", "PGRST205"];
const SETUP_MESSAGE = "Reports are not set up on this project yet. Nothing was saved.";

/**
 * Files one report, as the caller.
 *
 * Runs on the caller's own client so `reports_own_insert` is what permits it — the server never
 * chooses whose report this is, the token does. `reporter_id` is set from the verified identity
 * rather than from anything the browser sent, so it cannot be filed in somebody else's name.
 */
export async function fileReport(
  identity: SupabaseIdentity,
  input: { targetType: ReportTarget; targetId: string; reason: ReportReason; description?: string },
): Promise<Result<{ id: string }>> {
  const client = getSupabaseUserClient(identity.accessToken);
  if (!client) return fail("Reporting is not configured on this deployment.", "SETUP_NEEDED");

  if (!(REPORT_TARGETS as readonly string[]).includes(input.targetType)) return fail("Choose what you are reporting.");
  if (!(REPORT_REASONS as readonly string[]).includes(input.reason)) return fail("Choose a reason.");

  const description = (input.description ?? "").trim();
  if (description.length > 8000) return fail("That description is too long.");

  const id = randomUUID();
  const { error } = await client.from("reports").insert({
    id,
    reporter_id: identity.id,
    target_type: input.targetType,
    target_id: input.targetId,
    reason: input.reason,
    // Null rather than an empty string: a reason on its own is a legitimate report.
    description: description || null,
  });

  if (error) {
    console.error("[reports] insert failed:", { code: error.code, message: error.message });
    if (MISSING_SCHEMA.includes(String(error.code))) return fail(SETUP_MESSAGE, "SETUP_NEEDED");
    return fail("Your report could not be sent. Please try again.");
  }
  return { ok: true, data: { id } };
}

/**
 * The reports this account filed.
 *
 * `reports_own_or_moderator` is what scopes this; the `.eq` is belt and braces so a moderator
 * reading their own desk does not receive everybody's.
 */
export async function listOwnReports(identity: SupabaseIdentity): Promise<Result<OwnReport[]>> {
  const client = getSupabaseUserClient(identity.accessToken);
  if (!client) return fail("Reporting is not configured on this deployment.", "SETUP_NEEDED");

  const { data, error } = await client
    .from("reports")
    .select("id,target_type,target_id,reason,description,status,created_at")
    .eq("reporter_id", identity.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[reports] list failed:", { code: error.code, message: error.message });
    if (MISSING_SCHEMA.includes(String(error.code))) return fail(SETUP_MESSAGE, "SETUP_NEEDED");
    return fail("Your reports could not be loaded.");
  }

  return {
    ok: true,
    data: (data ?? []).map((value) => {
      const row = value as Record<string, unknown>;
      return {
        id: String(row.id),
        targetType: String(row.target_type ?? ""),
        targetId: String(row.target_id ?? ""),
        reason: String(row.reason ?? ""),
        description: (row.description as string | null) ?? null,
        status: String(row.status ?? "open"),
        createdAt: String(row.created_at ?? ""),
      };
    }),
  };
}
