/**
 * The learner's own control over being found.
 *
 * This is the whole gate. There is no approval step, no queue and no
 * administrator in the path: `profile_status = 'published'` is what RLS policy
 * 0025 admits, the learner sets it here, and turning it off removes them from
 * every instructor's view immediately because the policy reads the column live.
 *
 * Written through the learner's own session, so `learner_profiles_own` is what
 * authorises the change — nothing else can reach this column on their behalf.
 */
import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLocale } from "../contexts/LocaleContextState";
import ResultState from "./ResultState";
import { resultError, resultState } from "../lib/result-state";
import { useOnlineStatus } from "../lib/use-online-status";

export default function DiscoverabilitySwitch() {
  const { t } = useLocale();
  const online = useOnlineStatus();
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string } | null>(null);
  const [local, setLocal] = useState<boolean | null>(null);

  const query = trpc.supabaseCore.ownDiscoverability.useQuery(undefined, { retry: false });
  const update = trpc.supabaseCore.setOwnDiscoverability.useMutation();

  const state = resultState(query as never, online);
  const server = query.data?.ok ? (query.data.data as { discoverable: boolean }) : null;

  // The switch renders from the stored value until the reader changes it, then
  // the local copy leads and is reconciled on the next successful save.
  useEffect(() => { if (server) setLocal(server.discoverable); }, [server?.discoverable]);

  const toggle = async (next: boolean) => {
    setLocal(next);
    const result = (await update.mutateAsync({ discoverable: next })) as { ok: boolean; error?: string };
    if (result.ok) {
      setOutcome({ ok: true, text: next ? t("findStudents.nowDiscoverable") : t("findStudents.nowPrivate") });
      query.refetch();
    } else {
      setLocal(server?.discoverable ?? false);
      setOutcome({ ok: false, text: result.error ?? t("common.error") });
    }
  };

  const discoverable = local ?? false;

  return (
    <section className="ni-ed-card mt-8 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="ni-label">{t("findStudents.controlEyebrow")}</p>
          <h2 className="mt-2 font-display text-xl ni-t-ink">{t("findStudents.controlTitle")}</h2>
          <p className="mt-2 max-w-[60ch] text-sm leading-6 ni-t-muted">{t("findStudents.controlCopy")}</p>
        </div>

        {state === "ready" && (
          <label className="flex shrink-0 items-center gap-3">
            <span className="flex items-center gap-1.5 text-sm font-semibold ni-t-ink">
              {discoverable ? <Eye size={15} aria-hidden="true" className="ni-t-moss" /> : <EyeOff size={15} aria-hidden="true" className="ni-t-muted-soft" />}
              {discoverable ? t("findStudents.discoverable") : t("findStudents.private")}
            </span>
            <input
              type="checkbox"
              checked={discoverable}
              disabled={update.isPending}
              onChange={(event) => toggle(event.target.checked)}
              className="h-5 w-5 shrink-0 accent-[var(--ni-moss)]"
            />
          </label>
        )}
      </div>

      {state !== "ready" && (
        <div className="mt-4">
          <ResultState
            state={state}
            message={resultError(query as never)}
            onRetry={() => query.refetch()}
            retrying={query.isFetching}
          />
        </div>
      )}

      {outcome && (
        <p
          role={outcome.ok ? "status" : "alert"}
          className={`mt-4 rounded-[7px] border px-3 py-2 text-sm ${
            outcome.ok
              ? "border-[var(--ni-sage-line)] bg-[var(--ni-sage-soft)] ni-t-moss-deep"
              : "border-[var(--ni-clay-ink)] bg-[var(--ni-clay-soft)] ni-t-clay-ink"
          }`}
        >
          {outcome.text}
        </p>
      )}

      <p className="mt-4 text-[11px] leading-4 ni-t-muted-soft">{t("findStudents.controlNote")}</p>
    </section>
  );
}
