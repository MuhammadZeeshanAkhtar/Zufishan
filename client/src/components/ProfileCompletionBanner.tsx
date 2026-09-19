/**
 * "Please complete your profile" notice, shown on the learner and tutor overview.
 *
 * Onboarding only collects what an account genuinely needs. Everything else is filled in later from
 * here, so this notice is the second half of the two-stage flow. It reads the same profile rows the
 * Profile pages write, computes the percentage live, and disappears on its own once nothing is
 * missing — there is no stored percentage to go stale.
 *
 * It is a notification rather than a fixed block: one line, the remaining fields, a button, and a
 * close control. Closing it is remembered per signed-in account in this browser only, which is all
 * localStorage can honestly promise — nothing is written to the server and no other device is
 * affected. The percentage stays visible on the Profile page either way, so dismissing this hides a
 * reminder, never the information.
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, BellRing, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "../contexts/LocaleContextState";
import { profileCompletionFor } from "../lib/profile-completion";

type Role = "learner" | "instructor" | "admin";
type CoreProfiles = { profile?: unknown; learnerProfile?: unknown; instructorProfile?: unknown };

const DISMISS_PREFIX = "ni.profile-nudge-dismissed:";

/** Storage can be unavailable (private window, blocked site data), so every access is guarded. */
function readDismissed(accountId: string | undefined): boolean {
  if (!accountId) return false;
  try {
    return window.localStorage.getItem(DISMISS_PREFIX + accountId) === "1";
  } catch {
    return false;
  }
}

export default function ProfileCompletionBanner({ role }: { role: Role }) {
  const { t, formatNumber } = useLocale();
  const { user } = useAuth();
  const profiles = trpc.supabaseCore.profiles.useQuery(undefined, { staleTime: 30_000 });
  const [dismissed, setDismissed] = useState(false);

  // Read the stored choice after mount, and re-read it when the account changes, so signing in as
  // someone else never inherits the previous account's dismissal.
  useEffect(() => { setDismissed(readDismissed(user?.id)); }, [user?.id]);

  const dismiss = () => {
    setDismissed(true);
    if (!user?.id) return;
    try {
      window.localStorage.setItem(DISMISS_PREFIX + user.id, "1");
    } catch {
      // Hidden for this view only; nothing else in the page depends on it being stored.
    }
  };

  // Nothing to say until the real rows are in hand — never guess a percentage.
  if (!profiles.data?.ok) return null;
  const data = profiles.data.data as CoreProfiles | null;
  if (!data) return null;
  if (dismissed) return null;

  const row = (value: unknown) => (value && typeof value === "object" ? (value as Record<string, unknown>) : null);
  const result = profileCompletionFor(
    role,
    row(data.profile),
    row(role === "instructor" ? data.instructorProfile : data.learnerProfile),
  );
  if (result.complete) return null;

  return (
    <section
      aria-labelledby="profile-completion-title"
      className="mb-6 rounded-2xl border border-[var(--ni-gold-mid)] bg-[var(--ni-gold-soft)] px-4 py-3 ni-t-gold"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <BellRing size={16} aria-hidden="true" className="shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 id="profile-completion-title" className="text-sm font-bold leading-6">
            {t("profileCompletion.title")}
            <span className="font-normal tabular-nums"> · {formatNumber(result.percent)}%</span>
          </h2>
          <p className="mt-0.5 text-xs leading-5 opacity-90">
            {t("profileCompletion.remaining")}: {result.missing.map((field) => t(field.labelKey)).join(" · ")}
          </p>
        </div>
        <Link
          href={`/dashboard/${role === "instructor" ? "instructor" : "learner"}/profile`}
          className="ni-nudge-cta inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold"
        >
          {t("profileCompletion.cta")}
          <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />
        </Link>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t("common.close")}
          className="shrink-0 rounded-full p-1.5 transition hover:bg-[var(--ni-gold-mid)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ni-gold-ink)]"
        >
          <X size={15} aria-hidden="true" />
        </button>
      </div>

      <div
        role="progressbar"
        aria-valuenow={result.percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t("profileCompletion.label")}
        className="ni-nudge-bar mt-3 h-1.5 w-full overflow-hidden rounded-full"
      >
        <div className="ni-nudge-bar-fill h-full rounded-full transition-all" style={{ width: `${result.percent}%` }} />
      </div>
    </section>
  );
}
