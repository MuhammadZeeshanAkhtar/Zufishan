import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, LockKeyhole, MessageCircle, Send } from "lucide-react";
import { trpc } from "../lib/trpc";
import { useLocale } from "../contexts/LocaleContextState";

const panel = "rounded-[1.35rem] border border-[var(--ni-sage)] bg-[var(--ni-paper)] p-6";
const primary = "inline-flex items-center justify-center gap-2 rounded-full bg-[var(--ni-moss)] px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50";
const input = "mt-2 w-full rounded-xl border border-[var(--ni-sage-line)] bg-[var(--ni-field)] px-3 py-3 text-sm outline-none focus:border-[var(--ni-moss)] focus:ring-2 focus:ring-[var(--ni-sage-mid)]";

type Role = "learner" | "instructor";

type Row = Record<string, unknown> & { id: string };

function SetupState({ copy }: { copy: string }) {
  const { t } = useLocale();
  return <div className="rounded-2xl border border-[var(--ni-gold-mid)] bg-[var(--ni-gold-soft)] px-5 py-4 text-sm leading-6 ni-t-gold"><strong>{t("messaging.setupNeeded")}.</strong> {copy}</div>;
}

function formatDate(value: unknown) {
  if (typeof value !== "string") return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

export function SupabaseConversationListPage({ role }: { role: Role }) {
  const { t } = useLocale();
  const conversations = trpc.supabaseCore.conversations.useQuery(undefined, { retry: false });
  const rows: Row[] = conversations.data?.ok ? (conversations.data.data as Row[]) : [];

  return <div className="min-h-screen bg-[var(--ni-bg)] ni-t-ink">
    <header className="border-b border-[var(--ni-sage)] bg-[var(--ni-paper)]"><div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 lg:px-8"><Link href={`/dashboard/${role}`} className="inline-flex items-center gap-2 text-sm font-bold ni-t-moss"><ArrowLeft size={15}/> {t("dashboard.back")}</Link><span className="text-xs font-bold uppercase tracking-[.18em] ni-t-gold">{t("messaging.title")}</span></div></header>
    <main className="mx-auto max-w-6xl px-5 py-12 lg:px-8 lg:py-16"><p className="max-w-3xl text-sm leading-7 ni-t-muted">{t("messaging.protectedCopy")}</p>
      {conversations.isError && <div className="mt-8"><SetupState copy={t("messaging.setupCopy")}/></div>}
      <div className="mt-8 grid gap-4 md:grid-cols-2">{rows.map((conversation) => <Link key={conversation.id} href={`/dashboard/${role}/messages/${conversation.id}`} className={`${panel} block transition hover:-translate-y-0.5 hover:border-[var(--ni-sage-mid)]`}><div className="flex items-start gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--ni-sage)] ni-t-moss"><MessageCircle size={18}/></div><div><p className="font-bold">{typeof conversation.subject === "string" && conversation.subject ? conversation.subject : t("messaging.title")}</p><p className="mt-2 text-xs ni-t-muted">{formatDate(conversation.updated_at || conversation.created_at)}</p></div></div></Link>)}
        {!conversations.isLoading && !conversations.isError && rows.length === 0 && <div className="md:col-span-2"><SetupState copy={`${t("messaging.noThreads")} ${t("messaging.membershipRequired")}`}/></div>}
      </div>
    </main>
  </div>;
}

export function SupabaseConversationPage({ conversationId, role }: { conversationId: string; role: Role }) {
  const { t } = useLocale();
  const [body, setBody] = useState("");
  const [notice, setNotice] = useState("");
  const messages = trpc.supabaseCore.messages.useQuery({ conversationId }, { retry: false });
  const send = trpc.supabaseCore.createMessage.useMutation({ onSuccess: () => { setBody(""); void messages.refetch(); } });
  const rows: Row[] = messages.data?.ok ? (messages.data.data as Row[]) : [];
  const submit = async () => { setNotice(""); try { const result = await send.mutateAsync({ conversationId, body }); if (!result.ok) setNotice(result.error); } catch { setNotice(t("common.error")); } };

  return <div className="min-h-screen bg-[var(--ni-bg)] ni-t-ink"><header className="border-b border-[var(--ni-sage)] bg-[var(--ni-paper)] px-5 py-4"><div className="mx-auto max-w-6xl"><Link href={`/dashboard/${role}/messages`} className="inline-flex items-center gap-2 text-sm font-bold ni-t-moss"><ArrowLeft size={15}/> {t("dashboard.back")}</Link></div></header><main className="mx-auto max-w-5xl px-5 py-12 lg:px-8 lg:py-16"><div className={panel}><div className="flex items-center gap-3 border-b border-[var(--ni-sage)] pb-5"><LockKeyhole className="ni-t-moss"/><div><p className="text-xs font-bold uppercase tracking-[.18em] ni-t-gold">{t("dashboard.privateByDesign")}</p><h1 className="mt-2 font-display text-4xl">{t("messaging.title")}</h1></div></div>{messages.isError ? <div className="mt-6"><SetupState copy={t("messaging.unauthorized")}/></div> : <><div className="min-h-[260px] py-6">{rows.map((message) => <div key={message.id} className="mb-3 rounded-2xl bg-[var(--ni-sage-soft)] p-4 text-sm">{typeof message.body === "string" ? message.body : ""}<span className="mt-2 block text-xs ni-t-muted-soft">{formatDate(message.created_at)}</span></div>)}{!messages.isLoading && rows.length === 0 && <p className="text-sm ni-t-muted">{t("messaging.noMessages")} {t("messaging.membershipRequired")}</p>}</div><label className="block text-sm font-bold">{t("messaging.title")}<textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={12000} rows={4} className={input} placeholder={t("messaging.placeholder")}/></label><div className="mt-3 flex items-center justify-between gap-3"><span className="text-xs ni-t-muted-soft">{body.length}/12000 · {t("messaging.plainText")}</span><button className={primary} disabled={!body.trim() || send.isPending || messages.isError} onClick={() => void submit()}><Send size={15}/>{t("messaging.send")}</button></div>{notice && <p className="mt-4 rounded-xl bg-[var(--ni-gold-soft)] p-4 text-sm" role="status">{notice}</p>}</>}</div></main></div>;
}
