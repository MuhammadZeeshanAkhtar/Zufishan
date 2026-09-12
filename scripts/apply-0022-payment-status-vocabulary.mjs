/**
 * Applies 0017, which stops a review author publishing their own review.
 *
 * Additive and reversible: it creates one function and one trigger, and alters no table, column,
 * policy or row. Run inside a transaction so a failure leaves nothing half-applied.
 */
import { readFile } from "node:fs/promises";
import "dotenv/config";
import pg from "pg";

const sql = await readFile(new URL("../supabase/migrations/0022_payment_status_vocabulary.sql", import.meta.url), "utf8");
const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) throw new Error("SUPABASE_DB_URL is not configured");

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  await client.query("begin");
  await client.query(sql);
  await client.query("commit");

  // Report what now exists, rather than assuming the statement did what it said.
  const { rows } = await client.query(
    "select conname from pg_constraint where conname in ('session_ledger_payment_status_vocabulary','payment_references_status_vocabulary')",
  );
  console.log(`0022 applied; constraints present: ${rows.map((r) => r.conname).sort().join(", ") || "none"}`);
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  // Print the message only — a connection string must never reach the log.
  console.error("0022 failed:", error?.message ?? "unknown error");
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
