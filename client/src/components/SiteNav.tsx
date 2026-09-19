/**
 * The public site navigation.
 *
 * Six items, two of which open a panel. The panels are **disclosures**, not ARIA
 * menus: every child is a real link, and `role="menu"` would promise arrow-key
 * semantics that links do not have. A button with `aria-expanded` describing a
 * labelled list is the pattern that actually matches what is on screen.
 *
 * **Hover is an enhancement, never the only way in.** Opening on `pointerenter` is
 * guarded on `pointerType === "mouse"`, so a touch does not open and immediately
 * re-close the panel through the click that follows. Keyboard reaches the same
 * panel through focus and ArrowDown, and a tap toggles it.
 *
 * **Course categories are the real subject list, not an invented one.** They come from
 * `subjectOptions`, which re-exports the single `categories` list that the learner and
 * instructor profile forms already use — so what a learner can study is exactly what
 * they can browse. Subjects a published course carries that are not on that list are
 * appended, so nothing published is unreachable.
 *
 * The menu therefore names a subject before anyone has published a course in it. That
 * is deliberate: a learner looking for Fiqh should find the category and be told the
 * shelf is empty, rather than conclude Zufishan does not teach it. The menu itself
 * makes no claim about how full the catalogue is — picking a subject opens the courses
 * page, which lists only published courses and reports an empty result for itself.
 *
 * Nothing here writes, and no route is created for these links: every destination
 * already existed.
 *
 * **AI Tutor is an anchor, not a door.** It scrolls to an explanation on the homepage
 * rather than linking at the learner dashboard, so a logged-out visitor can read what
 * the tutor does without the navigation ever pointing at a private surface. Reaching
 * the tutor itself still goes through login and the existing learner role guard.
 *
 * **Blog is the opposite case.** It was an anchor while there was nothing to link to;
 * now that `/blog` exists and serves published articles to anyone, it is a plain link.
 * `BLOG_ID` is still exported because the homepage keeps a short preview section under
 * that anchor.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { ChevronDown } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { subjectOptions } from "../lib/reference-data";
import { useLocale } from "../contexts/LocaleContextState";

export type NavLink = { label: string; href: string };

/** Homepage sections the navigation scrolls to, rather than routing away to a page. */
export const AI_TUTOR_ID = "ai-tutor";
export const BLOG_ID = "blog";

/**
 * Scrolls to a homepage section, arriving on the homepage first when the reader is
 * somewhere else.
 *
 * The section cannot be scrolled to until the homepage has mounted, so after a route
 * change this waits for the element to exist rather than guessing at a delay. Focus
 * moves with the viewport, or the next Tab would resume from the header instead of
 * from the section the reader just asked for.
 */
export function useHomeSection() {
  const [location, setLocation] = useLocation();

  return useCallback((id: string) => {
    const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Polled on a timer rather than on animation frames: a browser that has the tab in
    // the background pauses rAF entirely, and the scroll would then never happen for
    // someone who clicked, switched away, and came back.
    const settle = (attempts: number) => {
      const target = document.getElementById(id);
      if (!target) {
        if (attempts > 0) window.setTimeout(() => settle(attempts - 1), 50);
        return;
      }
      target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
      target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
    };

    if (location === "/") settle(0);
    else { setLocation("/"); settle(60); }
  }, [location, setLocation]);
}

// `whitespace-nowrap` is load-bearing: "Our Courses" and "How it works" are two words,
// and without it a narrow header wraps each item onto a second line and doubles its height.
const triggerClass =
  // Colour and the gold underline come from `.site-header nav a, .site-header nav button`
// in index.css, so the buttons and the Blog link are styled by one rule. A Tailwind
// `hover:text-` utility here would lose to unlayered CSS and silently do nothing.
  "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-1 py-1 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]";

/**
 * One disclosure panel.
 *
 * `hidden` rather than conditional rendering: the panel keeps a stable id for
 * `aria-controls`, and `display:none` takes its links out of the tab order, so a
 * closed panel cannot be tabbed into.
 */
function Disclosure({ label, listLabel, children }: { label: string; listLabel: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const focusItem = (index: number) => {
    const items = wrap.current?.querySelectorAll<HTMLElement>("[data-nav-item]");
    if (!items?.length) return;
    items[(index + items.length) % items.length]?.focus();
  };

  return (
    <div
      ref={wrap}
      className="relative"
      // Mouse only: on a touch screen `pointerenter` fires with the tap, and the
      // click that follows would close what the tap had just opened.
      onPointerEnter={(event) => { if (event.pointerType === "mouse") setOpen(true); }}
      onPointerLeave={(event) => { if (event.pointerType === "mouse") setOpen(false); }}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false); }}
    >
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown") return;
          event.preventDefault();
          setOpen(true);
          window.setTimeout(() => focusItem(0), 0);
        }}
        className={triggerClass}
      >
        {label}
        <ChevronDown size={14} aria-hidden="true" className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      <div
        id={panelId}
        hidden={!open}
        // Flush against the trigger, with no margin: a gap is both further from the
        // item than it should sit and a dead zone that closes the panel on hover when
        // the pointer crosses it on the way down.
        //
        // `start-0` and the viewport-bounded width keep the panel on screen in both
        // directions, including when the page is mirrored for Urdu and Arabic.
        className="absolute start-0 top-full z-50 w-64 max-w-[calc(100vw-2rem)] overflow-hidden rounded-[1rem] border border-[var(--ni-sage)] bg-[var(--ni-paper)] p-2 shadow-[var(--ni-e3)]"
      >
        <ul aria-label={listLabel} className="max-h-[60vh] overflow-y-auto">
          {children}
        </ul>
      </div>
    </div>
  );
}

