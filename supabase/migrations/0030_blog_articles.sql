-- The blog: one table, and the public can read only what is published.
--
-- WHY A NEW TABLE. Nothing in the schema could carry an article. `courses` is a
-- syllabus with modules, lessons, enrolments and a review workflow; bending it into
-- a blog would mean an article inherits course moderation, appears in course
-- discovery, and can be enrolled in. The blog is a different object with a different
-- lifecycle, so it gets its own table rather than a borrowed one.
--
-- WHY SUBJECT IS A PLAIN COLUMN, NOT A FOREIGN KEY. Noor Ilm has no subjects table:
-- `categories` in `client/src/lib/lms-data.ts` is the one list, re-exported as
-- `subjectOptions`, and `courses.subject` is a plain text column holding a value from
-- it. `lms_subject` here follows exactly that, so the blog reuses the existing
-- vocabulary instead of creating a second subject system to keep in step.
--
-- `category` is the blog's own topic and is deliberately separate: "LMS Updates" and
-- "Teaching Guidance" are article topics that are not, and must not become, course
-- subjects. An article may carry both, one, or only a category.
--
-- THE WRITE RULE. Row-level security is enabled with exactly one policy: anonymous
-- and signed-in readers may SELECT rows whose status is 'published'. There is no
-- insert, update or delete policy at all, which means no learner, instructor or
-- signed-in account of any kind can write here through the anon key — writes are
-- possible only through the service-role client, which `requireAdmin` hands out after
-- checking the caller actually holds an admin role. This is the same shape
-- `audit_logs` already uses.
--
-- Because the SELECT policy names the status, a draft, unpublished or archived row is
-- invisible to the public API even if a query forgets to filter — the database
-- refuses to return it rather than trusting the caller to ask correctly.

create table if not exists public.blog_articles (
  id uuid primary key default gen_random_uuid(),

  -- Identity. The slug is the public URL, so it is unique and lowercase-checked.
  slug text not null unique,
  title text not null,

  excerpt text not null default '',
  content text not null default '',

  -- An existing approved asset path. There is no public storage bucket, so this
  -- holds a site-relative path (e.g. '/brand/hero-geometry.svg') rather than an
  -- invented external URL.
  cover_url text,

  -- The blog's own topic, and optionally a real LMS subject from `categories`.
  category text not null,
  lms_subject text,

  tags text[] not null default '{}',
  author_name text,

  status text not null default 'draft'
    check (status in ('draft', 'published', 'unpublished', 'archived')),
  featured boolean not null default false,

  seo_title text,
  seo_description text,

  -- Set when a row first becomes 'published', and kept afterwards so unpublishing
  -- and republishing does not rewrite the date the article was first public.
  published_at timestamptz,

  -- The admin who created it. `set null` so removing an account never deletes content.
  author_id uuid references auth.users (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists blog_articles_published_idx
  on public.blog_articles (status, published_at desc nulls last);
create index if not exists blog_articles_category_idx
  on public.blog_articles (category);

alter table public.blog_articles enable row level security;

-- The only policy on the table. Read, published only, for everyone.
drop policy if exists "published blog articles are public" on public.blog_articles;
create policy "published blog articles are public"
  on public.blog_articles
  for select
  using (status = 'published');

-- No insert/update/delete policy is defined on purpose: writing requires the
-- service-role client, which only `requireAdmin` provides.
revoke insert, update, delete on public.blog_articles from anon, authenticated;

-- `updated_at` is maintained by the database so it cannot be forgotten by a caller.
create or replace function public.touch_blog_article_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists blog_articles_touch_updated_at on public.blog_articles;
create trigger blog_articles_touch_updated_at
  before update on public.blog_articles
  for each row execute function public.touch_blog_article_updated_at();
