/**
 * Authentication failures, as codes rather than as whatever string the provider
 * happened to send.
 *
 * WHY THIS EXISTS. `signInWithPassword` was reported straight through:
 *
 *     if (error) return { ok: false, error: error.message };
 *
 * so the screen showed Supabase's own wording, in English, whatever the reader's
 * language. "Invalid login credentials" is the provider's phrasing for one very
 * specific fact — this email and this password do not match a confirmed account —
 * and it was the only thing a reader ever saw, because every other failure came
 * through the same line: an unconfirmed address, a rate limit, a dead network and
 * a mistyped password all arrived as one sentence in one language.
 *
 * Mapping to a code first means the catalogue owns the wording, the reader gets
 * their own language, and the states the brief lists can actually be told apart.
 * Nothing here changes whether a sign-in succeeds — only what a failure is called.
 *
 * A note on what is NOT distinguished. Supabase answers a wrong password and an
 * address that has no account with the SAME code, deliberately, so that a
 * stranger cannot use the login form to discover who has an account. That is a
 * privacy property worth keeping, so `invalid_credentials` covers both and the
 * wording says "email or password" rather than implying which one was wrong.
 */

export type AuthErrorCode =
  | "invalid_credentials"
  | "email_not_confirmed"
  | "email_taken"
  | "weak_password"
  | "rate_limited"
  | "session_expired"
  | "provider_disabled"
  | "network"
  | "auth_failed";

/** The shape supabase-js gives us, plus the shape a transport failure gives us. */
type MaybeAuthError = { message?: string; code?: string; status?: number; name?: string } | null | undefined;

/**
 * Classifies an auth failure.
 *
 * Reads the machine-readable `code` first, because that is stable, and falls back
 * to the message only for older responses that carry no code. A response that is
 * not JSON at all — an HTML error page from a proxy, say — arrives here as a
 * thrown `TypeError`/`SyntaxError` with no status, and is reported as a network
 * failure rather than as a credential problem, because that is what it is.
 */
export function authErrorCode(error: MaybeAuthError): AuthErrorCode {
  if (!error) return "auth_failed";

  const code = (error.code ?? "").toLowerCase();
  const message = (error.message ?? "").toLowerCase();
  const status = error.status;

  // A transport failure: fetch rejected, or the body could not be parsed.
  if (error.name === "TypeError" || error.name === "SyntaxError") return "network";
  if (message.includes("failed to fetch") || message.includes("networkerror") || message.includes("unexpected token")) return "network";

  if (code === "invalid_credentials" || message.includes("invalid login credentials")) return "invalid_credentials";
  if (code === "email_not_confirmed" || message.includes("email not confirmed") || message.includes("not confirmed")) return "email_not_confirmed";
  if (code === "user_already_exists" || code === "email_exists" || message.includes("already registered") || message.includes("already been registered")) return "email_taken";
  if (code === "weak_password" || message.includes("password should be at least")) return "weak_password";
  if (code === "over_request_rate_limit" || code === "over_email_send_rate_limit" || status === 429 || message.includes("rate limit")) return "rate_limited";
  if (code === "session_not_found" || code === "refresh_token_not_found" || message.includes("session") && message.includes("expired")) return "session_expired";
  if (code === "validation_failed" && message.includes("provider")) return "provider_disabled";
  if (message.includes("provider is not enabled") || message.includes("unsupported provider")) return "provider_disabled";

  // Anything the provider could not classify, and we should not guess at.
  return "auth_failed";
}

/** The catalogue key each code reads from. Kept here so the two cannot drift. */
export const AUTH_ERROR_KEY: Record<AuthErrorCode, string> = {
  invalid_credentials: "auth.error.invalidCredentials",
  email_not_confirmed: "auth.error.emailNotConfirmed",
  email_taken: "auth.error.emailTaken",
  weak_password: "auth.error.weakPassword",
  rate_limited: "auth.error.rateLimited",
  session_expired: "auth.error.sessionExpired",
  provider_disabled: "auth.decision.oauth_disabled",
  network: "auth.error.network",
  auth_failed: "auth.error.failed",
};
