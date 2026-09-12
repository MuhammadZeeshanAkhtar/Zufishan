/**
 * Payments: what a session would cost, and the ledger of what was actually charged.
 *
 * Two boundaries hold this module up, and both are already in the schema rather than in this file.
 *
 * `session_ledger` and `payment_references` have SELECT policies and **no insert or update policy at
 * all**. That is not an oversight — it means no learner, no instructor and no browser can write a
 * financial row under any circumstances. Every write goes through the service role, after this
 * server has decided it should. Nothing here weakens that, and nothing here needs to.
 *
 * The other boundary is honesty about what is not known. A price has three parts and the platform
 * currently knows one of them:
 *
 *   gross — the instructor's own hourly rate over the booked duration. Real, when they have set one.
 *   fee   — the platform's cut. Lives in `admin_settings` under `platform_fee`, which is empty.
 *   net   — gross minus fee, so unknown while the fee is unknown.
 *
 * A default fee is not invented here. `calculateQuote` returns nulls for anything it cannot derive,
 * and the UI reports "not calculated" rather than a number nobody agreed to. That matters more than
 * it looks: a fee shown once becomes a fee somebody expects.
 */
import { getSupabaseAdminClient } from "./supabase-admin-client";
import { getSupabaseUserClient } from "./supabase-user-client";
import type { SupabaseIdentity } from "./supabase-auth";
import { paymentProviderStatus, resolvePaymentProvider, type PaymentProviderStatus, type PaymentStatus } from "./payment-provider";

type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "SETUP_NEEDED" | "VALIDATION" | "PROVIDER_FAILED" };

/** The admin_settings key the platform fee lives under. Provider-neutral, and currently unset. */
export const PLATFORM_FEE_KEY = "platform_fee";

/** What the fee configuration looks like when somebody eventually sets it. */
export type FeeConfig = { basisPoints: number; currency: string };

export type Quote = {
  /** Minor units, always. No floats touch money anywhere in this system. */
  grossMinor: number | null;
  feeMinor: number | null;
  netMinor: number | null;
  currency: string | null;
  durationMinutes: number;
  /** Why a part of the quote is missing, so the screen can say which. */
  missing: Array<"instructor_rate" | "platform_fee">;
};

/**
 * Works out a quote from the parts that are known, and reports the parts that are not.
 *
 * Pure and exported so the arithmetic is testable on its own: rounding money is where quiet errors
 * live, and this rounds once, at the end, in minor units.
 */
export function calculateQuote(input: {
  hourlyRateMinor: number | null;
  rateCurrency: string | null;
  durationMinutes: number;
  fee: FeeConfig | null;
}): Quote {
  const missing: Quote["missing"] = [];
  if (input.hourlyRateMinor === null || input.rateCurrency === null) missing.push("instructor_rate");
  if (!input.fee) missing.push("platform_fee");

  if (input.hourlyRateMinor === null || input.rateCurrency === null) {
    return { grossMinor: null, feeMinor: null, netMinor: null, currency: input.rateCurrency, durationMinutes: input.durationMinutes, missing };
  }

  const grossMinor = Math.round((input.hourlyRateMinor * input.durationMinutes) / 60);
  if (!input.fee) {
    // Gross is knowable without a fee; net is not, and guessing it would invent the platform's cut.
    return { grossMinor, feeMinor: null, netMinor: null, currency: input.rateCurrency, durationMinutes: input.durationMinutes, missing };
  }
  // A fee quoted in one currency cannot be applied to a price in another without an FX rate, and
  // there is no FX source. Better to report it missing than to convert on an assumption.
  if (input.fee.currency !== input.rateCurrency) {
    return { grossMinor, feeMinor: null, netMinor: null, currency: input.rateCurrency, durationMinutes: input.durationMinutes, missing: [...missing, "platform_fee"] };
  }

  const feeMinor = Math.round((grossMinor * input.fee.basisPoints) / 10_000);
  return { grossMinor, feeMinor, netMinor: Math.max(0, grossMinor - feeMinor), currency: input.rateCurrency, durationMinutes: input.durationMinutes, missing };
}

/** Reads the platform fee, or null when nobody has set one. Server-only: admin_settings is admin-read. */
async function readFeeConfig(): Promise<FeeConfig | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) return null;
  const { data } = await admin.from("admin_settings").select("value").eq("key", PLATFORM_FEE_KEY).maybeSingle();
  const value = (data as { value?: Record<string, unknown> } | null)?.value;
  const basisPoints = Number(value?.basisPoints);
  const currency = typeof value?.currency === "string" ? value.currency : null;
  if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > 10_000 || !currency) return null;
  return { basisPoints, currency };
}

/**
 * What this booking would cost, and what is stopping it being charged.
 *
 * Readable by either party to the booking — RLS decides that, not this function. Nothing is written.
 */
