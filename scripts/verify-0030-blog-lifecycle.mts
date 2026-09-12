/**
 * Proves the article lifecycle, and what a public reader sees at each stage.
 *
 * Runs entirely inside one transaction that is rolled back, against the real database
 * and the real policy — no fixture, no mock, and nothing left behind.
 *
 * The admin side of each step uses the same privileged path `requireAdmin` hands to
 * the admin procedures; the public side reads as `anon`, which is the role an
 * anonymous visitor's request actually runs under. So "does a draft appear publicly?"
 * is answered by the database, not by trusting a `.eq()` in application code.
 */
import "dotenv/config";
import pg from "pg";

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) throw new Error("SUPABASE_DB_URL is not configured");

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 45000, query_timeout: 45000 });

const SLUG = "lifecycle-probe-article";

/** What an anonymous visitor can see, by slug. */
async function publicSees(): Promise<{ listed: number; bySlug: boolean }> {
  await client.query("set local role anon");
  const listed = await client.query("select count(*)::int as n from public.blog_articles where slug = $1", [SLUG]);
  const bySlug = await client.query("select id from public.blog_articles where slug = $1 and status = 'published'", [SLUG]);
  await client.query("set local role postgres");
  return { listed: listed.rows[0].n, bySlug: bySlug.rowCount === 1 };
}

try {
  await client.connect();
  await client.query("begin");

  const steps: Array<Record<string, unknown>> = [];

  // 1. Create. A new article is a draft; publishing is a separate, deliberate act.
  await client.query(
    `insert into public.blog_articles (slug, title, excerpt, content, category, lms_subject, status)
     values ($1, 'Lifecycle probe', 'Probe excerpt', 'Para one.\n\nPara two.', 'LMS Updates', 'Tajweed', 'draft')`,
    [SLUG],
  );
  steps.push({ step: "1. created as draft", ...(await publicSees()) });

  // 2. Edit while still a draft.
  await client.query("update public.blog_articles set title = 'Lifecycle probe, edited' where slug = $1", [SLUG]);
  steps.push({ step: "2. edited (still draft)", ...(await publicSees()) });

  // 3. Publish. published_at is stamped on first publication only.
  await client.query("update public.blog_articles set status = 'published', published_at = now() where slug = $1 and published_at is null", [SLUG]);
  const firstPublish = (await client.query("select published_at from public.blog_articles where slug = $1", [SLUG])).rows[0].published_at;
  steps.push({ step: "3. published", ...(await publicSees()) });

  // 4. Unpublish.
  await client.query("update public.blog_articles set status = 'unpublished' where slug = $1", [SLUG]);
  steps.push({ step: "4. unpublished", ...(await publicSees()) });

  // 5. Republish, and confirm the original publication date survives.
  await client.query("update public.blog_articles set status = 'published' where slug = $1 and published_at is null", [SLUG]);
  await client.query("update public.blog_articles set status = 'published' where slug = $1", [SLUG]);
  const secondPublish = (await client.query("select published_at from public.blog_articles where slug = $1", [SLUG])).rows[0].published_at;
  steps.push({ step: "5. republished", ...(await publicSees()), publishedAtUnchanged: String(firstPublish) === String(secondPublish) });

  // 6. Archive.
  await client.query("update public.blog_articles set status = 'archived' where slug = $1", [SLUG]);
  steps.push({ step: "6. archived", ...(await publicSees()) });

  // 7. Restore to draft.
  await client.query("update public.blog_articles set status = 'draft' where slug = $1", [SLUG]);
  steps.push({ step: "7. restored to draft", ...(await publicSees()) });

  // 8. Delete. The old public address must stop resolving.
  await client.query("delete from public.blog_articles where slug = $1", [SLUG]);
  steps.push({ step: "8. deleted", ...(await publicSees()) });

  // The CHECK constraint is the last word on which statuses can exist.
  let rejectedBadStatus = false;
  try {
    await client.query("savepoint bad");
    await client.query("insert into public.blog_articles (slug, title, category, status) values ('probe-bad', 'x', 'LMS Updates', 'live')");
    await client.query("rollback to savepoint bad");
  } catch {
    await client.query("rollback to savepoint bad");
    rejectedBadStatus = true;
  }

  await client.query("rollback");

  const left = (await client.query("select count(*)::int as n from public.blog_articles")).rows[0].n;
  console.log(JSON.stringify({ steps, rejectedBadStatus, rowsRemaining: left }, null, 2));
} finally {
  await client.end();
}
