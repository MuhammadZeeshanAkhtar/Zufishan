/**
 * The human check in front of learner discovery.
 *
 * Find Students shows real people who have opted into being approached, so a
 * human check in front of it is worth having. This component is that check —
 * and, just as importantly, it is honest about when there isn't one.
 *
 * THREE STATES, AND ONLY ONE OF THEM IS A PASS.
 *
 *   * **Not configured.** No provider is set on this deployment. The gate does
 *     not invent a pass and does not pretend to protect anything: it says so
 *     plainly, names the variables an operator must set, and lets the desk
 *     through. A gate whose only lock is a boolean in the browser stops nobody,
 *     and claiming otherwise would be worse than having no gate at all.
 *   * **Unverified.** A provider IS configured, so the widget is shown and the
 *     desk stays closed until the provider issues a token. Failure, expiry and
 *     cancellation all return here with a retry, because all three mean the same
 *     thing: no valid token.
 *   * **Verified.** A token exists. It is handed to the children, who send it
 *     with the query, where the SERVER checks it against the provider's secret.
 *     The token alone opens nothing — this component gates the interface, the
 *     server gates the data.
 *
 * Turnstile, hCaptcha and reCAPTCHA v2 all expose the same three calls on their
 * global (`render`, `reset`, and a container element), so one renderer serves
 * all three rather than three near-identical ones.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ShieldCheck, ShieldAlert, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLocale } from "../contexts/LocaleContextState";

type Provider = "turnstile" | "hcaptcha" | "recaptcha";
type Config =
  | { configured: false; requiredEnv: string[] }
  | { configured: true; provider: Provider; siteKey: string };

/** Where each provider's widget script lives, and what global it defines. */
const WIDGET: Record<Provider, { src: string; global: string }> = {
  turnstile: { src: "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit", global: "turnstile" },
  hcaptcha: { src: "https://js.hcaptcha.com/1/api.js?render=explicit", global: "hcaptcha" },
  recaptcha: { src: "https://www.google.com/recaptcha/api.js?render=explicit", global: "grecaptcha" },
};

type WidgetApi = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string | number;
  reset: (id?: string | number) => void;
};

/** Loads a provider script once per page, and resolves with its global. */
function loadWidget(provider: Provider): Promise<WidgetApi> {
  const { src, global } = WIDGET[provider];
  const existing = (window as unknown as Record<string, WidgetApi | undefined>)[global];
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve, reject) => {
    const already = document.querySelector<HTMLScriptElement>(`script[data-human-verification="${provider}"]`);
    const script = already ?? document.createElement("script");
    const settle = () => {
      const api = (window as unknown as Record<string, WidgetApi | undefined>)[global];
      if (api) resolve(api); else reject(new Error("widget global missing"));
    };
    if (already) { script.addEventListener("load", settle, { once: true }); return; }
    script.src = src;
    script.async = true;
    script.defer = true;
    script.dataset.humanVerification = provider;
    script.addEventListener("load", settle, { once: true });
    script.addEventListener("error", () => reject(new Error("widget script blocked")), { once: true });
    document.head.appendChild(script);
  });
}

export default function HumanVerificationGate({ children }: { children: (token: string | undefined) => ReactNode }) {
  const { t } = useLocale();
  const configQuery = trpc.supabaseCore.humanVerification.useQuery(undefined, { retry: false, staleTime: 5 * 60_000 });
  const config = configQuery.data?.ok ? (configQuery.data.data as Config) : null;

  const [token, setToken] = useState<string | undefined>(undefined);
  const [problem, setProblem] = useState<string | null>(null);
  const holder = useRef<HTMLDivElement | null>(null);
  const widget = useRef<{ api: WidgetApi; id: string | number } | null>(null);

  const reset = useCallback(() => {
    setToken(undefined);
    if (widget.current) widget.current.api.reset(widget.current.id);
  }, []);

  useEffect(() => {
    if (!config?.configured || !holder.current || widget.current) return;
    let live = true;
    void loadWidget(config.provider)
      .then((api) => {
        if (!live || !holder.current || widget.current) return;
        const id = api.render(holder.current, {
          sitekey: config.siteKey,
          callback: (issued: string) => { setProblem(null); setToken(issued); },
          // Expiry and error are not distinct outcomes for us: both mean there is
          // no usable token, and both offer the same remedy.
          "expired-callback": () => { setToken(undefined); setProblem(t("findStudents.verifyExpired")); },
          "error-callback": () => { setToken(undefined); setProblem(t("findStudents.verifyFailed")); },
        });
        widget.current = { api, id };
      })
      .catch(() => { if (live) setProblem(t("findStudents.verifyUnavailable")); });
    return () => { live = false; };
  }, [config, t]);

  if (configQuery.isLoading) {
    return (
      <p className="ni-state" role="status">
        <Loader2 size={16} className="me-2 inline animate-spin" aria-hidden="true" />
        {t("common.loading")}
      </p>
    );
  }

  // No provider on this deployment. Say so; do not simulate a pass.
  if (!config || !config.configured) {
    return (
      <>
        <div className="ni-banner mb-6" role="status">
          <ShieldAlert size={15} aria-hidden="true" className="me-2 inline align-[-2px]" />
          <span>{t("findStudents.verifyNotConfigured")}</span>
          {config && config.requiredEnv.length > 0 && (
            <span className="ms-1 ni-t-muted-soft">
              {t("findStudents.verifyNeeds")}{" "}
              <span className="ltr-embed font-mono text-[.72rem]">{config.requiredEnv.join(", ")}</span>
            </span>
          )}
        </div>
        {children(undefined)}
      </>
    );
  }

  if (!token) {
    return (
      <section className="ni-ed-card mx-auto max-w-md p-6 text-center" aria-live="polite">
        <span className="ni-auth__seal" aria-hidden="true"><ShieldCheck size={22} /></span>
        <h2 className="mt-4 font-display text-xl ni-t-ink">{t("findStudents.verifyTitle")}</h2>
        <p className="mx-auto mt-2 max-w-[42ch] text-sm leading-6 ni-t-muted">{t("findStudents.verifyCopy")}</p>
        <div ref={holder} className="mt-5 flex justify-center" />
        {problem && (
          <>
            <p role="alert" className="ni-auth__error mt-4 text-start">{problem}</p>
            <button type="button" onClick={reset} className="ni-auth__submit mt-4">
              {t("common.retry")}
            </button>
          </>
        )}
      </section>
    );
  }

  return <>{children(token)}</>;
}
