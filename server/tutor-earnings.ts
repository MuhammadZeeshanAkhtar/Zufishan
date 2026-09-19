/**
 * What a teacher earned, and when they are paid for it.
 *
 * The two screens behind this — Billing and Withdrawal Requests — were built on fixtures: both
 * called an `"instructor-demo"` helper, so every teacher saw the same invented figures and the same
 * empty withdrawal list however much they had actually taught. Nothing here is invented. Sessions
 * come from `class_sessions`, money from `session_ledger`, requests from `withdrawal_requests`, and
 * anything not yet known is returned as null for the screen to label honestly.
 *
 * The reference marketplace states the rule for the amount column plainly: it is the credits for a
 * session, based on the time logged and the tutor hourly rate. That is exactly what `minutesLogged`
 * and `estimatedMinor` do — and when the ledger already carries a settled amount for a session, the
 * ledger wins, because an estimate must never overwrite a recorded figure.
 *
 * Every read runs on the caller's own client, so RLS decides what a teacher may see. Nothing here
 * writes, and nothing here is elevated.
 */
import { getSupabaseUserClient } from "./supabase-user-client";
import type { SupabaseIdentity } from "./supabase-auth";

export type EarningsResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: "SETUP_NEEDED" | "VALIDATION" };
const fail = (error: string, code: "SETUP_NEEDED" | "VALIDATION" = "VALIDATION"): EarningsResult<never> => ({ ok: false, error, code });

/**
 * When a request becomes money in the teacher's hands.
 *
 * Held as data rather than prose so the screen, the tests and any later admin-editable setting all
 * read one description of the schedule instead of three that can drift. Days are ISO weekday
 * numbers (Monday = 1) in UTC, the only zone a payout run can sensibly be stated in.
 */
export const PAYOUT_POLICY = {
  /** Requests received at or before this moment qualify for the same week's payout. */
  cutoffWeekday: 1, cutoffHourUtc: 12,
  /** When the platform runs the batch. */
  processingWeekday: 2, processingHourUtc: 12,
  /** When the teacher is paid. */
  payoutWeekday: 5, payoutHourUtc: 0,
} as const;

/** Midnight UTC on the Monday of the week containing `value`. */
export function weekStartUtc(value: Date): Date {
  const start = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  const weekday = start.getUTCDay() === 0 ? 7 : start.getUTCDay();
  start.setUTCDate(start.getUTCDate() - (weekday - 1));
  return start;
}

/**
 * The Friday a request submitted at `submittedAt` is expected to be paid on.
 *
 * Miss the Monday cutoff and it rolls to the following week — the rule the reference states, and
 * the reason a teacher can read a date here instead of guessing.
 */
export function expectedPayoutAt(submittedAt: Date): Date {
  const cutoff = new Date(weekStartUtc(submittedAt));
  cutoff.setUTCDate(cutoff.getUTCDate() + (PAYOUT_POLICY.cutoffWeekday - 1));
  cutoff.setUTCHours(PAYOUT_POLICY.cutoffHourUtc, 0, 0, 0);

  const payout = new Date(weekStartUtc(submittedAt));
  payout.setUTCDate(payout.getUTCDate() + (PAYOUT_POLICY.payoutWeekday - 1) + (submittedAt > cutoff ? 7 : 0));
  payout.setUTCHours(PAYOUT_POLICY.payoutHourUtc, 0, 0, 0);
  return payout;
}

export type WeeklySession = {
  id: string; title: string; sessionType: string; status: string;
  scheduledStartAt: string; scheduledEndAt: string;
  learnerId: string; learnerName: string | null;
  /** Wall-clock minutes the session actually ran, or null when it has not run or was not recorded. */
  minutesLogged: number | null;
  /** What the ledger settled, when it has settled anything. */
  settledMinor: number | null; settledCurrency: string | null; paymentStatus: string | null;
  /** minutesLogged against the hourly rate — an estimate, labelled as one. Null when either is unknown. */
  estimatedMinor: number | null;
};

export type WeeklyEarnings = {
  weekStart: string; weekEnd: string;
  hourlyRateMinor: number | null; currency: string | null;
  sessions: WeeklySession[];
  totals: { minutesLogged: number; settledMinor: number | null; estimatedMinor: number | null };
};

/** The minutes a session actually ran. Only a real pair of timestamps counts. */
export function loggedMinutes(row: { instructor_joined_at?: string | null; learner_joined_at?: string | null; ended_at?: string | null }): number | null {
  const joined = row.instructor_joined_at ?? row.learner_joined_at ?? null;
  if (!joined || !row.ended_at) return null;
  const from = new Date(joined).getTime();
  const to = new Date(row.ended_at).getTime();
  if (Number.isNaN(from) || Number.isNaN(to) || to <= from) return null;
  return Math.round((to - from) / 60_000);
}

/**
 * One week of the caller's own teaching, as the Billing screen shows it.
 *
 * `weekStartIso` is any instant inside the week; the week is normalised to Monday 00:00 UTC so a
 * caller cannot ask for a half-week and be handed a misleading total.
 */
