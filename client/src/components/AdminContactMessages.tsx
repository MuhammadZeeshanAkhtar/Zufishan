/**
 * Where contact messages are read.
 *
 * The contact form writes a row and tells the sender it was saved. That promise is only kept if
 * somebody can actually read it, so this is the other half of the same change rather than a
 * nice-to-have: without it the form would be a more elaborate way of discarding messages.
 *
 * Read-only on purpose. A reviewer may move a message's status, but that is a separate act with its
 * own audit trail, and nothing here may edit what somebody wrote — the policy refuses it and so does
 * this screen. Every row carries a name, an email address and whatever the sender chose to confide,
 * which is exactly why the reading policy is a reviewer's alone.
 */
import { useState } from "react";
import { Mail } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLocale } from "../contexts/LocaleContextState";
import { useOnlineStatus } from "../lib/use-online-status";
import { resultError, resultState } from "../lib/result-state";
import ResultState from "./ResultState";
import type { TranslationKey } from "@/i18n/catalog";

type Message = {
  id: string; userId: string | null; senderName: string; senderEmail: string;
  senderRole: string; subject: string; body: string; status: string; createdAt: string;
};

const ROLE_LABELS: Record<string, TranslationKey> = {
  student: "contact.asStudent",
  teacher: "contact.asTeacher",
  other: "contact.asOther",
};

export default function AdminContactMessages() {
  const { t, locale } = useLocale();
  const online = useOnlineStatus();
  const [offset, setOffset] = useState(0);

  const query = trpc.admin.contactMessages.useQuery({ limit: 25, offset }, { retry: false });
  const state = resultState(query as never, online);
  const payload = query.data?.ok ? (query.data.data as { messages: Message[]; total: number }) : null;
  const messages = payload?.messages ?? [];

  const at = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
  };

  return (
    <div className="mx-auto max-w-5xl px-5 py-6 lg:px-6 lg:py-8">
      <h1 className="font-display text-2xl ni-t-ink">{t("adminContact.title")}</h1>
      <p className="mt-2 max-w-[70ch] text-sm leading-6 ni-t-muted">{t("adminContact.copy")}</p>

      {state !== "ready" ? (
        <div className="mt-6">
          <ResultState state={state} message={resultError(query as never)} onRetry={() => query.refetch()} retrying={query.isFetching} />
        </div>
      ) : messages.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-[var(--ni-sage-mid)] bg-[var(--ni-sage-soft)] px-5 py-10 text-center">
          <Mail size={20} aria-hidden="true" className="mx-auto ni-t-muted" />
          <p className="mt-3 font-display text-lg ni-t-ink">{t("adminContact.none")}</p>
        </div>
      ) : (
        <>
          <ul className="mt-6 grid gap-3">
            {messages.map((message) => (
              <li key={message.id} className="ni-ed-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-display text-lg ni-t-ink">{message.subject}</h2>
                    <p className="mt-1 text-xs ni-t-muted">
                      <span className="font-semibold">{t("adminContact.from")}:</span>{" "}
                      {message.senderName} · <span className="ltr-embed">{message.senderEmail}</span>
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <span className="ni-verify">{ROLE_LABELS[message.senderRole] ? t(ROLE_LABELS[message.senderRole]) : message.senderRole}</span>
                    <span className="ni-verify">{message.status}</span>
                  </div>
                </div>
                {/* The message as written. Never trimmed to a preview: a reviewer needs all of it. */}
                <p className="mt-3 max-w-[78ch] whitespace-pre-line text-sm leading-7 ni-t-muted">{message.body}</p>
                <p className="mt-3 text-[11px] ni-t-muted-soft tabular-nums">
                  {t("adminContact.received")}: {at(message.createdAt)}
                </p>
              </li>
            ))}
          </ul>

          {(payload?.total ?? 0) > messages.length + offset && (
            <div className="mt-5 flex justify-center">
              <button type="button" onClick={() => setOffset(offset + 25)} className="ni-btn ni-btn--outline text-sm">
                {t("common.loading")}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
