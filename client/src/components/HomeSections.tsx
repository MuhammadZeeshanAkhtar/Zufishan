/**
 * The homepage sections below the fold: AI Tutor, How it works, Contact and a short
 * Blog preview.
 *
 * The first three are anchors the navigation scrolls to, so the reader stays on the
 * page they were already reading; `scroll-mt` keeps each heading clear of the sticky
 * header. Blog keeps its anchor but the navigation now links to `/blog`, which is a
 * real page — this section is a three-article preview of it.
 *
 * Contact still describes something Zufishan does not have, and says so rather than
 * filling the space. See it for why.
 *
 * **The contact form does not claim to send anything.** Zufishan has no contact table,
 * no support procedure and no mail service — nothing in the schema or the router could
 * deliver a message. The form therefore validates properly, and then says plainly that
 * delivery is not configured, rather than showing a success state for a message that
 * went nowhere. Nothing is posted, nothing is stored, and no address or key is embedded
 * here. When a contact endpoint exists, `submit` is the one place that has to change.
 *
 * Colour comes only from theme tokens, so light, dark and system all follow the existing
 * provider without this file knowing which is active.
 */
import { Link } from "wouter";
import { BookMarked, BookOpen, Gauge, Languages, MessageCircle, Newspaper, ShieldCheck, Sparkles } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "../contexts/AuthContext";
import { useLocale } from "../contexts/LocaleContextState";
import { AI_TUTOR_ID, BLOG_ID } from "./SiteNav";
import type { PublicArticle } from "./BlogExperience";
import type { TranslationKey } from "../i18n/catalog";

/** A real sequence, so it is numbered: each step only makes sense after the one before. */
/** The existing learner AI Tutor. This section explains it; it does not embed it. */
const AI_TUTOR_ROUTE = "/dashboard/learner/ai-tutor";

/**
 * What the tutor actually does, in the order a learner meets it.
 *
 * Every line is checkable against `server/ai-tutor.ts` and `shared/ai-tutor.ts` — the
 * language lists, the `lesson` practice mode, and the pacing controls all exist. The
 * Quran line is the one that needed care: the system prompt disclaims being a Quran
 * authority and `classifyTutorRequest` refuses religious rulings outright, so the copy
 * promises the Arabic that Quran study rests on and says what the tutor will not do.
 */
const TUTOR_FACILITIES: Array<{ icon: typeof MessageCircle; titleKey: TranslationKey; copyKey: TranslationKey }> = [
  { icon: MessageCircle, titleKey: "aiTutor.f1", copyKey: "aiTutor.f1Copy" },
  { icon: Languages, titleKey: "aiTutor.f2", copyKey: "aiTutor.f2Copy" },
  { icon: BookOpen, titleKey: "aiTutor.f3", copyKey: "aiTutor.f3Copy" },
  { icon: BookMarked, titleKey: "aiTutor.f4", copyKey: "aiTutor.f4Copy" },
  { icon: Gauge, titleKey: "aiTutor.f5", copyKey: "aiTutor.f5Copy" },
];

