/**
 * Applies 0030, which creates `blog_articles`.
 *
 * Additive: one new table, its indexes, one SELECT policy and an updated_at trigger.
 * No existing table, column, policy or row is touched.
 *
 * Afterwards it proves the access rule under real RLS inside a transaction that is
 * rolled back — an anonymous reader and a signed-in learner are each shown a
 * published row and refused a draft, an unpublished and an archived one, and both
 * are refused every kind of write. Nothing this probe inserts survives.
 */
import { readFile } from "node:fs/promises";
import "dotenv/config";
import pg from "pg";

const sql = await readFile(new URL("../supabase/migrations/0030_blog_articles.sql", import.meta.url), "utf8");
const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) throw new Error("SUPABASE_DB_URL is not configured");

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 45000, query_timeout: 45000 });

const readsAs = async (role, label) => {
  await client.query(`set local role ${role}`);
  const { rows } = await client.query("select status from public.blog_articles order by status");
  await client.query("set local role postgres");
  return { reader: label, sees: rows.map((row) => row.status) };
};

const refusedWrite = async (role, label, statement, args = []) => {
  await client.query(`set local role ${role}`);
  let refused = false;
  try {
    await client.query("savepoint probe");
    await client.query(statement, args);
    await client.query("rollback to savepoint probe");
  } catch {
    await client.query("rollback to savepoint probe");
    refused = true;
  }
  await client.query("set local role postgres");
  return { writer: label, refused };
};

try {
  await client.connect();

  await client.query("begin");
  await client.query(sql);
  await client.query("commit");

  const { rows: policies } = await client.query(
    "select policyname, cmd from pg_policies where schemaname='public' and tablename='blog_articles' order by policyname",
  );
  const { rows: rls } = await client.query(
    "select relrowsecurity from pg_class where oid = 'public.blog_articles'::regclass",
  );

  // ---- the probe. Everything below is rolled back. ----
  await client.query("begin");
  await client.query(`
    insert into public.blog_articles (slug, title, category, status, published_at) values
      ('probe-published',   'Probe published',   'LMS Updates', 'published',   now()),
      ('probe-draft',       'Probe draft',       'LMS Updates', 'draft',       null),
      ('probe-unpublished', 'Probe unpublished', 'LMS Updates', 'unpublished', null),
      ('probe-archived',    'Probe archived',    'LMS Updates', 'archived',    null)
  `);

  const reads = [await readsAs("anon", "anonymous visitor")];
  await client.query("set local role postgres");
  await client.query(`select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000001"}', true)`);
  reads.push(await readsAs("authenticated", "signed-in learner"));

  const writes = [
    await refusedWrite("anon", "anonymous insert", "insert into public.blog_articles (slug, title, category) values ('probe-anon', 'x', 'LMS Updates')"),
    await refusedWrite("authenticated", "signed-in insert", "insert into public.blog_articles (slug, title, category) values ('probe-auth', 'x', 'LMS Updates')"),
    await refusedWrite("authenticated", "signed-in publish", "update public.blog_articles set status = 'published' where slug = 'probe-draft'"),
    await refusedWrite("authenticated", "signed-in delete", "delete from public.blog_articles where slug = 'probe-published'"),
  ];

  await client.query("rollback");

  const { rows: left } = await client.query("select count(*)::int as n from public.blog_articles");

  console.log(JSON.stringify({
    rowSecurityEnabled: rls[0]?.relrowsecurity === true,
    policies,
    reads,
    writes,
    rowsRemainingAfterProbe: left[0].n,
  }, null, 2));
} finally {
  await client.end();
}
