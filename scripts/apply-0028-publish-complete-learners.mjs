/**
 * Applies 0028, then verifies the outcome through the REAL RLS policy.
 *
 * The visibility check runs as the `authenticated` role with the instructor's
 * own JWT claim set, so policy 0025 is what decides — not a service-role read
 * that would bypass it. Addresses are fingerprinted; nothing secret is printed.
 */
import { readFileSync } from "node:fs";
import pg from "pg";

const env = {};
for (const raw of readFileSync(new URL("../.env", import.meta.url), "utf8").split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) continue;
  const eq = line.indexOf("=");
  if (eq <= 0) continue;
  const name = line.slice(0, eq).trim().replace(/^export\s+/, "");
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) continue;
  let value = line.slice(eq + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
  env[name] = value;
}

const client = new pg.Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 45000 });
await client.connect();

const snapshot = async () => (await client.query(
  `select substr(md5(u.email::text),1,6) as acct,
          lp.profile_status,
          coalesce(r.roles,'(none)') as roles,
          p.account_status
     from public.learner_profiles lp
     join public.profiles p on p.id = lp.user_id
     join auth.users u on u.id = lp.user_id
     left join lateral (select string_agg(role,',' order by role) as roles
                          from public.user_roles where user_id = lp.user_id) r on true
    order by 1`)).rows;

console.log("BEFORE");
console.table(await snapshot());

const sql = readFileSync(new URL("../supabase/migrations/0028_complete_learner_profiles_are_published.sql", import.meta.url), "utf8");
const result = await client.query(sql);
console.log(`\n0028 applied. rows published: ${result.rowCount ?? 0}`);

console.log("\nAFTER");
console.table(await snapshot());

// The real gate: read as the instructor, under RLS.
const idOf = async (role) => (await client.query(
  "select user_id::text as id from public.user_roles where role=$1 limit 1", [role])).rows[0]?.id;
const instructor = await idOf("instructor");
const learner = await idOf("learner");

const readAs = async (who) => {
  await client.query("begin");
  try {
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: who, role: "authenticated" })]);
    const rows = await client.query("select user_id::text as id from public.learner_profiles");
    return rows.rows.map((r) => r.id);
  } finally {
    await client.query("rollback");
  }
};

console.log("\n=== through RLS policy 0025, as the real instructor ===");
const visible = await readAs(instructor);
console.log("   learner rows the instructor can read:", visible.length);
console.log("   the real learner is among them      :", visible.includes(learner));

console.log("\n=== the board account is NOT published by this migration ===");
console.table((await client.query(
  `select substr(md5(u.email::text),1,6) as acct, lp.profile_status
     from public.learner_profiles lp join auth.users u on u.id = lp.user_id
    where lp.user_id in (select user_id from public.user_roles where role in ('admin','super_admin'))`)).rows);

console.log("\n=== running it again changes nothing (idempotent) ===");
const again = await client.query(sql);
console.log("   rows published on a second run:", again.rowCount ?? 0);

await client.end();
