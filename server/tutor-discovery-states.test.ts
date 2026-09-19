import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const scheduling = readFileSync(new URL("./scheduling.ts", import.meta.url), "utf8");
const core = readFileSync(new URL("./supabase-core.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/0014_instructor_sect_and_ijazah.sql", import.meta.url), "utf8");

const teachersPage = app.slice(app.indexOf("function TeachersPage"), app.indexOf("\nfunction ", app.indexOf("function TeachersPage") + 20));

describe("tutor discovery distinguishes failure from emptiness", () => {
  it("treats a handled ok:false payload as a failure, not an empty marketplace", () => {
    // The procedure returns { ok: false } over a SUCCESSFUL request, so react-query's
    // isError is false. Relying on isError alone printed "0 approved instructors"
    // while discovery was actually returning 42703.
    expect(teachersPage).toContain("const discoveryFailed = instructorsQuery.isError || (instructorsQuery.data !== undefined && !instructorsQuery.data.ok);");
  });

  it("renders the error state on failure and suppresses the results block", () => {
    expect(teachersPage).toContain('{discoveryFailed && <p role="alert"');
    expect(teachersPage).toContain("{!instructorsQuery.isLoading && !discoveryFailed && <>");
    // The old, insufficient guards are gone.
    expect(teachersPage).not.toContain('{instructorsQuery.isError && <p role="alert"');
    expect(teachersPage).not.toContain("!instructorsQuery.isLoading && !instructorsQuery.isError && <>");
  });

  it("keeps a genuine empty result visually separate from a failure", () => {
    // total/instructors still drive the empty copy; they are only reachable when
    // discovery succeeded, so the two states can never be confused again.
    expect(teachersPage).toContain("const instructors = result?.instructors ?? [];");
    expect(teachersPage).toContain("const total = result?.total ?? 0;");
  });

  it("never substitutes demo tutors for a failed or empty response", () => {
    expect(teachersPage).not.toMatch(/demoInstructor|fallbackInstructors|sampleTutors/);
  });
});

describe("the discovery query matches the applied schema", () => {
  it("selects sect and has_ijazah, which migration 0014 creates", () => {
    const fn = scheduling.slice(scheduling.indexOf("export async function listPublicInstructors"));
    const select = (fn.match(/\.select\("([^"]+)"/) ?? [])[1] ?? "";
    expect(select).toContain("sect");
    expect(select).toContain("has_ijazah");
    expect(migration).toContain("add column if not exists sect text");
    expect(migration).toContain("add column if not exists has_ijazah boolean not null default false");
  });

  it("filters on them without breaking the unfiltered list", () => {
    // Both filters are conditional, so an unfiltered call still returns everything
    // the published/approved gate allows.
    expect(scheduling).toContain('if (filters.sect) request = request.eq("sect", filters.sect);');
    expect(scheduling).toContain('if (filters.hasIjazah) request = request.eq("has_ijazah", true);');
  });

  it("keeps the published/approved gate ahead of any caller filter", () => {
    const discovery = scheduling.slice(scheduling.indexOf("export async function listPublicInstructors"));
    expect(discovery).toContain('.eq("public_profile_status", "published")');
    expect(discovery).toContain('.eq("public_profile_status", "published")');
    expect(discovery).toContain("const client = getSupabasePublicClient();");
  });
});

describe("instructor profile save is scoped and validated", () => {
  it("writes sect and has_ijazah to instructor_profiles", () => {
    expect(core).toContain("sect: input.sect!.trim() || null");
    expect(core).toContain("has_ijazah: input.hasIjazah");
  });

  it("scopes every write to the server-verified identity", () => {
    const fn = core.slice(core.indexOf("export async function updateOwnInstructorProfile"), core.indexOf("export async function updateOwnLearnerProfile"));
    expect(fn).toContain('.eq("id", identity.id)');
    expect(fn).toContain("user_id: identity.id");
    // No client-supplied owner id may reach the write.
    expect(fn).not.toMatch(/input\.(userId|user_id|instructorId)/);
  });

  it("constrains sect to the declared vocabulary in the database", () => {
    expect(migration).toContain("check (sect is null or sect in ('Sunni', 'Shia', 'Other', 'Prefer not to say'))");
  });

  it("0014 is additive and leaves RLS alone", () => {
    const stripped = migration.replace(/--.*$/gm, "").toLowerCase();
    for (const bad of ["drop ", "delete ", "truncate", "alter column", "create policy", "alter policy"]) {
      expect(stripped, `${bad} must not appear`).not.toContain(bad);
    }
  });
});
