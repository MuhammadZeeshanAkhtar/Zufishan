import { OAUTH_STATE_COOKIE, encodeOAuthState } from "@shared/const";
import { safeNewUrl, resolveInternalPath } from "./lib/safe-url";

export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

/**
 * Where an unauthenticated caller is sent.
 *
 * This app authenticates with Supabase at `/login`. The Manus OAuth portal below
 * is scaffold from the project template and is not configured here, which is
 * exactly what broke: `startLogin()` used to build its URL unconditionally, and
 * with `VITE_OAUTH_PORTAL_URL` unset the template collapsed to the literal
 * string "undefined/app-auth" at build time. `new URL("undefined/app-auth")`
 * throws, so any unauthorised API response — an expired token while saving a
 * course, say — surfaced as "Failed to construct 'URL': Invalid URL".
 *
 * Sign-in now goes to the route this app actually has, carrying a returnTo so
 * the reader comes back to what they were doing. Nothing here throws.
 */
export function signInPath(returnTo?: string): string {
  const target = returnTo ?? (typeof window !== "undefined" ? window.location.pathname + window.location.search : "");
  // Only in-app paths are ever carried, so this cannot become an open redirect.
  const safe = target.startsWith("/") && !target.startsWith("//") ? target : "";
  return safe && safe !== "/login" ? `/login?returnTo=${encodeURIComponent(safe)}` : "/login";
}

/** Navigates to sign-in. Safe to call from an error handler; never throws. */
export function goToSignIn(returnTo?: string): void {
  if (typeof window === "undefined") return;
  const path = signInPath(returnTo);
  // Already there: do nothing, so an unauthorised response on the login page
  // cannot start a reload loop.
  if (window.location.pathname === "/login") return;
  window.location.assign(resolveInternalPath(path) ?? path);
}

/**
 * The OAuth portal URL, or null when the portal is not configured.
 *
 * Built before any cookie is written, so a failure leaves no orphaned state
 * nonce behind.
 */
export function oauthPortalLoginUrl(
  state: string,
  env: Record<string, unknown> = import.meta.env as unknown as Record<string, unknown>,
  origin: string | null = typeof window !== "undefined" ? window.location.origin : null,
): URL | null {
  const portal = typeof env.VITE_OAUTH_PORTAL_URL === "string" ? env.VITE_OAUTH_PORTAL_URL.trim() : "";
  const appId = typeof env.VITE_APP_ID === "string" ? env.VITE_APP_ID.trim() : "";
  if (!portal || !appId) return null;

  const url = safeNewUrl(`${portal.replace(/\/+$/, "")}/app-auth`);
  if (!url) return null;

  url.searchParams.set("appId", appId);
  // The origin is passed in rather than read here, so this function is pure and
  // cannot throw in a non-browser context.
  if (origin) url.searchParams.set("redirectUri", `${origin}/api/oauth/callback`);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");
  return url;
}

/**
 * Starts the Manus OAuth login when it is configured.
 *
 * SIDE EFFECTS when it proceeds — it mints a one-time nonce, writes the
 * `__Host-` state cookie and navigates — so it must be called from an event
 * handler or effect, never during render: each call overwrites the cookie, and a
 * stray render-phase call would desync it from an in-flight login.
 *
 * Returns a result rather than throwing. When the portal is not configured it
 * falls back to this app's own sign-in route, which is the real one here.
 */
export const startLogin = (): { ok: true } | { ok: false; reason: "not_configured" } => {
  if (typeof window === "undefined") return { ok: false, reason: "not_configured" };

  const nonce = crypto.randomUUID();
  const state = encodeOAuthState({ redirectUri: `${window.location.origin}/api/oauth/callback`, nonce });
  const url = oauthPortalLoginUrl(state);

  if (!url) {
    goToSignIn();
    return { ok: false, reason: "not_configured" };
  }

  // The cookie is written only once the destination is known to be valid.
  document.cookie = `${OAUTH_STATE_COOKIE}=${nonce}; Path=/; Max-Age=600; SameSite=None; Secure`;
  window.location.href = url.toString();
  return { ok: true };
};
