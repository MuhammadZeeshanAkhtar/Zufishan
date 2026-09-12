/**
 * Applies 0023, which makes the signup trigger honour the requested role.
 *
 * Replaces one function body. It alters no table, column, policy or row, and it
 * cannot change an existing account's roles — only what happens on the next
 * signup. Run inside a transaction so a failure leaves nothing half-applied.
 *
 * Afterwards it proves the new body is live by simulating a signup inside a
 * transaction that is rolled back: three accounts are created in `auth.users`
 * with different requested roles, the resulting `user_roles` rows are read back,
 * and everything is discarded. No account survives this script.
 */
import { readFile } from "node:fs/promises";
import "dotenv/config";
import pg from "pg";

const sql = await readFile(new URL("../supabase/migrations/0023_signup_role_is_the_requested_one.sql", import.meta.url), "utf8");
const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) throw new Error("SUPABASE_DB_URL is not configured");

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();

  const before = await client.query("select count(*)::int as roles from public.user_roles");
  await client.query("begin");
  await client.query(sql);
  await client.query("commit");

  const { rows: live } = await client.query(
    "select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'handle_new_auth_user'",
  );
  const body = live[0]?.prosrc ?? "";
  console.log("0023 applied.");
  console.log("  reads requested_public_role :", body.includes("requested_public_role"));
  console.log("  allow-list is the two public roles:", body.includes("in ('learner', 'instructor')"));
  console.log("  no unconditional learner insert  :", !body.includes("values (new.id, 'learner')"));

  // Rolled-back proof that the trigger now grants what was asked for.
  await client.query("begin");
  const probe = async (label, metadata) => {
    const id = (await client.query("select gen_random_uuid() as id")).rows[0].id;
    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
       values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, '', now(), '{}'::jsonb, $3::jsonb, now(), now())`,
      [id, `probe-${label}-${id}@example.invalid`, JSON.stringify(metadata)],
    );
    const roles = await client.query("select role from public.user_roles where user_id = $1 order by role", [id]);
    const learner = await client.query("select 1 from public.learner_profiles where user_id = $1", [id]);
    console.log(
      `  ${label.padEnd(22)} roles=[${roles.rows.map((r) => r.role).join(",") || "none"}]  learner_profile=${learner.rowCount > 0}`,
    );
  };
  console.log("\nsimulated signups (rolled back):");
  await probe("requested learner", { requested_public_role: "learner" });
  await probe("requested instructor", { requested_public_role: "instructor" });
  await probe("requested admin", { requested_public_role: "admin" });
  await probe("no role requested", {});
  await client.query("rollback");

  const after = await client.query("select count(*)::int as roles from public.user_roles");
  console.log(`\nrole rows before ${before.rows[0].roles}, after ${after.rows[0].roles} — ${before.rows[0].roles === after.rows[0].roles ? "unchanged" : "CHANGED, INVESTIGATE"}`);
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  // Print the message only — a connection string must never reach the log.
  console.error("0023 failed:", error?.message ?? "unknown error");
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
