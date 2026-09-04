/**
 * The shared renderer for every non-ready panel state.
 *
 * Each state gets its own tone and its own semantics, because they mean genuinely different things
 * to the reader and to assistive technology: a failure is an `alert`, a loading notice is a polite
 * live region, and an empty result is ordinary prose. Collapsing them into one grey box is how a
 * broken endpoint ends up reading as "nothing here yet".
 *
 * `onRetry` is offered only where retrying can actually help — a connection problem or a server
 * fault. Retrying a forbidden response just repeats the refusal.
 */
import { CloudOff, Inbox, Loader2, RotateCw, ShieldAlert, TriangleAlert, Wrench } from "lucide-react";
import { useLocale } from "../contexts/LocaleContextState";
import type { ResultState as State } from "../lib/result-state";

const TONE: Record<Exclude<State, "ready">, { border: string; bg: string; text: string; icon: typeof Inbox }> = {
  loading:   { border: "var(--ni-sage-mid)",  bg: "var(--ni-sage-soft)", text: "var(--ni-muted)",     icon: Loader2 },
  offline:   { border: "var(--ni-gold-mid)",  bg: "var(--ni-gold-soft)", text: "var(--ni-gold-ink)",  icon: CloudOff },
  forbidden: { border: "var(--ni-clay-ink)",  bg: "var(--ni-clay-soft)", text: "var(--ni-clay)",      icon: ShieldAlert },
  setup:     { border: "var(--ni-gold-mid)",  bg: "var(--ni-gold-soft)", text: "var(--ni-gold-ink)",  icon: Wrench },
  error:     { border: "var(--ni-clay-ink)",  bg: "var(--ni-clay-soft)", text: "var(--ni-clay)",      icon: TriangleAlert },
  empty:     { border: "var(--ni-sage-mid)",  bg: "var(--ni-sage-soft)", text: "var(--ni-muted)",     icon: Inbox },
};

export default function ResultState({
  state, message, onRetry, retrying = false,
}: {
  state: Exclude<State, "ready">;
  /** Overrides the default copy — used for the server's own error text, or bespoke empty copy. */
  message?: string;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const { t } = useLocale();
  const tone = TONE[state];
  const Icon = tone.icon;

  const fallback: Record<Exclude<State, "ready">, string> = {
    loading: t("state.loading"),
    offline: t("state.offline"),
    forbidden: t("state.forbidden"),
    setup: t("state.setupNeeded"),
    error: t("state.error"),
    empty: t("state.empty"),
  };

  // Retrying a refusal or a misconfiguration cannot succeed, so the control is not offered there.
  const canRetry = Boolean(onRetry) && (state === "offline" || state === "error");

  return (
    <div
      role={state === "error" || state === "forbidden" ? "alert" : undefined}
      aria-live={state === "loading" ? "polite" : undefined}
      aria-busy={state === "loading" || undefined}
      className="flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3.5 text-sm leading-6"
      style={{ borderColor: tone.border, background: tone.bg, color: tone.text }}
    >
      <Icon size={16} className={state === "loading" ? "animate-spin" : ""} aria-hidden="true" />
      <span className="min-w-0 flex-1">{message ?? fallback[state]}</span>
      {canRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold disabled:opacity-50"
          style={{ borderColor: "currentColor" }}
        >
          <RotateCw size={13} className={retrying ? "animate-spin" : ""} aria-hidden="true" />
          {t("state.retry")}
        </button>
      )}
    </div>
  );
}
