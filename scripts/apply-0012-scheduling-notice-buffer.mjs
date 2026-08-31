import { readFile } from "node:fs/promises";
import pg from "pg";

const sql = await readFile(new URL("../supabase/migrations/0012_scheduling_notice_buffer.sql", import.meta.url), "utf8");
const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) throw new Error("SUPABASE_DB_URL is not configured");
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  await client.query("begin");
  await client.query(sql);
  await client.query("commit");
  console.log("Migration 0012 applied successfully through PostgreSQL.");
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  console.error("Migration 0012 failed.");
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
