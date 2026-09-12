/**
 * Learners who chose to be found, shown on the instructor's Find Students desk.
 *
 * **Two consents.** `profile_status = 'published'` is why the learning details appear
 * at all — enforced by RLS policy 0025, not by this component. `profiles.profile_visibility`
 * is a separate choice about the person: a learner who published their learning without
 * publishing themselves is shown under a neutral label and a neutral mark.
 *
 * **Every filter is resolved on the server.** The browser never receives a row it then
 * hides, so an unpublished learner is not fetched in the first place and a filtered-out
 * one never reaches this file. The five controls map to the five fields the learner
 * actually saved; nothing is derived, guessed or defaulted for display.
 *
 * Every action links to a procedure that already exists. Nothing here creates a follow,
 * a favourite, a contact exchange or any new relationship — and Message in particular
 * still refuses until a trial, booking, requirement response or enrolment connects the
 * two people, which is the existing rule and is not widened here.
 */
import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useLocale } from "../contexts/LocaleContextState";
import ResultState from "./ResultState";
import { resultError, resultState } from "../lib/result-state";
import { useOnlineStatus } from "../lib/use-online-status";
import { useDebounced } from "../lib/use-debounced";
import { countryOptions, genderLabelKeys, genderValues, languageOptions, subjectOptions } from "../lib/reference-data";
import LearnerAvatar from "./LearnerAvatar";
import MessageAction from "./MessageAction";
import type { TranslationKey } from "../i18n/catalog";

type Learner = {
  learnerId: string;
  displayName: string | null;
  avatarUrl: string | null;
  country: string | null;
  timezone: string | null;
  gender: string | null;
  subjects: string[];
  preferredLanguage: string | null;
  supportedLanguages: string[];
  profilePublic: boolean;
};

const field =
  "w-full rounded-[7px] border border-[var(--ni-sage-line)] bg-[var(--ni-field)] px-3 py-2 text-sm ni-t-ink outline-none focus:border-[var(--ni-moss)] focus:ring-2 focus:ring-[var(--ni-sage-mid)]";

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-[5px] border border-[var(--ni-sage-line)] bg-[var(--ni-field)] px-2 py-0.5 text-xs ni-t-ink">
      {children}
    </span>
  );
}

/** One `Label: value` pair on the detail row. Rendered only when the learner saved one. */
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex min-w-0 items-baseline gap-1.5">
      <span className="shrink-0 text-xs font-semibold ni-t-moss-deep">{label}:</span>
      <span className="truncate text-xs ni-t-muted">{value}</span>
    </span>
  );
}

function LearnerCard({ learner }: { learner: Learner }) {
  const { t } = useLocale();
  // A learner who published their learning but not themselves is named neutrally.
  const name = learner.profilePublic && learner.displayName ? learner.displayName : t("findStudents.anonymousLearner");
  // Their own words where they gave them, and nothing invented where they did not:
  // an absent value drops its row rather than printing "Unknown".
  const spoken = learner.supportedLanguages.length
    ? learner.supportedLanguages.join(", ")
    : learner.preferredLanguage;
  const genderLabel = learner.gender === "male" || learner.gender === "female"
    ? t(genderLabelKeys[learner.gender] as TranslationKey)
    : null;

  return (
    <article className="ni-ed-card p-5">
      <div className="flex items-start gap-4">
        <LearnerAvatar avatarUrl={learner.avatarUrl} gender={learner.gender} profilePublic={learner.profilePublic} />

        <div className="min-w-0 flex-1">
          {/* The name opens the full profile — the card's own heading rather than a
              second button, so the detail view stays reachable without adding one. */}
          <h3 className="min-w-0 truncate font-display text-lg ni-t-ink">
            <Link
              href={`/dashboard/instructor/students/${learner.learnerId}`}
              className="outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]"
            >
              {name}
            </Link>
          </h3>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {learner.subjects.length > 0 && (
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-semibold ni-t-moss-deep">{t("learnerProfile.wantToLearn")}:</span>
                {learner.subjects.map((subject) => <Chip key={subject}>{subject}</Chip>)}
              </span>
            )}
            {learner.timezone && (
              <span className="flex items-center gap-1.5">
                <span className="text-xs font-semibold ni-t-moss-deep">{t("discovery.timezone")}:</span>
                <Chip><span className="ltr-embed">{learner.timezone}</span></Chip>
              </span>
            )}
          </div>
        </div>

        <MessageAction
          counterpartId={learner.learnerId}
          viewerRole="instructor"
          tone="compact"
          label={t("findStudents.message")}
          className=""
          // An instructor cannot start a connection on their own; answering a published
          // learning request is the step that can lead to one.
          connectHref="/dashboard/instructor/requirements"
          connectLabel={t("findStudents.seeRequests")}
        />
      </div>

      {(genderLabel || learner.country || spoken) && (
        <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1.5 border-t border-[var(--ni-sage)] pt-3">
          {genderLabel && <Detail label={t("findStudents.gender")} value={genderLabel} />}
          {learner.country && <Detail label={t("marketplace.country")} value={learner.country} />}
          {spoken && <Detail label={t("marketplace.spokenLanguages")} value={spoken} />}
        </div>
      )}
    </article>
  );
}

