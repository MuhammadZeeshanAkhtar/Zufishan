/**
 * Sign in and create account — one composition, two modes.
 *
 * A split screen: a quiet Islamic panel on one side, the form on the other. The
 * panel is drawn, not photographed — an eight-point girih star, an arch, and a
 * low lantern glow, all in SVG and CSS so the page costs nothing to load and
 * both themes get a palette designed for them rather than an image that only
 * suits one. No Three.js, no canvas, no external asset.
 *
 * WHAT THE ROLE CARDS ARE. They are a statement of intent and nothing else.
 * Choosing "Board / Admin" does not make anyone an administrator; the server
 * compares the card with the roles the verified account actually holds and
 * returns both the verdict and the destination. The card only shapes the
 * sentence shown when the two disagree. That boundary already existed and is
 * untouched here — this file changed how it looks, not who may pass.
 *
 * Three roles, and only three. There is no Vendor role in this product: not in
 * the schema, not in the role ladder, not on this form. Four existing tests
 * already assert that the word appears nowhere.
 *
 * The layout is logical-direction throughout — `ms`/`me`, `text-start`,
 * `inset-inline` — so Urdu and Arabic mirror without a second stylesheet.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowRight, Check, Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "../contexts/LocaleContextState";
import type { TranslationKey } from "../i18n/catalog";
import { isSafeInternalReturn, normalizeEmail, type LoginContext, type PublicRole } from "../lib/auth-models";
import { isSupabaseBrowserConfigured } from "../lib/supabase-client";
import { rememberOAuthIntent } from "../lib/auth-oauth";
import { AUTH_ERROR_KEY, type AuthErrorCode } from "../lib/auth-errors";
import { useAuthReveal } from "../lib/use-auth-reveal";
import AuthPanel from "./AuthPanel";
import GoogleButton from "./GoogleButton";

type Mode = "login" | "signup";

/**
 * The three desks, in one list used by both modes.
 *
 * Signup offers the first two: an administrator is never self-selectable at
 * registration. Login offers all three, because someone has to be able to say
 * which desk they are trying to reach in order to be told they cannot.
 */
const ROLE_CARDS: Array<{ value: LoginContext; title: TranslationKey; copy: TranslationKey; signup: boolean }> = [
  { value: "learner", title: "authRole.learner", copy: "authRole.learnerCopy", signup: true },
  { value: "instructor", title: "authRole.instructor", copy: "authRole.instructorCopy", signup: true },
  { value: "admin", title: "authRole.admin", copy: "authRole.adminCopy", signup: false },
];

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return <label htmlFor={htmlFor} className="ni-auth-label">{children}</label>;
}

