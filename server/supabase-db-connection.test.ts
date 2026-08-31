import { describe, expect, it } from "vitest";

function redactDatabaseUrl(value: string) {
  const parsed = new URL(value);
  parsed.username = "redacted";
  parsed.password = "redacted";
  return parsed.toString();
}

describe("Supabase PostgreSQL connection", () => {
  it("validates the configured server-only URL and reaches the database endpoint without changing data", async () => {
    const raw = process.env.SUPABASE_DB_URL?.trim();
    expect(raw).toBeTruthy();
    const parsed = new URL(raw!);
    expect(["postgres:", "postgresql:"].includes(parsed.protocol)).toBe(true);
    expect(parsed.hostname).toBeTruthy();
    expect(parsed.port || "5432").toMatch(/^\d+$/);

    const { Client } = await import("pg");
    const client = new Client({ connectionString: raw, connectionTimeoutMillis: 8000, query_timeout: 8000, ssl: { rejectUnauthorized: false } });
    try {
      await client.connect();
      const result = await client.query<{ ok: number }>("select 1 as ok");
      expect(result.rows[0]?.ok).toBe(1);
    } finally {
      await client.end().catch(() => undefined);
    }
    expect(redactDatabaseUrl(raw!)).not.toContain(parsed.password);
  });
});
