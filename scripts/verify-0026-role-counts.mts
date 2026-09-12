/**
 * Renders what the Admin Dashboard will show, through the real code path.
 *
 * It calls `getAdminOverview` and `listUsers` — the same functions the tRPC
 * procedures call — so this is the page's own payload, not a re-implementation
 * of it. The administrator is found by querying which account actually holds the
 * `admin` role; no address is typed here, read from an environment variable into
 * this output, or hardcoded anywhere. Accounts are shown by display name and a
 * short id, exactly as the desk shows them.
 *
 * Read-only: it performs no write and changes no role record.
 */
import "dotenv/config";
import pg from "pg";
import { getAdminOverview } from "../server/admin-overview";
import { listUsers } from "../server/admin-users";
import type { SupabaseIdentity } from "../server/supabase-auth";

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) throw new Error("SUPABASE_DB_URL is not configured");

const db = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 45000 });
await db.connect();

// Whoever actually holds the admin role. Not an address, not a guess.
const { rows: admins } = await db.query(
  "select user_id::text as id from public.user_roles where role in ('admin','super_admin') limit 1",
);
if (admins.length === 0) throw new Error("No account holds an admin role; nothing to verify against.");
const identity: SupabaseIdentity = { id: admins[0].id, email: null, accessToken: "" };

console.log("=== BEFORE: what the old query counted (rows in user_roles) ===");
for (const role of ["learner", "instructor"]) {
  const { rows } = await db.query("select count(*)::int as n from public.user_roles where role = $1", [role]);
  console.log(`  Total ${role}s (role rows) : ${rows[0].n}`);
}

console.log("\n=== AFTER: the Admin Overview payload, as the page receives it ===");
const overview = await getAdminOverview(identity);
if (!overview.ok) throw new Error(`overview failed: ${overview.error}`);
for (const metric of overview.data.metrics) {
  if (!["learners", "instructors", "admins"].includes(metric.key)) continue;
  console.log(`  metric ${metric.key.padEnd(12)} = ${metric.available ? metric.value : "could not be read"}`);
}
console.log("\n  Accounts by role (the reconciliation line under the cards):");
let sum = 0;
for (const bucket of overview.data.accountRoles.buckets) {
  console.log(`    ${bucket.key.padEnd(12)} ${bucket.available ? bucket.value : "unavailable"}`);
  sum += bucket.value ?? 0;
}
const total = overview.data.accountRoles.totalAccounts;
console.log(`    ${"TOTAL".padEnd(12)} ${total}  -> buckets sum to ${sum}: ${sum === total ? "RECONCILES" : "MISMATCH"}`);

console.log("\n=== AFTER: User Management, first page, as the page receives it ===");
const list = await listUsers(identity, { limit: 25, offset: 0 });
if (!list.ok) throw new Error(`listUsers failed: ${list.error}`);
for (const row of list.data.rows) {
  const name = (row.displayName ?? "(no display name)").padEnd(20);
  console.log(`  ${name} effectiveRole=${row.effectiveRole.padEnd(12)} rolesHeld=[${row.roles.join(", ")}]`);
}
console.log(`  total ${list.data.total}`);

console.log("\n=== AFTER: each role filter returns only its own accounts ===");
for (const filter of ["learner", "instructor", "admin", "staff", "unassigned"] as const) {
  const page = await listUsers(identity, { role: filter, limit: 25, offset: 0 });
  if (!page.ok) { console.log(`  ${filter.padEnd(11)} ERROR ${page.error}`); continue; }
  const names = page.data.rows.map((row) => `${row.displayName ?? row.id.slice(0, 8)}:${row.effectiveRole}`);
  console.log(`  ${filter.padEnd(11)} ${page.data.total} account(s)  ${names.join("  ")}`);
}

const learnerPage = await listUsers(identity, { role: "learner", limit: 25, offset: 0 });
const adminInLearners = learnerPage.ok && learnerPage.data.rows.some((row) => row.id === identity.id);
console.log(`\n  The signed-in administrator appears under the Learner filter: ${adminInLearners}`);

await db.end();