export default function AuthExperience({ mode }: { mode: Mode }) {
  const { t } = useLocale();
  const [location, setLocation] = useLocation();
  const { signUp, signIn, signInWithGoogle } = useAuth();

  const [selected, setSelected] = useState<LoginContext>("learner");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const surface = useRef<HTMLDivElement | null>(null);
  useAuthReveal(surface, mode);

  const cards = useMemo(() => ROLE_CARDS.filter((card) => mode === "login" || card.signup), [mode]);
  const returnTo = isSafeInternalReturn(new URLSearchParams(location.split("?")[1] || "").get("returnTo"));

  // A role card that is not offered in this mode must never stay selected.
  useEffect(() => {
    if (mode === "signup" && selected === "admin") setSelected("learner");
  }, [mode, selected]);

  /**
   * One sentence for a failure, chosen from a code rather than passed through.
   *
   * `errorCode` is the transport/credential layer — a wrong password, an
   * unconfirmed address, a dead network. `decision` is the role layer — the wrong
   * desk, a reserved address, no role assigned. Both are codes, so both read in
   * the reader's own language; the raw provider string is only ever a last resort
   * for something neither layer recognised.
   */
  const decisionText = (result: { error?: string; errorCode?: AuthErrorCode; decision?: string }) => {
    if (result.errorCode) return t(AUTH_ERROR_KEY[result.errorCode] as TranslationKey);
    const code = result.decision;
    if (!code || code === "ok") return result.error || t("common.error");
    if (code === "already_learner" || code === "already_instructor") {
      return t(`auth.decision.${mode}.${code}` as TranslationKey);
    }
    const key = `auth.decision.${code}` as TranslationKey;
    const text = t(key);
    return text === key ? result.error || t("common.error") : text;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    const address = normalizeEmail(email);

    if (mode === "signup") {
      if (!address || password.length < 8) { setError(t("auth.passwordMin")); return; }
      if (confirm !== password) { setError(t("auth.passwordMismatch")); return; }
      if (!accepted) { setError(t("auth.termsRequired")); return; }
      setBusy(true);
      try {
        // `selected` cannot be "admin" here: signup never offers that card.
        const result = await signUp(address, password, selected as PublicRole);
        if (!result.ok) { setError(decisionText(result)); return; }
        if (result.needsVerification) { setSent(true); return; }
        // The destination comes from the role the SERVER granted, never from the
        // card. A grant that quietly landed elsewhere must not be papered over
        // by trusting the form.
        const next = result.next ?? `/onboarding/${selected}`;
        setLocation(returnTo ? `${next}?returnTo=${encodeURIComponent(returnTo)}` : next);
      } finally { setBusy(false); }
      return;
    }

    if (!address || !password) { setError(t("auth.invalidCredentials")); return; }
    setBusy(true);
    try {
      const result = await signIn(address, password, selected);
      if (!result.ok || !result.next) { setError(decisionText(result)); return; }
      setLocation(returnTo || result.next);
    } finally { setBusy(false); }
  };

  const startGoogle = async () => {
    setError("");
    setGoogleBusy(true);
    // Written down before the tab leaves for Google; read back by /auth/callback.
    rememberOAuthIntent({
      mode,
      role: mode === "signup" ? (selected as PublicRole) : undefined,
      context: mode === "login" ? selected : undefined,
      returnTo,
    });
    const result = await signInWithGoogle({
      mode,
      role: mode === "signup" ? (selected as PublicRole) : undefined,
      context: mode === "login" ? selected : undefined,
      returnTo,
    });
    // Only reached when the redirect could not start. A success has already
    // navigated away, so there is no success branch to fake here.
    if (!result.ok) { setError(decisionText(result)); setGoogleBusy(false); }
  };

  const heading = mode === "login" ? t("auth.loginTitle") : t("auth.signupTitle");

  if (sent) {
    return (
      <main className="ni-auth">
        <AuthPanel mode={mode} />
        <div className="ni-auth__form">
          <div className="ni-auth__inner text-center">
            <span className="ni-auth__seal" aria-hidden="true"><Check size={26} /></span>
            <h1 className="ni-auth__title mt-5">{t("auth.verifyTitle")}</h1>
            <p className="ni-auth__lede mt-3">{t("auth.supabaseConfigured")}</p>
            <Link href="/login" className="ni-auth__submit mt-7 inline-flex">{t("auth.returnLogin")}</Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="ni-auth">
      <AuthPanel mode={mode} />

      <div className="ni-auth__form">
        <div ref={surface} className="ni-auth__inner">
          <Link href="/" className="ni-auth__mark" data-auth-anim="mark">
            <span className="ni-auth__mark-glyph" aria-hidden="true">ن</span>
            <span className="ni-auth__mark-word">{t("brand.name")}</span>
          </Link>

          <h1 className="ni-auth__title" data-auth-anim="title">{heading}</h1>
          <p className="ni-auth__lede" data-auth-anim="lede">
            {mode === "login" ? t("auth.loginLede") : t("auth.signupLede")}
          </p>

          <form className="ni-auth__stack" onSubmit={submit} noValidate>
            <fieldset className="ni-auth__roles" data-auth-anim="roles">
              <legend className="ni-auth-label">{mode === "login" ? t("auth.continueAs") : t("auth.signupRole")}</legend>
              <div className={cards.length === 3 ? "ni-auth__role-grid ni-auth__role-grid--three" : "ni-auth__role-grid"}>
                {cards.map((card) => (
                  <button
                    key={card.value}
                    type="button"
                    onClick={() => setSelected(card.value)}
                    aria-pressed={selected === card.value}
                    className="ni-auth__role"
                    data-selected={selected === card.value ? "true" : "false"}
                  >
                    <span className="ni-auth__role-title">{t(card.title)}</span>
                    <span className="ni-auth__role-copy">{t(card.copy)}</span>
                    <span className="ni-auth__role-tick" aria-hidden="true"><Check size={13} /></span>
                  </button>
                ))}
              </div>
              {/* Stated on the form itself, because a role card that looks like a
                  permission control should say plainly that it is not one. */}
              <p className="ni-auth__note">
                <ShieldCheck size={13} aria-hidden="true" className="me-1.5 inline align-[-2px]" />
                {t("auth.contextNote")}
              </p>
            </fieldset>

            <div data-auth-anim="field">
              <Label htmlFor="auth-email">{t("auth.email")}</Label>
              <input
                id="auth-email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                dir="ltr"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={t("auth.emailPlaceholder")}
                className="ni-auth__input"
              />
            </div>

            <div data-auth-anim="field">
              <Label htmlFor="auth-password">{t("auth.password")}</Label>
              <div className="ni-auth__password">
                <input
                  id="auth-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  minLength={8}
                  dir="ltr"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={t("auth.passwordPlaceholder")}
                  className="ni-auth__input ni-auth__input--password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="ni-auth__reveal"
                  aria-pressed={showPassword}
                  aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {mode === "signup" && (
              <div data-auth-anim="field">
                <Label htmlFor="auth-confirm">{t("auth.confirmPassword")}</Label>
                <input
                  id="auth-confirm"
                  name="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  minLength={8}
                  dir="ltr"
                  required
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  placeholder={t("auth.passwordPlaceholder")}
                  className="ni-auth__input"
                />
              </div>
            )}

            {mode === "login" && (
              <div className="ni-auth__row" data-auth-anim="field">
                <label className="ni-auth__check">
                  <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
                  <span>{t("auth.rememberMe")}</span>
                </label>
                <Link href="/forgot-password" className="ni-auth__link">{t("auth.forgotPassword")}</Link>
              </div>
            )}

            {mode === "signup" && (
              <label className="ni-auth__check ni-auth__check--block" data-auth-anim="field">
                <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
                <span>{t("auth.termsAccept")}</span>
              </label>
            )}

            {error && (
              <p role="alert" data-auth-error className="ni-auth__error">{error}</p>
            )}

            <button type="submit" className="ni-auth__submit" disabled={busy} data-auth-anim="submit">
              {busy && <Loader2 size={16} className="ni-auth__spin" aria-hidden="true" />}
              {busy ? t("auth.working") : mode === "login" ? t("auth.loginAction") : t("auth.createAccountAction")}
              {!busy && <ArrowRight size={16} className="rtl:-scale-x-100" aria-hidden="true" />}
            </button>

            <div className="ni-auth__divider" data-auth-anim="submit"><span>{t("auth.or")}</span></div>

            <GoogleButton onClick={startGoogle} busy={googleBusy} label={t("auth.continueWithGoogle")} />

            {!isSupabaseBrowserConfigured && (
              <p className="ni-auth__note" role="status">{t("auth.demoBoundary")}</p>
            )}
          </form>

          <p className="ni-auth__foot" data-auth-anim="foot">
            {mode === "login" ? t("auth.newToNoor") : t("auth.alreadyHaveAccount")}{" "}
            <Link
              className="ni-auth__link ni-auth__link--strong"
              href={mode === "login"
                ? (location.includes("?") ? `/signup?${location.split("?")[1]}` : "/signup")
                : "/login"}
            >
              {mode === "login" ? t("auth.createAccount") : t("nav.login")}
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
