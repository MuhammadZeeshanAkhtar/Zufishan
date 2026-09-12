/**
 * The three things a person can do to a booking they hold.
 *
 * Each control maps to one procedure — `rescheduleBooking`, `cancelBooking`, `completeBooking` —
 * and each of those re-checks permission server-side. Nothing here grants anything: hiding a button
 * is a courtesy to the reader, not a security boundary, so the buttons only reflect rules the
 * server already enforces.
 *
 * Two of the three are irreversible from the reader's point of view, so both ask first. Cancelling
 * additionally requires a reason, because the procedure does — a confirmation dialog that lets you
 * submit something the server will reject is just a slower error.
 *
 * "Record outcome" appears only after the session's end time. The server refuses earlier, and a
 * button that exists solely to produce "this session has not finished yet" wastes the reader's time.
 */
import { useEffect, useRef, useState } from "react";
import { CalendarClock, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLocale } from "../contexts/LocaleContextState";

export type BookingRow = {
  id: string;
  status: string;
  scheduled_start_at: string;
  scheduled_end_at: string;
};

type Envelope = { ok: boolean; error?: string; code?: string };
type Action = "reschedule" | "cancel" | "complete";

/** Turns a failure envelope into something a reader can act on. */
function failureMessage(result: Envelope, t: (key: never) => string): string {
  if (result.ok) return "";
  // A conflict is the common one — an overlapping slot, or someone else changed the booking first.
  return result.error || (t as unknown as (k: string) => string)("common.error");
}