/** One labelled `<select>`. Five of these are the whole sidebar. */
function Filter({ label, value, onChange, allLabel, options }: {
  label: string; value: string; onChange: (next: string) => void;
  allLabel: string; options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block">
      <span className="ni-label">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className={`${field} mt-1.5`}>
        <option value="">{allLabel}</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

export default function DiscoverableLearners({ humanToken }: { humanToken?: string } = {}) {
  const { t, formatNumber } = useLocale();
  const online = useOnlineStatus();
  const [search, setSearch] = useState("");
  const [subject, setSubject] = useState("");
  const [language, setLanguage] = useState("");
  const [gender, setGender] = useState("");
  const [country, setCountry] = useState("");
  const [timezone, setTimezone] = useState("");
  const debounced = useDebounced(search);

  const query = trpc.supabaseCore.discoverableLearners.useQuery(
    {
      query: debounced || undefined,
      subjects: subject ? [subject] : undefined,
      language: language || undefined,
      gender: (gender || undefined) as "male" | "female" | undefined,
      country: country || undefined,
      timezone: timezone || undefined,
      humanToken,
      limit: 24,
    },
    { retry: false },
  );

  const active = Boolean(debounced || subject || language || gender || country || timezone);
  const state = resultState(query as never, online);
  const payload = query.data?.ok ? (query.data.data as { learners: Learner[]; total: number }) : null;
  const learners = payload?.learners ?? [];

  // The timezone list comes from the learners actually on the desk: unlike subjects,
  // languages and countries there is no curated source for it, and offering all ~400
  // IANA zones would be a list where almost every choice returns nothing.
  const timezones = Array.from(new Set(learners.map((learner) => learner.timezone).filter(Boolean) as string[])).sort();

  const reset = () => {
    setSearch(""); setSubject(""); setLanguage(""); setGender(""); setCountry(""); setTimezone("");
  };

  return (
    <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] lg:items-start">
      {/* Sidebar. On a narrow screen it collapses into a disclosure above the list,
          which is the pattern the tutor marketplace already uses. */}
      <details open className="ni-ed-card p-4 lg:sticky lg:top-24 [&>summary]:lg:hidden lg:!block">
        <summary className="cursor-pointer list-none font-display text-base ni-t-ink">{t("findStudents.searchBy")}</summary>
        <p className="hidden font-display text-base ni-t-ink lg:block">{t("findStudents.searchBy")}</p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <label className="block">
            <span className="ni-label">{t("adminUI.search")}</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("findStudents.searchPlaceholder")}
              className={`${field} mt-1.5`}
            />
          </label>

          <Filter
            label={t("marketplace.subject")} value={subject} onChange={setSubject}
            allLabel={t("findStudents.allSubjects")}
            options={subjectOptions.map((item) => ({ value: item, label: item }))}
          />
          <Filter
            label={t("marketplace.spokenLanguages")} value={language} onChange={setLanguage}
            allLabel={t("findStudents.allLanguages")}
            // No locale argument, deliberately: the profile forms call it the same way,
            // so the stored value is always the English name whatever language the
            // learner filled the form in. A translated label would match no row.
            options={languageOptions()}

          />
          <Filter
            label={t("findStudents.gender")} value={gender} onChange={setGender}
            allLabel={t("findStudents.allGenders")}
            options={genderValues.map((item) => ({ value: item, label: t(genderLabelKeys[item] as TranslationKey) }))}
          />
          <Filter
            label={t("marketplace.country")} value={country} onChange={setCountry}
            allLabel={t("findStudents.allCountries")}
            // Uncalled with a locale for the same reason as the languages above.
            options={countryOptions()}
          />
          <Filter
            label={t("marketplace.timezone")} value={timezone} onChange={setTimezone}
            allLabel={t("findStudents.allTimezones")}
            options={timezones.map((item) => ({ value: item, label: item }))}
          />
        </div>

        {active && (
          <button type="button" onClick={reset} className="ni-btn ni-btn--quiet mt-3 w-full text-sm">
            {t("marketplace.clearFilters")}
          </button>
        )}
      </details>

      <div className="min-w-0">
        {state === "ready" && (
          <p className="mb-3 text-xs ni-t-muted" aria-live="polite">
            {t("adminUI.resultCount", { count: formatNumber(payload?.total ?? 0) })}
          </p>
        )}

        {state !== "ready" ? (
          <ResultState
            state={state}
            message={resultError(query as never)}
            onRetry={() => query.refetch()}
            retrying={query.isFetching}
          />
        ) : learners.length === 0 ? (
          <ResultState state="empty" message={active ? t("findStudents.noMatches") : t("findStudents.empty")} />
        ) : (
          <div className="grid gap-4">
            {learners.map((learner) => <LearnerCard key={learner.learnerId} learner={learner} />)}
          </div>
        )}
      </div>
    </section>
  );
}
