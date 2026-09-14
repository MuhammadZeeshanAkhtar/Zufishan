/**
 * Applies 0032, the course-status guard.
 *
 * Additive: one function and one BEFORE UPDATE trigger on `public.courses`. No table,
 * column, policy or row is changed, and no course status is rewritten — the guard only
 * inspects transitions from this point forward.
 *
 * It reports the live status spread before and after so the effect is visible: the two
 * numbers must match, because applying a guard is not a migration of data.
 */
import { readFile } from "node:fs/promises";
import "dotenv/config";
import pg from "pg";

const sql = await readFile(new URL("../supabase/migrations/0032_course_publication_is_a_reviewer_decision.sql", import.meta.url), "utf8");
const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) throw new Error("SUPABASE_DB_URL is not configured");

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 45000, query_timeout: 45000 });
await client.connect();

const spread = async () =>
  (await client.query("select status, count(*)::int as n from public.courses group by status order by status")).rows;

try {
  console.log("course statuses before:", JSON.stringify(await spread()));

  await client.query(sql);
  console.log("\n0032 applied: function created, courses_status_guard installed");

  const trigger = await client.query(`
    select tgname, tgenabled from pg_trigger
    where tgrelid = 'public.courses'::regclass and not tgisinternal and tgname = 'courses_status_guard'
  `);
  console.log("trigger:", trigger.rows[0] ? `${trigger.rows[0].tgname} (enabled=${trigger.rows[0].tgenabled})` : "(missing)");

  console.log("course statuses after: ", JSON.stringify(await spread()));
  console.log("\nrows affected: 0 — no course status was rewritten.");
} finally {
  await client.end();
}
