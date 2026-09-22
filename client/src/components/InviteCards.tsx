/**
 * The cards on the two invite desks, and the bookings beside them.
 *
 * Both desks used to render almost nothing. Received invites showed a count — "3 invites" — and a
 * link elsewhere; Bookings showed a status word and a raw timestamp. A teacher deciding whether to
 * teach somebody cannot decide from a number, and a learner checking on an invite they sent could
 * not see who it went to.
 *
 * So each card now carries the person: their picture or the drawn mark for the gender they saved,
 * their name, where they are and what time it is for them — the same `LearnerAvatar` the rest of
 * the project uses, so one person looks like themselves everywhere.
 *
 * A received invite that has not been opened is marked New, and opening it clears exactly that
 * notice from the bell. Nothing is marked read on render: a card scrolling past is not a teacher
 * reading it.
 */
import { Link } from "wouter";
import { ArrowRight, Clock3 } from "lucide-react";
import { useLocale } from "../contexts/LocaleContextState";
import LearnerAvatar from "./LearnerAvatar";
import type { TranslationKey } from "@/i18n/catalog";

export type InvitePerson = {
  id: string; displayName: string | null; avatarUrl: string | null;
  country: string | null; timezone: string | null; gender: string | null; preferredLanguage: string | null;
};

type Requirement = {
  id: string; subject: string; level: string; goal: string;
  preferredLanguage: string; timezone: string; availability: string;
};

export type ReceivedInvite = {
  id: string; status: string; subject: string; message: string;
  requestedStartAt: string; requestedEndAt: string; learnerTimezone: string; createdAt: string;
  learner: InvitePerson | null; requirement: Requirement | null; unseen: boolean;
};

export type SentInvite = {
  id: string; status: string; subject: string; message: string;
  requestedStartAt: string; requestedEndAt: string; createdAt: string;
  instructor: InvitePerson | null; instructorResponse: string | null;
};

export type DeskBooking = {
  id: string; status: string; subject: string;
  scheduledStartAt: string; scheduledEndAt: string;
  learnerTimezone: string; instructorTimezone: string; person: InvitePerson | null;
};

/** One labelled fact. Absent values are dropped rather than printed as a dash. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="inline text-xs font-semibold ni-t-ink">{label}: </dt>
      <dd className="inline text-xs ni-t-muted">{children}</dd>
    </div>
  );
}

function Person({ person, fallbackKey }: { person: InvitePerson | null; fallbackKey: TranslationKey }) {
  const { t } = useLocale();
  return (
    <>
      <LearnerAvatar
        avatarUrl={person?.avatarUrl ?? null}
        gender={person?.gender ?? null}
        // The person wrote to this account, so their name is theirs to show here.
        profilePublic
      />
      <div className="min-w-0 flex-1">
        <p className="font-display text-lg ni-t-moss">{person?.displayName || t(fallbackKey)}</p>
        <dl className="mt-1.5 space-y-1">
          {person?.country && <Fact label={t("marketplace.country")}>{person.country}</Fact>}
          {person?.timezone && <Fact label={t("tutorDesk.timeZone")}><span className="ltr-embed">{person.timezone}</span></Fact>}
          {person?.preferredLanguage && <Fact label={t("invite.language")}>{person.preferredLanguage}</Fact>}
        </dl>
      </div>
    </>
  );
}

/** A teacher's view of an invite: who, what for, when, and what they wrote. */
export function ReceivedInviteCard({ invite, href, onOpen }: {
  invite: ReceivedInvite;
  href: string;
  onOpen: () => void;
}) {
  const { t, locale } = useLocale();
  const at = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
  };

  return (
    <li className="ni-ed-card p-4">
      <div className="flex items-start gap-4">
        <Person person={invite.learner} fallbackKey="findStudents.anonymousLearner" />
        <div className="flex shrink-0 flex-col items-end gap-2">
          {invite.unseen && <span className="ni-verify">{t("invite.new")}</span>}
          <span className="ni-verify">{invite.status.replaceAll("_", " ")}</span>
        </div>
      </div>

      <dl className="mt-3 space-y-1 border-t border-[var(--ni-sage-line)] pt-3">
        <Fact label={t("invite.wants")}>{invite.subject || "—"}</Fact>
        <Fact label={t("invite.requestedTime")}>
          <span className="ltr-embed">{at(invite.requestedStartAt)}</span>
        </Fact>
        {invite.message && <Fact label={t("invite.theirMessage")}>{invite.message}</Fact>}
      </dl>

      {/* The fullest statement of what somebody wants, when they posted one. */}
      {invite.requirement && (
        <div className="mt-3 rounded-xl border border-[var(--ni-gold-mid)] bg-[var(--ni-gold-soft)] p-3.5 ni-t-gold">
          <p className="text-xs font-bold uppercase tracking-[.1em]">{t("invite.requirement")}</p>
          <dl className="mt-2 space-y-1">
            <Fact label={t("invite.level")}>{invite.requirement.level}</Fact>
            <Fact label={t("invite.goal")}>{invite.requirement.goal}</Fact>
            <Fact label={t("invite.availability")}>{invite.requirement.availability}</Fact>
          </dl>
        </div>
      )}

      <div className="mt-3.5 flex flex-wrap gap-2">
        {/* Opening is what clears the notice; rendering the card is not. */}
        <Link href={href} onClick={onOpen} className="ni-btn ni-btn--primary text-sm">
          {t("invite.open")} <ArrowRight size={13} aria-hidden="true" className="rtl:-scale-x-100" />
        </Link>
        {invite.learner && (
          <Link href={`/dashboard/instructor/students/${invite.learner.id}`} onClick={onOpen} className="ni-btn ni-btn--outline text-sm">
            {t("invite.viewStudent")}
          </Link>
        )}
      </div>
    </li>
  );
}

