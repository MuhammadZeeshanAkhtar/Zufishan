/**
 * The payments provider boundary.
 *
 * Same shape as the classroom boundary, and for the same reason: nothing above `PaymentProvider`
 * knows a vendor exists, so connecting one later is an addition rather than a rewrite. No provider is
 * selected and none is contacted.
 *
 * Money makes two rules stricter than they were for the classroom.
 *
 * First, there is no null-object adapter and there never will be. A stubbed payment that returns
 * "succeeded" is indistinguishable from a real one until somebody's bank statement disagrees, which
 * is the single worst failure this system could have. `resolvePaymentProvider()` returns a
 * discriminated result and the procedures refuse; nothing anywhere fabricates a success.
 *
 * Second, the platform's status vocabulary is the platform's own. Every provider spells these
 * differently, and mapping a vendor's word directly onto a database column would make the ledger
 * unreadable the day the provider changes. An adapter maps onto `PAYMENT_STATUSES` and nothing else.
 */

export type ProviderResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: "SETUP_NEEDED" | "PROVIDER_FAILED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" };

/**
 * The life of a payment, in the platform's words.
 *
 * `not_configured` is the state a ledger row starts in and stays in while no provider exists — it is
 * not a payment that failed, and it is not one that is pending. Nothing has been attempted.
 */
export const PAYMENT_STATUSES = [
  "not_configured",
  "requires_action",
  "pending",
  "processing",
  "succeeded",
  "failed",
  "cancelled",
  "refunded",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** Statuses after which no further money moves without a new intent. */
export const TERMINAL_PAYMENT_STATUSES: readonly PaymentStatus[] = ["succeeded", "failed", "cancelled", "refunded"];

/**
 * A payment intent, normalised.
 *
 * `clientSecret` is deliberately optional and deliberately opaque: some providers hand the browser a
 * short-lived token to complete the payment, and it is the only provider value that may ever reach a
 * client. Nothing else from a provider response crosses that line.
 */
export type PaymentIntent = {
  externalIntentId: string;
  status: PaymentStatus;
  amountMinor: number;
  currency: string;
  clientSecret?: string;
};

/** A normalised provider event. An adapter maps its vendor's payload onto exactly this. */
export type PaymentEvent = {
  /** Stable per event, so a redelivered webhook is recognisable. The idempotency key. */
  externalEventId: string;
  externalIntentId: string;
  status: PaymentStatus;
  amountMinor: number;
  currency: string;
  occurredAt: string;
};

export interface PaymentProvider {
  readonly name: string;
  readonly requiredEnv: readonly string[];
  /** Currencies this adapter can actually charge in. Checked before an intent is attempted. */
  readonly supportedCurrencies: readonly string[];

  /** Creates an intent to collect `amountMinor`. Must be idempotent on `idempotencyKey`. */
  createIntent(input: {
    amountMinor: number;
    currency: string;
    ledgerId: string;
    idempotencyKey: string;
  }): Promise<ProviderResult<PaymentIntent>>;

  /** Reads the provider's current view of an intent. The provider is the authority, not the row. */
  readIntent(input: { externalIntentId: string }): Promise<ProviderResult<PaymentIntent>>;

  /** Cancels an intent that has not completed. */
  cancelIntent(input: { externalIntentId: string }): Promise<ProviderResult<PaymentIntent>>;

  /** Verifies a webhook from its raw bytes and normalises it. See `handlePaymentWebhook`. */
  verifyWebhook(input: { rawBody: Buffer | string; headers: Record<string, string | undefined> }): ProviderResult<PaymentEvent>;
}

/**
 * Registered adapters. Empty on purpose.
 *
 * A real integration adds one entry and implements the interface — no procedure, route, component,
 * column or policy changes.
 */
const ADAPTERS: Record<string, () => PaymentProvider> = {};

export type PaymentProviderResolution =
  | { status: "not_configured"; missing: string[] }
  | { status: "unknown_provider"; name: string; known: string[] }
  | { status: "incomplete"; name: string; missing: string[] }
  | { status: "ready"; provider: PaymentProvider };

export function resolvePaymentProvider(env: NodeJS.ProcessEnv = process.env): PaymentProviderResolution {
  const name = env.PAYMENT_PROVIDER?.trim();
  if (!name) return { status: "not_configured", missing: ["PAYMENT_PROVIDER", "PAYMENT_PROVIDER_SECRET"] };

  const factory = ADAPTERS[name];
  // Configured and broken is a different problem from never configured, and a different person fixes it.
  if (!factory) return { status: "unknown_provider", name, known: Object.keys(ADAPTERS) };

  const provider = factory();
  const missing = provider.requiredEnv.filter((key) => !env[key]?.trim());
  if (missing.length) return { status: "incomplete", name, missing };
  return { status: "ready", provider };
}

/** Status for the UI. Env *names* only — never a value, and never a key fragment. */
export type PaymentProviderStatus = {
  configured: boolean;
  reason: "not_configured" | "unknown_provider" | "incomplete" | "ready";
  provider: string | null;
  missing: string[];
  supportedCurrencies: string[];
};

export function paymentProviderStatus(env: NodeJS.ProcessEnv = process.env): PaymentProviderStatus {
  const resolved = resolvePaymentProvider(env);
  switch (resolved.status) {
    case "ready":
      return { configured: true, reason: "ready", provider: resolved.provider.name, missing: [], supportedCurrencies: [...resolved.provider.supportedCurrencies] };
    case "unknown_provider":
      return { configured: false, reason: "unknown_provider", provider: resolved.name, missing: [], supportedCurrencies: [] };
    case "incomplete":
      return { configured: false, reason: "incomplete", provider: resolved.name, missing: resolved.missing, supportedCurrencies: [] };
    default:
      return { configured: false, reason: "not_configured", provider: null, missing: resolved.missing, supportedCurrencies: [] };
  }
}

/**
 * The payment webhook boundary.
 *
 * Unmounted, for the same three reasons as the classroom one and one more that matters more here:
 * a payment webhook is the *only* trustworthy signal that money moved. Acting on one without an
 * idempotency store would let a redelivered "succeeded" mark a ledger row paid twice, and acting on
 * one without signature verification would let anybody who can reach the URL do the same.
 *
 * So this refuses, and names which precondition is missing rather than failing quietly.
 */
export function handlePaymentWebhook(input: {
  rawBody: Buffer | string;
  headers: Record<string, string | undefined>;
  env?: NodeJS.ProcessEnv;
}): ProviderResult<PaymentEvent> {
  const resolved = resolvePaymentProvider(input.env ?? process.env);
  if (resolved.status !== "ready") {
    return { ok: false, error: "No payment provider is configured, so payment events cannot be verified.", code: "SETUP_NEEDED" };
  }
  const verified = resolved.provider.verifyWebhook({ rawBody: input.rawBody, headers: input.headers });
  if (!verified.ok) return verified;

  // Stops here deliberately: applying a verified event needs the idempotency store, and a redelivery
  // without one would move a ledger row twice.
  return { ok: false, error: "Payment event verified, but event persistence is not connected yet.", code: "SETUP_NEEDED" };
}
