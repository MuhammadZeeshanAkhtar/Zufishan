/**
 * The dashboard's catch-all: what you get for a path inside a dashboard that has no page.
 *
 * What stood here was worse than a not-found page. It held a map of about twenty hardcoded English
 * titles and sentences — "Availability: weekly intervals will be connected later", "Billing: no
 * earnings are shown without a payment provider", "A protected requirement form will connect in
 * Prompt 6" — and printed one under a gold "Setup needed" banner.
 *
 * Every one of those modules has since been built. The map was never updated, so the page's job
 * had quietly inverted: it existed to tell somebody that a working module was not connected yet.
 * `Progress` was the clearest case — it had no route, fell through to here, and read as a feature
 * that was coming, when in fact nothing had been written to read the rows it already had.
 *
 * So the map is gone. A path with no page is a path with no page, said once, in the reader's own
 * language, with the way back. `dashboard-navigation.test.ts` now asserts that no module in the
 * rail can reach this page at all — which is the only way to keep it honest, because a catch-all
 * cannot know what it was reached by.
 */
import { Link, useLocation } from "wouter";
import { Compass } from "lucide-react";
import { useLocale } from "../contexts/LocaleContextState";

export function DashboardSubpage({ role }: { role: "learner" | "instructor" }) {
  const { t } = useLocale();
  const [location] = useLocation();

  return (
    <main className="mx-auto max-w-3xl px-5 py-16 lg:px-8 lg:py-24">
      <div className="ni-ed-card p-8 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-[var(--ni-sage-line)] bg-[var(--ni-field)] ni-t-muted">
          <Compass size={20} aria-hidden="true" />
        </span>
        <h1 className="mt-4 font-display text-3xl ni-t-ink">{t("common.notFound")}</h1>
        <p className="mx-auto mt-3 max-w-[52ch] text-sm leading-7 ni-t-muted">{t("subpage.copy")}</p>
        {/* The address itself, so a mistyped or out-of-date link is obvious rather than mysterious. */}
        <p className="mt-3 text-xs ni-t-muted-soft"><span className="ltr-embed">{location}</span></p>
        <Link href={`/dashboard/${role}`} className="ni-btn ni-btn--primary mt-6 text-sm">
          {t("dashboard.overview")}
        </Link>
      </div>
    </main>
  );
}
