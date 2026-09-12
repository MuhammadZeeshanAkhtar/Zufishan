/**
 * The public blog: the listing at `/blog` and one article at `/blog/:slug`.
 *
 * **Only published articles can appear here, and that is not this file's doing.**
 * Both procedures read through the anon client, and `blog_articles` carries exactly
 * one policy — select where status is 'published'. A draft, unpublished or archived
 * slug returns the same "not available" as a slug that never existed, so nothing about
 * the drafts leaks through the public route.
 *
 * **Article text is rendered as text.** `paragraphsOf` splits on blank lines and each
 * paragraph goes through JSX, which escapes it. There is no `dangerouslySetInnerHTML`
 * anywhere in this file, so an article body cannot inject markup or script into a
 * reader's page however it was typed.
 *
 * Colour comes only from existing theme tokens, so light and dark follow the site.
 */
import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, ArrowRight, CalendarDays, FileText, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLocale } from "../contexts/LocaleContextState";
import { paragraphsOf } from "./AdminBlogExperience";

export type PublicArticle = {
  id: string; slug: string; title: string; excerpt: string; content: string;
  cover_url: string | null; category: string; lms_subject: string | null;
  tags: string[]; author_name: string | null; featured: boolean;
  seo_title: string | null; seo_description: string | null; published_at: string | null;
};

const dateOf = (value: string | null) => (value ? new Date(value).toLocaleDateString() : null);

const PAGE = 9;

function ArticleCard({ article }: { article: PublicArticle }) {
  const { t } = useLocale();
  const published = dateOf(article.published_at);
  return (
    <li>
      <Link
        href={`/blog/${article.slug}`}
        className="ni-ed-card group flex h-full flex-col p-5 outline-none focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]"
      >
        {article.cover_url && (
          <img src={article.cover_url} alt="" className="mb-4 h-32 w-full rounded-xl bg-[var(--ni-field)] object-contain" />
        )}
        <p className="ni-label">
          {article.category}{article.lms_subject ? ` · ${article.lms_subject}` : ""}
        </p>
        <h2 className="mt-2 font-display text-lg leading-snug ni-t-ink group-hover:underline">{article.title}</h2>
        {article.excerpt && <p className="mt-2 line-clamp-3 flex-1 text-sm leading-6 ni-t-muted">{article.excerpt}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--ni-sage)] pt-3.5">
          {published && (
            <span className="inline-flex items-center gap-1 text-xs ni-t-muted-soft">
              <CalendarDays size={12} aria-hidden="true" />{published}
            </span>
          )}
          {article.author_name && <span className="text-xs ni-t-muted-soft">{article.author_name}</span>}
          <span className="ms-auto inline-flex items-center gap-1 text-xs font-bold ni-link">
            {t("blog.readArticle")} <ArrowRight size={13} aria-hidden="true" className="rtl:-scale-x-100" />
          </span>
        </div>
      </Link>
    </li>
  );
}

