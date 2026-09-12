/**
 * Blog Management, inside the existing admin desk.
 *
 * This is a module of the desk that is already there: it renders inside `AdminShell`
 * like Instructors and Courses do, behind the same `AdminProtectedRoute`, and every
 * call it makes goes to a procedure that runs `requireAdmin` server-side. Hiding the
 * nav item from a learner is presentation; the refusal happens in the procedure and,
 * for writes, in the database — `blog_articles` has no insert, update or delete
 * policy at all, so the anon key cannot write there whoever is holding it.
 *
 * **Article content is rendered as text, never as HTML.** The preview and the public
 * page both split on blank lines and emit paragraphs, so an article body cannot carry
 * script or markup into anyone's page. There is no `dangerouslySetInnerHTML` here.
 *
 * **Covers are chosen, not uploaded.** All four storage buckets are private and serve
 * signed URLs that expire, so there is nowhere to put an image an anonymous reader
 * could load. Rather than invent a public URL, the cover is one of the site's own
 * approved assets; the server refuses anything that is not a site-relative image path.
 */
import { useState } from "react";
import {
  Archive, Check, Eye, FileText, Loader2, Pencil, Plus, RotateCcw, Send, Trash2, Undo2, X,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLocale } from "../contexts/LocaleContextState";
import AdminShell from "./AdminShell";
import { subjectOptions } from "../lib/reference-data";
import type { TranslationKey } from "@/i18n/catalog";

/** Mirrors `BLOG_CATEGORIES` in `server/blog.ts`. Topics, deliberately not course subjects. */
const CATEGORIES = [
  "Quran Learning", "Tajweed", "Hifz", "Arabic",
  "Islamic Studies", "AI Tutor and Learning Support", "Teaching Guidance", "LMS Updates",
] as const;

const STATUSES = ["draft", "published", "unpublished", "archived"] as const;
type Status = (typeof STATUSES)[number];

/** The site's approved assets. No upload path exists, so this is the whole list. */
const COVERS = [
  "/brand/hero-geometry.svg",
  "/brand/course-geometry.svg",
  "/brand/tutor-geometry.svg",
  "/brand/noor-ilm-mark.svg",
] as const;

type Article = {
  id: string; slug: string; title: string; excerpt: string; content: string;
  cover_url: string | null; category: string; lms_subject: string | null; tags: string[];
  author_name: string | null; featured: boolean; seo_title: string | null;
  seo_description: string | null; published_at: string | null;
  status: Status; created_at: string; updated_at: string;
};

const panel = "rounded-2xl border border-[var(--ni-sage)] bg-[var(--ni-paper)] p-5";
const input = "mt-1.5 w-full rounded-xl border border-[var(--ni-sage-line)] bg-[var(--ni-field)] px-3 py-2 text-sm ni-t-ink outline-none focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]";
const label = "block text-sm font-semibold ni-t-ink";

const dateOf = (value: string | null) => (value ? new Date(value).toLocaleDateString() : null);

/** Blank-line-separated paragraphs. The only transformation applied to article text. */
export function paragraphsOf(content: string): string[] {
  return content.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
}

