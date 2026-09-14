/**
 * The public homepage.
 *
 * Lifted out of App.tsx, where it sat as one 7,000-character line alongside the
 * router. The route is unchanged — `/` still renders this — but the page now has
 * somewhere to live that is not the routing table.
 *
 * **What changed about its honesty.** The old page mapped over two hardcoded
 * arrays in `lms-data.ts` and rendered them as this platform's courses and
 * teachers: invented people with invented credentials, on the public front page.
 * Both rails now call the same procedures `/courses` and `/teachers` already use
 * — `schedulingPublic.publishedCourses` and `schedulingPublic.instructors` — and
 * render the shared `ResultState` when there is nothing to show. With no course
 * published and no instructor approved yet, those sections say so. That is the
 * correct thing for them to say.
 *
 * Nothing here writes. No procedure was added, no route changed, no filter or
 * link removed. Colour comes only from theme tokens, so light, dark and system
 * all follow the existing provider without this file knowing which is active.
 */
import { useRef } from "react";
import { Link } from "wouter";
import { ArrowRight, BookOpen, CalendarCheck, GraduationCap, Languages, ShieldCheck, Sparkles } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLocale } from "../contexts/LocaleContextState";
import ResultState from "./ResultState";
import InstructorCard, { type DiscoveryInstructor } from "./InstructorCard";
import { AITutorSection, BlogSection, ContactSection, HowItWorksSection } from "./HomeSections";
import { IslamicCardImage } from "./IslamicCardArt";
import { resultError, resultState } from "../lib/result-state";
import { useOnlineStatus } from "../lib/use-online-status";
import { useGsapReveal } from "../lib/use-gsap-reveal";
import type { TranslationKey } from "@/i18n/catalog";

type PublicCourse = {
  id: string; slug: string; title: string; description: string;
  subject: string; level: string; language: string; status: string; created_at: string;
};

const SUBJECT_ROUTES: Array<{ key: string; href: string; labelKey: TranslationKey }> = [
  { key: "quran", href: "/courses/category/quran", labelKey: "subject.quran" },
  { key: "tajweed", href: "/courses/category/tajweed", labelKey: "subject.tajweed" },
  { key: "hifz", href: "/courses/category/hifz", labelKey: "subject.hifz" },
  { key: "arabic", href: "/courses/category/arabic", labelKey: "subject.arabic" },
  { key: "hadith", href: "/courses/category/hadith", labelKey: "subject.hadith" },
  { key: "fiqh", href: "/courses/category/fiqh", labelKey: "subject.fiqh" },
  { key: "seerah", href: "/courses/category/seerah", labelKey: "subject.seerah" },
  { key: "tafsir", href: "/courses/category/tafsir", labelKey: "subject.tafsir" },
];

/* ------------------------------------------------------------------- pieces */

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="ni-label flex items-center gap-2">
      <span aria-hidden="true" className="ni-mark ni-t-gold text-[.9rem]"><i /><i /><i /><i /></span>
      {children}
    </p>
  );
}

function SectionHead({ eyebrow, title, copy, action }: {
  eyebrow: string; title: string; copy?: string; action?: React.ReactNode;
}) {
  return (
    <div className="mb-10 flex flex-wrap items-end justify-between gap-5">
      <div className="min-w-0 max-w-[58ch]">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 className="mt-4 font-display text-[clamp(1.8rem,3.4vw,2.5rem)] leading-[1.14] tracking-[-.02em] ni-t-ink text-balance">{title}</h2>
        {copy && <p className="mt-4 text-[1.02rem] leading-8 ni-t-muted">{copy}</p>}
      </div>
      {action}
    </div>
  );
}

