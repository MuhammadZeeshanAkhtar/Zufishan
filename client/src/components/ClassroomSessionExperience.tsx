/**
 * The classroom, connected to the real session record.
 *
 * What stood here ran entirely on fixtures: `getClassroomSession("session-101")` — a hardcoded id —
 * with `resolveDemoActorId(email, role)` deriving an actor from an email address, and
 * `canAccessClassroom` deciding authorisation in the browser. None of it touched `class_sessions`,
 * so a real session could be created by the server and never opened by anyone.
 *
 * The booking screen also linked to `/classroom/{booking.id}/waiting-room`, passing a *booking* id
 * where a session id belongs. Those are different records — a booking is an agreement to meet, a
 * session is the meeting — so that link could never resolve. Opening a classroom now goes through
 * `openSession({ bookingId })`, which finds or creates the session and hands back its real id.
 *
 * Authorisation is not decided here and must not be. `class_sessions_participant_or_moderator`
 * returns nothing at all to someone who is not a party, so a stranger gets NOT_FOUND from the
 * database rather than a check this file could get wrong. What this screen decides is only what to
 * *offer*: the instructor moves the session through its stages, each party records their own
 * attendance, and neither of those buttons is the boundary — 0018 and `class_attendance_own_write`
 * are.
 *
 * The video provider is deliberately absent, and its absence is read from the server rather than
 * assumed here. `scheduling.classroomProvider` answers with one of four states, and this screen
 * keeps them apart: not configured (an operator's task), a provider name with no adapter behind it,
 * an adapter with incomplete configuration (both a broken setup, shown as an error), or ready.
 *
 * "Join the call" asks the provider for a short-lived, per-person grant. It never constructs a URL:
 * a fabricated join link fails in front of a learner at the moment a class was due to start, which
 * is worse than saying there is no call. A session can still be scheduled, opened, attended and
 * closed with no provider at all — what is missing then is the call, not the record.
 */
import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, CircleCheck, DoorOpen, Loader2, LogIn, LogOut, Radio, Video } from "lucide-react";
import { trpc } from "../lib/trpc";
import { useAuth } from "../contexts/AuthContext";
import { useLocale } from "../contexts/LocaleContextState";
import ResultState from "./ResultState";
import { resultError, resultRows, resultState, type ResultState as State } from "../lib/result-state";
import { useOnlineStatus } from "../lib/use-online-status";

type Session = {
  id: string; learner_id: string; instructor_id: string; status: string;
  scheduled_start_at: string; scheduled_end_at: string; session_type: string;
  live_provider: string | null; recording_status: string;
};
type Attendance = { id: string; session_id: string; user_id: string; joined_at: string | null; left_at: string | null; status: string };
type ProviderStatus = { configured: boolean; reason: "not_configured" | "unknown_provider" | "incomplete" | "ready"; provider: string | null; missing: string[] };

/** The ordered stages, mirroring SESSION_FLOW on the server. */
const FLOW = ["scheduled", "waiting_room", "live", "completed"] as const;
const CLOSED = ["completed", "cancelled", "no_show"];

const panel = "rounded-[1.35rem] border border-[var(--ni-sage)] bg-[var(--ni-paper)] p-6";
const primary = "inline-flex items-center justify-center gap-2 rounded-full bg-[var(--ni-moss)] px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50";
const quiet = "inline-flex items-center justify-center gap-2 rounded-full border border-[var(--ni-sage-mid)] px-4 py-2.5 text-sm font-bold ni-t-moss disabled:opacity-50";

