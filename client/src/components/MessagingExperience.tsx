/**
 * Messaging.
 *
 * Replaces the earlier list/thread pair, which had three problems worth naming: a handled
 * `ok: false` rendered as "no threads yet" (the same conflation that made a failed tutor search look
 * like an empty marketplace), there was no way to start a conversation, and `read_at` was never
 * written so everything was permanently unread.
 *
 * State comes from the shared derivation, so failure, emptiness, forbidden and offline stay
 * distinct here as everywhere else. Sending is optimistic in appearance only — a failed send keeps
 * the text in the box and offers retry, because silently losing what someone typed is worse than
 * showing them an error.
 */
import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, MessageCircle, Send } from "lucide-react";
import { trpc } from "../lib/trpc";
import { useLocale } from "../contexts/LocaleContextState";
import { useAuth } from "@/contexts/AuthContext";
import ResultState from "./ResultState";
import { resultError, resultState } from "../lib/result-state";
import { useOnlineStatus } from "../lib/use-online-status";

type Role = "learner" | "instructor";

const shell = "min-h-screen bg-[var(--ni-bg)] ni-t-ink";
const wrap = "mx-auto max-w-4xl px-5 py-10 lg:px-8 lg:py-14";

function Head({ role, title }: { role: Role; title: string }) {
  const { t } = useLocale();
  return (
    <header className="border-b border-[var(--ni-sage)] bg-[var(--ni-paper)]">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-5 py-4 lg:px-8">
        <Link href={`/dashboard/${role}`} className="inline-flex items-center gap-2 text-sm font-bold ni-t-moss">
          <ArrowLeft size={15} className="rtl:rotate-180" aria-hidden="true" /> {t("dashboard.back")}
        </Link>
        <span className="ni-eyebrow truncate">{title}</span>
      </div>
    </header>
  );
}

const when = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
};

/* ------------------------------------------------------------------- list */

export function ConversationListPage({ role }: { role: Role }) {
  const { t } = useLocale();
  const online = useOnlineStatus();
  const conversations = trpc.supabaseCore.conversationSummaries.useQuery(undefined, { retry: false });
  const state = resultState(conversations as never, online);
  const rows = conversations.data?.ok ? conversations.data.data : [];

  return (
    <div className={shell}>
      <Head role={role} title={t("messaging.title")} />
      <main className={wrap}>
        <p className="max-w-[60ch] text-sm leading-6 ni-t-muted">{t("messaging.protectedCopy")}</p>

        <div className="mt-8">
          {state !== "ready" && (
            <ResultState
              state={state}
              message={state === "empty" ? t("messaging.noThreads") : resultError(conversations as never)}
              onRetry={() => conversations.refetch()}
              retrying={conversations.isFetching}
            />
          )}

          {state === "ready" && (
            <ul className="grid gap-3">
              {rows.map((row) => (
                <li key={row.id}>
                  <Link
                    href={`/dashboard/${role}/messages/${row.id}`}
                    className="ni-card flex items-start gap-3.5 p-4 no-underline"
                  >
                    <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--ni-sage)] ni-t-moss">
                      <MessageCircle size={18} aria-hidden="true" />
                      {row.unread > 0 && (
                        <span
                          aria-label={t("messaging.unreadCount", { count: row.unread })}
                          className="absolute -end-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--ni-moss)] px-1 text-[10px] font-bold text-[var(--ni-paper)]"
                        >
                          {row.unread}
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate ${row.unread > 0 ? "font-bold ni-t-ink" : "font-semibold ni-t-muted"}`}>
                        {row.counterpart?.name || row.subject || t("messaging.title")}
                      </span>
                      {row.lastMessage && (
                        <span className="mt-1 block truncate text-xs ni-t-muted">
                          {row.lastMessage.fromMe ? `${t("messaging.you")}: ` : ""}{row.lastMessage.body}
                        </span>
                      )}
                      <span className="mt-1 block text-[11px] ni-t-muted-soft tabular">{when(row.updatedAt)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}

/* ----------------------------------------------------------------- thread */

export function ConversationThreadPage({ conversationId, role }: { conversationId: string; role: Role }) {
  const { t } = useLocale();
  const { currentSession } = useAuth();
  const online = useOnlineStatus();
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const messages = trpc.supabaseCore.messages.useQuery({ conversationId }, { retry: false });
  const markRead = trpc.supabaseCore.markConversationRead.useMutation();
  const send = trpc.supabaseCore.createMessage.useMutation();

  const state = resultState(messages as never, online);
  const rows = (messages.data?.ok ? messages.data.data : []) as Record<string, unknown>[];

  // Receipts are written once the thread has actually rendered its messages.
  useEffect(() => {
    if (state === "ready" || state === "empty") markRead.mutate({ conversationId });
    // markRead is intentionally omitted: re-running on its identity would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, conversationId]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [rows.length]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || send.isPending) return;
    setSendError(null);
    const result = await send.mutateAsync({ conversationId, body }).catch(() => null);
    if (!result || !result.ok) {
      // The text stays in the box: losing what someone wrote is worse than an error.
      setSendError(result && !result.ok ? result.error : t("messaging.sendFailed"));
      return;
    }
    setDraft("");
    messages.refetch();
  };

  return (
    <div className={shell}>
      <Head role={role} title={t("messaging.title")} />
      <main className={wrap}>
        <div className="mb-4">
          <Link href={`/dashboard/${role}/messages`} className="text-sm font-bold ni-t-moss">
            ← {t("messaging.allThreads")}
          </Link>
        </div>

        {state !== "ready" && (
          <ResultState
            state={state}
            message={state === "empty" ? t("messaging.noMessages") : resultError(messages as never)}
            onRetry={() => messages.refetch()}
            retrying={messages.isFetching}
          />
        )}

        {state === "ready" && (
          <ol className="grid gap-2.5">
            {rows.map((row) => {
              // Whose message this is decides which side it sits on, so it comes from the session.
              const mine = String(row.sender_id ?? "") === String(currentSession?.userId ?? "");
              return (
                <li key={String(row.id)} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-6 ${
                      mine
                        ? "bg-[var(--ni-moss)] text-[var(--ni-paper)]"
                        : "border border-[var(--ni-sage)] bg-[var(--ni-paper)] ni-t-ink"
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{String(row.body ?? "")}</p>
                    <p className={`mt-1 text-[11px] tabular ${mine ? "text-[color-mix(in_srgb,var(--ni-paper)_75%,transparent)]" : "ni-t-muted-soft"}`}>
                      {when(String(row.created_at ?? "") || null)}
                    </p>
                  </div>
                </li>
              );
            })}
            <div ref={endRef} />
          </ol>
        )}

        <form onSubmit={submit} className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex-1">
            <span className="sr-only">{t("messaging.writeMessage")}</span>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={2}
              maxLength={12000}
              placeholder={t("messaging.writeMessage")}
              className="input"
            />
          </label>
          <button
            type="submit"
            disabled={!draft.trim() || send.isPending}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--ni-moss)] px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            <Send size={15} className="rtl:rotate-180" aria-hidden="true" />
            {send.isPending ? t("messaging.sending") : t("messaging.send")}
          </button>
        </form>

        {sendError && (
          <div className="mt-3">
            <ResultState state="error" message={sendError} onRetry={() => submit(new Event("submit") as never)} retrying={send.isPending} />
          </div>
        )}
      </main>
    </div>
  );
}
