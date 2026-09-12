/**
 * Applies 0017, which stops a review author publishing their own review.
 *
 * Additive and reversible: it creates one function and one trigger, and alters no table, column,
 * policy or row. Run inside a transaction so a failure leaves nothing half-applied.
 */
import { readFile } from "node:fs/promises";
import "dotenv/config";
import pg from "pg";

const sql = await readFile(new URL("../supabase/migrations/0021_certificate_rule_and_verification_code.sql", import.meta.url), "utf8");
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
    "select column_name from information_schema.columns where table_name in ('courses','certificates') and column_name in ('pass_mark','verification_code')",
  );
  console.log(`0021 applied; columns present: ${rows.map((r) => r.column_name).sort().join(", ") || "none"}`);
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  // Print the message only — a connection string must never reach the log.
  console.error("0021 failed:", error?.message ?? "unknown error");
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
