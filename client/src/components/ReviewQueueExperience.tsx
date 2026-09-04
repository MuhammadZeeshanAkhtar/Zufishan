/**
 * Reviewer desk: the two decisions that gate public visibility.
 *
 * Instructor verification and course publishing are the same job — a reviewer reads a submission
 * and records a decision — so they share one screen rather than becoming two half-built admin
 * pages. Both queues come from `adminReview.*`, which re-checks the caller's role server-side; this
 * component grants nothing on its own and shows a forbidden state when the server refuses.
 *
 * Every state the procedures can return is rendered: loading, forbidden, setup-needed, error, empty
 * and success. Nothing is faked — an empty queue means the database returned no rows.
 */
import { useState } from "react";
import { BadgeCheck, BookCheck, Loader2, ShieldAlert } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLocale } from "../contexts/LocaleContextState";
import ResultState from "./ResultState";
import { resultError, resultRows, resultState } from "../lib/result-state";
import { useOnlineStatus } from "../lib/use-online-status";

type Envelope = { ok: boolean; error?: string; code?: string; data?: unknown };

function Panel({ title, icon: Icon, children }: { title: string; icon: typeof BadgeCheck; children: React.ReactNode }) {
  return (
    <section className="ni-card p-6">
      <h2 className="flex items-center gap-2.5 font-display text-2xl text-[var(--ni-ink)]">
        <Icon size={20} className="text-[var(--ni-moss)]" aria-hidden="true" />
        {title}
      </h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export default function ReviewQueueExperience() {
  const { t } = useLocale();
  const [busy, setBusy] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ id: string; text: string; ok: boolean } | null>(null);

  const instructors = trpc.adminReview.instructorQueue.useQuery(undefined, { retry: false });
  const courses = trpc.adminReview.courseQueue.useQuery(undefined, { retry: false });

  const verify = trpc.adminReview.setInstructorVerification.useMutation({
    onSettled: () => { setBusy(null); instructors.refetch(); },
  });
  const decide = trpc.adminReview.setCourseDecision.useMutation({
    onSettled: () => { setBusy(null); courses.refetch(); },
  });

  const record = (id: string, result: Envelope, okText: string) =>
    setOutcome({ id, ok: result.ok, text: result.ok ? okText : (result.error ?? t("common.error")) });

  const online = useOnlineStatus();
  const instructorState = resultState(instructors as never, online);
  const courseState = resultState(courses as never, online);

  const instructorRows = resultRows<Record<string, unknown>>(instructors as never);
  const courseRows = resultRows<Record<string, unknown>>(courses as never);

  const notice = (state: ReturnType<typeof resultState>, empty: string, err: string | undefined, retry: () => void) => {
    if (state === "ready") return null;
    return <ResultState state={state} message={state === "empty" ? empty : err} onRetry={retry} />;
  };

  return (
    <main className="mx-auto max-w-5xl px-5 py-10 lg:px-8 lg:py-14">
      <p className="ni-eyebrow">{t("review.eyebrow")}</p>
      <h1 className="mt-3 font-display text-4xl text-[var(--ni-ink)]">{t("review.title")}</h1>
      <p className="mt-3 max-w-[62ch] text-sm leading-6 text-[var(--ni-muted)]">{t("review.copy")}</p>

      <div className="mt-9 grid gap-6">
        <Panel title={t("review.instructorQueue")} icon={BadgeCheck}>
          {notice(instructorState, t("review.noInstructors"), resultError(instructors as never), () => instructors.refetch())}
          {instructorState === "ready" && (
            <ul className="grid gap-3">
              {instructorRows.map((row) => {
                const id = String(row.user_id);
                const profile = (row.profiles ?? {}) as Record<string, unknown>;
                return (
                  <li key={id} className="rounded-2xl border border-[var(--ni-sage)] bg-[var(--ni-field)] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-[var(--ni-ink)]">{String(profile.display_name ?? profile.full_name ?? row.public_slug)}</p>
                        <p className="mt-1 text-xs text-[var(--ni-muted)]">
                          {String(row.verification_status)} · {String(row.public_profile_status)}
                          {row.sect ? ` · ${String(row.sect)}` : ""}{row.has_ijazah ? " · ijazah declared" : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        {(["approved", "rejected"] as const).map((status) => (
                          <button
                            key={status}
                            type="button"
                            disabled={busy === id || verify.isPending}
                            onClick={async () => {
                              setBusy(id);
                              const result = await verify.mutateAsync({ instructorId: id, status }) as Envelope;
                              record(id, result, t("review.saved"));
                            }}
                            className={`rounded-full px-4 py-2 text-xs font-bold disabled:opacity-50 ${
                              status === "approved"
                                ? "bg-[var(--ni-moss)] text-[var(--ni-paper)]"
                                : "border border-[var(--ni-clay-ink)] text-[var(--ni-clay-ink)]"
                            }`}
                          >
                            {t(status === "approved" ? "review.approve" : "review.reject")}
                          </button>
                        ))}
                      </div>
                    </div>
                    {outcome?.id === id && (
                      <p role={outcome.ok ? "status" : "alert"} className={`mt-3 text-xs font-semibold ${outcome.ok ? "text-[var(--ni-moss-deep)]" : "text-[var(--ni-clay-ink)]"}`}>
                        {outcome.text}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title={t("review.courseQueue")} icon={BookCheck}>
          {notice(courseState, t("review.noCourses"), resultError(courses as never), () => courses.refetch())}
          {courseState === "ready" && (
            <ul className="grid gap-3">
              {courseRows.map((row) => {
                const id = String(row.id);
                return (
                  <li key={id} className="rounded-2xl border border-[var(--ni-sage)] bg-[var(--ni-field)] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-[var(--ni-ink)]">{String(row.title)}</p>
                        <p className="mt-1 text-xs text-[var(--ni-muted)]">{String(row.subject)} · {String(row.level)} · {String(row.language)}</p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        {(["published", "rejected"] as const).map((decision) => (
                          <button
                            key={decision}
                            type="button"
                            disabled={busy === id || decide.isPending}
                            onClick={async () => {
                              setBusy(id);
                              const result = await decide.mutateAsync({ courseId: id, decision }) as Envelope;
                              record(id, result, t("review.saved"));
                            }}
                            className={`rounded-full px-4 py-2 text-xs font-bold disabled:opacity-50 ${
                              decision === "published"
                                ? "bg-[var(--ni-moss)] text-[var(--ni-paper)]"
                                : "border border-[var(--ni-clay-ink)] text-[var(--ni-clay-ink)]"
                            }`}
                          >
                            {t(decision === "published" ? "review.publish" : "review.reject")}
                          </button>
                        ))}
                      </div>
                    </div>
                    {outcome?.id === id && (
                      <p role={outcome.ok ? "status" : "alert"} className={`mt-3 text-xs font-semibold ${outcome.ok ? "text-[var(--ni-moss-deep)]" : "text-[var(--ni-clay-ink)]"}`}>
                        {outcome.text}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </main>
  );
}
