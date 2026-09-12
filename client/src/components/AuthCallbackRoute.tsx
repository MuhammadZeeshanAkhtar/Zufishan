/**
 * Where Google sends the reader back.
 *
 * Before this existed, `/auth/callback` rendered the generic "check your email"
 * panel, so an OAuth return had nowhere to land: the session was created by the
 * Supabase client and then simply sat there while the reader looked at a
 * verification notice. This route completes the round trip.
 *
 * It decides nothing itself. The session is already real by the time this
 * mounts — `detectSessionInUrl` on the browser client consumes the code in the
 * URL — and every question after that is asked of the server:
 *
 *   * which roles this verified identity holds,
 *   * whether the board address matches (so Google cannot be a way around admin
 *     authorization),
 *   * whether onboarding is still outstanding,
 *   * and therefore where this account belongs.
 *
 * That is the same `loginContext` procedure the password form has always used,
 * so both doors reach the same guard. The role card chosen before the redirect
 * travels as a request and is re-decided there; it is never treated as a grant.
 *
 * A refusal — the wrong desk, a reserved address, no role assigned — is shown
 * here with the existing wording and a way back, rather than bouncing the reader
 * to a dashboard or silently to /login.
 */
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "../contexts/LocaleContextState";
import type { TranslationKey } from "../i18n/catalog";
import { isSafeInternalReturn } from "../lib/auth-models";
import { classifyOAuthReturn, takeOAuthIntent } from "../lib/auth-oauth";
import { AUTH_ERROR_KEY } from "../lib/auth-errors";

export default function AuthCallbackRoute() {
  const { t } = useLocale();
  const [, setLocation] = useLocation();
  const { resolveAfterOAuth } = useAuth();
  const [failure, setFailure] = useState<string | null>(null);
  // React runs effects twice in development StrictMode. The intent is consumed
  // on read, so without this the second pass would resolve with no intent at all.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    let active = true;

    void (async () => {
      // Google reports a refusal in the query string. Cancelling at the consent
      // screen is the ordinary case and is not an error worth alarming anyone
      // about — it returns to the form quietly.
      const params = new URLSearchParams(window.location.search);
      const returned = classifyOAuthReturn(params);
      if (returned) {
        // Cancelling is the ordinary case and not worth alarming anyone about.
        if (returned === "cancelled") { setLocation("/login"); return; }
        if (!active) return;
        setFailure(t(({
          redirect: "auth.decision.oauth_redirect",
          misconfigured: "auth.decision.oauth_misconfigured",
          failed: "auth.decision.oauth_failed",
        } as const)[returned]));
        return;
      }

      const intent = takeOAuthIntent();
      const result = await resolveAfterOAuth(intent);
      if (!active) return;

      if (result.ok && result.next) {
        const returnTo = isSafeInternalReturn(intent?.returnTo ?? null);
        // Replace, so the browser's back button does not return to a spent
        // callback URL.
        window.history.replaceState({}, "", returnTo || result.next);
        setLocation(returnTo || result.next);
        return;
      }

      if (result.errorCode) { setFailure(t(AUTH_ERROR_KEY[result.errorCode] as TranslationKey)); return; }

      const code = result.decision;
      if (code && code !== "ok") {
        // This refusal arrived through Google, so it is worded for Google: the
        // reader's remedy is a different account, not a different password.
        const googleKey = `auth.decision.google.${code}` as TranslationKey;
        const googleText = t(googleKey);
        if (googleText !== googleKey) { setFailure(googleText); return; }

        const phase = intent?.mode === "signup" ? "signup" : "login";
        const key = (code === "already_learner" || code === "already_instructor")
          ? (`auth.decision.${phase}.${code}` as TranslationKey)
          : (`auth.decision.${code}` as TranslationKey);
        const text = t(key);
        setFailure(text === key ? result.error || t("common.error") : text);
        return;
      }
      setFailure(result.error || t("common.error"));
    })();

    return () => { active = false; };
  }, [resolveAfterOAuth, setLocation, t]);

  if (failure) {
    return (
      <main className="ni-auth ni-auth--single">
        <div className="ni-auth__form">
          <div className="ni-auth__inner text-center">
            <span className="ni-auth__seal ni-auth__seal--warn" aria-hidden="true"><AlertTriangle size={24} /></span>
            <h1 className="ni-auth__title mt-5">{t("auth.oauthReturnTitle")}</h1>
            <p role="alert" className="ni-auth__error mt-4 text-start">{failure}</p>
            <Link href="/login" className="ni-auth__submit mt-6 inline-flex">{t("auth.returnLogin")}</Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="ni-auth ni-auth--single">
      <div className="ni-auth__form">
        <div className="ni-auth__inner text-center" role="status" aria-live="polite">
          <Loader2 size={26} className="ni-auth__spin mx-auto ni-t-moss" aria-hidden="true" />
          <h1 className="ni-auth__title mt-5">{t("auth.oauthReturnTitle")}</h1>
          <p className="ni-auth__lede mt-3">{t("auth.oauthReturnCopy")}</p>
        </div>
      </div>
    </main>
  );
}
