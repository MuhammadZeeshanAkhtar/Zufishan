/**
 * Applies 0025, which lets an instructor read learner profiles the learner has
 * published.
 *
 * Additive and read-only: one permissive SELECT policy. No table, column, write
 * policy or row is altered.
 *
 * Afterwards it proves the rule under real RLS inside a transaction that is
 * rolled back — a published learner, a draft learner, and four different readers.
 * Nothing survives this script.
 */
import { readFile } from "node:fs/promises";
import "dotenv/config";
import pg from "pg";

const sql = await readFile(new URL("../supabase/migrations/0025_discoverable_learners_readable_by_instructors.sql", import.meta.url), "utf8");
const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) throw new Error("SUPABASE_DB_URL is not configured");

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 45000, query_timeout: 45000 });
try {
  await client.connect();

  const before = (await client.query("select count(*)::int as n from public.learner_profiles")).rows[0].n;
  await client.query("begin");
  await client.query(sql);
  await client.query("commit");

  const { rows: policies } = await client.query(
    "select policyname, cmd from pg_policies where schemaname='public' and tablename='learner_profiles' order by policyname",
  );
  console.log("0025 applied. Policies on learner_profiles:");
  for (const row of policies) console.log(`  ${row.policyname.padEnd(46)} ${row.cmd}`);

  // Prove it, rolled back.
  await client.query("begin");
  let n = 0;
  const makeUser = async (label, role) => {
    const id = (await client.query("select gen_random_uuid() as id")).rows[0].id;
    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'',now(),'{}'::jsonb,$3::jsonb,now(),now())`,
      [id, `sim-${label}-${id}@example.invalid`, JSON.stringify({ display_name: label, requested_public_role: role })],
    );
    return id;
  };

  const publishedLearner = await makeUser("Published Learner", "learner");
  const draftLearner = await makeUser("Draft Learner", "learner");
  const otherLearner = await makeUser("Other Learner", "learner");
  const instructor = await makeUser("Instructor", "instructor");
  await client.query("update public.learner_profiles set profile_status='published', learning_goal='Simulated goal' where user_id=$1", [publishedLearner]);
  await client.query("update public.learner_profiles set profile_status='draft' where user_id=$1", [draftLearner]);

  const asUser = async (userId, sql2, values = []) => {
    const point = `p${n += 1}`;
    await client.query(`savepoint ${point}`);
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: "authenticated" })]);
    try {
      const r = await client.query(sql2, values);
      await client.query("select set_config('request.jwt.claims', null, true)");
      await client.query("reset role");
      await client.query(`release savepoint ${point}`);
      return r;
    } catch (error) {
      await client.query(`rollback to savepoint ${point}`);
      await client.query("reset role");
      return { rowCount: 0, rows: [], failed: error.message.split("\n")[0].slice(0, 70) };
    }
  };

  const scope = "select user_id from public.learner_profiles where user_id = any($1::uuid[])";
  const ids = [[publishedLearner, draftLearner]];
  console.log("\nwho can read a published learner profile (rolled back):");
  console.log(`  the instructor            → ${(await asUser(instructor, scope, ids)).rowCount} row(s)`);
  console.log(`  another learner           → ${(await asUser(otherLearner, scope, ids)).rowCount} row(s)`);
  console.log(`  the learner themselves    → ${(await asUser(publishedLearner, scope, ids)).rowCount} row(s)`);

  const draftOnly = "select user_id from public.learner_profiles where user_id = $1";
  console.log(`\n  instructor reads a DRAFT learner → ${(await asUser(instructor, draftOnly, [draftLearner])).rowCount} row(s)`);

  const write = await asUser(instructor, "update public.learner_profiles set profile_status='draft' where user_id=$1", [publishedLearner]);
  console.log(`  instructor edits a learner's visibility → ${write.rowCount} row(s) (must be 0)`);

  await client.query("rollback");
  const after = (await client.query("select count(*)::int as n from public.learner_profiles")).rows[0].n;
  console.log(`\nlearner_profiles before ${before}, after ${after} — ${before === after ? "nothing created" : "CHANGED, INVESTIGATE"}`);
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  // Print the message only — a connection string must never reach the log.
  console.error("0025 failed:", error?.message ?? "unknown error");
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
