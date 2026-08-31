import { describe, expect, it } from "vitest";

describe("configured Supabase database secret", () => {
  it("authenticates with a non-mutating health query without exposing the URL", async () => {
    const connectionString = process.env.SUPABASE_DB_URL?.trim();
    expect(connectionString).toBeTruthy();
    const parsed = new URL(connectionString!);
    expect(["postgres:", "postgresql:"].includes(parsed.protocol)).toBe(true);
    const { Client } = await import("pg");
    const client = new Client({ connectionString, connectionTimeoutMillis: 8000, query_timeout: 8000, ssl: { rejectUnauthorized: false } });
    try {
      await client.connect();
      const result = await client.query<{ ok: number }>("select 1 as ok");
      expect(result.rows[0]?.ok).toBe(1);
    } finally {
      await client.end().catch(() => undefined);
    }
    expect(parsed.password).not.toBe("");
  });
});
