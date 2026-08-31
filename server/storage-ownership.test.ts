import { describe, expect, it } from "vitest";
import { buildPrivateObjectPath, PRIVATE_BUCKETS, validatePrivateFile } from "./supabase-storage";
import { readFileSync } from "node:fs";

const storageSource = readFileSync(new URL("./supabase-storage.ts", import.meta.url), "utf8");
const migrationSource = readFileSync(new URL("../supabase/migrations/0004_private_storage_policies.sql", import.meta.url), "utf8");

describe("private Storage ownership contracts", () => {
  it("prefixes instructor credential and media objects with the authenticated identity", () => {
    const identity = "11111111-1111-1111-1111-111111111111";
    expect(buildPrivateObjectPath(PRIVATE_BUCKETS.credentials, identity, { filename: "id.pdf" })).toBe(`${identity}/credentials/id.pdf`);
    expect(buildPrivateObjectPath(PRIVATE_BUCKETS.instructorMedia, identity, { filename: "intro.mp4" })).toBe(`${identity}/media/intro.mp4`);
  });

  it("uses bounded MIME and size validation before private uploads", () => {
    expect(validatePrivateFile(PRIVATE_BUCKETS.credentials, { filename: "id.pdf", mimeType: "application/pdf", sizeBytes: 100 }).ok).toBe(true);
    expect(validatePrivateFile(PRIVATE_BUCKETS.credentials, { filename: "id.exe", mimeType: "application/x-msdownload", sizeBytes: 100 }).ok).toBe(false);
  });

  it("keeps course and classroom access checks identity- and role-scoped", () => {
    expect(storageSource).toContain("instructor_id=$2::uuid");
    expect(storageSource).toContain("enrolments e");
    expect(storageSource).toContain("class_participants p");
    expect(storageSource).toContain('mode !== "delete"');
  });

  it("binds signed downloads and deletes to protected object ownership", () => {
    expect(storageSource).toContain("createSignedDownloadUrl");
    expect(storageSource).toContain("deletePrivateObject");
    expect(storageSource).toContain("credentials");
    expect(storageSource).toContain("identity.id");
    expect(storageSource).toContain("class_participants p");
    expect(storageSource).toContain("enrolments e");
  });

  it("keeps Storage object policies private and authenticated", () => {
    expect(migrationSource).toMatch(/bucket_id.*instructor-credentials|instructor-credentials.*bucket_id/i);
    expect(migrationSource).toMatch(/auth\.uid\(\)/);
    expect(migrationSource).toMatch(/authenticated/i);
    expect(migrationSource).not.toMatch(/\bto\s+anon\b/i);
  });
});
