/**
 * Proves migration 0031 before it is applied for real.
 *
 * Everything runs inside ONE transaction that is ROLLED BACK, so no policy change, no
 * course and no profile survives this script. It applies the migration, builds a real
 * instructor/course pair, and reads the catalogue as the anonymous role at each step.
 *
 * What it has to show:
 *   - a published course owned by a PENDING instructor is invisible to the public
 *   - approving that instructor makes the same row visible, with nothing else changed
 *   - the owner still sees their own DRAFT
 *   - a rejected instructor's published course goes back to invisible
 *
 * Prints verdicts and truncated ids only.
 */
import { readFileSync } from "node:fs";
import pg from "pg";

const env = Object.fromEntries(
  readFileSync(".env", "utf8").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);

const client = new pg.Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

const short = (id: string) => `${String(id).slice(0, 8)}…`;

/** Reads the catalogue exactly as the anonymous visitor's client does. */
async function visibleToPublic(courseId: string): Promise<boolean> {
  // Re-planned each time. Without this the probe reuses a generic plan that has already
  // folded the STABLE policy function, and a verification change made afterwards appears
  // not to take effect — an artefact of one long-lived connection, not of the policy.
  // Claims MUST be cleared. `visibleToOwner` sets them transaction-locally, and without
  // this every later "anonymous" read still carried the instructor's sub, matched the
  // owner branch of the policy, and reported a published course as publicly visible.
  await client.query(`select set_config('request.jwt.claims', '', true)`);
  await client.query("set local role anon");
  const res = await client.query(`select id from public.courses where id = $1 and status = 'published'`, [courseId]);
  await client.query("reset role");
  return res.rows.length > 0;
}

async function visibleToOwner(courseId: string, owner: string): Promise<boolean> {
  await client.query("set local role authenticated");
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: owner, role: "authenticated" })]);
  const res = await client.query(`select id from public.courses where id = $1`, [courseId]);
  await client.query("reset role");
  await client.query(`select set_config('request.jwt.claims', '', true)`);
  return res.rows.length > 0;
}

try {
  await client.query("begin");

  await client.query(readFileSync("supabase/migrations/0031_published_courses_require_an_approved_instructor.sql", "utf8"));
  console.log("migration applied inside the transaction\n");

  const instructor = (await client.query(
    `select user_id from public.user_roles where role = 'instructor' limit 1`,
  )).rows[0]?.user_id;
  if (!instructor) { console.log("no instructor account to test with"); await client.query("rollback"); process.exit(0); }
  console.log("instructor:", short(instructor));

  // The trigger that normally reserves this column for administrators is stood down for
  // the length of this transaction only; the rollback restores it either way.
  await client.query("alter table public.instructor_profiles disable trigger instructor_profiles_verification_guard");

  await client.query(
    `insert into public.instructor_profiles (user_id, public_slug, verification_status, public_profile_status)
     values ($1, 'probe-' || substr(gen_random_uuid()::text, 1, 8), 'verification_pending', 'draft')
     on conflict (user_id) do update set verification_status = 'verification_pending'`,
    [instructor],
  );

  const published = (await client.query(
    `insert into public.courses (instructor_id, slug, title, description, subject, level, language, status)
     values ($1, 'probe-published-' || gen_random_uuid(), 'Probe published', 'probe', 'Tajweed', 'Beginner', 'English', 'published')
     returning id`,
    [instructor],
  )).rows[0].id;

  const draft = (await client.query(
    `insert into public.courses (instructor_id, slug, title, description, subject, level, language, status)
     values ($1, 'probe-draft-' || gen_random_uuid(), 'Probe draft', 'probe', 'Tajweed', 'Beginner', 'English', 'draft')
     returning id`,
    [instructor],
  )).rows[0].id;

  console.log("courses created:", short(published), "(published) and", short(draft), "(draft)\n");

  const step = async (label: string) => {
    const actual = (await client.query(
      `select verification_status as s from public.instructor_profiles where user_id = $1`, [instructor],
    )).rows[0]?.s;
    const fn = (await client.query(`select public.is_approved_instructor($1) as ok`, [instructor])).rows[0]?.ok;
    console.log(
      `  ${label.padEnd(18)} column=${String(actual).padEnd(21)} fn=${String(fn).padEnd(5)}` +
      ` public sees published: ${String(await visibleToPublic(published)).padEnd(5)}` +
      ` owner sees draft: ${await visibleToOwner(draft, instructor)}`,
    );
  };

  console.log("1. instructor verification_pending");
  await step("pending");

  console.log("\n2. instructor approved");
  await client.query(`update public.instructor_profiles set verification_status = 'approved' where user_id = $1`, [instructor]);
  await step("approved");

  console.log("\n3. a second published course, same instructor");
  const second = (await client.query(
    `insert into public.courses (instructor_id, slug, title, description, subject, level, language, status)
     values ($1, 'probe-second-' || gen_random_uuid(), 'Probe second', 'probe', 'Arabic', 'Beginner', 'English', 'published')
     returning id`,
    [instructor],
  )).rows[0].id;
  console.log(`  both published courses visible:             ${await visibleToPublic(published) && await visibleToPublic(second)}`);

  console.log("\n4. instructor rejected");
  await client.query(`update public.instructor_profiles set verification_status = 'rejected' where user_id = $1`, [instructor]);
  await step("rejected");

  await client.query("rollback");
  console.log("\nrolled back — no policy, course or profile change was kept");

  const left = await client.query("select count(*)::int as n from public.courses");
  console.log("courses table rows now:", left.rows[0].n);
} finally {
  await client.end();
}