function Shell({ backHref, eyebrow, title, children }: { backHref: string; eyebrow: string; title: string; children: React.ReactNode }) {
  const { t } = useLocale();
  return (
    <div className="min-h-screen bg-[var(--ni-bg)] ni-t-ink">
      <header className="border-b border-[var(--ni-sage)] bg-[var(--ni-paper)]">
        <div className="mx-auto flex min-w-0 max-w-4xl items-center gap-4 px-5 py-4 lg:px-8">
          <Link href={backHref} className="inline-flex items-center gap-2 text-sm font-bold ni-t-moss">
            <ArrowLeft size={15} className="rtl:rotate-180" aria-hidden="true" /> {t("dashboard.back")}
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full min-w-0 max-w-4xl px-5 py-12 lg:px-8 lg:py-16">
        {/* `eyebrow` is still accepted so no caller changed; nothing prints it. */}
        <h1 className="sr-only">{title}</h1>
        {children}
      </main>
    </div>
  );
}

const when = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
};

function StatusPill({ status }: { status: string }) {
  const { t } = useLocale();
  const tone = status === "live" ? "bg-[var(--ni-moss)] text-white"
    : CLOSED.includes(status) ? "bg-[var(--ni-sage-soft)] ni-t-muted"
    : "bg-[var(--ni-gold-soft)] ni-t-gold";
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[.14em] ${tone}`}>
      {status === "live" && <Radio size={11} aria-hidden="true" />}
      {t(`classroom.status.${status}` as never)}
    </span>
  );
}

/**
 * The provider notice, read from the server.
 *
 * It used to call a client-side constant that always answered "not configured", which would have
 * kept saying so after a provider was genuinely connected. It now asks, and it keeps three answers
 * apart: nobody configured a provider, a provider name is set with no adapter behind it, or an
 * adapter is present with its configuration incomplete. The first is a setup task; the other two are
 * a broken configuration, and reporting them as "not set up yet" would send the wrong person to fix
 * the wrong thing.
 */
function ProviderNotice() {
  const { t } = useLocale();
  const status = trpc.scheduling.classroomProvider.useQuery(undefined, { retry: false });
  const info = status.data?.ok ? (status.data.data as ProviderStatus) : null;
  if (!info || info.configured) return null;
  const broken = info.reason === "unknown_provider" || info.reason === "incomplete";
  return (
    <ResultState
      state={broken ? "error" : "setup"}
      message={
        info.reason === "unknown_provider" ? t("classroom.providerUnknown", { provider: info.provider ?? "" })
        : info.reason === "incomplete" ? t("classroom.providerIncomplete", { missing: info.missing.join(", ") })
        : t("classroom.providerNotConnected")
      }
    />
  );
}

/* ------------------------------------------------------------------ the room */

export function ClassroomGate({ sessionId }: { sessionId: string }) {
  const { t } = useLocale();
  const { currentSession } = useAuth();
  const online = useOnlineStatus();
  const signedIn = Boolean(currentSession);

  const query = trpc.scheduling.session.useQuery({ sessionId }, { enabled: signedIn, retry: false });
  const attendance = trpc.scheduling.sessionAttendance.useQuery({ sessionId }, { enabled: signedIn, retry: false });
  const advance = trpc.scheduling.setSessionStatus.useMutation();
  const record = trpc.scheduling.recordAttendance.useMutation();

  const [failure, setFailure] = useState("");
  const [joinRefusal, setJoinRefusal] = useState("");
  const join = trpc.scheduling.classroomJoin.useMutation();

  const session = query.data?.ok ? (query.data.data as Session) : null;
  const rows = resultRows<Attendance>(attendance as never);
  const me = currentSession?.userId ?? "";
  const isInstructor = Boolean(session && session.instructor_id === me);

  const mine = useMemo(() => rows.find((row) => row.user_id === me), [rows, me]);
  const otherParty = session ? (isInstructor ? session.learner_id : session.instructor_id) : "";
  const other = useMemo(() => rows.find((row) => row.user_id === otherParty), [rows, otherParty]);

  const state = resultState(query as never, online);
  const status = session?.status ?? "";
  const joinable = status === "waiting_room" || status === "live";
  const joined = Boolean(mine?.joined_at && !mine?.left_at);
  const nextStage = FLOW[FLOW.indexOf(status as (typeof FLOW)[number]) + 1];

  /**
   * Asks for a join grant. Every refusal is shown as the server worded it, because "no provider",
   * "the provider failed" and "this session is not open" need different responses from the reader.
   */
  const joinCall = async () => {
    setJoinRefusal("");
    try {
      const result = await join.mutateAsync({ sessionId });
      if (!result.ok) { setJoinRefusal(result.error); return; }
      const grant = result.data as { joinUrl: string };
      window.open(grant.joinUrl, "_blank", "noopener,noreferrer");
    } catch {
      setJoinRefusal(t("classroom.joinFailed"));
    }
  };

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setFailure("");
    try {
      const result = await fn();
      if (!result.ok) { setFailure(result.error ?? t("classroom.actionFailed")); return; }
      await Promise.all([query.refetch(), attendance.refetch()]);
    } catch {
      setFailure(t("classroom.actionFailed"));
    }
  };

  if (!signedIn) {
    return (
      <Shell backHref="/login" eyebrow={t("classroom.eyebrow")} title={t("classroom.title")}>
        <div className="mt-8"><ResultState state="forbidden" message={t("messaging.unauthorized")} /></div>
      </Shell>
    );
  }

  const backHref = `/dashboard/${currentSession?.role === "instructor" ? "instructor" : "learner"}/classrooms`;

  if (state !== "ready" || !session) {
    // A stranger's read returns nothing, so "not found" here means "not yours" — said as an
    // explanation rather than a silent redirect to the dashboard. A successful envelope carrying no
    // row is not emptiness either; there is no such thing as half a session, so that is a fault.
    const shown: Exclude<State, "ready"> = state === "empty" ? "forbidden" : state === "ready" ? "error" : state;
    return (
      <Shell backHref={backHref} eyebrow={t("classroom.eyebrow")} title={t("classroom.title")}>
        <div className="mt-8">
          <ResultState
            state={shown}
            message={resultError(query as never)}
            onRetry={() => query.refetch()}
            retrying={query.isFetching}
          />
        </div>
      </Shell>
    );
  }

  return (
    <Shell backHref={backHref} eyebrow={t("classroom.eyebrow")} title={t("classroom.title")}>
      <div className="mt-6 space-y-5">
        <div className={panel}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold ni-t-moss-deep">
                {t(isInstructor ? "classroom.teachingRole" : "classroom.learningRole")}
              </p>
              <p className="mt-1 text-sm ni-t-muted ltr-embed">{when(session.scheduled_start_at)} — {when(session.scheduled_end_at)}</p>
            </div>
            <StatusPill status={session.status} />
          </div>

          {/* Where the video would be. The button asks the provider; it never builds a link. */}
          <div className="mt-5 grid place-items-center rounded-2xl border border-dashed border-[var(--ni-sage-mid)] bg-[var(--ni-sage-soft)] px-5 py-10 text-center">
            <Video size={26} className="ni-t-muted-soft" aria-hidden="true" />
            <p className="mt-3 max-w-[46ch] text-sm leading-6 ni-t-muted">{t("classroom.noVideoCopy")}</p>
            {joinable && (
              <button type="button" onClick={joinCall} disabled={join.isPending} aria-busy={join.isPending} className={`${primary} mt-4`}>
                {join.isPending ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Video size={15} aria-hidden="true" />}
                {join.isPending ? t("classroom.joiningCall") : t("classroom.joinCall")}
              </button>
            )}
            {joinRefusal && (
              <p role="status" className="mt-3 max-w-[46ch] text-xs leading-5 ni-t-gold">{joinRefusal}</p>
            )}
          </div>
        </div>

        <ProviderNotice />

        {/* Attendance: each person writes only their own, which is what the policy allows. */}
        <div className={panel}>
          <h2 className="font-display text-xl">{t("classroom.attendance")}</h2>
          <ul className="mt-4 space-y-2 text-sm">
            <li className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">{t("classroom.you")}</span>
              <span className={joined ? "font-bold ni-t-moss" : "ni-t-muted-soft"}>
                {joined ? t("classroom.joinedAt", { time: when(mine!.joined_at!) }) : t("classroom.notJoined")}
              </span>
            </li>
            <li className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">{t(isInstructor ? "classroom.theLearner" : "classroom.theInstructor")}</span>
              <span className={other?.joined_at && !other?.left_at ? "font-bold ni-t-moss" : "ni-t-muted-soft"}>
                {other?.joined_at && !other?.left_at ? t("classroom.present") : t("classroom.notJoined")}
              </span>
            </li>
          </ul>

          {joinable ? (
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => run(() => record.mutateAsync({ sessionId, action: joined ? "leave" : "join" }))}
                disabled={record.isPending}
                aria-busy={record.isPending}
                className={joined ? quiet : primary}
              >
                {record.isPending ? <Loader2 size={15} className="animate-spin" aria-hidden="true" />
                  : joined ? <LogOut size={15} className="icon-directional" aria-hidden="true" />
                  : <LogIn size={15} className="icon-directional" aria-hidden="true" />}
                {joined ? t("classroom.leave") : t("classroom.join")}
              </button>
            </div>
          ) : (
            <p className="mt-5 text-xs leading-5 ni-t-muted">{t("classroom.notOpenToJoin")}</p>
          )}
        </div>

        {/* Stage controls. Offered to the instructor only, mirroring 0018 and setSessionStatus. */}
        {isInstructor && !CLOSED.includes(session.status) && (
          <div className={panel}>
            <h2 className="font-display text-xl">{t("classroom.stage")}</h2>
            <p className="mt-2 text-sm leading-6 ni-t-muted">{t("classroom.stageCopy")}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              {nextStage && (
                <button
                  type="button"
                  onClick={() => run(() => advance.mutateAsync({ sessionId, status: nextStage }))}
                  disabled={advance.isPending}
                  aria-busy={advance.isPending}
                  className={primary}
                >
                  {advance.isPending ? <Loader2 size={15} className="animate-spin" aria-hidden="true" />
                    : nextStage === "completed" ? <CircleCheck size={15} aria-hidden="true" />
                    : <DoorOpen size={15} aria-hidden="true" />}
                  {t(`classroom.advanceTo.${nextStage}` as never)}
                </button>
              )}
              <button
                type="button"
                onClick={() => run(() => advance.mutateAsync({ sessionId, status: "cancelled" }))}
                disabled={advance.isPending}
                className={`${quiet} border-[var(--ni-clay-ink)] ni-t-clay-ink`}
              >
                {t("classroom.cancelSession")}
              </button>
              <button
                type="button"
                onClick={() => run(() => advance.mutateAsync({ sessionId, status: "no_show" }))}
                disabled={advance.isPending}
                className={quiet}
              >
                {t("classroom.markNoShow")}
              </button>
            </div>
          </div>
        )}

        {CLOSED.includes(session.status) && (
          <div className={panel}>
            <h2 className="font-display text-xl">{t(`classroom.closed.${session.status}` as never)}</h2>
            <p className="mt-2 text-sm leading-6 ni-t-muted">{t("classroom.closedCopy")}</p>
            {/* Reviews open on a completed session; that is the policy, so the link only shows there. */}
            {session.status === "completed" && !isInstructor && (
              <Link href="/dashboard/learner/reviews/new" className={`${quiet} mt-4`}>{t("reviews.reviewASession")}</Link>
            )}
            <p className="mt-4 text-xs leading-5 ni-t-muted-soft">
              {t("classroom.recordingStatus", { status: session.recording_status })}
            </p>
          </div>
        )}

        {failure && (
          <p role="alert" className="flex flex-wrap items-center gap-2 rounded-xl bg-[var(--ni-clay-soft)] px-4 py-3 text-sm ni-t-clay">
            {failure}
            <button type="button" onClick={() => { void query.refetch(); void attendance.refetch(); }} className="font-bold underline">
              {t("common.retry")}
            </button>
          </p>
        )}
      </div>
    </Shell>
  );
}

/* ------------------------------------------------------------- the sessions */

export function ClassroomDashboard({ role }: { role: "learner" | "instructor" }) {
  const { t } = useLocale();
  const { currentSession } = useAuth();
  const online = useOnlineStatus();
  const signedIn = Boolean(currentSession);

  const query = trpc.scheduling.sessions.useQuery(undefined, { enabled: signedIn, retry: false });
  const rows = resultRows<Session>(query as never);
  const base = resultState(query as never, online);
  const state: State = base;

  if (!signedIn) {
    return (
      <Shell backHref="/login" eyebrow={t("classroom.deskEyebrow")} title={t("classroom.deskTitle")}>
        <div className="mt-8"><ResultState state="forbidden" message={t("messaging.unauthorized")} /></div>
      </Shell>
    );
  }

  return (
    <Shell backHref={`/dashboard/${role}`} eyebrow={t("classroom.deskEyebrow")} title={t("classroom.deskTitle")}>
      <div className="mt-6 space-y-5">
        <ProviderNotice />

        {state !== "ready" && (
          <ResultState
            state={state}
            message={state === "empty" ? t("classroom.noSessions") : resultError(query as never)}
            onRetry={() => query.refetch()}
            retrying={query.isFetching}
          />
        )}

        {state === "ready" && rows.map((session) => (
          <article key={session.id} className={panel}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold ni-t-moss-deep">{t(`classroom.type.${session.session_type}` as never)}</p>
                <p className="mt-1 text-sm ni-t-muted ltr-embed">{when(session.scheduled_start_at)}</p>
              </div>
              <StatusPill status={session.status} />
            </div>
            <Link href={`/classroom/${session.id}`} className={`${quiet} mt-4`}>
              <DoorOpen size={15} aria-hidden="true" /> {t("classroom.open")}
            </Link>
          </article>
        ))}
      </div>
    </Shell>
  );
}

/* ------------------------------------------------- opening one from a booking */

/**
 * "Open the classroom" on a booking.
 *
 * A booking has no session until someone opens one, and `openSession` is idempotent, so both
 * parties pressing this at the same time still get a single session rather than two half-attended
 * ones. The id it returns is the session's — which is what the classroom route actually needs.
 */
export function OpenClassroomAction({ bookingId, status }: { bookingId: string; status: string }) {
  const { t } = useLocale();
  const [, setLocation] = useLocation();
  const open = trpc.scheduling.openSession.useMutation();
  const [failure, setFailure] = useState("");

  // Only a confirmed booking has a meeting to open; the server refuses the rest anyway.
  if (status !== "confirmed") return null;

  const go = async () => {
    setFailure("");
    try {
      const result = await open.mutateAsync({ bookingId });
      if (!result.ok) { setFailure(result.error); return; }
      setLocation(`/classroom/${(result.data as { sessionId: string }).sessionId}`);
    } catch {
      setFailure(t("classroom.openFailed"));
    }
  };

  return (
    <div className="mt-3">
      <button type="button" onClick={go} disabled={open.isPending} aria-busy={open.isPending} className={quiet}>
        {open.isPending ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <DoorOpen size={15} aria-hidden="true" />}
        {open.isPending ? t("classroom.opening") : t("classroom.open")}
      </button>
      {failure && (
        <p role="alert" className="mt-2 flex flex-wrap items-center gap-2 text-xs ni-t-clay-ink">
          {failure}
          <button type="button" onClick={go} className="font-bold underline">{t("common.retry")}</button>
        </p>
      )}
    </div>
  );
}
