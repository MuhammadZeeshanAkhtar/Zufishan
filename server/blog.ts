/**
 * The blog: administration and public reading, in one module.
 *
 * **Two clients, and that is the whole authorisation story.** Every admin function
 * goes through `requireAdmin`, which checks the caller's roles and only then hands
 * back the service-role client — the same gate `admin-courses` and `admin-users`
 * already use. Every public function uses the anon client, under which
 * `blog_articles` exposes exactly one policy: select where status is 'published'.
 *
 * So a draft is not hidden by a `.eq()` that a future edit might drop; it is refused
 * by the database. The public functions still filter by status, but that filter is a
 * second lock, not the only one.
 *
 * **Content is stored as text and never as HTML.** Nothing here renders, and the
 * client renders `content` as plain text paragraphs rather than through
 * `dangerouslySetInnerHTML`, so an article body cannot introduce script or markup
 * into a reader's page. `sanitise` additionally strips control characters and caps
 * length on the way in.
 */
import { z } from "zod";
import type { SupabaseIdentity } from "./supabase-auth";
import { getSupabasePublicClient } from "./supabase-user-client";
import {
  clampLimit, clampOffset, invalid, likeTerm, logFailure, notFound,
  recordAudit, requireAdmin, type AdminResult, type Page,
} from "./admin-guard";

/** The lifecycle. `unpublished` is distinct from `draft`: it was public once. */
export const ARTICLE_STATUSES = ["draft", "published", "unpublished", "archived"] as const;
export type ArticleStatus = (typeof ARTICLE_STATUSES)[number];
export const ARTICLE_FILTERS = ["all", ...ARTICLE_STATUSES] as const;

/** Status changes an administrator can ask for. Creating is a save, not a transition. */
export const ARTICLE_ACTIONS = ["publish", "unpublish", "archive", "restore"] as const;
export type ArticleAction = (typeof ARTICLE_ACTIONS)[number];

/**
 * Blog topics. Separate from LMS subjects on purpose.
 *
 * "LMS Updates" and "Teaching Guidance" are things to write about, not things to
 * teach, and adding them to `categories` would put them in course discovery and on
 * every learner and instructor profile form. An article carries a topic from this
 * list and, optionally, a real subject from `categories` — the two are independent.
 */
export const BLOG_CATEGORIES = [
  "Quran Learning",
  "Tajweed",
  "Hifz",
  "Arabic",
  "Islamic Studies",
  "AI Tutor and Learning Support",
  "Teaching Guidance",
  "LMS Updates",
] as const;

export const ARTICLE_SORTS = ["newest", "oldest", "updated"] as const;
export type ArticleSort = (typeof ARTICLE_SORTS)[number];

/** Columns the public may see. `author_id`, and nothing else private, is absent. */
const PUBLIC_COLUMNS =
  "id,slug,title,excerpt,content,cover_url,category,lms_subject,tags,author_name,featured,seo_title,seo_description,published_at";

/** Everything the desk needs, including the private lifecycle columns. */
const ADMIN_COLUMNS = `${PUBLIC_COLUMNS},status,author_id,created_at,updated_at`;

export type PublicArticle = {
  id: string; slug: string; title: string; excerpt: string; content: string;
  cover_url: string | null; category: string; lms_subject: string | null;
  tags: string[]; author_name: string | null; featured: boolean;
  seo_title: string | null; seo_description: string | null; published_at: string | null;
};

export type AdminArticle = PublicArticle & {
  status: ArticleStatus; author_id: string | null; created_at: string; updated_at: string;
};

/* ------------------------------------------------------------------ shaping */

/**
 * Strips control characters and caps length. Applied to every text field on write.
 *
 * Written as a code-point walk rather than a regex character class: the class needs
 * \u escapes, and an escape that does not survive a tool in the chain turns into a
 * literal control character with stray hyphens around it — which silently becomes a
 * range that eats ordinary punctuation. Tab and newline are kept, because article
 * content is paragraphs.
 */