/** One link inside a panel. `data-nav-item` is what ArrowDown focuses. */
function PanelLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        data-nav-item=""
        className="block truncate rounded-[.6rem] px-3 py-2 text-sm ni-t-ink outline-none transition-colors hover:bg-[var(--ni-sage-soft)] focus-visible:bg-[var(--ni-sage-soft)] focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]"
      >
        {children}
      </Link>
    </li>
  );
}

/**
 * Every subject Zufishan teaches, for the Our Courses panel.
 *
 * The subject travels as a query parameter rather than through one of the fixed
 * `/courses/category/...` routes, because those name only eight subjects by hand
 * while this list is the whole curated set.
 *
 * The facet query is still made, but only to catch a published subject that is not on
 * the curated list — it does not decide which subjects appear, and the menu says
 * nothing about how full the catalogue is. A reader who picks a subject lands on the
 * courses page, which reports for itself whether anything is published there.
 */
function useCourseMenu(): NavLink[] {
  const facets = trpc.schedulingPublic.courseFacets.useQuery(undefined, { retry: false });
  const published = facets.data?.ok ? ((facets.data.data as { subjects: string[] }).subjects ?? []) : [];
  const extra = published.filter((subject) => !subjectOptions.includes(subject)).sort();
  return [...subjectOptions, ...extra].map((subject) => ({
    label: subject,
    href: `/courses?subject=${encodeURIComponent(subject)}`,
  }));
}

/** The desktop navigation. Hidden below `lg`, where the header opens the mobile list instead. */
export default function SiteNav() {
  const { t } = useLocale();
  const goToSection = useHomeSection();
  const categories = useCourseMenu();

  return (
    <nav aria-label={t("nav.coursesMenu")} className="hidden items-center gap-6 text-sm font-semibold lg:flex xl:gap-7">
      <Disclosure label={t("nav.ourCourses")} listLabel={t("nav.coursesMenu")}>
        {categories.map((item) => <PanelLink key={item.href} href={item.href}>{item.label}</PanelLink>)}
      </Disclosure>

      <Disclosure label={t("nav.findTeachers")} listLabel={t("nav.teachersMenu")}>
        <PanelLink href="/teachers/male">{t("nav.maleTeachers")}</PanelLink>
        <PanelLink href="/teachers/female">{t("nav.femaleTeachers")}</PanelLink>
      </Disclosure>

      {/* An anchor, not a route: the AI Tutor itself stays behind the learner dashboard. */}
      <button type="button" onClick={() => goToSection(AI_TUTOR_ID)} className={triggerClass}>
        {t("nav.aiTutor")}
      </button>

      {/* Real routes rather than homepage anchors, so they navigate instead of scrolling. Contact
          joined them when its homepage section was removed; FAQs was reachable only from the
          footer, which is why nobody could find it. */}
      <Link href="/contact-lms" className={triggerClass}>{t("nav.contact")}</Link>
      <Link href="/pricing" className={triggerClass}>{t("nav.pricing")}</Link>
      <Link href="/faqs" className={triggerClass}>{t("nav.faqs")}</Link>
      <Link href="/blog" className={triggerClass}>{t("nav.blog")}</Link>
    </nav>
  );
}

/**
 * The same items as the desktop rail, flattened for the mobile sheet.
 *
 * No hover and no floating panel: the sub-items are simply listed under their
 * heading, which is the behaviour a tap-driven menu wants.
 */
export function SiteNavMobile({ onNavigate }: { onNavigate: () => void }) {
  const { t } = useLocale();
  const goToSection = useHomeSection();
  const categories = useCourseMenu();

  const sub = "block ps-4 text-sm font-normal ni-t-muted";

  return (
    <div className="flex flex-col gap-4 text-sm font-semibold">
      <p className="ni-t-ink">{t("nav.ourCourses")}</p>
      {categories.map((item) => (
        <Link key={item.href} href={item.href} onClick={onNavigate} className={sub}>{item.label}</Link>
      ))}

      <p className="ni-t-ink">{t("nav.findTeachers")}</p>
      <Link href="/teachers/male" onClick={onNavigate} className={sub}>{t("nav.maleTeachers")}</Link>
      <Link href="/teachers/female" onClick={onNavigate} className={sub}>{t("nav.femaleTeachers")}</Link>

      <button
        type="button"
        onClick={() => { onNavigate(); goToSection(AI_TUTOR_ID); }}
        className="text-start ni-t-ink outline-none focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]"
      >
        {t("nav.aiTutor")}
      </button>

      <Link href="/contact-lms" onClick={onNavigate} className="ni-t-ink">{t("nav.contact")}</Link>
      <Link href="/faqs" onClick={onNavigate} className="ni-t-ink">{t("nav.faqs")}</Link>
      <Link href="/pricing" onClick={onNavigate} className="ni-t-ink">{t("nav.pricing")}</Link>
      <Link href="/blog" onClick={onNavigate} className="ni-t-ink">{t("nav.blog")}</Link>
    </div>
  );
}
