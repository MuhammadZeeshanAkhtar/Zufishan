import { describe, expect, it } from "vitest";

const describeIfConfigured = process.env.SUPABASE_DB_URL?.trim() ? describe : describe.skip;

describeIfConfigured("applied Hifz PostgreSQL catalog", () => {
  it("contains the Hifz tables with RLS, expected policies, indexes, and foreign keys", async () => {
    const { Client } = await import("pg");
    const client = new Client({ connectionString: process.env.SUPABASE_DB_URL, connectionTimeoutMillis: 8000, query_timeout: 8000, ssl: { rejectUnauthorized: false } });
    try {
      await client.connect();
      const tables = await client.query<{ table_name: string; rls_enabled: boolean }>(`select c.relname as table_name, c.relrowsecurity as rls_enabled from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = any($1::text[]) and c.relkind = 'r' order by c.relname`, [["hifz_plans", "hifz_records", "hifz_reviews", "hifz_reminders"]]);
      expect(tables.rows).toEqual([
        { table_name: "hifz_plans", rls_enabled: true }, { table_name: "hifz_records", rls_enabled: true }, { table_name: "hifz_reminders", rls_enabled: true }, { table_name: "hifz_reviews", rls_enabled: true },
      ]);
      const indexes = await client.query<{ indexname: string }>(`select indexname from pg_indexes where schemaname = 'public' and indexname = any($1::text[]) order by indexname`, [["hifz_plans_instructor_idx", "hifz_plans_learner_updated_idx", "hifz_records_instructor_status_idx", "hifz_records_learner_date_idx", "hifz_records_plan_section_idx", "hifz_reminders_learner_schedule_idx", "hifz_reviews_instructor_idx", "hifz_reviews_learner_reviewed_idx", "hifz_reviews_plan_type_idx", "hifz_reviews_record_idx"]]);
      expect(indexes.rows.map((row) => row.indexname)).toEqual(["hifz_plans_instructor_idx", "hifz_plans_learner_updated_idx", "hifz_records_instructor_status_idx", "hifz_records_learner_date_idx", "hifz_records_plan_section_idx", "hifz_reminders_learner_schedule_idx", "hifz_reviews_instructor_idx", "hifz_reviews_learner_reviewed_idx", "hifz_reviews_plan_type_idx", "hifz_reviews_record_idx"]);
      const policies = await client.query<{ tablename: string; policyname: string }>(`select tablename, policyname from pg_policies where schemaname = 'public' and tablename = any($1::text[]) order by tablename, policyname`, [["hifz_plans", "hifz_records", "hifz_reviews", "hifz_reminders"]]);
      expect(policies.rows.map((row) => `${row.tablename}:${row.policyname}`)).toEqual([
        "hifz_plans:hifz_plans_own_select", "hifz_plans:hifz_plans_own_write", "hifz_records:hifz_records_instructor_select", "hifz_records:hifz_records_learner_insert", "hifz_records:hifz_records_learner_select", "hifz_records:hifz_records_learner_update", "hifz_reminders:hifz_reminders_own_select", "hifz_reminders:hifz_reminders_own_write", "hifz_reviews:hifz_reviews_assigned_instructor_select", "hifz_reviews:hifz_reviews_assigned_instructor_update", "hifz_reviews:hifz_reviews_authorised_select", "hifz_reviews:hifz_reviews_instructor_manage", "hifz_reviews:hifz_reviews_learner_insert", "hifz_reviews:hifz_reviews_learner_update",
      ]);
      const relationships = await client.query<{ table_name: string; column_name: string; referenced_table: string }>(`select tc.table_name, kcu.column_name, ccu.table_name as referenced_table from information_schema.table_constraints tc join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public' and tc.table_name = any($1::text[]) order by tc.table_name, kcu.column_name`, [["hifz_plans", "hifz_records", "hifz_reviews", "hifz_reminders"]]);
      expect(relationships.rows).toEqual([
        { table_name: "hifz_plans", column_name: "instructor_id", referenced_table: "profiles" }, { table_name: "hifz_plans", column_name: "learner_id", referenced_table: "profiles" }, { table_name: "hifz_records", column_name: "instructor_id", referenced_table: "profiles" }, { table_name: "hifz_records", column_name: "learner_id", referenced_table: "profiles" }, { table_name: "hifz_records", column_name: "plan_id", referenced_table: "hifz_plans" }, { table_name: "hifz_reminders", column_name: "learner_id", referenced_table: "profiles" }, { table_name: "hifz_reminders", column_name: "plan_id", referenced_table: "hifz_plans" }, { table_name: "hifz_reviews", column_name: "instructor_id", referenced_table: "profiles" }, { table_name: "hifz_reviews", column_name: "learner_id", referenced_table: "profiles" }, { table_name: "hifz_reviews", column_name: "plan_id", referenced_table: "hifz_plans" }, { table_name: "hifz_reviews", column_name: "record_id", referenced_table: "hifz_records" }, { table_name: "hifz_reviews", column_name: "reviewed_by", referenced_table: "profiles" },
      ]);
    } finally { await client.end().catch(() => undefined); }
  });
});