const sanitise = (value: string, max: number): string => {
  let out = "";
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    const isControl = (code < 0x20 && code !== 0x09 && code !== 0x0a) || code === 0x7f;
    if (!isControl) out += character;
  }
  return out.trim().slice(0, max);
};

/**
 * A URL-safe slug.
 *
 * Kept strict rather than clever: lowercase, digits and single hyphens. A slug is a
 * public route segment, so anything that could change how a path is parsed is removed
 * rather than escaped.
 */
export function normaliseSlug(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export const articleInput = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1).max(200),
  slug: z.string().min(1).max(160),
  excerpt: z.string().max(600).optional(),
  content: z.string().max(60_000).optional(),
  coverUrl: z.string().max(400).optional(),
  category: z.enum(BLOG_CATEGORIES),
  lmsSubject: z.string().max(80).optional(),
  tags: z.array(z.string().max(40)).max(10).optional(),
  authorName: z.string().max(120).optional(),
  featured: z.boolean().optional(),
  seoTitle: z.string().max(200).optional(),
  seoDescription: z.string().max(400).optional(),
});
export type ArticleInput = z.infer<typeof articleInput>;

/**
 * A cover must be a site-relative path.
 *
 * Zufishan has no public storage bucket, so there is nowhere to upload an image that
 * anonymous readers could then load. Rather than invent an external URL, a cover is a
 * path under the site's own approved assets. Anything absolute, protocol-relative or
 * containing a traversal segment is refused — a cover ends up in an `<img src>`, and
 * `javascript:` belongs nowhere near one.
 */
export function isSafeCoverPath(value: string): boolean {
  if (!value) return true;
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//")) return false;
  if (value.includes("..")) return false;
  return /^\/[A-Za-z0-9/_\-.]+\.(svg|png|jpg|jpeg|webp)$/.test(value);
}

const rowFromInput = (input: ArticleInput) => ({
  title: sanitise(input.title, 200),
  slug: normaliseSlug(input.slug),
  excerpt: sanitise(input.excerpt ?? "", 600),
  content: sanitise(input.content ?? "", 60_000),
  cover_url: input.coverUrl ? sanitise(input.coverUrl, 400) : null,
  category: input.category,
  lms_subject: input.lmsSubject ? sanitise(input.lmsSubject, 80) : null,
  tags: (input.tags ?? []).map((tag) => sanitise(tag, 40)).filter(Boolean).slice(0, 10),
  author_name: input.authorName ? sanitise(input.authorName, 120) : null,
  featured: input.featured ?? false,
  seo_title: input.seoTitle ? sanitise(input.seoTitle, 200) : null,
  seo_description: input.seoDescription ? sanitise(input.seoDescription, 400) : null,
});

/* -------------------------------------------------------------------- admin */

export async function listBlogArticles(
  identity: SupabaseIdentity,
  input: { search?: string; status?: (typeof ARTICLE_FILTERS)[number]; category?: string; subject?: string; sort?: ArticleSort; limit?: number; offset?: number },
): Promise<AdminResult<Page<AdminArticle>>> {
  const gate = await requireAdmin(identity);
  if (!gate.ok) return gate.failure;

  const limit = clampLimit(input.limit);
  const offset = clampOffset(input.offset);

  let query = gate.admin.from("blog_articles").select(ADMIN_COLUMNS, { count: "exact" });
  if (input.status && input.status !== "all") query = query.eq("status", input.status);
  if (input.category) query = query.eq("category", input.category);
  if (input.subject) query = query.eq("lms_subject", input.subject);
  if (input.search?.trim()) {
    const term = likeTerm(input.search.trim());
    query = query.or(`title.ilike.${term},slug.ilike.${term},excerpt.ilike.${term}`);
  }

  const sort = input.sort ?? "newest";
  if (sort === "updated") query = query.order("updated_at", { ascending: false });
  else query = query.order("created_at", { ascending: sort === "oldest" });

  const { data, error, count } = await query.range(offset, offset + limit - 1);
  if (error) { logFailure("blog.list", error); return invalid("Blog articles could not be loaded."); }
  return { ok: true, data: { rows: (data ?? []) as unknown as AdminArticle[], total: count ?? 0, limit, offset } };
}

