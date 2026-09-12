import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { calculateQuote } from "./payments";
import { handlePaymentWebhook, paymentProviderStatus, resolvePaymentProvider, PAYMENT_STATUSES, TERMINAL_PAYMENT_STATUSES } from "./payment-provider";

const provider = readFileSync(new URL("./payment-provider.ts", import.meta.url), "utf8");
const payments = readFileSync(new URL("./payments.ts", import.meta.url), "utf8");
const ui = readFileSync(new URL("../client/src/components/PaymentsExperience.tsx", import.meta.url), "utf8");
const routers = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const rls = readFileSync(new URL("../supabase/migrations/0002_auth_and_rls.sql", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/0022_payment_status_vocabulary.sql", import.meta.url), "utf8");
const catalog = readFileSync(new URL("../client/src/i18n/catalog.ts", import.meta.url), "utf8");

describe("no provider, no fake money", () => {
  it("registers no adapters and names no vendor", () => {
    expect(provider).toContain("const ADAPTERS: Record<string, () => PaymentProvider> = {};");
    expect(provider).not.toMatch(/stripe|paddle|braintree|adyen|razorpay|paypal|checkout\.com/i);
    expect(payments).not.toMatch(/stripe|paddle|braintree|adyen|razorpay|paypal|checkout\.com/i);
  });

  it("never reports a payment as successful from the client", () => {
    // There is no local "paid" transition anywhere: a payment is complete when the ledger says so.
    expect(ui).not.toMatch(/setPaid|status:\s*["']succeeded["']|isPaid\s*=\s*true/);
    expect(ui).toContain("There is deliberately no success branch that marks anything paid locally.");
  });

  it("refuses to start a checkout, and says which precondition is missing", () => {
    expect(payments).toContain('return { ok: false, error: "This instructor has not set a rate, so there is nothing to charge.", code: "SETUP_NEEDED" };');
    expect(payments).toContain('return { ok: false, error: "No platform fee is configured, so a payment cannot be split or recorded.", code: "SETUP_NEEDED" };');
    expect(payments).toContain('return { ok: false, error: "No payment provider is connected, so no payment can be taken.", code: "SETUP_NEEDED" };');
  });

  it("reports what the platform does not know before consulting any provider", () => {
    const body = payments.slice(payments.indexOf("export async function startCheckout"));
    expect(body.indexOf('quote.missing.includes("instructor_rate")')).toBeLessThan(body.indexOf("resolvePaymentProvider()"));
  });
});

describe("the quote invents nothing", () => {
  it("computes gross from the instructor's own rate over the booked duration", () => {
    const quote = calculateQuote({ hourlyRateMinor: 6000, rateCurrency: "USD", durationMinutes: 30, fee: null });
    expect(quote.grossMinor).toBe(3000);
    expect(quote.currency).toBe("USD");
  });

  it("leaves fee and net null when no platform fee is configured", () => {
    const quote = calculateQuote({ hourlyRateMinor: 6000, rateCurrency: "USD", durationMinutes: 60, fee: null });
    expect(quote).toMatchObject({ grossMinor: 6000, feeMinor: null, netMinor: null });
    expect(quote.missing).toContain("platform_fee");
  });

  it("returns nothing at all when the instructor has set no rate", () => {
    const quote = calculateQuote({ hourlyRateMinor: null, rateCurrency: null, durationMinutes: 60, fee: { basisPoints: 1000, currency: "USD" } });
    expect(quote).toMatchObject({ grossMinor: null, feeMinor: null, netMinor: null });
    expect(quote.missing).toContain("instructor_rate");
  });

  it("splits by basis points once a fee exists", () => {
    const quote = calculateQuote({ hourlyRateMinor: 10_000, rateCurrency: "USD", durationMinutes: 60, fee: { basisPoints: 1500, currency: "USD" } });
    expect(quote).toMatchObject({ grossMinor: 10_000, feeMinor: 1500, netMinor: 8500, missing: [] });
  });

  it("refuses to apply a fee quoted in another currency rather than converting on an assumption", () => {
    const quote = calculateQuote({ hourlyRateMinor: 10_000, rateCurrency: "PKR", durationMinutes: 60, fee: { basisPoints: 1500, currency: "USD" } });
    expect(quote.grossMinor).toBe(10_000);
    expect(quote.feeMinor).toBeNull();
    expect(quote.missing).toContain("platform_fee");
  });

  it("rounds once, in minor units, and never goes negative", () => {
    const quote = calculateQuote({ hourlyRateMinor: 3333, rateCurrency: "USD", durationMinutes: 50, fee: { basisPoints: 10_000, currency: "USD" } });
    expect(Number.isInteger(quote.grossMinor!)).toBe(true);
    expect(quote.netMinor).toBe(0);
  });

  it("treats a zero-length booking as zero, not as unknown", () => {
    const quote = calculateQuote({ hourlyRateMinor: 6000, rateCurrency: "USD", durationMinutes: 0, fee: null });
    expect(quote.grossMinor).toBe(0);
  });
});

describe("the four provider states stay distinct", () => {
  it("reports not_configured when nothing is set", () => {
    expect(paymentProviderStatus({} as NodeJS.ProcessEnv)).toMatchObject({ configured: false, reason: "not_configured", provider: null });
  });

  it("reports unknown_provider when a name has no adapter", () => {
    const status = paymentProviderStatus({ PAYMENT_PROVIDER: "someone" } as NodeJS.ProcessEnv);
    expect(status).toMatchObject({ configured: false, reason: "unknown_provider", provider: "someone" });
    expect(status.reason).not.toBe("not_configured");
  });

  it("never reports configured while no adapter is registered", () => {
    for (const env of [{}, { PAYMENT_PROVIDER: "x" }, { PAYMENT_PROVIDER: "x", PAYMENT_PROVIDER_SECRET: "y" }]) {
      expect(paymentProviderStatus(env as NodeJS.ProcessEnv).configured).toBe(false);
    }
    expect(resolvePaymentProvider({ PAYMENT_PROVIDER: "x" } as NodeJS.ProcessEnv).status).toBe("unknown_provider");
  });

  it("carries env names only, never a secret value", () => {
    const status = paymentProviderStatus({ PAYMENT_PROVIDER_SECRET: "sk_live_realsecret" } as NodeJS.ProcessEnv);
    expect(JSON.stringify(status)).not.toContain("sk_live_realsecret");
  });
});

describe("the payment webhook refuses rather than moving money", () => {
  it("refuses with no provider, because there is no key to verify against", () => {
    const result = handlePaymentWebhook({ rawBody: "{}", headers: {}, env: {} as NodeJS.ProcessEnv });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("SETUP_NEEDED");
  });

  it("refuses a forged success payload", () => {
    const forged = JSON.stringify({ type: "payment.succeeded", amountMinor: 999_999, status: "succeeded" });
    const result = handlePaymentWebhook({ rawBody: forged, headers: { "x-signature": "whatever" }, env: {} as NodeJS.ProcessEnv });
    expect(result.ok).toBe(false);
  });

  it("names why it cannot act even on a verified event", () => {
    expect(provider).toContain("a redelivered \"succeeded\" mark a ledger row paid twice");
    expect(provider).toContain("rawBody: Buffer | string");
  });
});

describe("financial writes stay server-controlled", () => {
  it("rests on tables with no insert or update policy at all", () => {
    expect(rls).toContain("create policy session_ledger_parties_or_finance on public.session_ledger for select using (learner_id = auth.uid() or instructor_id = auth.uid() or public.is_finance_user());");
    expect(rls).toContain("create policy payment_references_finance on public.payment_references for select using (public.is_finance_user());");
    expect(rls).not.toMatch(/create policy \w+ on public\.session_ledger for (insert|update|all)/);
    expect(rls).not.toMatch(/create policy \w+ on public\.payment_references for (insert|update|all)/);
  });

  it("reads the ledger on the caller's own client, letting the policy scope it", () => {
    const body = payments.slice(payments.indexOf("export async function listOwnTransactions"));
    expect(body).toContain("getSupabaseUserClient(identity.accessToken)");
    expect(body).not.toContain("getSupabaseAdminClient");
  });

  it("exposes no procedure that writes a financial column", () => {
    const block = routers.slice(routers.indexOf("paymentsSetup:"), routers.indexOf("myTransactions:") + 200);
    expect(block).not.toMatch(/setPaymentStatus|updateLedger|setBalance|adjustFee/);
  });

  it("says so on the screen, so the read-only nature is not a secret", () => {
    expect(ui).toContain('t("pay.readOnlyNote")');
  });
});

describe("the status vocabulary is closed and provider-neutral", () => {
  it("constrains both money tables to the platform's own words", () => {
    expect(migration).toContain("session_ledger_payment_status_vocabulary");
    expect(migration).toContain("payment_references_status_vocabulary");
    for (const status of PAYMENT_STATUSES) expect(migration, `${status} must be allowed`).toContain(`'${status}'`);
  });

  it("adds no policy and alters no column", () => {
    expect(migration).not.toMatch(/create policy|alter policy|drop policy/);
    expect(migration.toLowerCase()).not.toMatch(/\b(drop table|drop column|delete from|truncate|alter column)\b/);
  });

  it("names no vendor, so connecting any provider needs no schema change", () => {
    expect(migration).not.toMatch(/stripe|paddle|adyen|razorpay|paypal/i);
  });

  it("agrees with the code's vocabulary, and marks the terminal ones", () => {
    expect(PAYMENT_STATUSES).toContain("not_configured");
    expect(TERMINAL_PAYMENT_STATUSES).toEqual(["succeeded", "failed", "cancelled", "refunded"]);
  });

  it("has a label for every status, in all three locales", () => {
    for (const status of PAYMENT_STATUSES) {
      expect(catalog.match(new RegExp(`"pay\\.status\\.${status}":`, "g"))?.length, `pay.status.${status} needs en/ur/ar`).toBe(3);
    }
  });
});

describe("UI states and money formatting", () => {
  it("routes checkout and history for the roles that need them", () => {
    expect(app).toContain('<Route path="/dashboard/learner/checkout/:bookingId">');
    expect(app).toContain('<Route path="/dashboard/learner/transactions">');
    expect(app).toContain('<Route path="/dashboard/instructor/transactions">');
  });

  it("derives state through the shared layer and offers retry", () => {
    expect(ui.match(/resultState\(/g)?.length).toBe(2);
    expect(ui.match(/onRetry=\{/g)?.length).toBe(2);
    expect(ui).toContain("useOnlineStatus");
  });

  it("renders an unknown amount as words, never as zero", () => {
    expect(ui).toContain("if (amount === null || amount === undefined || !currency) return unknown;");
    expect(ui).toContain('const unknown = t("pay.notCalculated");');
  });

  it("disables paying while anything required is missing", () => {
    expect(ui).toContain("disabled={start.isPending || !payload.provider.configured || payload.quote.missing.length > 0}");
  });

  it("tells a filtered-empty list apart from an empty one", () => {
    expect(ui).toContain('message={state === "empty" ? (filter ? t("pay.noneMatch") : t("pay.none")) : resultError(query as never)}');
  });

  it("states plainly that card details are never entered here", () => {
    expect(ui).toContain('t("pay.noCardHere")');
    // No card field exists on this screen, and none should.
    expect(ui).not.toMatch(/cardNumber|cvv|expiry|autoComplete="cc-/i);
  });

  it("isolates money and dates for right-to-left reading", () => {
    expect(ui).not.toMatch(/\b(ml|mr|pl|pr)-\d/);
    expect(ui.match(/ltr-embed/g)?.length).toBe(5);
  });
});
