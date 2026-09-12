/**
 * Google sign-in: carrying the reader's INTENT across a full-page redirect.
 *
 * OAuth leaves the application entirely. The tab navigates to Google, and what
 * comes back is a fresh page load with a session in the URL — every piece of
 * React state that existed before the click is gone. So the three things chosen
 * on the form have to be written down somewhere first: which page the reader
 * started from, which role card they picked, and where they were originally
 * trying to go.
 *
 * WHAT THIS IS NOT. None of it is authorization. The stored role is a *request*,
 * exactly like the role card on the email signup form, and it is handed to the
 * same server procedure that already governs that path — `claimPublicRole`,
 * which refuses to grant a public role to the board address, refuses to overwrite
 * a role the account already holds, and accepts nothing outside
 * learner/instructor. A reader who edits this value by hand gains precisely what
 * they would gain by clicking a different card: nothing they could not already
 * ask for, and nothing the server does not re-decide.
 *
 * `sessionStorage`, not `localStorage`: the intent belongs to one sign-in
 * attempt in one tab. It is cleared the moment it is read, so an abandoned
 * attempt cannot steer a later one.
 */
import type { PublicRole, LoginContext } from "./auth-models";

export type OAuthIntent = {
  mode: "login" | "signup";
  /** The role card chosen at signup. A request, never a grant. */
  role?: PublicRole;
  /** The desk chosen at login. Shapes the message and the destination check only. */
  context?: LoginContext;
  /** A safe internal path the reader was heading for before being asked to sign in. */
  returnTo?: string | null;
};

const KEY = "noor-ilm-oauth-intent";

export function rememberOAuthIntent(intent: OAuthIntent): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(intent));
  } catch {
    // Private windows and blocked site data both throw. The callback still works;
    // it simply falls back to asking the server where this account belongs.
  }
}

/** Reads the intent and removes it, so one attempt can never steer the next. */
export function takeOAuthIntent(): OAuthIntent | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OAuthIntent;
    if (parsed?.mode !== "login" && parsed?.mode !== "signup") return null;
    if (parsed.role && parsed.role !== "learner" && parsed.role !== "instructor") delete parsed.role;
    if (parsed.context && !["learner", "instructor", "admin"].includes(parsed.context)) delete parsed.context;
    return parsed;
  } catch {
    return null;
  }
}

export function clearOAuthIntent(): void {
  try { sessionStorage.removeItem(KEY); } catch { /* nothing to clear */ }
}

/**
 * Whether a failure means "this project has no Google provider configured".
 *
 * Supabase answers an unconfigured provider with HTTP 400 and a message naming
 * it. Telling that apart from a network failure matters: one is an operator
 * task with a known fix, the other is worth retrying. Neither is ever reported
 * as a successful sign-in.
 */
export function isProviderDisabled(message: string | null | undefined): boolean {
  const text = (message ?? "").toLowerCase();
  return text.includes("provider is not enabled")
    || text.includes("unsupported provider")
    || text.includes("validation_failed");
}

/** Where Google returns to. Same-origin and fixed, so it cannot be pointed elsewhere. */
export function oauthRedirectTarget(): string {
  return `${window.location.origin}/auth/callback`;
}

/**
 * What a failed OAuth return actually means.
 *
 * Everything after `?` on the way back from Google is the provider's own report,
 * and the categories are genuinely different jobs for genuinely different people:
 *
 *   * `cancelled`      — the reader closed the consent screen. Not an error.
 *   * `redirect`       — the return address is not on the project's allow-list.
 *     An operator adds it in Supabase; nothing the reader can do.
 *   * `misconfigured`  — Google rejected the client itself: a wrong or expired
 *     client id/secret, or a redirect URI missing from the Google credential.
 *   * `failed`         — anything else, reported honestly as unknown.
 *
 * Collapsing these into one sentence, which is what happened before, sends an
 * operator hunting through the wrong settings page.
 */
export type OAuthReturnFailure = "cancelled" | "redirect" | "misconfigured" | "failed";

export function classifyOAuthReturn(params: URLSearchParams): OAuthReturnFailure | null {
  const code = (params.get("error") ?? "").toLowerCase();
  const detail = (params.get("error_description") ?? "").toLowerCase();
  if (!code && !detail) return null;
  const both = `${code} ${detail}`;

  if (/access_denied|consent_required|user_cancelled|user_denied/.test(both)) return "cancelled";
  // Supabase refuses a return address that is not allow-listed; Google refuses a
  // redirect URI that is not on the credential. Same remedy family, different console.
  if (/redirect|requested path is invalid|redirect_uri_mismatch/.test(both)) return "redirect";
  if (/invalid_client|unauthorized_client|client_id|invalid_request|provider is not enabled|unsupported provider/.test(both)) return "misconfigured";
  return "failed";
}

/**
 * Is Google actually configured on this project?
 *
 * This exists because of how `signInWithOAuth` really behaves, which is not how
 * it reads. It does not resolve with an error when a provider is missing — it
 * navigates the whole tab to `/auth/v1/authorize`, and the project answers 400.
 * Measured, not assumed: clicking the button on an unconfigured project left the
 * reader looking at a raw Supabase error page, with the application gone and
 * every message in this file unreachable.
 *
 * So the provider is checked BEFORE the tab is allowed to leave. `/auth/v1/settings`
 * is Supabase's own public endpoint for exactly this — it lists which providers
 * are enabled and nothing else. It carries the publishable key the browser
 * already holds, and returns no secret, no user and no token.
 *
 * A check that cannot be reached returns `true`: an unreachable network is not
 * evidence that the provider is missing, and the redirect will surface a real
 * failure on its own. This only ever prevents the one case it can prove.
 */
export async function isGoogleEnabled(): Promise<boolean> {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key) return false;
  try {
    const response = await fetch(`${url.replace(/\/+$/, "")}/auth/v1/settings`, { headers: { apikey: key } });
    if (!response.ok) return true;
    const settings = (await response.json()) as { external?: Record<string, boolean> };
    return settings.external?.google === true;
  } catch {
    return true;
  }
}