/** A course as the public catalogue actually stores it — no image, no rating, no enrolment count. */
function CourseTile({ course }: { course: PublicCourse }) {
  const { t } = useLocale();
  return (
    <Link
      href={`/courses/${course.slug}`}
      className="ni-ed-card group flex flex-col p-5 outline-none focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]"
    >
      <div aria-hidden="true" className="ni-stripe -mx-5 -mt-5 mb-5" />
      <p className="ni-label">{course.subject}</p>
      <h3 className="mt-2.5 font-display text-lg leading-snug ni-t-ink group-hover:underline">{course.title}</h3>
      <p className="mt-2.5 line-clamp-3 flex-1 text-sm leading-6 ni-t-muted">{course.description}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--ni-sage)] pt-3.5">
        <span className="ni-verify">{course.level}</span>
        <span className="ni-verify"><Languages size={12} aria-hidden="true" />{course.language}</span>
        <span className="ms-auto inline-flex items-center gap-1 text-xs font-bold ni-link">
          {t("home.viewCourse")} <ArrowRight size={13} aria-hidden="true" className="rtl:-scale-x-100" />
        </span>
      </div>
    </Link>
  );
}

/* --------------------------------------------------------------------- page */

export default function HomeExperience() {
  const { t } = useLocale();
  const online = useOnlineStatus();
  const root = useRef<HTMLDivElement | null>(null);

  // The same two procedures the catalogue and the tutor marketplace use. The
  // homepage takes a short page of each; nothing is filtered in the browser.
  const coursesQuery = trpc.schedulingPublic.publishedCourses.useQuery(undefined, { retry: false });
  const instructorsQuery = trpc.schedulingPublic.instructors.useQuery({ limit: 3 }, { retry: false });

  const courseState = resultState(coursesQuery as never, online);
  const instructorState = resultState(instructorsQuery as never, online);

  const courses: PublicCourse[] = coursesQuery.data?.ok
    ? ((coursesQuery.data.data as { courses?: PublicCourse[] }).courses ?? []).slice(0, 4)
    : [];
  const instructors: DiscoveryInstructor[] = instructorsQuery.data?.ok
    ? ((instructorsQuery.data.data as { instructors?: DiscoveryInstructor[] }).instructors ?? [])
    : [];

  useGsapReveal(root);

  const features: Array<{ icon: typeof BookOpen; titleKey: TranslationKey; copyKey: TranslationKey; href: string }> = [
    { icon: BookOpen, titleKey: "home.featCourses", copyKey: "home.featCoursesCopy", href: "/courses" },
    { icon: GraduationCap, titleKey: "home.featTeachers", copyKey: "home.featTeachersCopy", href: "/teachers" },
    { icon: CalendarCheck, titleKey: "home.featRequests", copyKey: "home.featRequestsCopy", href: "/requirements" },
  ];

  const steps: Array<{ titleKey: TranslationKey; copyKey: TranslationKey }> = [
    { titleKey: "home.step1", copyKey: "home.step1Copy" },
    { titleKey: "home.step2", copyKey: "home.step2Copy" },
    { titleKey: "home.step3", copyKey: "home.step3Copy" },
    { titleKey: "home.step4", copyKey: "home.step4Copy" },
  ];

  return (
    <div ref={root}>
      {/* ---------------------------------------------------------- hero --- */}
      <section className="ni-linework relative overflow-hidden border-b border-[var(--ni-sage)]">
        <div className="relative z-[1] mx-auto grid max-w-7xl items-center gap-14 px-5 pb-20 pt-14 lg:grid-cols-[1.05fr_.95fr] lg:px-8 lg:pb-28 lg:pt-20">
          <div className="min-w-0">
            <div data-anim="intro"><Eyebrow>{t("home.eyebrow")}</Eyebrow></div>
            <h1 data-anim="intro" className="text-balance mt-6 max-w-xl font-display text-[clamp(2.5rem,6vw,4.1rem)] font-semibold leading-[1.04] tracking-[-.03em] ni-t-ink">
              {t("home.title")}
            </h1>
            <p data-anim="intro" className="mt-6 max-w-lg text-[1.05rem] leading-8 ni-t-muted">{t("home.copy")}</p>
            <div data-anim="intro" className="mt-9 flex flex-wrap gap-3">
              <Link href="/courses" className="ni-btn ni-btn--primary">
                {t("home.exploreCourses")} <ArrowRight size={16} aria-hidden="true" className="rtl:-scale-x-100" />
              </Link>
              <Link href="/teachers" className="ni-btn ni-btn--outline">{t("home.findTutor")}</Link>
            </div>
            <p data-anim="intro" className="mt-6 inline-flex items-center gap-2 text-xs leading-5 ni-t-muted-soft">
              <ShieldCheck size={14} aria-hidden="true" className="shrink-0 ni-t-moss" />
              {t("home.heroAssurance")}
            </p>
          </div>

          {/* The hero card: how the platform actually works, in four steps.
              A two-column grid on anything wider than a phone keeps it compact
              and horizontal, so it stays shorter than the copy beside it and the
              hero's height is still set by the left column, not by this card. */}
          {/* Artwork only: the card carries no text, so nothing sits beside, above or
              below the image. The 3:2 box keeps it landscape and stops it driving the
              hero's height, which is still set by the copy column on the left. */}
          <aside data-anim="intro" className="ni-ed-card ni-works overflow-hidden">
            <div className="aspect-[4/3] w-full sm:aspect-[3/2] lg:aspect-[4/3]">
              <IslamicCardImage />
            </div>
          </aside>
        </div>
      </section>

      {/* ------------------------------------------------------ subjects --- */}
      <section data-anim="section" className="mx-auto max-w-7xl px-5 py-16 lg:px-8 lg:py-20">
        <SectionHead
          eyebrow={t("home.popularSubjects")}
          title={t("home.subjectsTitle")}
          copy={t("home.subjectsCopy")}
          action={<Link href="/courses" className="ni-btn ni-btn--quiet text-sm">{t("home.browseAll")}</Link>}
        />
        <div data-anim="stagger" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {SUBJECT_ROUTES.map((subject) => (
            <Link
              key={subject.key}
              href={subject.href}
              className="ni-lift group rounded-[11px] border border-[var(--ni-sage)] border-t-2 border-t-[var(--ni-gold-mid)] bg-[var(--ni-field)] p-4 outline-none hover:bg-[var(--ni-paper)] focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]"
            >
              <p className="font-display text-base ni-t-ink">{t(subject.labelKey)}</p>
              <span className="mt-1.5 inline-flex items-center gap-1 text-xs ni-t-muted group-hover:ni-t-ink">
                {t("home.browse")} <ArrowRight size={11} aria-hidden="true" className="rtl:-scale-x-100" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------- courses --- */}
      <section data-anim="section" className="border-y border-[var(--ni-sage)] bg-[var(--ni-bg-lift)]">
        <div className="mx-auto max-w-7xl px-5 py-16 lg:px-8 lg:py-20">
          <SectionHead
            eyebrow={t("home.studyDesk")}
            title={t("home.studyTitle")}
            copy={t("home.studyCopy")}
            action={<Link href="/courses" className="ni-btn ni-btn--quiet text-sm">{t("home.browseAll")}</Link>}
          />
          {courseState !== "ready" || courses.length === 0 ? (
            <ResultState
              state={courseState === "ready" ? "empty" : courseState}
              message={courseState === "ready" ? t("home.noCourses") : resultError(coursesQuery as never)}
              onRetry={() => coursesQuery.refetch()}
              retrying={coursesQuery.isFetching}
            />
          ) : (
            <div data-anim="stagger" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {courses.map((course) => <CourseTile key={course.id} course={course} />)}
            </div>
          )}
        </div>
      </section>

      {/* ------------------------------------------------------ teachers --- */}
      <section data-anim="section" className="mx-auto max-w-7xl px-5 py-16 lg:px-8 lg:py-20">
        <SectionHead
          eyebrow={t("home.meetTeachers")}
          title={t("home.teacherTitle")}
          copy={t("home.teacherCopy")}
          action={<Link href="/teachers" className="ni-btn ni-btn--quiet text-sm">{t("home.meetAll")}</Link>}
        />
        {instructorState !== "ready" || instructors.length === 0 ? (
          <ResultState
            state={instructorState === "ready" ? "empty" : instructorState}
            message={instructorState === "ready" ? t("home.noTeachers") : resultError(instructorsQuery as never)}
            onRetry={() => instructorsQuery.refetch()}
            retrying={instructorsQuery.isFetching}
          />
        ) : (
          <div data-anim="stagger" className="grid gap-5 lg:grid-cols-3">
            {instructors.map((instructor) => (
              <InstructorCard key={instructor.public_slug} instructor={instructor} href={`/teachers/${instructor.public_slug}`} />
            ))}
          </div>
        )}
      </section>

      {/* ------------------------------------------------------ features --- */}
      <section data-anim="section" className="border-y border-[var(--ni-sage)] bg-[var(--ni-bg-lift)]">
        <div className="mx-auto max-w-7xl px-5 py-16 lg:px-8 lg:py-20">
          <SectionHead eyebrow={t("home.whyEyebrow")} title={t("home.pathTitle")} copy={t("home.pathCopy")} />
          <div data-anim="stagger" className="grid gap-5 md:grid-cols-3">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <Link
                  key={feature.titleKey}
                  href={feature.href}
                  className="ni-ed-card group p-6 outline-none focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]"
                >
                  <span className="inline-flex rounded-[9px] border border-[var(--ni-sage-line)] bg-[var(--ni-field)] p-2.5">
                    <Icon size={18} aria-hidden="true" className="ni-t-gold" />
                  </span>
                  <h3 className="mt-4 font-display text-lg ni-t-ink group-hover:underline">{t(feature.titleKey)}</h3>
                  <p className="mt-2.5 text-sm leading-7 ni-t-muted">{t(feature.copyKey)}</p>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* -------------------------------------------------- how it works --- */}
      <section data-anim="section" className="mx-auto max-w-7xl px-5 py-16 lg:px-8 lg:py-20">
        <SectionHead
          eyebrow={t("home.noorWay")}
          title={t("home.stepsTitle")}
          copy={t("home.stepsCopy")}
          action={<Link href="/how-it-works" className="ni-btn ni-btn--quiet text-sm">{t("home.seeHow")}</Link>}
        />
        {/* Numbered because these genuinely are a sequence — you cannot track
            progress before you have started learning. */}
        <ol data-anim="stagger" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <li key={step.titleKey} className="ni-ed-card p-5">
              <span aria-hidden="true" className="ni-label tabular-nums">{String(index + 1).padStart(2, "0")}</span>
              <h3 className="mt-3 font-display text-lg ni-t-ink">{t(step.titleKey)}</h3>
              <p className="mt-2 text-sm leading-7 ni-t-muted">{t(step.copyKey)}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* The two sections the header navigates to, rather than routing away. */}
      <AITutorSection />
      <HowItWorksSection />
      <ContactSection />
      <BlogSection />

      {/* ----------------------------------------------------------- cta --- */}
      <section data-anim="section" className="mx-auto max-w-7xl px-5 pb-20 lg:px-8 lg:pb-24">
        <div className="ni-ed-card relative overflow-hidden">
          <div aria-hidden="true" className="ni-stripe" />
          <div className="grid gap-6 p-7 sm:grid-cols-[1.4fr_.6fr] sm:items-center lg:p-10">
            <div className="min-w-0">
              <Eyebrow>{t("home.readiness")}</Eyebrow>
              <h2 className="mt-4 max-w-xl font-display text-[clamp(1.7rem,3vw,2.3rem)] leading-[1.15] ni-t-ink text-balance">{t("home.nextTitle")}</h2>
              <p className="mt-4 max-w-lg text-sm leading-7 ni-t-muted">{t("home.nextCopy")}</p>
            </div>
            <div className="flex flex-wrap gap-3 sm:justify-end">
              <Link href="/signup" className="ni-btn ni-btn--primary">
                <Sparkles size={15} aria-hidden="true" />
                {t("home.createAccount")}
              </Link>
              <Link href="/how-it-works" className="ni-btn ni-btn--outline">{t("home.seeHow")}</Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
