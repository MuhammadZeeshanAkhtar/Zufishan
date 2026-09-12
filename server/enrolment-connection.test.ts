/**
 * Enrolment is a connection, so it has to be as hard to forge as one.
 *
 * THE HOLE. `enrolments_learner_insert` checked only `learner_id = auth.uid()`,
 * and `createEnrolment` checked nothing at all — it upserted straight in with
 * `status = 'active'`. Reading an unpublished course was already blocked by
 * `courses_published_or_owner`, so on its own this looked harmless.
 *
 * It was not, because an active enrolment is one of the four relationships that
 * authorise a conversation. Anyone holding a course UUID could insert an
 * enrolment against it and open messaging with that instructor — no publication,
 * no agreement, no request. The messaging rule was sound; this was the way round
 * it. Proven against the live database before the fix: a draft course accepted
 * the enrolment; after it, draft and archived are refused and published still
 * works.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../supabase/migrations/0029_enrolment_requires_a_published_course.sql");
const core = read("./supabase-core.ts");
const eligibility = read("./connection-eligibility.ts");

const enrolFn = core.slice(core.indexOf("export async function createEnrolment"), core.indexOf("export async function listOwnEnrolments"));

describe("only a published course can be enrolled in", () => {
  it("requires publication at the database, not only in the procedure", () => {
    const statements = migration.replace(/^\s*--.*$/gm, "");
    expect(statements).toContain("create policy enrolments_learner_insert");
    expect(statements).toContain("learner_id = auth.uid()");
    expect(statements).toContain("public.is_user_role('learner')");
    expect(statements).toContain("and c.status = 'published'");
  });

  it("adds no new table and no new status vocabulary", () => {
    expect(migration).not.toMatch(/create table|add column|alter table .* add constraint/i);
    // 'published' is the existing courses vocabulary.
    expect(read("../supabase/migrations/0001_noor_ilm_lms_canonical.sql")).toContain("create table public.courses");
  });

  it("touches only the insert policy, leaving reads and updates alone", () => {
    const statements = migration.replace(/^\s*--.*$/gm, "");
    expect(statements).toContain("for insert");
    expect(statements).not.toMatch(/for select|for update|for delete/);
    expect(statements).not.toMatch(/enrolments_own_update|enrolments_own_or_course_owner/);
  });

  it("refuses in the procedure too, with a reason the learner can act on", () => {
    expect(enrolFn).toContain('if (!row || row.status !== "published")');
    expect(enrolFn).toContain('return failure("That course is not open for enrolment.");');
  });

  it("still writes the enrolment the same way when the course is published", () => {
    expect(enrolFn).toContain('.upsert({ learner_id: identity.id, course_id: courseId, status: "active" }, { onConflict: "learner_id,course_id" })');
  });

  it("keeps enrolment as a messaging connection only while it is active", () => {
    expect(eligibility).toContain('export const CONNECTED_ENROLMENT_STATUSES = ["active", "completed"] as const;');
    expect(eligibility).toContain('export const PENDING_ENROLMENT_STATUSES = ["pending"] as const;');
  });
});

describe("the connection tells the other person", () => {
  it("notifies the instructor when a learner enrols", () => {
    expect(enrolFn).toContain('"enrolment_created"');
    expect(enrolFn).toContain("row.instructor_id");
    // Never notify yourself for enrolling in your own course.
    expect(enrolFn).toContain("row.instructor_id !== identity.id");
  });

  it("is idempotent, so a repeated enrolment does not repeat the notice", () => {
    expect(enrolFn).toContain("`enrolment:${courseId}:${identity.id}`");
    const helper = core.slice(core.indexOf("async function notifyUser"), core.indexOf("export async function createEnrolment"));
    expect(helper).toContain('{ onConflict: "user_id,idempotency_key", ignoreDuplicates: true }');
  });

  it("reuses the existing notifications table rather than adding a delivery system", () => {
    const helper = core.slice(core.indexOf("async function notifyUser"), core.indexOf("export async function createEnrolment"));
    expect(helper).toContain('admin.from("notifications")');
    expect(helper).not.toMatch(/sendmail|smtp|webhook|createTable/i);
    // The notifications table already existed.
    const migrations = readdirSync(new URL("../supabase/migrations/", import.meta.url));
    const declares = migrations.some((file) =>
      readFileSync(new URL(file, new URL("../supabase/migrations/", import.meta.url)), "utf8").includes("create table public.notifications"));
    expect(declares).toBe(true);
  });

  it("logs a failed notification without failing the enrolment", () => {
    const helper = core.slice(core.indexOf("async function notifyUser"), core.indexOf("export async function createEnrolment"));
    expect(helper).toContain("console.error");
    // The notice is sent after the write, and its outcome does not change the result.
    expect(enrolFn.indexOf("const result = await safe(")).toBeLessThan(enrolFn.indexOf("notifyUser("));
    expect(enrolFn).toContain("return result;");
  });
});
