import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BLOG_CATEGORIES, isSafeCoverPath, normaliseSlug } from "./blog";
import { categories } from "../client/src/lib/lms-data";

/** Source with the leading documentation block removed, so no assertion is met by prose. */
const codeOf = (path: string) => {
  const text = readFileSync(new URL(path, import.meta.url), "utf8");
  const firstImport = text.indexOf("\nimport ");
  return firstImport === -1 ? text : text.slice(firstImport);
};

const blog = codeOf("./blog.ts");
const migration = readFileSync(new URL("../supabase/migrations/0030_blog_articles.sql", import.meta.url), "utf8");
const adminUi = codeOf("../client/src/components/AdminBlogExperience.tsx");
const publicUi = codeOf("../client/src/components/BlogExperience.tsx");
const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const nav = codeOf("../client/src/components/SiteNav.tsx");
const adminNav = readFileSync(new URL("../client/src/lib/admin-nav.ts", import.meta.url), "utf8");

describe("the database is the first lock, not the last", () => {
  it("enables row-level security and publishes only published rows", () => {
    expect(migration).toContain("alter table public.blog_articles enable row level security");
    expect(migration).toContain("for select\n  using (status = 'published')");
  });

  it("defines no insert, update or delete policy at all", () => {
    // Without a write policy the anon key cannot write, whoever holds it. Writes are
    // possible only through the service-role client `requireAdmin` hands out.
    const policies = migration.match(/create policy[\s\S]*?;/g) ?? [];
    expect(policies).toHaveLength(1);
    for (const policy of policies) expect(policy).toContain("for select");
    expect(migration).toContain("revoke insert, update, delete on public.blog_articles from anon, authenticated");
  });

  it("constrains status to the four lifecycle values", () => {
    expect(migration).toContain("check (status in ('draft', 'published', 'unpublished', 'archived'))");
  });
});

describe("every administrative path is gated server-side", () => {
  it("calls requireAdmin in each admin function", () => {
    const adminFunctions = ["listBlogArticles", "getBlogArticle", "saveBlogArticle", "setBlogArticleStatus", "deleteBlogArticle"];
    for (const name of adminFunctions) {
      const start = blog.indexOf(`export async function ${name}`);
      expect(start, `${name} must exist`).toBeGreaterThan(-1);
      const body = blog.slice(start, start + 400);
      expect(body, `${name} must gate on requireAdmin`).toContain("const gate = await requireAdmin(identity);");
      expect(body, `${name} must return the refusal`).toContain("if (!gate.ok) return gate.failure;");
    }
  });

  it("records every write in the existing audit log", () => {
    for (const action of ["blog_article_created", "blog_article_updated", "blog_article_deleted"]) {
      expect(blog, `${action} must be audited`).toContain(action);
    }
    expect(blog).toContain("await recordAudit(gate.admin,");
  });

  it("never lets a save publish something by itself", () => {
    // A new row is inserted as a draft; only setBlogArticleStatus can publish.
    expect(blog).toContain('.insert({ ...row, status: "draft", author_id: identity.id })');
  });
});

describe("public reads cannot reach a draft", () => {
  it("uses the anonymous client and still filters on status", () => {
    for (const name of ["listPublishedArticles", "getPublishedArticle", "listPublishedArticleFacets"]) {
      const start = blog.indexOf(`export async function ${name}`);
      expect(start, `${name} must exist`).toBeGreaterThan(-1);
      const body = blog.slice(start, start + 900);
      expect(body, `${name} must use the anon client`).toContain("getSupabasePublicClient()");
      expect(body, `${name} must filter to published`).toContain('.eq("status", "published")');
      expect(body, `${name} must not use the service-role client`).not.toContain("requireAdmin");
    }
  });

  it("returns no private column to the public", () => {
    const publicColumns = blog.slice(blog.indexOf("const PUBLIC_COLUMNS"), blog.indexOf("const ADMIN_COLUMNS"));
    for (const priv of ["status", "author_id", "created_at", "updated_at"]) {
      expect(publicColumns, `${priv} must not be a public column`).not.toContain(priv);
    }
  });
});

