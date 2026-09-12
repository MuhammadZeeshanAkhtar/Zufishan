/**
 * Applies 0024, which makes the notifications conflict target inferable.
 *
 * Replaces one index. No column, policy, trigger or row is altered, and the
 * uniqueness it enforces is unchanged for the rows themselves.
 *
 * Afterwards it proves the fix the only way that counts: by issuing the exact
 * statement `notify()` issues, inside a transaction that is rolled back — once
 * as a first raise and once as a repeat, to show both that it lands and that it
 * does not duplicate.
 */
import { readFile } from "node:fs/promises";
import "dotenv/config";
import pg from "pg";

const sql = await readFile(new URL("../supabase/migrations/0024_notifications_conflict_target_is_inferable.sql", import.meta.url), "utf8");
const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) throw new Error("SUPABASE_DB_URL is not configured");

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 45000, query_timeout: 45000 });
try {
  await client.connect();

  const before = (await client.query("select count(*)::int as n from public.notifications")).rows[0].n;
  await client.query("begin");
  await client.query(sql);
  await client.query("commit");

  const { rows: index } = await client.query(
    "select indexdef from pg_indexes where schemaname='public' and tablename='notifications' and indexname='notifications_recipient_idempotency_idx'",
  );
  const definition = index[0]?.indexdef ?? "";
  console.log("0024 applied.");
  console.log("  index exists      :", Boolean(definition));
  console.log("  no longer partial :", !definition.includes("WHERE"));

  // The proof: the statement notify() actually sends, twice, then discarded.
  const target = (await client.query("select id from public.profiles limit 1")).rows[0]?.id;
  if (!target) {
    console.log("\nNo profile to address a probe notification to; skipping the write proof.");
  } else {
    await client.query("begin");
    const raise = () => client.query(
      `insert into public.notifications (user_id, type, title, body, related_entity_type, related_entity_id, idempotency_key, locale)
       values ($1, 'verification_decided', 'probe', 'probe', 'instructor_profiles', $1, 'probe:0024', 'en')
       on conflict (user_id, idempotency_key) do nothing`,
      [target],
    );
    const first = await raise();
    const second = await raise();
    const total = (await client.query("select count(*)::int as n from public.notifications where idempotency_key = 'probe:0024'")).rows[0].n;
    console.log("\nthe statement notify() sends (rolled back):");
    console.log(`  first raise  → ${first.rowCount} row inserted`);
    console.log(`  repeat raise → ${second.rowCount} rows inserted (idempotent)`);
    console.log(`  rows for that key: ${total}`);
    await client.query("rollback");
  }

  const after = (await client.query("select count(*)::int as n from public.notifications")).rows[0].n;
  console.log(`\nnotifications before ${before}, after ${after} — ${before === after ? "unchanged" : "CHANGED, INVESTIGATE"}`);
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  // Print the message only — a connection string must never reach the log.
  console.error("0024 failed:", error?.message ?? "unknown error");
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
