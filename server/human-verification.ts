/**
 * Human verification for learner discovery.
 *
 * WHY THIS EXISTS. Find Students hands an instructor a list of real people who
 * are open to being approached. That is exactly the shape of thing worth
 * scraping, so a human check in front of it is a reasonable ask.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. There is no provider configured on this
 * project — no site key, no secret, no widget, nothing. A check with no provider
 * behind it can only ever be a boolean the browser sets for itself, which stops
 * nobody and would let this desk claim a protection it does not have. So when no
 * provider is configured this module says so, in those words, and the procedure
 * carries on unguarded rather than pretending.
 *
 * The seam is real, not speculative: the moment `CAPTCHA_PROVIDER` and
 * `CAPTCHA_SECRET_KEY` are set, `verifyHumanToken` starts making a genuine
 * server-to-server siteverify call and the procedure starts refusing requests
 * that fail it — with no code change here or on the client.
 *
 * The secret is read on the server and never returned, logged or sent to the
 * browser. Only the SITE key is public, and only the provider name and which
 * variable names are missing ever reach a client.
 */

export type CaptchaProvider = "turnstile" | "hcaptcha" | "recaptcha";

/** Where each provider's server-side check lives. */
const VERIFY_ENDPOINT: Record<CaptchaProvider, string> = {
  turnstile: "https://challenges.cloudflare.com/turnstile/v0/siteverify",
  hcaptcha: "https://api.hcaptcha.com/siteverify",
  recaptcha: "https://www.google.com/recaptcha/api/siteverify",
};

export type HumanVerificationConfig =
  | { configured: false; requiredEnv: string[] }
  /** `siteKey` is public by design — it is rendered into the widget. */
  | { configured: true; provider: CaptchaProvider; siteKey: string };

const REQUIRED_ENV = ["CAPTCHA_PROVIDER", "CAPTCHA_SITE_KEY", "CAPTCHA_SECRET_KEY"];

function providerOf(value: string | undefined): CaptchaProvider | null {
  const name = (value ?? "").trim().toLowerCase();
  return name === "turnstile" || name === "hcaptcha" || name === "recaptcha" ? name : null;
}

/**
 * What the browser is told: the provider name and the public site key, or the
 * NAMES of the variables an operator still has to set. Never a secret.
 */
export function describeHumanVerification(env: NodeJS.ProcessEnv = process.env): HumanVerificationConfig {
  const provider = providerOf(env.CAPTCHA_PROVIDER);
  const siteKey = env.CAPTCHA_SITE_KEY?.trim();
  const secret = env.CAPTCHA_SECRET_KEY?.trim();
  if (!provider || !siteKey || !secret) {
    return {
      configured: false,
      requiredEnv: REQUIRED_ENV.filter((name) => !env[name]?.trim()),
    };
  }
  return { configured: true, provider, siteKey };
}

export type HumanVerificationResult =
  /** No provider on this project, so nothing was checked. Never reported as a pass. */
  | { outcome: "not_configured" }
  | { outcome: "passed" }
  | { outcome: "failed"; reason: "missing_token" | "rejected" | "unreachable" };

/**
 * Checks a token with the provider, server-side.
 *
 * The token comes from the widget in the browser and is worthless on its own —
 * only the provider can say whether it is genuine, and only the secret can ask.
 * A provider that cannot be reached is reported as `unreachable`, not as a pass:
 * failing open here would make the whole check decorative.
 */
export async function verifyHumanToken(
  token: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): Promise<HumanVerificationResult> {
  const config = describeHumanVerification(env);
  if (!config.configured) return { outcome: "not_configured" };

  const candidate = token?.trim();
  if (!candidate) return { outcome: "failed", reason: "missing_token" };

  try {
    const body = new URLSearchParams({ secret: env.CAPTCHA_SECRET_KEY!.trim(), response: candidate });
    const response = await fetch(VERIFY_ENDPOINT[config.provider], {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!response.ok) return { outcome: "failed", reason: "unreachable" };
    const verdict = (await response.json()) as { success?: boolean };
    return verdict.success === true ? { outcome: "passed" } : { outcome: "failed", reason: "rejected" };
  } catch (cause) {
    // Codes and shapes only — a verification failure must never log the secret
    // or the token, both of which are credentials for this exchange.
    console.error("[human-verification] check failed:", { provider: config.provider, name: (cause as Error)?.name });
    return { outcome: "failed", reason: "unreachable" };
  }
}