export async function getCheckoutQuote(
  identity: SupabaseIdentity,
  input: { bookingId: string },
): Promise<Result<{ quote: Quote; provider: PaymentProviderStatus; ledger: unknown | null }>> {
  const db = getSupabaseUserClient(identity.accessToken);
  if (!db) return { ok: false, error: "Supabase persistence unavailable.", code: "SETUP_NEEDED" };

  const { data: booking } = await db
    .from("bookings").select("id,learner_id,instructor_id,status,scheduled_start_at,scheduled_end_at").eq("id", input.bookingId).maybeSingle();
  if (!booking) return { ok: false, error: "This booking is not available to your account.", code: "NOT_FOUND" };

  const row = booking as { id: string; learner_id: string; instructor_id: string; status: string; scheduled_start_at: string; scheduled_end_at: string };
  const durationMinutes = Math.max(0, Math.round((new Date(row.scheduled_end_at).getTime() - new Date(row.scheduled_start_at).getTime()) / 60_000));

  // The instructor's own published rate. Their profile is readable when published and approved.
  const { data: rate } = await db
    .from("instructor_profiles").select("hourly_rate_minor,currency").eq("user_id", row.instructor_id).maybeSingle();
  const rateRow = rate as { hourly_rate_minor: number | null; currency: string | null } | null;

  const quote = calculateQuote({
    hourlyRateMinor: typeof rateRow?.hourly_rate_minor === "number" ? rateRow.hourly_rate_minor : null,
    rateCurrency: rateRow?.currency ?? null,
    durationMinutes,
    fee: await readFeeConfig(),
  });

  // An existing ledger row, if this session was ever charged. RLS limits it to the two parties.
  const { data: ledger } = await db
    .from("session_ledger").select("id,amount_minor,currency,payment_status,gross_minor,fee_minor,net_minor,created_at")
    .or(`learner_id.eq.${identity.id},instructor_id.eq.${identity.id}`)
    .limit(1).maybeSingle();

  return { ok: true, data: { quote, provider: paymentProviderStatus(), ledger: ledger ?? null } };
}

/**
 * Begins a checkout.
 *
 * Refuses today, and will keep refusing until a provider is registered — but the refusal is specific,
 * because "we cannot take payments yet" and "your instructor has not set a price" send the reader to
 * very different places. Order matters: what the platform does not know is reported before the
 * provider is consulted, so a missing price is never disguised as a provider problem.
 */
export async function startCheckout(
  identity: SupabaseIdentity,
  input: { bookingId: string },
): Promise<Result<{ intentId: string; clientSecret?: string; status: PaymentStatus }>> {
  const quoted = await getCheckoutQuote(identity, input);
  if (!quoted.ok) return quoted;

  const { quote } = quoted.data;
  if (quote.missing.includes("instructor_rate")) {
    return { ok: false, error: "This instructor has not set a rate, so there is nothing to charge.", code: "SETUP_NEEDED" };
  }
  if (quote.missing.includes("platform_fee")) {
    return { ok: false, error: "No platform fee is configured, so a payment cannot be split or recorded.", code: "SETUP_NEEDED" };
  }

  const resolved = resolvePaymentProvider();
  if (resolved.status !== "ready") {
    return { ok: false, error: "No payment provider is connected, so no payment can be taken.", code: "SETUP_NEEDED" };
  }
  if (quote.currency && !resolved.provider.supportedCurrencies.includes(quote.currency)) {
    return { ok: false, error: `The connected provider cannot charge in ${quote.currency}.`, code: "VALIDATION" };
  }

  // Everything past this point requires a registered adapter, which is why it is unreachable today.
  // The ledger row must be written first, through the service role, so an intent always has a row to
  // attach to and a webhook arriving before the response still finds one.
  return { ok: false, error: "Payment intent creation is not connected yet.", code: "SETUP_NEEDED" };
}

/**
 * The caller's own transactions.
 *
 * `session_ledger_parties_or_finance` already limits this to rows where the caller is the learner or
 * the instructor, so no filter here is the security boundary — the policy is.
 */
export async function listOwnTransactions(identity: SupabaseIdentity): Promise<Result<unknown[]>> {
  const db = getSupabaseUserClient(identity.accessToken);
  if (!db) return { ok: false, error: "Supabase persistence unavailable.", code: "SETUP_NEEDED" };
  const { data, error } = await db
    .from("session_ledger")
    .select("id,session_id,learner_id,instructor_id,amount_minor,currency,payment_status,gross_minor,fee_minor,net_minor,created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    console.error("[payments] ledger list failed:", { code: error.code, message: error.message });
    return { ok: false, error: "Transactions could not be loaded." };
  }
  return { ok: true, data: data ?? [] };
}

/** The payment provider's status, plus whether a platform fee exists. Both are setup facts, not money. */
export async function getPaymentsSetup(): Promise<Result<{ provider: PaymentProviderStatus; feeConfigured: boolean }>> {
  return { ok: true, data: { provider: paymentProviderStatus(), feeConfigured: (await readFeeConfig()) !== null } };
}
