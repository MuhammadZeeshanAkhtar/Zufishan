/**
 * The teacher's training area.
 *
 * The reference marketplace gates a new tutor behind a sequence — watch the guidance, pass a
 * pre-evaluation test, book an evaluation — and only then lets them message students. The page
 * that did this job here was a single sentence saying persistence was required.
 *
 * The sequence is now shown, and the part of it that can be answered truthfully is answered from
 * real state rather than from a checkbox the teacher ticks:
 *
 *  - **Profile** and **Schedule** are read from the teacher's own rows. A step is complete because
 *    the row exists, not because someone said so, and each links to the page that completes it.
 *  - **System check** genuinely inspects this browser: what it is, whether a camera and microphone
 *    are visible to it, the screen it is on, and whether it can do live calls at all. It asks for
 *    no permission and turns nothing on — `enumerateDevices` reports presence without labels until
 *    a site is granted access, which is all this step needs.
 *  - **Test** and **Evaluation** are held open. Both need something an administrator supplies — the
 *    test and any fee for it, and the classroom provider — so they say so instead of pretending.
 *
 * The guide list keeps the reference's eight topics as named slots. No video is invented for them;
 * each says an administrator adds it.
 */
import { useState } from "react";
import { Link } from "wouter";
import { Check, Circle, Lock, Monitor, PlayCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "../contexts/LocaleContextState";
import { profileCompletionFor } from "../lib/profile-completion";
import type { TranslationKey } from "@/i18n/catalog";

type StepState = "done" | "todo" | "locked";

/** What this browser reports about itself. Nothing is requested and nothing is switched on. */
type SystemReport = {
  browser: string; screen: string;
  camera: boolean | null; microphone: boolean | null; calls: boolean;
};

async function inspectSystem(): Promise<SystemReport> {
  const agent = navigator.userAgent;
  const named = /Edg\/([\d.]+)/.exec(agent) ? "Edge" : /Chrome\/([\d.]+)/.exec(agent) ? "Chrome"
    : /Firefox\/([\d.]+)/.exec(agent) ? "Firefox" : /Safari\//.test(agent) ? "Safari" : "Browser";
  const version = /(?:Edg|Chrome|Firefox|Version)\/([\d]+)/.exec(agent)?.[1] ?? "";
  const calls = typeof navigator.mediaDevices?.getUserMedia === "function" && typeof window.RTCPeerConnection === "function";

  let camera: boolean | null = null;
  let microphone: boolean | null = null;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    camera = devices.some((device) => device.kind === "videoinput");
    microphone = devices.some((device) => device.kind === "audioinput");
  } catch {
    // Blocked, or no device API at all. Left null so the screen says "would not list" rather
    // than reporting a camera that is missing.
  }
  return {
    browser: version ? `${named} ${version}` : named,
    screen: `${window.screen.width} × ${window.screen.height}`,
    camera, microphone, calls,
  };
}

function StepIcon({ state }: { state: StepState }) {
  if (state === "done") return <Check size={15} aria-hidden="true" />;
  if (state === "locked") return <Lock size={13} aria-hidden="true" />;
  return <Circle size={13} aria-hidden="true" />;
}

