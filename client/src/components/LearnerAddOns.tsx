/**
 * Two learner modules the reference marketplace has and this project did not.
 *
 * Reviewing the reference's student dashboard turned up two entries with no counterpart here:
 *
 *  - **Parental Watch** — a parent watching back recordings of their child's lessons. On the
 *    reference it is a purchasable add-on ("To purchase Parental Watch, please click Add-on's").
 *  - **Quran for revision** — the Quran text, to read between lessons.
 *
 * Neither can be built honestly today, and for reasons that are worth stating rather than hiding.
 * Parental Watch needs two things this deployment does not have: an administrator to enable the
 * add-on, and classroom recording, which arrives with the classroom provider. The Quran reader
 * needs an approved content source, and this project has a standing rule that no Quran text,
 * translation, Tafsir, Tajweed ruling or audio is shown before that connection exists.
 *
 * So the modules exist, in the rail, where a learner looking for them will look — and each says
 * plainly what it is for, what it is waiting on, and who supplies that. What neither does is
 * pretend: no sample recording, no placeholder ayah, and nothing that could be mistaken for a
 * purchase. Each also points at the nearest thing that does work today.
 */
import { Link } from "wouter";
import { Archive, BookOpen, ShieldCheck, Video } from "lucide-react";
import { useLocale } from "../contexts/LocaleContextState";
import type { TranslationKey } from "@/i18n/catalog";

export function HeldModule({ icon: Icon, titleKey, copyKey, soonKey, action }: {
  icon: typeof Video;
  titleKey: TranslationKey;
  copyKey: TranslationKey;
  soonKey: TranslationKey;
  action: { href: string; labelKey: TranslationKey; icon: typeof Video };
}) {
  const { t } = useLocale();
  const ActionIcon = action.icon;
  return (
    <div className="mx-auto max-w-4xl px-5 py-6 lg:px-6 lg:py-8">
      <h1 className="font-display text-2xl ni-t-ink">{t(titleKey)}</h1>
      <p className="mt-2 max-w-[68ch] text-sm leading-6 ni-t-muted">{t(copyKey)}</p>

      <div className="mt-6 rounded-2xl border border-dashed border-[var(--ni-sage-mid)] bg-[var(--ni-sage-soft)] px-6 py-12 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-[var(--ni-sage-line)] bg-[var(--ni-field)] ni-t-muted">
          <Icon size={20} aria-hidden="true" />
        </span>
        <p className="mt-4"><span className="ni-verify">{t("tutorClassroom.comingSoon")}</span></p>
        <p className="mx-auto mt-3 max-w-[56ch] text-sm leading-7 ni-t-muted">{t(soonKey)}</p>
        <div className="mt-5">
          <Link href={action.href} className="ni-btn ni-btn--outline text-sm">
            <ActionIcon size={14} aria-hidden="true" /> {t(action.labelKey)}
          </Link>
        </div>
      </div>
    </div>
  );
}

/** A parent following their child's lessons back. Needs the add-on and a recording provider. */
export function ParentalWatchPage() {
  return (
    <HeldModule
      icon={ShieldCheck}
      titleKey="learnerAddOn.parentalTitle"
      copyKey="learnerAddOn.parentalCopy"
      soonKey="learnerAddOn.parentalSoon"
      // Archives is where a recording would appear, so that is where to look meanwhile.
      action={{ href: "/dashboard/learner/archives", labelKey: "learnerAddOn.openArchives", icon: Archive }}
    />
  );
}

/** Reading between lessons. Needs an approved Quran source before a single word is shown. */
export function QuranRevisionPage() {
  return (
    <HeldModule
      icon={BookOpen}
      titleKey="learnerAddOn.quranTitle"
      copyKey="learnerAddOn.quranCopy"
      soonKey="learnerAddOn.quranSoon"
      // The Hifz tracker already records revision by reference, without showing the text.
      action={{ href: "/dashboard/learner/hifz", labelKey: "learnerAddOn.openHifz", icon: BookOpen }}
    />
  );
}
