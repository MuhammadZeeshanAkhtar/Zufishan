/**
 * "Message this person" — the entry point into a conversation.
 *
 * Until now `startConversation` had no caller: messaging could be read, but nothing on any screen
 * could open a thread, and the tutor profile carried a disabled button saying setup was needed.
 *
 * `startConversation` is idempotent: it returns the existing thread when one is already open between
 * the two people, and creates one only when there is none. So this component never has to ask
 * whether a conversation exists — it asks to open one, and goes wherever the server points. That is
 * what keeps a second thread from appearing for the same pair, which would split a history in half
 * with neither side able to tell which one is current.
 *
 * The server also refuses a thread between two people with no working relationship — no trial,
 * booking, requirement response or enrolment. That refusal is not a fault to apologise for; it is
 * the rule that stops messaging becoming an open channel between any two accounts. It arrives as
 * FORBIDDEN and is shown as the explanation it is, in place, rather than as an error.
 *
 * Placement follows from that rule. On a booking or a trial the relationship is guaranteed, so the
 * action always works. On a public tutor profile it works for a learner who has already met this
 * instructor, and explains itself to everyone else.
 */
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Loader2, MessageCircle } from "lucide-react";
import { trpc } from "../lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "../contexts/LocaleContextState";

/** The envelope `startConversation` returns; `created` distinguishes a new thread from a reused one. */
type Envelope = {
  ok: boolean;
  error?: string;
  code?: string;
  data?: { conversationId: string; created: boolean };
};

export default function MessageAction({
  counterpartId,
  viewerRole,
  subject,
  tone = "compact",
  label,
  className = "mt-4",
  connectHref,
  connectLabel,
}: {
  counterpartId: string;
  /**
   * The viewer's own role: it picks the dashboard the thread opens in, and names the other person.
   * Pass it where the screen already knows (a booking page is one role or the other); omit it on a
   * shared screen like a public profile, where it comes from the session — hardcoding a role there
   * would send an instructor to a learner-only route.
   */
  viewerRole?: "learner" | "instructor";
  subject?: string;
  tone?: "compact" | "standard";
  label?: string;
  className?: string;
  /**
   * Where this viewer can go to BUILD the connection the refusal is asking for.
   *
   * Optional because it differs by side and only the calling screen knows it. A learner
   * can request a trial with the instructor they are looking at. An instructor cannot
   * create a connection unilaterally at all — the nearest real step is answering a
   * published learning request — so the two sides genuinely need different links, and a
   * screen with no honest next step passes neither and shows only the explanation.
   */
  connectHref?: string;
  connectLabel?: string;
}) {
  const { t } = useLocale();
  const { currentSession } = useAuth();
  const [, setLocation] = useLocation();
  const [refused, setRefused] = useState("");
  const [failed, setFailed] = useState("");

  const start = trpc.supabaseCore.startConversation.useMutation();
  const role = viewerRole ?? (currentSession?.role === "instructor" ? "instructor" : "learner");

  const shape =
    tone === "standard"
      ? "rounded-full border border-[var(--ni-sage-mid)] px-5 py-3 text-sm font-semibold ni-t-moss-deep"
      : "rounded-full border border-[var(--ni-sage-line)] px-3.5 py-2 text-xs font-bold ni-t-moss-deep";
  const control = `inline-flex items-center justify-center gap-1.5 ${shape} hover:bg-[var(--ni-sage-soft)] disabled:opacity-50`;

  // Signing in is a precondition, not a failure — say so instead of letting the request fail on auth.
  if (!currentSession) {
    return (
      <div className={className}>
        <Link href="/login" className={control}>
          <MessageCircle size={15} aria-hidden="true" />
          {t("messaging.signInToMessage")}
        </Link>
      </div>
    );
  }

  const open = async () => {
    setRefused("");
    setFailed("");
    try {
      const result = (await start.mutateAsync({ counterpartId, subject })) as Envelope;
      if (result.ok && result.data) {
        // Reused or newly created, the destination is the same thread.
        setLocation(`/dashboard/${role}/messages/${result.data.conversationId}`);
        return;
      }
      if (result.code === "FORBIDDEN") {
        setRefused(result.error || t("messaging.notConnected"));
        return;
      }
      setFailed(result.error || t("messaging.startFailed"));
    } catch {
      // A throw means the request never completed, so retrying is worth offering.
      setFailed(t("messaging.startFailed"));
    }
  };

  return (
    <div className={className}>
      <button type="button" onClick={open} disabled={start.isPending} aria-busy={start.isPending} className={control}>
        {start.isPending ? (
          <Loader2 size={15} className="animate-spin" aria-hidden="true" />
        ) : (
          <MessageCircle size={15} aria-hidden="true" />
        )}
        {start.isPending
          ? t("messaging.opening")
          : label || t(role === "learner" ? "messaging.messageInstructor" : "messaging.messageLearner")}
      </button>

      {/* A refusal explains a rule, so it is announced politely and not styled as a fault.
          It also carries the way OUT of the rule where the caller knows one: being told
          a connection is required is only half an answer without the step that makes one. */}
      {refused && (
        <div role="status" className="mt-2 max-w-[52ch] rounded-xl border border-[var(--ni-gold-mid)] bg-[var(--ni-gold-soft)] px-3 py-2 text-xs leading-5 ni-t-gold">
          <p>{refused}</p>
          {connectHref && connectLabel && (
            <Link href={connectHref} className="mt-1.5 inline-flex font-bold underline">
              {connectLabel}
            </Link>
          )}
        </div>
      )}

      {failed && (
        <p role="alert" className="mt-2 flex max-w-[52ch] flex-wrap items-center gap-2 text-xs leading-5 ni-t-clay-ink">
          {failed}
          <button type="button" onClick={open} className="font-bold underline">
            {t("common.retry")}
          </button>
        </p>
      )}
    </div>
  );
}
