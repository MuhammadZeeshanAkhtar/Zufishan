/**
 * "Please complete your profile" nudge, shown on both dashboards.
 *
 * Onboarding only collects what an account genuinely needs. Everything else is filled in later from
 * here, so the banner is the second half of the two-stage flow. It reads the same profile rows the
 * Profile pages write, computes the percentage live, and disappears on its own once nothing is
 * missing — there is no stored percentage to go stale and no dismissal to leave it permanently
 * hidden while the profile is still thin.
 */
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLocale } from "../contexts/LocaleContextState";
import { profileCompletionFor } from "../lib/profile-completion";

type Role = "learner" | "instructor" | "admin";
type CoreProfiles = { profile?: unknown; learnerProfile?: unknown; instructorProfile?: unknown };

export default function ProfileCompletionBanner({ role }: { role: Role }) {
  const { t } = useLocale();
  const profiles = trpc.supabaseCore.profiles.useQuery(undefined, { staleTime: 30_000 });

  // Nothing to say until the real rows are in hand — never guess a percentage.
  if (!profiles.data?.ok) return null;
  const data = profiles.data.data as CoreProfiles | null;
  if (!data) return null;

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
      className="mb-6 rounded-2xl border border-[var(--ni-gold-mid)] bg-[var(--ni-gold-soft)] px-5 py-4 text-[var(--ni-gold-ink)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h2 id="profile-completion-title" className="font-display text-xl leading-tight">
            {t("profileCompletion.title")}
          </h2>
          <p className="mt-1 text-sm leading-6">{t("profileCompletion.copy", { percent: result.percent })}</p>
        </div>
        <Link
          href={`/dashboard/${role === "instructor" ? "instructor" : "learner"}/profile`}
          className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[var(--ni-teal)] px-5 py-2 text-sm font-semibold text-[var(--ni-paper)] transition hover:opacity-90"
        >
          {t("profileCompletion.cta")}
          <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
        </Link>
      </div>

      <div
        role="progressbar"
        aria-valuenow={result.percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t("profileCompletion.label")}
        className="mt-4 h-2 w-full overflow-hidden rounded-full bg-[var(--ni-gold-mid)]"
      >
        <div className="h-full rounded-full bg-[var(--ni-teal)] transition-all" style={{ width: `${result.percent}%` }} />
      </div>

      <p className="mt-3 text-xs font-semibold uppercase tracking-wide opacity-80">
        {t("profileCompletion.remaining")}
      </p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {result.missing.map((field) => (
          <li
            key={field.key}
            className="rounded-full border border-[var(--ni-gold-mid)] bg-[var(--ni-paper)] px-3 py-1 text-xs text-[var(--ni-ink)]"
          >
            {t(field.labelKey)}
          </li>
        ))}
      </ul>
    </section>
  );
}
