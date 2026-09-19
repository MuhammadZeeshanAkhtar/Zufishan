/**
 * The discovery card for an approved, published instructor.
 *
 * The layout follows the structure of the reference the company supplied — a round
 * avatar beside the name, a verification mark, a star rating, subject chips under an
 * "I can teach" label, a truncated biography, a languages/gender row, and a divided
 * strip of facts along the bottom. Structure only: no name, photo, biography, rate,
 * rating, location or count from that reference appears here or anywhere in this
 * codebase. Every value comes from the Zufishan database, for an instructor who
 * published their own listing.
 *
 * The presentation itself lives in `InstructorPresentation`, shared with the public
 * profile page so a listing and its profile can never disagree about the same person.
 *
 * **What is deliberately missing.** The reference also shows an online/offline state.
 * Zufishan tracks no presence at all — no `last_seen_at`, no heartbeat, no realtime
 * presence channel — so there is nothing truthful to render and no such badge appears.
 * "Last Active" is not presence: it is the last time the instructor actually joined a
 * class. The rating, session count and learner count ARE real, counted from `reviews`
 * and `class_sessions` at read time by `discovery-stats`.
 *
 * **Two consents, kept apart.** `public_profile_status = 'published'` and
 * `verification_status = 'approved'` are why the listing is here — the server applies
 * both before any filter. `profilePublic` is separate: it reflects the person's own
 * `profile_visibility`, and when it is false the card shows the listing without the
 * personal detail, falling back to the public slug and a drawn avatar. Neither flag is
 * trusted from the browser; both are decided on the server.
 */
import { Link } from "wouter";
import { BadgeCheck, Globe2, ShieldCheck } from "lucide-react";
import { useLocale } from "../contexts/LocaleContextState";
import { displayableImageSrc } from "../lib/safe-url";
import {
  Chip, Fact, InstructorAvatar, Rating, useInstructorFacts,
  type DiscoveryInstructor,
} from "./InstructorPresentation";

export type { DiscoveryInstructor };

export default function InstructorCard({ instructor, href }: { instructor: DiscoveryInstructor; href: string }) {
  const { t, formatNumber } = useLocale();

  const name = instructor.displayName?.trim() || instructor.public_slug;
  const subjects = instructor.subjects ?? [];
  const languages = instructor.teaching_languages ?? [];
  const approved = instructor.verification_status === "approved";
  const facts = useInstructorFacts(instructor);

  return (
    <Link
      href={href}
      className="ni-ed-card group block p-5 outline-none focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]"
    >
      <div className="flex items-start gap-4">
        <InstructorAvatar name={name} src={displayableImageSrc(instructor.avatarUrl)} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h3 className="min-w-0 truncate font-display text-xl ni-t-ink">{name}</h3>
            {approved && (
              <span className="inline-flex shrink-0 items-center gap-1 ni-label" style={{ color: "var(--ni-moss-deep)" }}>
                <BadgeCheck size={14} aria-hidden="true" />
                {t("marketplace.verified")}
              </span>
            )}
            {instructor.country && (
              <span className="inline-flex shrink-0 items-center gap-1 text-xs ni-t-muted">
                <Globe2 size={12} aria-hidden="true" />
                {instructor.country}
              </span>
            )}
            {/* Only when somebody has actually reviewed. An unrated instructor shows no
                stars rather than five empty ones, which would read as a score of zero. */}
            {typeof instructor.ratingAverage === "number" && (
              <Rating average={instructor.ratingAverage} count={instructor.ratingCount ?? 0} />
            )}
          </div>

          {subjects.length > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <span className="ni-label">{t("discovery.canTeach")}</span>
              {subjects.slice(0, 4).map((subject) => <Chip key={subject}>{subject}</Chip>)}
              {subjects.length > 4 && <span className="text-xs ni-t-muted-soft">+{formatNumber(subjects.length - 4)}</span>}
            </div>
          )}
        </div>
      </div>

      {/* The instructor's own words: their profile biography, else their stated
          teaching approach. Never a generated summary. */}
      {(instructor.bio || instructor.teaching_approach) && (
        <p className="mt-4 line-clamp-3 text-sm leading-6 ni-t-muted">{instructor.bio || instructor.teaching_approach}</p>
      )}

      {(languages.length > 0 || instructor.gender) && (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          {languages.length > 0 && (
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="ni-label">{t("discovery.languages")}</span>
              {languages.slice(0, 4).map((language) => <Chip key={language}>{language}</Chip>)}
            </span>
          )}
          {instructor.gender && (
            <span className="flex items-center gap-1.5">
              <span className="ni-label">{t("gender.label")}</span>
              <span className="text-sm ni-t-ink">{instructor.gender}</span>
            </span>
          )}
        </div>
      )}

      {facts.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-y-3 border-t border-[var(--ni-sage)] pt-3.5 sm:grid-cols-3 lg:flex lg:flex-wrap">
          {facts.map((fact) => <Fact key={fact.label} label={fact.label} value={fact.value} unit={fact.unit} />)}
        </div>
      )}

      {/* Said plainly rather than left as a mystery: the listing is public, the
          person's own details are not. */}
      {instructor.profilePublic === false && (
        <p className="mt-3 inline-flex items-center gap-1.5 text-[11px] leading-4 ni-t-muted-soft">
          <ShieldCheck size={12} aria-hidden="true" />
          {t("discovery.profilePrivate")}
        </p>
      )}
    </Link>
  );
}
