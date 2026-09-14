/**
 * Proves migration 0032 before it is applied for real.
 *
 * One transaction, ROLLED BACK: no trigger, course or profile survives. It applies the
 * migration, then attempts every status transition AS THE OWNING INSTRUCTOR, which is the
 * actor the guard exists to restrain.
 *
 * What it has to show:
 *   - the owner may submit a draft for review, and withdraw it again
 *   - the owner may NOT publish, reject or archive their own course
 *   - the owner may still edit the course's content freely
 *   - a reviewer (admin) may publish
 *
 * Prints verdicts only.
 */
import { readFileSync } from "node:fs";
import pg from "pg";

const env = Object.fromEntries(
  readFileSync(".env", "utf8").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);

const client = new pg.Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

/** Runs a statement as a signed-in account, with claims cleared afterwards. */
async function asAccount(account: string, sql: string, args: unknown[] = []): Promise<string> {
  await client.query("savepoint s");
  await client.query("set local role authenticated");
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: account, role: "authenticated" })]);
  try {
    await client.query(sql, args);
    await client.query("release savepoint s");
    return "ALLOWED";
  } catch (error) {
    await client.query("rollback to savepoint s");
    return (error as { code?: string }).code === "42501" ? "refused" : `error ${(error as { code?: string }).code}`;
  } finally {
    await client.query("reset role");
    await client.query(`select set_config('request.jwt.claims', '', true)`);
  }
}

try {
  await client.query("begin");
  await client.query(readFileSync("supabase/migrations/0032_course_publication_is_a_reviewer_decision.sql", "utf8"));
  console.log("migration applied inside the transaction\n");

  const instructor = (await client.query(`select user_id from public.user_roles where role = 'instructor' limit 1`)).rows[0]?.user_id;
  const adminAccount = (await client.query(`select user_id from public.user_roles where role = 'admin' limit 1`)).rows[0]?.user_id;
  if (!instructor) { console.log("no instructor account"); await client.query("rollback"); process.exit(0); }

  const course = (await client.query(
    `insert into public.courses (instructor_id, slug, title, description, subject, level, language, status)
     values ($1, 'guard-probe-' || gen_random_uuid(), 'Guard probe', 'probe', 'Tajweed', 'Beginner', 'English', 'draft')
     returning id`,
    [instructor],
  )).rows[0].id;

  const set = (status: string) => [`update public.courses set status = $2 where id = $1`, [course, status]] as const;
  const reset = async (status: string) => { await client.query(`update public.courses set status = $2 where id = $1`, [course, status]); };

  console.log("as the OWNING INSTRUCTOR:");
  console.log(`  draft    -> in_review   ${await asAccount(instructor, ...set("in_review"))}   (submit)`);
  console.log(`  in_review-> draft       ${await asAccount(instructor, ...set("draft"))}   (withdraw)`);
  await reset("draft");
  console.log(`  draft    -> published   ${await asAccount(instructor, ...set("published"))}   (self-publish)`);
  console.log(`  draft    -> rejected    ${await asAccount(instructor, ...set("rejected"))}`);
  console.log(`  draft    -> archived    ${await asAccount(instructor, ...set("archived"))}`);
  console.log(`  edit the title          ${await asAccount(instructor, `update public.courses set title = 'Edited' where id = $1`, [course])}   (content is untouched by the guard)`);

  if (adminAccount) {
    await reset("in_review");
    console.log("\nas an ADMINISTRATOR:");
    console.log(`  in_review-> published   ${await asAccount(adminAccount, ...set("published"))}`);
  }

  await client.query("rollback");
  console.log("\nrolled back — no trigger or course was kept");
  console.log("courses table rows now:", (await client.query("select count(*)::int as n from public.courses")).rows[0].n);
} finally {
  await client.end();
}