/** A learner's view of an invite they sent: who it went to, and what came back. */
export function SentInviteCard({ invite, href }: { invite: SentInvite; href: string }) {
  const { t, locale } = useLocale();
  const at = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
  };

  return (
    <li className="ni-ed-card p-4">
      <div className="flex items-start gap-4">
        <Person person={invite.instructor} fallbackKey="learnerHome.tabInvites" />
        <span className="ni-verify shrink-0">{invite.status.replaceAll("_", " ")}</span>
      </div>

      <dl className="mt-3 space-y-1 border-t border-[var(--ni-sage-line)] pt-3">
        <Fact label={t("invite.wants")}>{invite.subject || "—"}</Fact>
        <Fact label={t("invite.requestedTime")}>
          <span className="ltr-embed">{at(invite.requestedStartAt)}</span>
        </Fact>
        <Fact label={t("invite.theirReply")}>
          {invite.instructorResponse || <span className="italic">{t("invite.awaitingReply")}</span>}
        </Fact>
      </dl>

      <Link href={href} className="ni-btn ni-btn--outline mt-3.5 text-sm">
        {t("learnerHome.openInvite")} <ArrowRight size={13} aria-hidden="true" className="rtl:-scale-x-100" />
      </Link>
    </li>
  );
}

/** A confirmed lesson, with the other person named and the time in both zones. */
export function BookingCard({ booking, href, role }: {
  booking: DeskBooking;
  href: string;
  role: "learner" | "instructor";
}) {
  const { t, locale } = useLocale();
  const inZone = (value: string, zone: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    try {
      return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: zone || "UTC" }).format(date);
    } catch {
      // An unknown zone name must not blank the whole card.
      return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
    }
  };
  const ownZone = role === "learner" ? booking.learnerTimezone : booking.instructorTimezone;

  return (
    <li className="ni-ed-card p-4">
      <div className="flex items-start gap-4">
        <Person person={booking.person} fallbackKey="findStudents.anonymousLearner" />
        <span className="ni-verify shrink-0">{booking.status.replaceAll("_", " ")}</span>
      </div>

      <dl className="mt-3 space-y-1 border-t border-[var(--ni-sage-line)] pt-3">
        <Fact label={t("invite.wants")}>{booking.subject || "—"}</Fact>
        <Fact label={t("booking.yourTime")}>
          <span className="ltr-embed">
            <Clock3 size={11} aria-hidden="true" className="me-1 inline" />
            {inZone(booking.scheduledStartAt, ownZone)}
          </span>
        </Fact>
      </dl>

      <Link href={href} className="ni-btn ni-btn--outline mt-3.5 text-sm">
        {t("booking.openBooking")} <ArrowRight size={13} aria-hidden="true" className="rtl:-scale-x-100" />
      </Link>
    </li>
  );
}
