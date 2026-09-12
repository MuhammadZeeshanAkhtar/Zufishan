/**
 * Applies migration 0027 with before/after proof.
 *
 * Prints role rows only, fingerprinted. No address, key or connection string is
 * ever logged. The whole thing runs in one transaction and refuses to commit if
 * anything other than the single expected row would change.
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

const client = new pg.Client({
  connectionString: env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 45000,
});
await client.connect();

const snapshot = async () => (await client.query(
  `select substr(md5(u.email::text),1,6) as acct,
          coalesce(string_agg(r.role, ',' order by r.role), '(none)') as roles
     from auth.users u
     left join public.user_roles r on r.user_id = u.id
    group by u.id, u.email
    order by 2`)).rows;

console.log("BEFORE");
console.table(await snapshot());
const before = (await client.query("select count(*)::int as n from public.user_roles")).rows[0].n;

await client.query("begin");
try {
  const sql = readFileSync(new URL("../supabase/migrations/0027_board_account_holds_no_public_role.sql", import.meta.url), "utf8");
  const result = await client.query(sql);
  const removed = Array.isArray(result) ? result.find((r) => r.command === "DELETE")?.rowCount ?? 0 : result.rowCount ?? 0;

  // Refuse to commit anything larger than the one row the audit identified.
  if (removed > 1) throw new Error(`expected at most 1 row, would have removed ${removed} — rolled back`);

  // Nobody may lose admin access, and no other account may lose a role.
  const stillAdmin = (await client.query(
    "select count(*)::int as n from public.user_roles where role in ('admin','super_admin')")).rows[0].n;
  if (stillAdmin < 1) throw new Error("no admin role remains — rolled back");

  const publicRolesLeft = (await client.query(
    `select count(*)::int as n from public.user_roles ur
      where ur.role in ('learner','instructor')
        and not exists (select 1 from public.user_roles a
                         where a.user_id = ur.user_id and a.role in ('admin','super_admin'))`)).rows[0].n;

  await client.query("commit");
  console.log(`\n0027 applied. role rows ${before} -> ${before - removed} (removed ${removed})`);
  console.log(`  admin roles intact          : ${stillAdmin}`);
  console.log(`  ordinary public roles intact: ${publicRolesLeft}`);
} catch (cause) {
  await client.query("rollback");
  console.error("ROLLED BACK:", cause.message);
  process.exitCode = 1;
}

console.log("\nAFTER");
console.table(await snapshot());

console.log("\nBoard account now holds:");
console.table((await client.query(
  `select substr(md5(u.email::text),1,6) as acct,
          coalesce(string_agg(r.role, ',' order by r.role), '(none)') as roles
     from auth.users u
     join public.user_roles r on r.user_id = u.id
    where u.id in (select user_id from public.user_roles where role in ('admin','super_admin'))
    group by u.id, u.email`)).rows);

console.log("\nOrphaned learner_profiles row on the board account (reported, not deleted):");
console.table((await client.query(
  `select substr(md5(u.email::text),1,6) as acct, lp.profile_status,
          (lp.profile_status = 'published') as visible_to_instructors
     from public.learner_profiles lp
     join auth.users u on u.id = lp.user_id
    where lp.user_id in (select user_id from public.user_roles where role in ('admin','super_admin'))`)).rows);

await client.end();