export async function listWeeklyEarnings(identity: SupabaseIdentity, weekStartIso?: string): Promise<EarningsResult<WeeklyEarnings>> {
  const client = getSupabaseUserClient(identity.accessToken);
  if (!client) return fail("Billing persistence is not configured.", "SETUP_NEEDED");

  const anchor = weekStartIso ? new Date(weekStartIso) : new Date();
  if (Number.isNaN(anchor.getTime())) return fail("That week could not be read.");
  const start = weekStartUtc(anchor);
  const end = new Date(start); end.setUTCDate(end.getUTCDate() + 7);

  const [{ data: sessionRows, error: sessionError }, { data: profileRow }] = await Promise.all([
    client.from("class_sessions")
      .select("id,title,session_type,status,scheduled_start_at,scheduled_end_at,learner_id,instructor_joined_at,learner_joined_at,ended_at")
      .eq("instructor_id", identity.id)
      .gte("scheduled_start_at", start.toISOString())
      .lt("scheduled_start_at", end.toISOString())
      .order("scheduled_start_at"),
    client.from("instructor_profiles").select("hourly_rate_minor,currency").eq("user_id", identity.id).maybeSingle(),
  ]);
  if (sessionError) {
    console.error("[earnings] sessions failed:", { code: sessionError.code, message: sessionError.message });
    return fail("This week could not be loaded.");
  }

  const sessions = (sessionRows ?? []) as Record<string, unknown>[];
  const rate = profileRow as { hourly_rate_minor: number | null; currency: string | null } | null;
  const hourlyRateMinor = typeof rate?.hourly_rate_minor === "number" ? rate.hourly_rate_minor : null;

  // The ledger, and the learners' names, only for the sessions in this week.
  const ids = sessions.map((row) => String(row.id));
  const learnerIds = Array.from(new Set(sessions.map((row) => String(row.learner_id))));
  const [{ data: ledgerRows }, { data: learnerRows }] = await Promise.all([
    ids.length
      ? client.from("session_ledger").select("session_id,amount_minor,net_minor,currency,payment_status").in("session_id", ids)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    learnerIds.length
      ? client.from("profiles").select("id,display_name,full_name").in("id", learnerIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);

  type Settled = { amount_minor: number | null; net_minor: number | null; currency: string | null; payment_status: string | null };
  const ledger = new Map<string, Settled>();
  for (const row of (ledgerRows ?? []) as Record<string, unknown>[]) {
    ledger.set(String(row.session_id), row as unknown as Settled);
  }
  const names = new Map<string, string | null>();
  for (const row of (learnerRows ?? []) as Record<string, unknown>[]) {
    const name = String(row.display_name ?? row.full_name ?? "").trim();
    names.set(String(row.id), name || null);
  }

  const rows: WeeklySession[] = sessions.map((row) => {
    const minutes = loggedMinutes(row as never);
    const settled = ledger.get(String(row.id)) ?? null;
    const settledMinor = settled?.net_minor ?? settled?.amount_minor ?? null;
    return {
      id: String(row.id), title: String(row.title ?? ""), sessionType: String(row.session_type ?? ""), status: String(row.status ?? ""),
      scheduledStartAt: String(row.scheduled_start_at ?? ""), scheduledEndAt: String(row.scheduled_end_at ?? ""),
      learnerId: String(row.learner_id ?? ""), learnerName: names.get(String(row.learner_id)) ?? null,
      minutesLogged: minutes,
      settledMinor: typeof settledMinor === "number" ? settledMinor : null,
      settledCurrency: settled?.currency ?? null,
      paymentStatus: settled?.payment_status ?? null,
      // An estimate needs both halves; without either it stays null rather than reading as zero.
      estimatedMinor: minutes !== null && hourlyRateMinor !== null ? Math.round((minutes / 60) * hourlyRateMinor) : null,
    };
  });

  const settledTotals = rows.map((row) => row.settledMinor).filter((value): value is number => value !== null);
  const estimatedTotals = rows.map((row) => row.estimatedMinor).filter((value): value is number => value !== null);
  return {
    ok: true,
    data: {
      weekStart: start.toISOString(), weekEnd: end.toISOString(),
      hourlyRateMinor, currency: rate?.currency ?? null,
      sessions: rows,
      totals: {
        minutesLogged: rows.reduce((total, row) => total + (row.minutesLogged ?? 0), 0),
        settledMinor: settledTotals.length ? settledTotals.reduce((a, b) => a + b, 0) : null,
        estimatedMinor: estimatedTotals.length ? estimatedTotals.reduce((a, b) => a + b, 0) : null,
      },
    },
  };
}

export type WithdrawalRow = {
  id: string; amountMinor: number; currency: string; status: string;
  createdAt: string; expectedPayoutAt: string; providerReference: string | null;
};

/** The caller's own withdrawal requests, each with the Friday the policy puts it on. */
export async function listWithdrawalRequests(identity: SupabaseIdentity): Promise<EarningsResult<WithdrawalRow[]>> {
  const client = getSupabaseUserClient(identity.accessToken);
  if (!client) return fail("Withdrawal persistence is not configured.", "SETUP_NEEDED");

  const { data, error } = await client
    .from("withdrawal_requests").select("id,amount_minor,currency,status,provider_reference,created_at")
    .eq("instructor_id", identity.id).order("created_at", { ascending: false });
  if (error) {
    console.error("[earnings] withdrawals failed:", { code: error.code, message: error.message });
    return fail("Withdrawal requests could not be loaded.");
  }

  return {
    ok: true,
    data: (data ?? []).map((row) => {
      const entry = row as Record<string, unknown>;
      const createdAt = String(entry.created_at ?? "");
      return {
        id: String(entry.id), amountMinor: Number(entry.amount_minor ?? 0), currency: String(entry.currency ?? ""),
        status: String(entry.status ?? ""), createdAt,
        expectedPayoutAt: expectedPayoutAt(new Date(createdAt)).toISOString(),
        providerReference: (entry.provider_reference as string | null) ?? null,
      };
    }),
  };
}
