/**
 * Sessions — the record of what happened.
 *
 * What stood here was a "session ledger" built from `createSessionLedgerEntry("session-101")`: one
 * hardcoded fixture id, identical for every account, so nobody was ever looking at their own
 * classes. This reads the caller's own `class_sessions` instead.
 *
 * The honest part is what it leaves out. There is no payment provider on this project, so there is
 * no amount, fee, payout or balance here. Printing a zero would read as "you earned nothing",
 * which is a different and false statement — so the page says once, plainly, that money is not
 * connected, and spends the rest of its space on what it can actually tell you: whether each class
 * happened, and whether both of you turned up.
 */
import { Link } from "wouter";
import { CircleSlash, Clock3, UserCheck, UserX } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useLocale } from "../contexts/LocaleContextState";
import LearnerAvatar from "./LearnerAvatar";
import ResultState from "./ResultState";
import { resultError, resultState } from "../lib/result-state";
import { useOnlineStatus } from "../lib/use-online-status";
import { trpc } from "../lib/trpc";
import { supabaseClient } from "../lib/supabase-client";

type Person = {
  id: string; displayName: string | null; avatarUrl: string | null;
  country: string | null; timezone: string | null; gender: string | null; preferredLanguage: string | null;
};

type Entry = {
  id: string; title: string; subject: string; sessionType: string; status: string;
  scheduledStartAt: string; scheduledEndAt: string; endedAt: string | null;
  learnerTimezone: string; instructorTimezone: string;
  ownJoinedAt: string | null; counterpartJoinedAt: string | null;
  person: Person | null; recordingStatus: string;
};

/** Present or absent, said as a fact rather than a tick that could mean either. */
function Attendance({ joinedAt, label }: { joinedAt: string | null; label: string }) {
  const { t } = useLocale();
  const Icon = joinedAt ? UserCheck : UserX;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${joinedAt ? "ni-t-moss" : "ni-t-muted"}`}>
      <Icon size={13} aria-hidden="true" />
      {label}: {t(joinedAt ? "sessionRecord.joined" : "sessionRecord.didNotJoin")}
    </span>
  );
}

export default function SessionRecord({ role }: { role: "learner" | "instructor" }) {
  const { t, locale } = useLocale();
  const { currentSession } = useAuth();
  const online = useOnlineStatus();
  const realMode = Boolean(supabaseClient && currentSession);

  const query = trpc.scheduling.sessionRecord.useQuery({ role }, { enabled: realMode });
  const state = resultState(query as never, online);
  const entries = (query.data?.ok ? query.data.data : []) as Entry[];

  const when = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? "—"
      : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
  };

  return (
    <main className="mx-auto max-w-6xl px-5 py-10 lg:px-8 lg:py-14">
      <h1 className="sr-only">{t("sessionRecord.title")}</h1>

      {/* Said once, at the top, rather than as a zero in every row. */}
      <div className="ni-ed-card flex items-start gap-3 p-4">
        <CircleSlash size={17} aria-hidden="true" className="mt-0.5 shrink-0 ni-t-muted" />
        <p className="text-sm ni-t-muted">{t("sessionRecord.noMoney")}</p>
      </div>

      {state !== "ready" ? (
        <div className="mt-6">
          <ResultState
            state={state}
            message={state === "empty" ? t("sessionRecord.none") : resultError(query as never)}
            onRetry={() => query.refetch()}
            retrying={query.isFetching}
          />
        </div>
      ) : (
        <ul className="mt-6 grid gap-3 md:grid-cols-2">
          {entries.map((entry) => (
            <li key={entry.id} className="ni-ed-card p-4">
              <div className="flex items-start gap-3">
                <LearnerAvatar
                  avatarUrl={entry.person?.avatarUrl ?? null}
                  gender={entry.person?.gender ?? null}
                  /* Both accounts were in this class, so the other person's name is readable here. */
                  profilePublic
                />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-lg ni-t-moss">
                    {entry.person?.displayName || t("findStudents.anonymousLearner")}
                  </p>
                  <p className="truncate text-sm ni-t-muted">{entry.subject || entry.title}</p>
                </div>
                <span className="ni-verify shrink-0">{entry.status.replaceAll("_", " ")}</span>
              </div>

              <p className="mt-3 border-t border-[var(--ni-sage-line)] pt-3 text-xs ni-t-muted">
                <Clock3 size={11} aria-hidden="true" className="me-1 inline" />
                <span className="ltr-embed">{when(entry.scheduledStartAt)}</span>
                {" · "}
                {t(entry.sessionType === "trial" ? "sessionRecord.trial" : "sessionRecord.course")}
              </p>

              <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
                <Attendance joinedAt={entry.ownJoinedAt} label={t("sessionRecord.you")} />
                <Attendance joinedAt={entry.counterpartJoinedAt} label={t("sessionRecord.them")} />
              </div>

              <Link href={`/classroom/${entry.id}/waiting-room`} className="ni-btn ni-btn--outline mt-3.5 text-sm">
                {t("sessionRecord.open")}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