export function AITutorSection() {
  const { t } = useLocale();
  const { currentSession, isLoading, roleResolved } = useAuth();

  /**
   * Where "Start learning" goes, decided by the session that already exists.
   *
   * No new authorisation: every branch lands on a surface that keeps its own guard.
   * A logged-out visitor is sent to signup carrying the tutor as `returnTo`, which
   * `AuthExperience` sanitises through `isSafeInternalReturn` and which opens on the
   * learner card. An instructor or admin goes to their own desk rather than being
   * bounced off a learner route they have no claim to — the same destination
   * `ProtectedRoute` would pick. While the session is still resolving the link points
   * at the guarded route itself, so the guard decides rather than this component
   * guessing from an unsettled state.
   */
  const startHref =
    isLoading || !roleResolved ? AI_TUTOR_ROUTE
    : !currentSession ? `/signup?returnTo=${encodeURIComponent(AI_TUTOR_ROUTE)}`
    : currentSession.role === "learner" ? AI_TUTOR_ROUTE
    : currentSession.role ? `/dashboard/${currentSession.role}`
    : AI_TUTOR_ROUTE;

  return (
    <section
      id={AI_TUTOR_ID}
      data-anim="section"
      aria-labelledby="ai-tutor-title"
      className="scroll-mt-24 border-t border-[var(--ni-sage)]"
    >
      <div className="mx-auto max-w-7xl px-5 py-14 lg:px-8 lg:py-16">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="min-w-0 max-w-2xl">
            <h2 id="ai-tutor-title" className="font-display text-[clamp(1.6rem,2.8vw,2.2rem)] leading-[1.15] ni-t-ink text-balance">
              {t("aiTutor.title")}
            </h2>
            <p className="mt-3 text-sm leading-7 ni-t-muted">{t("aiTutor.intro")}</p>
          </div>
          <Link href={startHref} className="ni-btn ni-btn--primary">
            <Sparkles size={15} aria-hidden="true" />
            {t("aiTutor.start")}
          </Link>
        </div>

        {/* Five facilities and the disclaimer fill a 3x2 grid, so no cell sits empty. */}
        <ul className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TUTOR_FACILITIES.map(({ icon: Icon, titleKey, copyKey }) => (
            <li key={titleKey} className="ni-ed-card h-full p-5">
              <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--ni-sage-soft)]">
                <Icon size={17} className="ni-t-moss" />
              </span>
              <p className="ni-works__step-title mt-3">{t(titleKey)}</p>
              <p className="ni-works__step-copy mt-1.5">{t(copyKey)}</p>
            </li>
          ))}
          <li className="ni-ed-card h-full border-[var(--ni-gold-border)] bg-[var(--ni-gold-soft)] p-5">
            <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--ni-paper)]">
              <ShieldCheck size={17} className="ni-t-gold-ink" />
            </span>
            <p className="mt-3 text-xs leading-5 ni-t-gold-ink">{t("aiTutor.disclaimer")}</p>
          </li>
        </ul>
      </div>
    </section>
  );
}

/**
 * The homepage blog preview: the three most recent published articles.
 *
 * It reads the same public procedure `/blog` uses, so it can only ever show what the
 * blog itself shows — published rows, under the table's one RLS policy. Nothing here
 * is written by hand, so an empty blog produces the empty state rather than filler.
 *
 * "View all articles" appears only when there is a published article to view; before
 * that it would point at a listing the reader would find empty.
 */
export function BlogSection() {
  const { t } = useLocale();
  const query = trpc.schedulingPublic.blogArticles.useQuery({ limit: 3 }, { retry: false });
  const articles = query.data?.ok ? (query.data.data.articles as PublicArticle[]) : [];

  return (
    <section
      id={BLOG_ID}
      data-anim="section"
      aria-labelledby="blog-title"
      className="scroll-mt-24 border-t border-[var(--ni-sage)]"
    >
      <div className="mx-auto max-w-7xl px-5 py-14 lg:px-8 lg:py-16">
        <h2 id="blog-title" className="max-w-2xl font-display text-[clamp(1.6rem,2.8vw,2.2rem)] leading-[1.15] ni-t-ink text-balance">
          {t("blog.title")}
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-7 ni-t-muted">{t("blog.intro")}</p>

        {articles.length === 0 ? (
          /* Dashed rather than solid: this is a space waiting for content, not a card. */
          <div className="mt-7 flex items-center gap-3 rounded-[1rem] border border-dashed border-[var(--ni-sage-line)] bg-[var(--ni-field)] px-5 py-6">
            <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--ni-sage-soft)]">
              <Newspaper size={17} className="ni-t-moss" />
            </span>
            <p className="text-sm leading-6 ni-t-muted">{t("blog.empty")}</p>
          </div>
        ) : (
          <>
            <ul className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {articles.map((article) => (
                <li key={article.id}>
                  <Link
                    href={`/blog/${article.slug}`}
                    className="ni-ed-card group flex h-full flex-col p-5 outline-none focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]"
                  >
                    <p className="ni-label">{article.category}</p>
                    <h3 className="mt-2 font-display text-base leading-snug ni-t-ink group-hover:underline">{article.title}</h3>
                    {article.excerpt && <p className="mt-2 line-clamp-3 flex-1 text-sm leading-6 ni-t-muted">{article.excerpt}</p>}
                    <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold ni-link">{t("blog.readArticle")}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <Link href="/blog" className="ni-btn ni-btn--outline mt-6">{t("blog.viewAll")}</Link>
          </>
        )}
      </div>
    </section>
  );
}