export async function getBlogArticle(identity: SupabaseIdentity, input: { id: string }): Promise<AdminResult<AdminArticle>> {
  const gate = await requireAdmin(identity);
  if (!gate.ok) return gate.failure;

  const { data, error } = await gate.admin.from("blog_articles").select(ADMIN_COLUMNS).eq("id", input.id).maybeSingle();
  if (error) { logFailure("blog.get", error); return invalid("That article could not be loaded."); }
  if (!data) return notFound("article");
  return { ok: true, data: data as unknown as AdminArticle };
}

/**
 * Creates or updates. A new article is always a draft — publishing is a separate,
 * deliberate action, so no save can put something public by accident.
 */
export async function saveBlogArticle(identity: SupabaseIdentity, input: ArticleInput): Promise<AdminResult<AdminArticle>> {
  const gate = await requireAdmin(identity);
  if (!gate.ok) return gate.failure;

  const row = rowFromInput(input);
  if (!row.slug) return invalid("A URL slug is required.");
  if (!row.title) return invalid("A title is required.");
  if (row.cover_url && !isSafeCoverPath(row.cover_url)) return invalid("A cover must be a site asset path, such as /brand/hero-geometry.svg.");

  // The slug is the public route, so a collision is reported rather than resolved.
  const clash = await gate.admin.from("blog_articles").select("id").eq("slug", row.slug).maybeSingle();
  if (clash.data && clash.data.id !== input.id) return invalid("That URL slug is already used by another article.");

  const existing = input.id ? await gate.admin.from("blog_articles").select("id").eq("id", input.id).maybeSingle() : null;
  if (input.id && !existing?.data) return notFound("article");

  const write = input.id
    ? gate.admin.from("blog_articles").update(row).eq("id", input.id)
    : gate.admin.from("blog_articles").insert({ ...row, status: "draft", author_id: identity.id });

  const { data, error } = await write.select(ADMIN_COLUMNS).maybeSingle();
  if (error || !data) { logFailure("blog.save", error); return invalid("That article could not be saved."); }

  await recordAudit(gate.admin, {
    actorId: identity.id,
    action: input.id ? "blog_article_updated" : "blog_article_created",
    entityType: "blog_article",
    entityId: (data as { id: string }).id,
    metadata: { slug: row.slug, category: row.category },
  });

  return { ok: true, data: data as unknown as AdminArticle };
}

/** Publish, unpublish, archive, restore. The only way a status changes. */
export async function setBlogArticleStatus(
  identity: SupabaseIdentity,
  input: { id: string; action: ArticleAction },
): Promise<AdminResult<AdminArticle>> {
  const gate = await requireAdmin(identity);
  if (!gate.ok) return gate.failure;

  const current = await gate.admin.from("blog_articles").select("id,status,published_at").eq("id", input.id).maybeSingle();
  if (current.error) { logFailure("blog.status.read", current.error); return invalid("That article could not be loaded."); }
  if (!current.data) return notFound("article");

  const was = current.data as { status: ArticleStatus; published_at: string | null };
  const next: Record<ArticleAction, ArticleStatus> = {
    publish: "published", unpublish: "unpublished", archive: "archived", restore: "draft",
  };

  const patch: Record<string, unknown> = { status: next[input.action] };
  // First publication stamps the date; a later republish keeps the original.
  if (input.action === "publish" && !was.published_at) patch.published_at = new Date().toISOString();

  const { data, error } = await gate.admin.from("blog_articles").update(patch).eq("id", input.id).select(ADMIN_COLUMNS).maybeSingle();
  if (error || !data) { logFailure("blog.status.write", error); return invalid("That article could not be updated."); }

  await recordAudit(gate.admin, {
    actorId: identity.id,
    action: `blog_article_${input.action}ed`,
    entityType: "blog_article",
    entityId: input.id,
    metadata: { from: was.status, to: next[input.action] },
  });

  return { ok: true, data: data as unknown as AdminArticle };
}

