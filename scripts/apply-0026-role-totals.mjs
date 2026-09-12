/**
 * Applies 0026, which adds `public.account_effective_role` — one row per
 * account carrying the single highest-privilege role that account holds.
 *
 * Additive and read-only: one view. No table, column, policy or row is altered,
 * and no role record is rewritten. The stale `admin` + `learner` pairing on the
 * administrator account is left exactly as it is and reported instead.
 *
 * Afterwards it proves three things that the old row-counting query could not
 * satisfy: every account appears exactly once, an account holding both `admin`
 * and `learner` lands in `admins` and not in `learners`, and no signed-in
 * end-user role can read the view at all. The simulated accounts used for the
 * multi-role proof are created inside a transaction that is rolled back.
 */
import { readFile } from "node:fs/promises";
import "dotenv/config";
import pg from "pg";

const sql = await readFile(new URL("../supabase/migrations/0026_role_totals_are_per_account.sql", import.meta.url), "utf8");
const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) throw new Error("SUPABASE_DB_URL is not configured");

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 45000, query_timeout: 45000 });
try {
  await client.connect();

  // Role rows are never touched by this migration; the count is recorded on both
  // sides so that claim is checked rather than asserted.
  const roleRowsBefore = (await client.query("select count(*)::int as n from public.user_roles")).rows[0].n;

  await client.query("begin");
  await client.query(sql);
  await client.query("commit");

  const roleRowsAfter = (await client.query("select count(*)::int as n from public.user_roles")).rows[0].n;
  console.log(`0026 applied. user_roles rows before ${roleRowsBefore}, after ${roleRowsAfter} — ${roleRowsBefore === roleRowsAfter ? "unchanged" : "CHANGED, INVESTIGATE"}`);

  const options = (await client.query(
    "select coalesce(array_to_string(reloptions,','),'(none)') as opts from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='account_effective_role'",
  )).rows[0].opts;
  console.log(`  view options: ${options}`);
  for (const who of ["anon", "authenticated"]) {
    const can = (await client.query("select has_table_privilege($1,'public.account_effective_role','select') as ok", [who])).rows[0].ok;
    console.log(`  ${who} may select: ${can}`);
  }

  console.log("\nLive buckets (accounts, mutually exclusive):");
  for (const row of (await client.query(
    "select effective_role, count(*)::int as accounts from public.account_effective_role group by 1 order by 1",
  )).rows) console.log(`  ${row.effective_role.padEnd(14)} ${row.accounts}`);

  const totals = (await client.query(
    `select (select count(*) from public.profiles)::int as profiles,
            (select count(*) from public.account_effective_role)::int as view_rows,
            (select count(distinct user_id) from public.account_effective_role)::int as accounts`,
  )).rows[0];
  console.log(`  exhaustive: profiles ${totals.profiles} = view rows ${totals.view_rows} = distinct accounts ${totals.accounts}`);

  // Prove the precedence ladder against roles that do not exist in live data,
  // then throw the simulated accounts away.
  console.log("\nPrecedence proof on simulated accounts (rolled back):");
  await client.query("begin");
  const make = async (label, roles) => {
    const id = (await client.query("select gen_random_uuid() as id")).rows[0].id;
    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'',now(),'{}'::jsonb,$3::jsonb,now(),now())`,
      [id, `sim-role-${id}@example.invalid`, JSON.stringify({ display_name: label, requested_public_role: "learner" })],
    );
    await client.query("delete from public.user_roles where user_id = $1", [id]);
    for (const role of roles) await client.query("insert into public.user_roles (user_id, role) values ($1,$2)", [id, role]);
    return { id, label, roles };
  };
  const cases = [
    await make("admin + learner", ["admin", "learner"]),
    await make("super_admin + learner + instructor", ["super_admin", "learner", "instructor"]),
    await make("moderator + learner", ["moderator", "learner"]),
    await make("instructor + learner", ["instructor", "learner"]),
    await make("learner only", ["learner"]),
    await make("no role at all", []),
  ];
  for (const item of cases) {
    const row = (await client.query("select top_role, effective_role from public.account_effective_role where user_id=$1", [item.id])).rows[0];
    console.log(`  ${item.label.padEnd(34)} -> ${String(row.top_role).padEnd(12)} ${row.effective_role}`);
  }
  const leak = (await client.query(
    "select count(*)::int as n from public.account_effective_role where user_id = any($1::uuid[]) and effective_role = 'learners'",
    [cases.filter((c) => c.roles.some((r) => r !== "learner")).map((c) => c.id)],
  )).rows[0].n;
  console.log(`  accounts holding a non-learner role that still counted as a learner: ${leak}`);
  await client.query("rollback");

  const after = (await client.query("select count(*)::int as n from public.user_roles")).rows[0].n;
  console.log(`\nAfter rollback, user_roles rows: ${after} — ${after === roleRowsBefore ? "unchanged" : "CHANGED, INVESTIGATE"}`);
} finally {
  await client.end();
}
