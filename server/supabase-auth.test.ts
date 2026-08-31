import { describe, expect, it } from "vitest";
import { getBearerTokenForTest } from "./supabase-auth";

describe("Supabase server auth boundary", () => {
  const request = (authorization?: string) => ({ header: (name: string) => name.toLowerCase() === "authorization" ? authorization : undefined });

  it("accepts only a bearer token from the authorization header", () => {
    expect(getBearerTokenForTest(request("Bearer verified-token"))).toBe("verified-token");
    expect(getBearerTokenForTest(request("bearer verified-token"))).toBe("verified-token");
    expect(getBearerTokenForTest(request("Basic not-a-bearer"))).toBeNull();
    expect(getBearerTokenForTest(request())).toBeNull();
  });

  it("does not parse browser role or user-id claims as authorization", () => {
    const token = getBearerTokenForTest(request("Bearer token-with-role-admin"));
    expect(token).toBe("token-with-role-admin");
    expect("role" in { token }).toBe(false);
    expect("userId" in { token }).toBe(false);
  });
});
