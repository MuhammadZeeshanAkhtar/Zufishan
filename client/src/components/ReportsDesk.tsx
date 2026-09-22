/**
 * Reports — raising a concern, and seeing what you raised.
 *
 * The page this replaces asked for a reason and a description and then called an in-memory
 * `submitReport` that stored nothing. Somebody describing a safety problem was shown a
 * confirmation and their words were thrown away. That is worse than having no form at all: a
 * person who believes they have reported something stops looking for another way to be heard.
 *
 * Three things follow from making it real.
 *
 *  - **A report is about something.** `reports.target_id` is a uuid, and the old page defaulted it
 *    to the string "conversation-trial-101", which could never have been stored even if the write
 *    had been real. So the class being reported is chosen from the reader's own sessions, and when
 *    they have none the page says so and points at Contact rather than offering a form that cannot
 *    be submitted.
 *  - **The tick depends on the row.** The confirmation is shown only after the server returns
 *    `ok`, and a failure is stated as a failure — the specific fault this page existed to have.
 *  - **What you filed stays visible.** `reports_own_or_moderator` lets you read your own, so the
 *    reports you have already raised are listed underneath with their status. A report you cannot
 *    see afterwards is indistinguishable from one that was never stored.
 */
import { useState } from "react";
import { Link } from "wouter";
import { CircleAlert, Flag, ShieldCheck } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useLocale } from "../contexts/LocaleContextState";
import ResultState from "./ResultState";
import { resultError, resultState } from "../lib/result-state";
import { useOnlineStatus } from "../lib/use-online-status";
import { trpc } from "../lib/trpc";
import { supabaseClient } from "../lib/supabase-client";
import type { TranslationKey } from "@/i18n/catalog";

/** The reasons the server accepts, with the label each one is offered under. */
const REASONS: { value: string; label: TranslationKey }[] = [
  { value: "technical_issue", label: "reports.reasonTechnical" },
  { value: "schedule_problem", label: "reports.reasonSchedule" },
  { value: "missed_class", label: "reports.reasonMissed" },
  { value: "inappropriate_behaviour", label: "reports.reasonConduct" },
  { value: "payment_concern", label: "reports.reasonPayment" },
  { value: "safety_concern", label: "reports.reasonSafety" },
  { value: "other", label: "reports.reasonOther" },
];

type Session = { id: string; title: string; subject: string; scheduledStartAt: string; person: { displayName: string | null } | null };
type Report = { id: string; reason: string; description: string | null; status: string; createdAt: string };

