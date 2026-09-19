/**
 * A teacher's stated background: employment history, certifications, ijazah.
 *
 * The reference marketplace puts these on the profile editor as three repeatable lists, each with
 * an "Add Another" row, saved with the rest of the profile. This is the same shape: the editor
 * sends the whole list for one kind, and that kind is replaced. A teacher reordering or removing an
 * entry is the ordinary case, and a diff protocol would buy nothing for a list of a few rows.
 *
 * Reads and writes both run on the caller's own client, so `instructor_qualifications_own_or_admin`
 * is what decides. The public read is a separate function with its own client, because the profile
 * page is visited by people who are not the teacher — and it is allowed only by the published and
 * approved condition the listing already enforces.
 *
 * The table arrives in migration 0034. Until that is applied, PostgREST answers 42P01 and every
 * function here reports SETUP_NEEDED rather than throwing, so a profile editor on an un-migrated
 * project still loads and simply says the section is not ready.
 */
import { getSupabasePublicClient, getSupabaseUserClient } from "./supabase-user-client";
import type { SupabaseIdentity } from "./supabase-auth";

export type QualificationKind = "employment" | "certification" | "ijazah";
export const QUALIFICATION_KINDS: QualificationKind[] = ["employment", "certification", "ijazah"];

export type Qualification = {
  id: string; kind: QualificationKind; title: string;
  organisation: string | null; period: string | null; detail: string | null; position: number;
};
export type QualificationInput = { title: string; organisation?: string | null; period?: string | null; detail?: string | null };

type FailureCode = "SETUP_NEEDED" | "VALIDATION" | "FORBIDDEN";
type Result<T> = { ok: true; data: T } | { ok: false; error: string; code?: FailureCode };
const fail = (error: string, code: FailureCode = "VALIDATION"): Result<never> => ({ ok: false, error, code });

/**
 * "That table is not there" — i.e. migration 0034 has not been applied to this project.
 *
 * Two codes, because two layers can answer. Postgres itself raises `42P01` (undefined_table), but a
 * request through PostgREST usually never reaches the planner: the table is absent from the schema
 * cache and it answers `PGRST205` instead. Checking only the first is how this shipped reporting a
 * plain failure on an un-migrated project, which is exactly the case the check exists to catch.
 */
const MISSING_TABLE = ["42P01", "PGRST205"];
const notMigrated = (error: { code?: string } | null) => Boolean(error?.code && MISSING_TABLE.includes(error.code));

const COLUMNS = "id,kind,title,organisation,period,detail,position";

function shape(rows: unknown[]): Qualification[] {
  return rows.map((value) => {
    const row = value as Record<string, unknown>;
    return {
      id: String(row.id), kind: String(row.kind) as QualificationKind, title: String(row.title ?? ""),
      organisation: (row.organisation as string | null) ?? null,
      period: (row.period as string | null) ?? null,
      detail: (row.detail as string | null) ?? null,
      position: Number(row.position ?? 0),
    };
  });
}

/** The caller's own entries, every kind, in the order they arranged them. */
export async function listOwnQualifications(identity: SupabaseIdentity): Promise<Result<Qualification[]>> {
  const client = getSupabaseUserClient(identity.accessToken);
  if (!client) return fail("Profile persistence is not configured.", "SETUP_NEEDED");

  const { data, error } = await client
    .from("instructor_qualifications").select(COLUMNS)
    .eq("instructor_id", identity.id)
    .order("kind").order("position").order("created_at");
  if (error) {
    if (notMigrated(error)) return fail("Qualifications are not set up on this project yet.", "SETUP_NEEDED");
    console.error("[qualifications] own read failed:", { code: error.code, message: error.message });
    return fail("Your background could not be loaded.");
  }
  return { ok: true, data: shape(data ?? []) };
}

/**
 * One published teacher's entries, for their public profile.
 *
 * Read on the anonymous client: the policy, not this function, is what permits it, and using the
 * public client makes that impossible to get wrong by accident.
 */
export async function listPublicQualifications(instructorId: string): Promise<Result<Qualification[]>> {
  const client = getSupabasePublicClient();
  if (!client) return fail("Profile persistence is not configured.", "SETUP_NEEDED");

  const { data, error } = await client
    .from("instructor_qualifications").select(COLUMNS)
    .eq("instructor_id", instructorId)
    .order("kind").order("position").order("created_at");
  if (error) {
    if (notMigrated(error)) return { ok: true, data: [] };
    console.error("[qualifications] public read failed:", { code: error.code, message: error.message });
    return fail("This teacher's background could not be loaded.");
  }
  return { ok: true, data: shape(data ?? []) };
}

/**
 * Replaces every entry of one kind with the list the editor sent.
 *
 * Scoped twice over: the delete and the insert both carry `instructor_id = identity.id`, and RLS
 * would refuse either way. An entry with no title is dropped rather than stored as a blank row —
 * the editor leaves an empty "Add Another" line behind whenever someone changes their mind.
 */
export async function replaceQualifications(
  identity: SupabaseIdentity,
  input: { kind: QualificationKind; entries: QualificationInput[] },
): Promise<Result<Qualification[]>> {
  const client = getSupabaseUserClient(identity.accessToken);
  if (!client) return fail("Profile persistence is not configured.", "SETUP_NEEDED");
  if (!QUALIFICATION_KINDS.includes(input.kind)) return fail("That kind of entry does not exist.");

  const clean = input.entries
    .map((entry, index) => ({
      instructor_id: identity.id,
      kind: input.kind,
      title: (entry.title ?? "").trim().slice(0, 160),
      organisation: (entry.organisation ?? "").trim().slice(0, 160) || null,
      period: (entry.period ?? "").trim().slice(0, 80) || null,
      detail: (entry.detail ?? "").trim().slice(0, 600) || null,
      position: index,
    }))
    .filter((entry) => entry.title.length > 0)
    .slice(0, 20);

  const { error: deleteError } = await client
    .from("instructor_qualifications").delete()
    .eq("instructor_id", identity.id).eq("kind", input.kind);
  if (deleteError) {
    if (notMigrated(deleteError)) return fail("Qualifications are not set up on this project yet.", "SETUP_NEEDED");
    console.error("[qualifications] clear failed:", { code: deleteError.code, message: deleteError.message });
    return fail("Your background could not be saved.");
  }

  if (clean.length) {
    const { error: insertError } = await client.from("instructor_qualifications").insert(clean);
    if (insertError) {
      console.error("[qualifications] insert failed:", { code: insertError.code, message: insertError.message });
      return fail("Your background could not be saved.");
    }
  }

  return listOwnQualifications(identity);
}