export default function BlogListingPage() {
  const { t } = useLocale();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [subject, setSubject] = useState("");
  const [limit, setLimit] = useState(PAGE);

  const query = trpc.schedulingPublic.blogArticles.useQuery(
    { search: search || undefined, category: category || undefined, subject: subject || undefined, limit },
    { retry: false },
  );
  // Topics with a published article behind them, so a filter is never a dead end.
  const facets = trpc.schedulingPublic.blogFacets.useQuery(undefined, { retry: false });

  const articles: PublicArticle[] = query.data?.ok ? (query.data.data.articles as PublicArticle[]) : [];
  const total = query.data?.ok ? query.data.data.total : 0;
  const categories = facets.data?.ok ? facets.data.data.categories : [];
  const subjects = facets.data?.ok ? facets.data.data.subjects : [];
  const filtering = Boolean(search || category || subject);

  const control = "rounded-xl border border-[var(--ni-sage-line)] bg-[var(--ni-field)] px-3 py-2 text-sm ni-t-ink outline-none focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]";

  return (
    <main className="mx-auto max-w-7xl px-5 py-12 lg:px-8 lg:py-16">
      <h1 className="max-w-2xl font-display text-[clamp(1.9rem,3.4vw,2.7rem)] leading-[1.12] ni-t-ink text-balance">
        {t("blog.title")}
      </h1>
      <p className="mt-4 max-w-2xl text-[1.02rem] leading-8 ni-t-muted">{t("blog.intro")}</p>

      {(categories.length > 0 || subjects.length > 0) && (
        <div className="mt-8 flex flex-wrap gap-3">
          <input
            value={search}
            onChange={(event) => { setSearch(event.target.value); setLimit(PAGE); }}
            placeholder={t("blog.searchPlaceholder")}
            aria-label={t("blog.searchPlaceholder")}
            className={`min-w-[14rem] flex-1 ${control}`}
          />
          {categories.length > 0 && (
            <select aria-label={t("blog.allTopics")} value={category} onChange={(event) => { setCategory(event.target.value); setLimit(PAGE); }} className={control}>
              <option value="">{t("blog.allTopics")}</option>
              {categories.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          )}
          {subjects.length > 0 && (
            <select aria-label={t("blog.allSubjects")} value={subject} onChange={(event) => { setSubject(event.target.value); setLimit(PAGE); }} className={control}>
              <option value="">{t("blog.allSubjects")}</option>
              {subjects.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          )}
        </div>
      )}

      {query.isLoading && (
        <p role="status" className="mt-10 flex items-center gap-2 text-sm ni-t-muted">
          <Loader2 size={16} className="animate-spin" aria-hidden="true" /> {t("common.loading")}
        </p>
      )}

      {!query.isLoading && articles.length === 0 && (
        <div className="mt-10 flex items-center gap-3 rounded-[1rem] border border-dashed border-[var(--ni-sage-line)] bg-[var(--ni-field)] px-5 py-6">
          <FileText size={18} className="ni-t-muted-soft" aria-hidden="true" />
          <p className="text-sm ni-t-muted">{filtering ? t("marketplace.noMatches") : t("blog.empty")}</p>
        </div>
      )}

      {articles.length > 0 && (
        <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((article) => <ArticleCard key={article.id} article={article} />)}
        </ul>
      )}

      {articles.length < total && (
        <div className="mt-8 flex justify-center">
          <button type="button" onClick={() => setLimit((current) => current + PAGE)} className="ni-btn ni-btn--outline">
            {t("blog.loadMore")}
          </button>
        </div>
      )}
    </main>
  );
}

export function BlogArticlePage({ slug }: { slug: string }) {
  const { t } = useLocale();
  const query = trpc.schedulingPublic.blogArticle.useQuery({ slug }, { retry: false });

  const article: PublicArticle | null = query.data?.ok ? (query.data.data as PublicArticle) : null;
  const published = dateOf(article?.published_at ?? null);

  const back = (
    <Link href="/blog" className="inline-flex items-center gap-1.5 text-sm font-bold ni-link outline-none focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]">
      <ArrowLeft size={14} aria-hidden="true" className="rtl:-scale-x-100" /> {t("blog.backToBlog")}
    </Link>
  );

  if (query.isLoading) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-16 lg:px-8">
        <p role="status" className="flex items-center gap-2 text-sm ni-t-muted">
          <Loader2 size={16} className="animate-spin" aria-hidden="true" /> {t("common.loading")}
        </p>
      </main>
    );
  }

  // A draft, unpublished, archived or deleted slug lands here, identically to a
  // slug that never existed. Nothing distinguishes the two for a public reader.
  if (!article) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-16 lg:px-8">
        <h1 className="font-display text-3xl ni-t-ink">{t("blog.notFound")}</h1>
        <div className="mt-6">{back}</div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-12 lg:px-8 lg:py-16">
      {back}
      <p className="ni-label mt-6">
        {article.category}{article.lms_subject ? ` · ${article.lms_subject}` : ""}
      </p>
      <h1 className="mt-3 font-display text-[clamp(1.8rem,3.2vw,2.5rem)] leading-[1.14] ni-t-ink text-balance">{article.title}</h1>

      <p className="mt-3 flex flex-wrap items-center gap-3 text-xs ni-t-muted-soft">
        {published && <span className="inline-flex items-center gap-1"><CalendarDays size={12} aria-hidden="true" />{published}</span>}
        {article.author_name && <span>{article.author_name}</span>}
      </p>

      {article.cover_url && (
        <img src={article.cover_url} alt="" className="mt-7 h-56 w-full rounded-2xl bg-[var(--ni-field)] object-contain" />
      )}

      {article.excerpt && <p className="mt-7 text-[1.02rem] leading-8 ni-t-muted">{article.excerpt}</p>}

      {/* Escaped by JSX. No HTML from an article ever reaches the DOM as markup. */}
      <div className="mt-6 space-y-4">
        {paragraphsOf(article.content).map((paragraph, index) => (
          <p key={index} className="text-[1.02rem] leading-8 ni-t-ink">{paragraph}</p>
        ))}
      </div>

      {article.tags.length > 0 && (
        <ul className="mt-8 flex flex-wrap gap-2 border-t border-[var(--ni-sage)] pt-5">
          {article.tags.map((tag) => (
            <li key={tag} className="rounded-full bg-[var(--ni-sage-soft)] px-3 py-1 text-xs font-semibold ni-t-moss-deep">{tag}</li>
          ))}
        </ul>
      )}

      <div className="mt-8">{back}</div>
    </main>
  );
}
