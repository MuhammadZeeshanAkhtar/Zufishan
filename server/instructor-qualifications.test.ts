/**
 * A teacher's stated background, and the boundaries it had to respect.
 *
 * Zufishan had `has_ijazah`: a single yes/no box that cannot say which ijazah, from whom, or when,
 * and nowhere at all to state where someone had taught. The reference marketplace gives a tutor
 * three repeatable lists. This adds them — which means a new table, and a new table is exactly the
 * kind of change worth pinning: what it may hold, who may read it, and what it must not touch.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { QUALIFICATION_KINDS } from "./instructor-qualifications";

const server = readFileSync(new URL("./instructor-qualifications.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/0034_instructor_qualifications.sql", import.meta.url), "utf8");
const routers = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const editor = readFileSync(new URL("../client/src/components/TutorQualifications.tsx", import.meta.url), "utf8");
const management = readFileSync(new URL("../client/src/components/InstructorManagement.tsx", import.meta.url), "utf8");
const catalog = readFileSync(new URL("../client/src/i18n/catalog.ts", import.meta.url), "utf8");

/** Source with comments stripped: these files describe what they replaced, which is not a call. */
const codeOnly = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--.*$/gm, " ").replace(/\/\/.*$/gm, " ");

describe("the migration is additive and nothing else", () => {
  it("creates one table and adds one column", () => {
    expect(migration).toContain("create table if not exists public.instructor_qualifications");
    expect(migration).toContain("alter table public.instructor_profiles add column if not exists fiqh text;");
  });

  it("drops, renames and rewrites nothing", () => {
    const sql = codeOnly(migration).toLowerCase();
    for (const forbidden of ["drop table", "drop column", "drop policy", "rename", "truncate", "delete from", "update public."]) {
      expect(sql, `migration must not ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("leaves the existing credentials table alone", () => {
    /*
     * `instructor_credentials` is the private *file* table an admin reviews, and prose does not go
     * in it. The table comment names it to say exactly that, so this checks for statements against
     * it rather than for the word — a mention is documentation, a DDL line would be a change.
     */
    const sql = codeOnly(migration).toLowerCase();
    for (const statement of ["alter table public.instructor_credentials", "drop table public.instructor_credentials", "insert into public.instructor_credentials"]) {
      expect(sql, statement).not.toContain(statement);
    }
  });

  it("turns row level security on and owns the rows to the teacher", () => {
    expect(migration).toContain("alter table public.instructor_qualifications enable row level security;");
    expect(migration).toContain("using (instructor_id = auth.uid() or public.is_admin_user())");
    expect(migration).toContain("with check (instructor_id = auth.uid() or public.is_admin_user())");
  });

  it("opens the public read no wider than the listing already is", () => {
    // Exactly the condition the marketplace listing itself requires.
    expect(migration).toContain("p.public_profile_status = 'published'");
    expect(migration).toContain("p.verification_status = 'approved'");
  });

  it("bounds every text column rather than accepting unbounded prose", () => {
    expect(migration).toContain("length(btrim(title)) between 1 and 160");
    for (const bound of ["length(organisation) <= 160", "length(period) <= 80", "length(detail) <= 600"]) {
      expect(migration, bound).toContain(bound);
    }
  });

  it("constrains kind to the three lists the editor offers", () => {
    expect(migration).toContain("kind in ('employment', 'certification', 'ijazah')");
    expect(QUALIFICATION_KINDS).toEqual(["employment", "certification", "ijazah"]);
  });

  it("constrains fiqh to declared schools, with null meaning not stated", () => {
    expect(migration).toContain("fiqh in ('Hanafi', 'Shafii', 'Maliki', 'Hanbali', 'Other', 'Prefer not to say')");
    expect(migration).toContain("fiqh is null or");
  });
});

describe("the server writes only the caller's own rows", () => {
  it("runs on the caller's client, never an elevated one", () => {
    expect(server).toContain("getSupabaseUserClient(identity.accessToken)");
    expect(codeOnly(server)).not.toContain("getSupabaseAdminClient");
  });

  it("scopes both halves of the replace to the caller", () => {
    const fn = server.slice(server.indexOf("export async function replaceQualifications"));
    expect(fn).toContain('.eq("instructor_id", identity.id).eq("kind", input.kind)');
    expect(fn).toContain("instructor_id: identity.id,");
  });

  it("reads a published teacher's entries on the anonymous client", () => {
    const fn = server.slice(server.indexOf("export async function listPublicQualifications"), server.indexOf("export async function replaceQualifications"));
    expect(fn).toContain("getSupabasePublicClient()");
    // The policy permits it; the function does not decide.
    expect(fn).not.toContain("public_profile_status");
  });

  it("drops a blank row instead of storing it", () => {
    expect(server).toContain("(entry) => entry.title.length > 0");
  });

  it("caps how many entries one list may hold", () => {
    expect(server).toContain(".slice(0, 20)");
    expect(routers).toContain("})).max(20),");
  });

  it("says setup is needed rather than throwing when the migration is not applied", () => {
    // Both layers that can answer: Postgres itself, and PostgREST's schema cache.
    expect(server).toContain('const MISSING_TABLE = ["42P01", "PGRST205"];');
    expect(server).toContain('return fail("Qualifications are not set up on this project yet.", "SETUP_NEEDED")');
    // A visitor reading someone's profile sees no section, not an error about a migration.
    const publicRead = server.slice(server.indexOf("export async function listPublicQualifications"), server.indexOf("export async function replaceQualifications"));
    expect(publicRead).toContain("if (notMigrated(error)) return { ok: true, data: [] };");
  });

  it("validates kind at the router as well as in the function", () => {
    expect(routers).toContain('kind: z.enum(["employment", "certification", "ijazah"]),');
    expect(server).toContain("if (!QUALIFICATION_KINDS.includes(input.kind))");
  });
});

describe("what a teacher sees, and what a student reads", () => {
  it("gives each list its own save, so a typo does not resubmit the whole profile", () => {
    expect(editor).toContain("trpc.scheduling.saveQualifications.useMutation()");
    expect(editor).toContain('<List key={entry.key} kind={entry.key}');
  });

  it("keeps an empty row to type into, as the reference does", () => {
    expect(editor).toContain("setRows([...mine, blank()]);");
    expect(editor).toContain('t("tutorQual.addAnother")');
    expect(editor).toContain('t("tutorQual.remove")');
  });

  it("is mounted on the profile editor and on the public profile", () => {
    expect(management).toContain("<TutorQualifications/>");
    expect(management).toContain("<PublicInstructorBackground instructorId={profile.user_id} />");
  });

  it("names the migration as the reason when the section cannot open", () => {
    expect(editor).toContain('query.data.code === "SETUP_NEEDED"');
    expect(catalog).toContain("This section opens once its database migration has been applied");
  });

  it("adds fiqh beside sect rather than folding it into it", () => {
    expect(management).toContain('t("tutorQual.fiqh")');
    expect(management).toContain('update("fiqh", e.target.value)');
    // The two stay separate all the way to the row.
    expect(routers).toContain('fiqh: z.enum(["Hanafi", "Shafii", "Maliki", "Hanbali", "Other", "Prefer not to say"]).optional()');
  });

  it("is written in all three languages, and uses no new colour", () => {
    for (const key of ["tutorQual.title", "tutorQual.employment", "tutorQual.ijazah", "tutorQual.fiqh", "tutorQual.setupNeeded"]) {
      expect(catalog.match(new RegExp(`"${key.replace(".", "\\.")}":`, "g")), key).toHaveLength(3);
    }
    expect(codeOnly(editor)).not.toMatch(/#[0-9a-fA-F]{6}\b/);
  });
});