function StatusBadge({ status }: { status: Status }) {
  const { t } = useLocale();
  const tone: Record<Status, string> = {
    published: "bg-[var(--ni-sage-soft)] ni-t-moss-deep",
    draft: "bg-[var(--ni-field)] ni-t-muted",
    unpublished: "bg-[var(--ni-gold-soft)] ni-t-gold-ink",
    archived: "bg-[var(--ni-field)] ni-t-muted-soft",
  };
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-bold ${tone[status]}`}>
      {t(`blogAdmin.status.${status}` as TranslationKey)}
    </span>
  );
}

/* ------------------------------------------------------------------- preview */

function Preview({ draft, onClose }: { draft: FormState; onClose: () => void }) {
  const { t } = useLocale();
  return (
    <div className={`${panel} mt-4`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[.14em] ni-t-gold">{t("blogAdmin.previewTitle")}</p>
        <button type="button" onClick={onClose} className="rounded-full p-1 ni-t-muted outline-none focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]" aria-label={t("blogAdmin.cancel")}>
          <X size={16} />
        </button>
      </div>
      {draft.coverUrl && <img src={draft.coverUrl} alt="" className="mt-4 h-40 w-full rounded-xl object-contain bg-[var(--ni-field)]" />}
      <p className="mt-4 text-xs font-bold uppercase tracking-[.14em] ni-t-gold">{draft.category}</p>
      <h3 className="mt-2 font-display text-2xl ni-t-ink">{draft.title || "—"}</h3>
      {draft.excerpt && <p className="mt-2 text-sm leading-6 ni-t-muted">{draft.excerpt}</p>}
      <div className="mt-4 space-y-3">
        {paragraphsOf(draft.content).map((paragraph, index) => (
          <p key={index} className="text-sm leading-7 ni-t-ink">{paragraph}</p>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- form */

type FormState = {
  id?: string; title: string; slug: string; excerpt: string; content: string;
  coverUrl: string; category: string; lmsSubject: string; tags: string;
  authorName: string; featured: boolean; seoTitle: string; seoDescription: string;
};

const EMPTY: FormState = {
  title: "", slug: "", excerpt: "", content: "", coverUrl: "", category: CATEGORIES[0],
  lmsSubject: "", tags: "", authorName: "", featured: false, seoTitle: "", seoDescription: "",
};

const formFrom = (article: Article): FormState => ({
  id: article.id, title: article.title, slug: article.slug, excerpt: article.excerpt,
  content: article.content, coverUrl: article.cover_url ?? "", category: article.category,
  lmsSubject: article.lms_subject ?? "", tags: article.tags.join(", "),
  authorName: article.author_name ?? "", featured: article.featured,
  seoTitle: article.seo_title ?? "", seoDescription: article.seo_description ?? "",
});

/** Mirrors the server's `normaliseSlug`, so the address shown matches the one stored. */
const slugify = (value: string) =>
  value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);

function ArticleForm({ initial, onDone }: { initial: FormState; onDone: () => void }) {
  const { t } = useLocale();
  const utils = trpc.useUtils();
  const [draft, setDraft] = useState<FormState>(initial);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const save = trpc.admin.saveBlogArticle.useMutation({
    onSuccess: (result) => {
      if (!result.ok) { setError(result.error); return; }
      setError(""); setSaved(true);
      utils.admin.blogArticles.invalidate();
      // The id arrives on first save, so a second save updates rather than duplicating.
      setDraft((current) => ({ ...current, id: result.data.id }));
    },
    onError: () => setError(t("common.error")),
  });

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setSaved(false);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.title.trim()) { setError(t("blogAdmin.fTitle")); return; }
    save.mutate({
      id: draft.id,
      title: draft.title.trim(),
      slug: slugify(draft.slug || draft.title),
      excerpt: draft.excerpt.trim(),
      content: draft.content,
      coverUrl: draft.coverUrl || undefined,
      category: draft.category as (typeof CATEGORIES)[number],
      lmsSubject: draft.lmsSubject || undefined,
      tags: draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 10),
      authorName: draft.authorName.trim() || undefined,
      featured: draft.featured,
      seoTitle: draft.seoTitle.trim() || undefined,
      seoDescription: draft.seoDescription.trim() || undefined,
    });
  };

  const publicPath = `/blog/${slugify(draft.slug || draft.title) || "…"}`;

  return (
    <form onSubmit={submit} className={panel}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>{t("blogAdmin.fTitle")}
          <input required value={draft.title} onChange={(e) => set("title", e.target.value)} className={input} />
        </label>
        <label className={label}>{t("blogAdmin.fSlug")}
          <input value={draft.slug} onChange={(e) => set("slug", e.target.value)} placeholder={slugify(draft.title)} className={input} />
          <span className="mt-1 block text-xs ni-t-muted-soft">{t("blogAdmin.publicUrl")}: {publicPath}</span>
        </label>
      </div>

      <label className={`${label} mt-4`}>{t("blogAdmin.fExcerpt")}
        <textarea rows={2} value={draft.excerpt} onChange={(e) => set("excerpt", e.target.value)} className={input} />
      </label>

      <label className={`${label} mt-4`}>{t("blogAdmin.fContent")}
        <textarea rows={10} value={draft.content} onChange={(e) => set("content", e.target.value)} className={input} />
        <span className="mt-1 block text-xs ni-t-muted-soft">{t("blogAdmin.fContentHelp")}</span>
      </label>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className={label}>{t("blogAdmin.fCategory")}
          <select value={draft.category} onChange={(e) => set("category", e.target.value)} className={input}>
            {CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
        </label>
        <label className={label}>{t("blogAdmin.fSubject")}
          <select value={draft.lmsSubject} onChange={(e) => set("lmsSubject", e.target.value)} className={input}>
            <option value="">{t("blogAdmin.fSubjectNone")}</option>
            {subjectOptions.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
          </select>
        </label>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className={label}>{t("blogAdmin.fCover")}
          <select value={draft.coverUrl} onChange={(e) => set("coverUrl", e.target.value)} className={input}>
            <option value="">{t("blogAdmin.fCoverNone")}</option>
            {COVERS.map((cover) => <option key={cover} value={cover}>{cover.split("/").pop()}</option>)}
          </select>
          <span className="mt-1 block text-xs ni-t-muted-soft">{t("blogAdmin.fCoverHelp")}</span>
        </label>
        <label className={label}>{t("blogAdmin.fAuthor")}
          <input value={draft.authorName} onChange={(e) => set("authorName", e.target.value)} className={input} />
        </label>
      </div>

      <label className={`${label} mt-4`}>{t("blogAdmin.fTags")}
        <input value={draft.tags} onChange={(e) => set("tags", e.target.value)} className={input} />
        <span className="mt-1 block text-xs ni-t-muted-soft">{t("blogAdmin.fTagsHelp")}</span>
      </label>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className={label}>{t("blogAdmin.fSeoTitle")}
          <input value={draft.seoTitle} onChange={(e) => set("seoTitle", e.target.value)} className={input} />
        </label>
        <label className={label}>{t("blogAdmin.fSeoDescription")}
          <input value={draft.seoDescription} onChange={(e) => set("seoDescription", e.target.value)} className={input} />
        </label>
      </div>

      <label className="mt-4 flex items-center gap-2.5 text-sm ni-t-ink">
        <input type="checkbox" checked={draft.featured} onChange={(e) => set("featured", e.target.checked)} />
        {t("blogAdmin.fFeatured")}
      </label>

      {error && <p role="alert" className="mt-4 text-sm ni-t-clay">{error}</p>}
      {saved && <p role="status" className="mt-4 flex items-center gap-2 text-sm font-semibold ni-t-moss"><Check size={16} /> {t("blogAdmin.saved")}</p>}

      <div className="mt-5 flex flex-wrap gap-3">
        <button type="submit" disabled={save.isPending} className="ni-btn ni-btn--primary">
          {save.isPending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} {t("blogAdmin.save")}
        </button>
        <button type="button" onClick={() => setPreviewing((current) => !current)} className="ni-btn ni-btn--outline">
          <Eye size={15} /> {t("blogAdmin.preview")}
        </button>
        <button type="button" onClick={onDone} className="ni-btn ni-btn--quiet">{t("blogAdmin.cancel")}</button>
      </div>

      {previewing && <Preview draft={draft} onClose={() => setPreviewing(false)} />}
    </form>
  );
}

/* ---------------------------------------------------------------------- list */

function DeleteDialog({ article, onCancel, onConfirm, pending }: {
  article: Article; onCancel: () => void; onConfirm: () => void; pending: boolean;
}) {
  const { t } = useLocale();
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="blog-delete-title" className="mt-3 rounded-xl border border-[var(--ni-gold-border)] bg-[var(--ni-gold-soft)] p-4">
      <p id="blog-delete-title" className="text-sm font-bold ni-t-gold-ink">{t("blogAdmin.deleteTitle")}</p>
      <p className="mt-1.5 text-xs leading-5 ni-t-gold-ink">{t("blogAdmin.deleteCopy")}</p>
      <p className="mt-2 text-xs font-semibold ni-t-gold-ink">/blog/{article.slug}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={onConfirm} disabled={pending} className="ni-btn ni-btn--primary">
          {pending ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />} {t("blogAdmin.deleteConfirm")}
        </button>
        <button type="button" onClick={onCancel} className="ni-btn ni-btn--quiet">{t("blogAdmin.cancel")}</button>
      </div>
    </div>
  );
}

function Row({ article, onEdit }: { article: Article; onEdit: (article: Article) => void }) {
  const { t } = useLocale();
  const utils = trpc.useUtils();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");

  const refresh = () => utils.admin.blogArticles.invalidate();
  const status = trpc.admin.setBlogArticleStatus.useMutation({
    onSuccess: (result) => { if (!result.ok) setError(result.error); else { setError(""); refresh(); } },
    onError: () => setError(t("common.error")),
  });
  const remove = trpc.admin.deleteBlogArticle.useMutation({
    onSuccess: (result) => { if (!result.ok) setError(result.error); else { setConfirming(false); refresh(); } },
    onError: () => setError(t("common.error")),
  });

  const act = (action: "publish" | "unpublish" | "archive" | "restore") => status.mutate({ id: article.id, action });
  const busy = status.isPending || remove.isPending;

  return (
    <article className={`${panel} mb-3`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[.14em] ni-t-gold">
            {article.category}{article.lms_subject ? ` · ${article.lms_subject}` : ""}
          </p>
          <h2 className="mt-1.5 font-display text-xl ni-t-ink">{article.title}</h2>
          <p className="mt-1 text-xs ni-t-muted-soft">/blog/{article.slug}</p>
        </div>
        <StatusBadge status={article.status} />
      </div>

      {article.excerpt && <p className="mt-3 line-clamp-2 text-sm leading-6 ni-t-muted">{article.excerpt}</p>}

      <p className="mt-3 text-xs ni-t-muted-soft">
        {t("blogAdmin.created")}: {dateOf(article.created_at)} · {t("blogAdmin.updated")}: {dateOf(article.updated_at)} ·{" "}
        {t("blogAdmin.publishedOn")}: {dateOf(article.published_at) ?? t("blogAdmin.notPublished")}
        {article.author_name ? ` · ${article.author_name}` : ""}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => onEdit(article)} className="ni-btn ni-btn--outline"><Pencil size={14} /> {t("blogAdmin.edit")}</button>
        {article.status !== "published" && (
          <button type="button" disabled={busy} onClick={() => act("publish")} className="ni-btn ni-btn--primary"><Send size={14} /> {t("blogAdmin.publish")}</button>
        )}
        {article.status === "published" && (
          <button type="button" disabled={busy} onClick={() => act("unpublish")} className="ni-btn ni-btn--outline"><Undo2 size={14} /> {t("blogAdmin.unpublish")}</button>
        )}
        {article.status !== "archived" && (
          <button type="button" disabled={busy} onClick={() => act("archive")} className="ni-btn ni-btn--quiet"><Archive size={14} /> {t("blogAdmin.archive")}</button>
        )}
        {article.status === "archived" && (
          <button type="button" disabled={busy} onClick={() => act("restore")} className="ni-btn ni-btn--outline"><RotateCcw size={14} /> {t("blogAdmin.restore")}</button>
        )}
        <button type="button" disabled={busy} onClick={() => setConfirming(true)} className="ni-btn ni-btn--quiet"><Trash2 size={14} /> {t("blogAdmin.delete")}</button>
      </div>

      {error && <p role="alert" className="mt-3 text-sm ni-t-clay">{error}</p>}
      {confirming && (
        <DeleteDialog article={article} pending={remove.isPending} onCancel={() => setConfirming(false)} onConfirm={() => remove.mutate({ id: article.id })} />
      )}
    </article>
  );
}

export default function AdminBlogPage() {
  const { t } = useLocale();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");
  const [category, setCategory] = useState("");
  const [subject, setSubject] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest" | "updated">("newest");
  const [editing, setEditing] = useState<FormState | null>(null);

  const query = trpc.admin.blogArticles.useQuery(
    { search: search || undefined, status: statusFilter, category: category || undefined, subject: subject || undefined, sort },
    { retry: false },
  );

  const rows: Article[] = query.data?.ok ? (query.data.data.rows as Article[]) : [];
  const failure = query.data && !query.data.ok ? query.data.error : "";

  return (
    // The desk's own shell: same sidebar, breadcrumb and header every other module uses.
    <AdminShell
      activeKey="blog"
      eyebrow={t("adminDesk.nav.blog")}
      title={t("blogAdmin.title")}
      copy={t("blogAdmin.copy")}
      actions={editing ? undefined : (
        <button type="button" onClick={() => setEditing({ ...EMPTY })} className="ni-btn ni-btn--primary">
          <Plus size={15} /> {t("blogAdmin.new")}
        </button>
      )}
    >
      {editing && <div className="mb-6"><ArticleForm initial={editing} onDone={() => setEditing(null)} /></div>}

      <div className="flex flex-wrap gap-3">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("blogAdmin.searchPlaceholder")}
          aria-label={t("blogAdmin.searchPlaceholder")}
          className="min-w-[14rem] flex-1 rounded-xl border border-[var(--ni-sage-line)] bg-[var(--ni-field)] px-3 py-2 text-sm ni-t-ink outline-none focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]"
        />
        <select aria-label={t("blogAdmin.allStatuses")} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | Status)} className="rounded-xl border border-[var(--ni-sage-line)] bg-[var(--ni-field)] px-3 py-2 text-sm ni-t-ink">
          <option value="all">{t("blogAdmin.allStatuses")}</option>
          {STATUSES.map((value) => <option key={value} value={value}>{t(`blogAdmin.status.${value}` as TranslationKey)}</option>)}
        </select>
        <select aria-label={t("blogAdmin.allCategories")} value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-xl border border-[var(--ni-sage-line)] bg-[var(--ni-field)] px-3 py-2 text-sm ni-t-ink">
          <option value="">{t("blogAdmin.allCategories")}</option>
          {CATEGORIES.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select aria-label={t("blogAdmin.allSubjects")} value={subject} onChange={(event) => setSubject(event.target.value)} className="rounded-xl border border-[var(--ni-sage-line)] bg-[var(--ni-field)] px-3 py-2 text-sm ni-t-ink">
          <option value="">{t("blogAdmin.allSubjects")}</option>
          {subjectOptions.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select aria-label={t("blogAdmin.sortNewest")} value={sort} onChange={(event) => setSort(event.target.value as "newest" | "oldest" | "updated")} className="rounded-xl border border-[var(--ni-sage-line)] bg-[var(--ni-field)] px-3 py-2 text-sm ni-t-ink">
          <option value="newest">{t("blogAdmin.sortNewest")}</option>
          <option value="oldest">{t("blogAdmin.sortOldest")}</option>
          <option value="updated">{t("blogAdmin.sortUpdated")}</option>
        </select>
      </div>

      <div className="mt-6">
        {query.isLoading && (
          <p role="status" className="flex items-center gap-2 text-sm ni-t-muted"><Loader2 size={16} className="animate-spin" /> {t("common.loading")}</p>
        )}
        {failure && <p role="alert" className="text-sm ni-t-clay">{failure}</p>}
        {!query.isLoading && !failure && rows.length === 0 && (
          <div className="flex items-center gap-3 rounded-[1rem] border border-dashed border-[var(--ni-sage-line)] bg-[var(--ni-field)] px-5 py-6">
            <FileText size={18} className="ni-t-muted-soft" aria-hidden="true" />
            <p className="text-sm ni-t-muted">{search || statusFilter !== "all" || category || subject ? t("blogAdmin.noMatches") : t("blogAdmin.empty")}</p>
          </div>
        )}
        {rows.map((article) => <Row key={article.id} article={article} onEdit={(current) => setEditing(formFrom(current))} />)}
      </div>
    </AdminShell>
  );
}