function Step({ state, title, copy, children }: { state: StepState; title: string; copy: string; children?: React.ReactNode }) {
  const { t } = useLocale();
  const label = state === "done" ? t("tutorTraining.done") : state === "locked" ? t("tutorTraining.locked") : t("tutorTraining.todo");
  return (
    <li className="ni-ed-card flex gap-4 p-5">
      <span
        aria-hidden="true"
        className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border ${
          state === "done"
            ? "border-[var(--ni-moss)] bg-[var(--ni-moss)] text-[var(--ni-on-primary)]"
            : "border-[var(--ni-sage-line)] bg-[var(--ni-field)] ni-t-muted"}`}
      >
        <StepIcon state={state} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="font-display text-base ni-t-ink">{title}</h3>
          <span className="ni-verify">{label}</span>
        </div>
        <p className="mt-1.5 max-w-[62ch] text-sm leading-6 ni-t-muted">{copy}</p>
        {children && <div className="mt-3.5">{children}</div>}
      </div>
    </li>
  );
}

const GUIDES: TranslationKey[] = [
  "tutorTraining.guideProfile", "tutorTraining.guideSchedule", "tutorTraining.guideSystem",
  "tutorTraining.guideConnect", "tutorTraining.guideInvite", "tutorTraining.guideStart",
  "tutorTraining.guideOperate", "tutorTraining.guideTrouble",
];

export default function TutorTrainingArea() {
  const { t, formatNumber } = useLocale();
  const { user } = useAuth();
  const [report, setReport] = useState<SystemReport | null>(null);
  const [checking, setChecking] = useState(false);

  const profiles = trpc.supabaseCore.profiles.useQuery(undefined, { enabled: Boolean(user), retry: false, staleTime: 30_000 });
  const availability = trpc.scheduling.availability.useQuery(undefined, { enabled: Boolean(user), retry: false });

  const row = (value: unknown) => (value && typeof value === "object" ? (value as Record<string, unknown>) : null);
  const core = profiles.data?.ok ? (profiles.data.data as { profile?: unknown; instructorProfile?: unknown } | null) : null;
  const profileDone = Boolean(core) && profileCompletionFor("instructor", row(core?.profile), row(core?.instructorProfile)).complete;
  const scheduleDone = availability.data?.ok && Array.isArray(availability.data.data) && availability.data.data.length > 0;
  const systemDone = report !== null;

  // Only the steps that can actually be completed today count towards the figure; the two held
  // open by an administrator are not counted as outstanding work the teacher can do.
  const openSteps: boolean[] = [profileDone, Boolean(scheduleDone), systemDone];
  const doneCount = openSteps.filter(Boolean).length;

  const runCheck = async () => {
    setChecking(true);
    try { setReport(await inspectSystem()); } finally { setChecking(false); }
  };

  const found = (value: boolean | null) =>
    value === null ? t("tutorTraining.checkBlocked") : value ? t("tutorTraining.checkFound") : t("tutorTraining.checkMissing");

  return (
    <div className="mx-auto max-w-4xl px-5 py-6 lg:px-6 lg:py-8">
      <h1 className="font-display text-2xl ni-t-ink">{t("tutorTraining.title")}</h1>
      <p className="mt-2 max-w-[70ch] text-sm leading-6 ni-t-muted">{t("tutorTraining.intro")}</p>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--ni-gold-mid)] bg-[var(--ni-gold-soft)] px-4 py-3 ni-t-gold">
        <span className="text-sm font-bold">{t("tutorTraining.readiness")}</span>
        <span className="text-sm tabular-nums">
          {t("tutorTraining.stepsDone", { done: formatNumber(doneCount), total: formatNumber(openSteps.length) })}
        </span>
      </div>

      <ol className="mt-5 grid gap-3">
        <Step state={profileDone ? "done" : "todo"} title={t("tutorTraining.stepProfile")} copy={t("tutorTraining.stepProfileCopy")}>
          <Link href="/dashboard/instructor/profile" className="ni-btn ni-btn--outline text-sm">{t("tutorTraining.openProfile")}</Link>
        </Step>

        <Step state={scheduleDone ? "done" : "todo"} title={t("tutorTraining.stepSchedule")} copy={t("tutorTraining.stepScheduleCopy")}>
          <Link href="/dashboard/instructor/availability" className="ni-btn ni-btn--outline text-sm">{t("tutorTraining.openSchedule")}</Link>
        </Step>

        <Step state={systemDone ? "done" : "todo"} title={t("tutorTraining.stepSystem")} copy={t("tutorTraining.stepSystemCopy")}>
          {!report ? (
            <button type="button" onClick={runCheck} disabled={checking} className="ni-btn ni-btn--primary text-sm">
              <Monitor size={14} aria-hidden="true" /> {t("tutorTraining.runCheck")}
            </button>
          ) : (
            <>
              <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                {[
                  [t("tutorTraining.checkBrowser"), report.browser],
                  [t("tutorTraining.checkScreen"), report.screen],
                  [t("tutorTraining.checkCamera"), found(report.camera)],
                  [t("tutorTraining.checkMicrophone"), found(report.microphone)],
                  [t("tutorTraining.checkCalls"), report.calls ? t("tutorTraining.checkFound") : t("tutorTraining.checkMissing")],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-baseline justify-between gap-3 border-b border-[var(--ni-sage-line)] pb-1.5 last:border-b-0">
                    <dt className="text-xs font-bold uppercase tracking-[.08em] ni-t-muted">{label}</dt>
                    <dd className="text-sm font-semibold ni-t-ink">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2.5 text-xs leading-6 ni-t-muted">{t("tutorTraining.checkNote")}</p>
            </>
          )}
        </Step>

        <Step state="locked" title={t("tutorTraining.stepTest")} copy={t("tutorTraining.stepTestCopy")} />

        <Step state="locked" title={t("tutorTraining.stepEvaluation")} copy={t("tutorTraining.stepEvaluationCopy")}>
          <Link href="/dashboard/instructor/classroom-demo" className="ni-btn ni-btn--outline text-sm">
            <PlayCircle size={14} aria-hidden="true" /> {t("tutorTraining.tryClassroom")}
          </Link>
        </Step>
      </ol>

      <section className="mt-9">
        <h2 className="font-display text-lg ni-t-ink">{t("tutorTraining.guides")}</h2>
        <p className="mt-1.5 max-w-[66ch] text-sm leading-6 ni-t-muted">{t("tutorTraining.guidesCopy")}</p>
        <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {GUIDES.map((key) => (
            <li key={key} className="flex items-start gap-3 rounded-2xl border border-dashed border-[var(--ni-sage-mid)] bg-[var(--ni-sage-soft)] px-4 py-3.5">
              <PlayCircle size={16} aria-hidden="true" className="mt-0.5 shrink-0 ni-t-muted" />
              <div className="min-w-0">
                <p className="text-sm font-semibold ni-t-ink">{t(key)}</p>
                <span className="mt-1 inline-block ni-verify">{t("tutorClassroom.comingSoon")}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