export async function deleteBlogArticle(identity: SupabaseIdentity, input: { id: string }): Promise<AdminResult<{ id: string }>> {
  const gate = await requireAdmin(identity);
  if (!gate.ok) return gate.failure;

  const existing = await gate.admin.from("blog_articles").select("id,slug,title").eq("id", input.id).maybeSingle();
  if (existing.error) { logFailure("blog.delete.read", existing.error); return invalid("That article could not be loaded."); }
  if (!existing.data) return notFound("article");

  const { error } = await gate.admin.from("blog_articles").delete().eq("id", input.id);
  if (error) { logFailure("blog.delete", error); return invalid("That article could not be deleted."); }

  // Recorded before the row is gone from every other view, so the trail survives it.
  await recordAudit(gate.admin, {
    actorId: identity.id,
    action: "blog_article_deleted",
    entityType: "blog_article",
    entityId: input.id,
    metadata: { slug: (existing.data as { slug: string }).slug },
  });

  return { ok: true, data: { id: input.id } };
}

/* ------------------------------------------------------------------- public */

const publicFailure = (message: string) => ({ ok: false as const, error: message });

/**
 * Published articles, newest first. No authentication, and no private column.
 *
 * The anon client is used deliberately: under it the table's only policy allows
 * published rows, so an unpublished article is unreachable here even in principle.
 */
export async function listPublishedArticles(
  input: { search?: string; category?: string; subject?: string; limit?: number; offset?: number } = {},
) {
  const db = getSupabasePublicClient();
  if (!db) return publicFailure("Supabase persistence unavailable.");

  const limit = clampLimit(input.limit);
  const offset = clampOffset(input.offset);

  let query = db.from("blog_articles").select(PUBLIC_COLUMNS, { count: "exact" }).eq("status", "published");
  if (input.category) query = query.eq("category", input.category);
  if (input.subject) query = query.eq("lms_subject", input.subject);
  if (input.search?.trim()) {
    const term = likeTerm(input.search.trim());
    query = query.or(`title.ilike.${term},excerpt.ilike.${term}`);
  }

  const { data, error, count } = await query
    .order("published_at", { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (error) { logFailure("blog.public.list", error); return publicFailure("Blog articles are not available."); }
  return { ok: true as const, data: { articles: (data ?? []) as unknown as PublicArticle[], total: count ?? 0, limit, offset } };
}

/**
 * One published article by slug.
 *
 * A draft, unpublished, archived or deleted slug returns the same "not found" as a
 * slug that never existed — the reader learns nothing about what is in the drafts.
 */
export async function getPublishedArticle(input: { slug: string }) {
  const db = getSupabasePublicClient();
  if (!db) return publicFailure("Supabase persistence unavailable.");

  const slug = normaliseSlug(input.slug);
  if (!slug) return publicFailure("That article is not available.");

  const { data, error } = await db.from("blog_articles").select(PUBLIC_COLUMNS).eq("slug", slug).eq("status", "published").maybeSingle();
  if (error) { logFailure("blog.public.get", error); return publicFailure("That article is not available."); }
  if (!data) return publicFailure("That article is not available.");
  return { ok: true as const, data: data as unknown as PublicArticle };
}

/** Topics that actually have a published article behind them, for the public filter. */
export async function listPublishedArticleFacets() {
  const db = getSupabasePublicClient();
  if (!db) return publicFailure("Supabase persistence unavailable.");

  const { data, error } = await db.from("blog_articles").select("category,lms_subject").eq("status", "published");
  if (error) { logFailure("blog.public.facets", error); return publicFailure("Blog filters are not available."); }

  const rows = (data ?? []) as Array<{ category: string | null; lms_subject: string | null }>;
  const distinct = (key: "category" | "lms_subject") =>
    Array.from(new Set(rows.map((row) => row[key]).filter(Boolean))).sort() as string[];

  return { ok: true as const, data: { categories: distinct("category"), subjects: distinct("lms_subject") } };
}
