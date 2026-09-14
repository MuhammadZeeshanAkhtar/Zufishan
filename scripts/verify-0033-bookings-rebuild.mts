/**
 * Proves 0033 transcribes `bookings` exactly — by rebuilding it from nothing.
 *
 * Fingerprints the live table, then inside ONE transaction that is ROLLED BACK: drops it,
 * runs the migration, and fingerprints the result. If the two fingerprints match, the
 * migration produces the table a fresh environment needs. Nothing survives the rollback.
 *
 * A weaker check — running the migration against the existing table and seeing no error —
 * would only prove it is idempotent, not that it is COMPLETE. A column or constraint left
 * out of the file would pass that check and still break a new environment, which is the
 * whole failure this migration exists to prevent.
 */
import { readFileSync } from "node:fs";
import pg from "pg";

const env = Object.fromEntries(
  readFileSync(".env", "utf8").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);

const client = new pg.Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 45000 });
await client.connect();

/** Columns, constraints, indexes and policies, normalised and sorted. */
async function fingerprint() {
  const cols = await client.query(`
    select column_name || ' ' || coalesce(udt_name,'') || ' ' || is_nullable || ' ' || coalesce(column_default,'-') as line
    from information_schema.columns where table_schema='public' and table_name='bookings' order by column_name`);
  const cons = await client.query(`
    select conname || ' :: ' || pg_get_constraintdef(oid) as line
    from pg_constraint where conrelid='public.bookings'::regclass order by conname`);
  const idx = await client.query(`
    select indexdef as line from pg_indexes where schemaname='public' and tablename='bookings' order by indexname`);
  const pol = await client.query(`
    select policyname || ' [' || cmd || '] ' || coalesce(qual,'-') || ' | ' || coalesce(with_check,'-') as line
    from pg_policies where schemaname='public' and tablename='bookings' order by policyname`);
  const rls = await client.query(`select relrowsecurity as on from pg_class where oid='public.bookings'::regclass`);
  return {
    columns: cols.rows.map((r) => r.line),
    constraints: cons.rows.map((r) => r.line),
    indexes: idx.rows.map((r) => r.line),
    policies: pol.rows.map((r) => r.line),
    rls: rls.rows[0]?.on,
  };
}

const diff = (a: string[], b: string[]) => ({
  onlyBefore: a.filter((x) => !b.includes(x)),
  onlyAfter: b.filter((x) => !a.includes(x)),
});

try {
  const rows = await client.query("select count(*)::int as n from public.bookings");
  console.log("live bookings rows:", rows.rows[0].n);

  const before = await fingerprint();
  console.log(`before: ${before.columns.length} columns, ${before.constraints.length} constraints, ${before.indexes.length} indexes, ${before.policies.length} policies, rls=${before.rls}`);

  await client.query("begin");
  await client.query("drop table public.bookings cascade");
  await client.query(readFileSync("supabase/migrations/0033_bookings_enters_the_migration_history.sql", "utf8"));
  const after = await fingerprint();
  console.log(`after:  ${after.columns.length} columns, ${after.constraints.length} constraints, ${after.indexes.length} indexes, ${after.policies.length} policies, rls=${after.rls}`);

  let clean = true;
  for (const part of ["columns", "constraints", "indexes", "policies"] as const) {
    const d = diff(before[part], after[part]);
    if (d.onlyBefore.length || d.onlyAfter.length) {
      clean = false;
      console.log(`\n  ${part.toUpperCase()} DIFFER`);
      d.onlyBefore.forEach((l) => console.log("    missing from migration:", l));
      d.onlyAfter.forEach((l) => console.log("    added by migration:   ", l));
    }
  }
  if (before.rls !== after.rls) { clean = false; console.log("  RLS differs:", before.rls, "->", after.rls); }

  console.log(clean ? "\n✓ identical — the migration rebuilds this table exactly" : "\n✗ the migration does not match the live table");

  await client.query("rollback");
  const back = await client.query("select count(*)::int as n from public.bookings");
  console.log("rolled back — bookings rows:", back.rows[0].n);
} finally {
  await client.end();
}