/** `datetime-local` needs a local-clock string, not an ISO instant. */
function toLocalInput(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  // Escape closes, and focus moves into the dialog so a keyboard reader is not left behind it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    panel.current?.querySelector<HTMLElement>("textarea, input, button")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button type="button" aria-label={(void 0, "Close")} onClick={onClose} className="absolute inset-0 bg-[var(--ni-teal)]/45 backdrop-blur-[2px]" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative m-0 w-full max-w-md rounded-t-[1.4rem] border border-[var(--ni-sage)] bg-[var(--ni-paper)] p-6 shadow-[0_-8px_40px_rgba(10,46,44,.2)] sm:m-4 sm:rounded-[1.4rem]"
      >
        <h2 className="font-display text-2xl ni-t-ink">{title}</h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

export default function BookingActions({ booking, isInstructor, onDone }: {
  booking: BookingRow;
  isInstructor: boolean;
  onDone: () => void;
}) {
  const { t } = useLocale();
  const [open, setOpen] = useState<Action | null>(null);
  const [reason, setReason] = useState("");
  const [startAt, setStartAt] = useState(() => toLocalInput(booking.scheduled_start_at));
  const [endAt, setEndAt] = useState(() => toLocalInput(booking.scheduled_end_at));
  const [failure, setFailure] = useState<string>("");

  const settle = (result: Envelope) => {
    if (result.ok) { setOpen(null); setFailure(""); onDone(); return; }
    setFailure(failureMessage(result, t as never));
  };

  const reschedule = trpc.scheduling.rescheduleBooking.useMutation();
  const cancel = trpc.scheduling.cancelBooking.useMutation();
  const complete = trpc.scheduling.completeBooking.useMutation();
  const pending = reschedule.isPending || cancel.isPending || complete.isPending;

  // Only a confirmed booking can be acted on, matching every procedure's own guard.
  if (booking.status !== "confirmed") return null;

  const finished = new Date(booking.scheduled_end_at).getTime() <= Date.now();
  const close = () => { setOpen(null); setFailure(""); };

  const button = "inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold disabled:opacity-50";
  const quiet = `${button} border border-[var(--ni-sage-line)] ni-t-moss-deep hover:bg-[var(--ni-sage-soft)]`;

  return (
    <>
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" className={quiet} disabled={pending} onClick={() => setOpen("reschedule")}>
          <CalendarClock size={14} aria-hidden="true" />{t("booking.reschedule")}
        </button>
        <button
          type="button"
          className={`${button} border border-[var(--ni-clay-ink)] ni-t-clay-ink hover:bg-[var(--ni-clay-soft)]`}
          disabled={pending}
          onClick={() => setOpen("cancel")}
        >
          <XCircle size={14} aria-hidden="true" />{t("booking.cancel")}
        </button>
        {isInstructor && finished && (
          <button type="button" className={`${button} bg-[var(--ni-moss)] text-[var(--ni-paper)]`} disabled={pending} onClick={() => setOpen("complete")}>
            <CheckCircle2 size={14} aria-hidden="true" />{t("booking.recordOutcome")}
          </button>
        )}
      </div>

      {open === "reschedule" && (
        <Dialog title={t("booking.rescheduleTitle")} onClose={close}>
          <p className="text-sm leading-6 ni-t-muted">{t("booking.rescheduleCopy")}</p>
          <label className="mt-4 block text-sm font-semibold ni-t-moss-deep">
            {t("booking.newStart")}
            <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className="input ltr-embed" />
          </label>
          <label className="mt-3 block text-sm font-semibold ni-t-moss-deep">
            {t("booking.newEnd")}
            <input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} className="input ltr-embed" />
          </label>
          {failure && <p role="alert" className="mt-3 text-sm ni-t-clay-ink">{failure}</p>}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button type="button" className={quiet} onClick={close}>{t("common.cancel")}</button>
            <button
              type="button"
              className={`${button} bg-[var(--ni-moss)] text-[var(--ni-paper)]`}
              disabled={pending || !startAt || !endAt}
              onClick={async () => settle(await reschedule.mutateAsync({
                bookingId: booking.id,
                startAt: new Date(startAt).toISOString(),
                endAt: new Date(endAt).toISOString(),
              }) as Envelope)}
            >
              {pending && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
              {t("booking.confirmReschedule")}
            </button>
          </div>
        </Dialog>
      )}

      {open === "cancel" && (
        <Dialog title={t("booking.cancelTitle")} onClose={close}>
          <p className="text-sm leading-6 ni-t-muted">{t("booking.cancelCopy")}</p>
          <label className="mt-4 block text-sm font-semibold ni-t-moss-deep">
            {t("booking.cancelReason")}
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="input" />
          </label>
          {failure && <p role="alert" className="mt-3 text-sm ni-t-clay-ink">{failure}</p>}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button type="button" className={quiet} onClick={close}>{t("booking.keepBooking")}</button>
            <button
              type="button"
              className={`${button} bg-[var(--ni-clay-ink)] text-[var(--ni-paper)]`}
              /* The procedure requires a reason, so the control stays disabled until there is one. */
              disabled={pending || !reason.trim()}
              onClick={async () => settle(await cancel.mutateAsync({ bookingId: booking.id, reason: reason.trim() }) as Envelope)}
            >
              {pending && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
              {t("booking.confirmCancel")}
            </button>
          </div>
        </Dialog>
      )}

      {open === "complete" && (
        <Dialog title={t("booking.outcomeTitle")} onClose={close}>
          <p className="text-sm leading-6 ni-t-muted">{t("booking.outcomeCopy")}</p>
          {failure && <p role="alert" className="mt-3 text-sm ni-t-clay-ink">{failure}</p>}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button type="button" className={quiet} onClick={close}>{t("common.cancel")}</button>
            <button
              type="button"
              className={quiet}
              disabled={pending}
              onClick={async () => settle(await complete.mutateAsync({ bookingId: booking.id, outcome: "no_show" }) as Envelope)}
            >
              {t("booking.markNoShow")}
            </button>
            <button
              type="button"
              className={`${button} bg-[var(--ni-moss)] text-[var(--ni-paper)]`}
              disabled={pending}
              onClick={async () => settle(await complete.mutateAsync({ bookingId: booking.id, outcome: "completed" }) as Envelope)}
            >
              {pending && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
              {t("booking.markCompleted")}
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
