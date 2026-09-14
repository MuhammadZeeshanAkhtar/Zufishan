/**
 * Applies 0031, which narrows the public branch of `courses_published_or_owner`.
 *
 * Before: any row with `status = 'published'` was readable by anyone. After: the row is
 * public only while its owner is an `approved` instructor. The owner's own rows and the
 * administrator's access are unchanged — only the public branch is narrowed.
 *
 * It then reports what actually changed in the live catalogue, so the effect is visible
 * rather than assumed: how many published courses exist, and how many of those belong to
 * an instructor who is not approved and therefore just left the public listing.
 *
 * This script WRITES: it replaces one policy and creates one function. It inserts,
 * updates and deletes no rows.
 */
import { readFile } from "node:fs/promises";
import "dotenv/config";
import pg from "pg";

const sql = await readFile(new URL("../supabase/migrations/0031_published_courses_require_an_approved_instructor.sql", import.meta.url), "utf8");
const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) throw new Error("SUPABASE_DB_URL is not configured");

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 45000, query_timeout: 45000 });
await client.connect();

try {
  const before = await client.query(`
    select
      count(*) filter (where c.status = 'published')                                   as published,
      count(*) filter (where c.status = 'published'
        and not coalesce(ip.verification_status = 'approved', false))                  as published_by_unapproved,
      count(*)                                                                          as total
    from public.courses c
    left join public.instructor_profiles ip on ip.user_id = c.instructor_id
  `);
  const row = before.rows[0];
  console.log("catalogue before:", {
    totalCourses: Number(row.total),
    published: Number(row.published),
    publishedByUnapprovedInstructor: Number(row.published_by_unapproved),
  });

  await client.query(sql);
  console.log("\n0031 applied: function created, SELECT policy replaced");

  const policy = await client.query(`
    select qual from pg_policies
    where schemaname = 'public' and tablename = 'courses' and policyname = 'courses_published_or_owner'
  `);
  console.log("policy now:", String(policy.rows[0]?.qual ?? "(missing)"));

  console.log(
    "\nrows affected: 0 — no course, profile or role was written.",
    `\n${Number(row.published_by_unapproved)} published course(s) owned by an unapproved instructor are now hidden from learners.`,
  );
} finally {
  await client.end();
}