describe("article content cannot inject markup", () => {
  it("renders through JSX, never as HTML", () => {
    for (const [name, source] of [["admin", adminUi], ["public", publicUi]] as const) {
      expect(source, `${name} must not set inner HTML`).not.toContain("dangerouslySetInnerHTML");
      expect(source, `${name} must not build markup from content`).not.toMatch(/innerHTML|outerHTML/);
    }
    expect(adminUi).toContain("export function paragraphsOf");
  });

  it("refuses a cover that is not a site asset path", () => {
    for (const good of ["/brand/hero-geometry.svg", "/brand/noor-ilm-mark.svg", ""]) {
      expect(isSafeCoverPath(good), `${good} should be allowed`).toBe(true);
    }
    for (const bad of ["javascript:alert(1)", "//evil.example/x.png", "https://evil.example/x.png", "/brand/../../etc/passwd.png", "/brand/script.js", "data:image/svg+xml;base64,AAA"]) {
      expect(isSafeCoverPath(bad), `${bad} must be refused`).toBe(false);
    }
  });

  it("keeps a slug to a safe URL segment", () => {
    expect(normaliseSlug("Hello World!")).toBe("hello-world");
    expect(normaliseSlug("../../etc/passwd")).toBe("etc-passwd");
    expect(normaliseSlug("  Tajweed: a start  ")).toBe("tajweed-a-start");
  });
});

describe("blog topics and course subjects stay separate", () => {
  it("does not add blog-only topics to the LMS subject list", () => {
    for (const blogOnly of ["AI Tutor and Learning Support", "Teaching Guidance", "LMS Updates", "Islamic Studies"]) {
      expect(categories as string[], `${blogOnly} must not become a course subject`).not.toContain(blogOnly);
    }
  });

  it("lets an article carry a real course subject alongside its topic", () => {
    expect(blog).toContain("lms_subject");
    expect(adminUi).toContain('import { subjectOptions } from "../lib/reference-data";');
    // The subject dropdown offers the one existing list rather than a second vocabulary.
    expect(adminUi).toContain("subjectOptions.map((subject)");
  });

  it("creates no second subject table", () => {
    // Bounded at the opening paren so this reads the table NAME, not the column list:
    // `lms_subject` is a column on blog_articles and is exactly the reuse we want.
    expect(migration).not.toMatch(/create table[^(]*subject/i);
    const created = migration.match(/create table (?:if not exists )?public\.(\w+)/gi) ?? [];
    expect(created).toEqual(["create table if not exists public.blog_articles"]);
    expect(BLOG_CATEGORIES.length).toBe(8);
  });
});

describe("the module lives inside the desk that already exists", () => {
  it("is one more nav entry, not a second dashboard", () => {
    expect(adminNav).toContain('{ key: "blog",         href: "/admin/blog",');
    expect(adminUi).toContain('import AdminShell from "./AdminShell";');
    expect(adminUi).toContain('activeKey="blog"');
  });

  it("sits behind the same guard as every other admin page", () => {
    expect(app).toContain('<Route path="/admin/blog">{() => <AdminProtectedRoute><AdminBlogPage/></AdminProtectedRoute>}</Route>');
  });

  it("leaves the existing admin modules in place", () => {
    for (const key of ["overview", "instructors", "courses", "users", "content", "reviews", "bookings", "auditLogs", "systemStatus", "settings"]) {
      expect(adminNav, `${key} must survive`).toContain(`key: "${key}"`);
    }
  });
});

describe("the public blog is a page, reachable without login", () => {
  it("navigates to /blog rather than scrolling", () => {
    expect(nav).toContain('<Link href="/blog" className={triggerClass}>{t("nav.blog")}</Link>');
    expect(app).toContain('<Route path="/blog">{() => <><Header/><BlogListingPage/><Footer/></>}</Route>');
    expect(app).toContain('<Route path="/blog/:slug">');
  });

  it("is not wrapped in any route guard", () => {
    const listing = app.slice(app.indexOf('<Route path="/blog">'), app.indexOf('<Route path="/blog">') + 200);
    expect(listing).not.toContain("ProtectedRoute");
    expect(listing).not.toContain("AdminProtectedRoute");
  });

  it("carries the site's own header and footer", () => {
    expect(app).toContain("<Header/><BlogListingPage/><Footer/>");
  });
});