export default function ReportsDesk({ role }: { role: "learner" | "instructor" }) {
  const { t, locale } = useLocale();
  const { currentSession } = useAuth();
  const online = useOnlineStatus();
  const realMode = Boolean(supabaseClient && currentSession);

  const sessionsQuery = trpc.scheduling.sessionRecord.useQuery({ role }, { enabled: realMode });
  const mineQuery = trpc.scheduling.myReports.useQuery(undefined, { enabled: realMode });
  const file = trpc.scheduling.fileReport.useMutation();

  const sessions = (sessionsQuery.data?.ok ? sessionsQuery.data.data : []) as Session[];
  const mine = (mineQuery.data?.ok ? mineQuery.data.data : []) as Report[];

  const [targetId, setTargetId] = useState("");
  const [reason, setReason] = useState(REASONS[0].value);
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [filed, setFiled] = useState(false);

  const sessionsState = resultState(sessionsQuery as never, online);
  const mineState = resultState(mineQuery as never, online);
  const loadingSessions = sessionsState === "loading";

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!targetId) { setError(t("reports.chooseClass")); return; }
    try {
      const result = await file.mutateAsync({ targetType: "session", targetId, reason: reason as never, description: description.trim() || undefined });
      // The tick depends on the row, not on the click.
      if (!result || !result.ok) { setError(result?.error || t("reports.failed")); return; }
      setFiled(true);
      setDescription("");
      void mineQuery.refetch();
    } catch {
      setError(t("reports.failed"));
    }
  };

  const when = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
  };

  return (
    <main className="mx-auto max-w-4xl px-5 py-10 lg:px-8 lg:py-14">
      <h1 className="sr-only">{t("reports.title")}</h1>

      <div className="ni-ed-card flex items-start gap-3 p-4">
        <ShieldCheck size={17} aria-hidden="true" className="mt-0.5 shrink-0 ni-t-gold" />
        <p className="text-sm ni-t-muted">{t("reports.privacy")}</p>
      </div>

      {/* A report is about something, so there has to be something to report. */}
      {!loadingSessions && sessions.length === 0 ? (
        <div className="ni-ed-card mt-6 p-5">
          <CircleAlert size={18} aria-hidden="true" className="ni-t-muted" />
          <p className="mt-3 text-sm ni-t-muted">{t("reports.nothingToReport")}</p>
          <Link href="/contact-lms" className="ni-btn ni-btn--outline mt-4 text-sm">{t("reports.contactInstead")}</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="ni-ed-card mt-6 p-5">
          <label className="block text-sm font-semibold ni-t-moss-deep">
            {t("reports.whichClass")}
            <select value={targetId} onChange={(event) => { setTargetId(event.target.value); setFiled(false); }} className="input mt-1.5">
              <option value="">{loadingSessions ? t("reports.loadingClasses") : t("reports.chooseClass")}</option>
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.subject || session.title} · {session.person?.displayName || t("findStudents.anonymousLearner")} · {when(session.scheduledStartAt)}
                </option>
              ))}
            </select>
          </label>

          <label className="mt-4 block text-sm font-semibold ni-t-moss-deep">
            {t("reports.reason")}
            <select value={reason} onChange={(event) => { setReason(event.target.value); setFiled(false); }} className="input mt-1.5">
              {REASONS.map((item) => <option key={item.value} value={item.value}>{t(item.label)}</option>)}
            </select>
          </label>

          <label className="mt-4 block text-sm font-semibold ni-t-moss-deep">
            {t("reports.description")}
            <textarea
              value={description}
              onChange={(event) => { setDescription(event.target.value); setFiled(false); }}
              maxLength={8000}
              className="input mt-1.5 min-h-28"
              placeholder={t("reports.descriptionPlaceholder")}
            />
          </label>

          {error && <p className="mt-4 rounded-xl bg-[var(--ni-clay-soft)] p-3 text-sm ni-t-clay" role="alert">{error}</p>}
          {filed && <p className="mt-4 rounded-xl bg-[var(--ni-gold-soft)] p-3 text-sm ni-t-gold" role="status">{t("reports.filed")}</p>}

          <button type="submit" disabled={file.isPending} className="ni-btn ni-btn--primary mt-5 text-sm">
            <Flag size={13} aria-hidden="true" /> {t(file.isPending ? "reports.sending" : "reports.send")}
          </button>
        </form>
      )}

      <section className="mt-9">
        <h2 className="font-display text-xl ni-t-ink">{t("reports.yours")}</h2>
        {mineQuery.data && !mineQuery.data.ok ? (
          <div className="mt-3">
            {/* Reached only on a failure envelope, so "ready" cannot occur — but it is narrowed rather
                than cast, so a later change cannot smuggle a success state into a failure panel. */}
            <ResultState
              state={mineState === "ready" ? "error" : mineState}
              message={resultError(mineQuery as never)}
              onRetry={() => mineQuery.refetch()}
              retrying={mineQuery.isFetching}
            />
          </div>
        ) : mine.length === 0 ? (
          <p className="ni-ed-card mt-3 p-5 text-sm ni-t-muted">{t("reports.noneYet")}</p>
        ) : (
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {mine.map((report) => (
              <li key={report.id} className="ni-ed-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold ni-t-ink">{t(REASONS.find((item) => item.value === report.reason)?.label ?? "reports.reasonOther")}</p>
                  <span className="ni-verify shrink-0">{report.status.replaceAll("_", " ")}</span>
                </div>
                {report.description && <p className="mt-2 text-sm leading-6 ni-t-muted">{report.description}</p>}
                <p className="mt-2 text-xs ni-t-muted-soft"><span className="ltr-embed">{when(report.createdAt)}</span></p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
