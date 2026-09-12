import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Source with the leading documentation block removed, so no assertion is met by prose. */
const codeOf = (path: string) => {
  const text = readFileSync(new URL(path, import.meta.url), "utf8");
  const firstImport = text.indexOf("\nimport ");
  return firstImport === -1 ? text : text.slice(firstImport);
};
const raw = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

const notifications = codeOf("./notifications.ts");
const verification = codeOf("./instructor-verification.ts");
const adminInstructors = codeOf("./admin-instructors.ts");
const adminCourses = codeOf("./admin-courses.ts");
const rls = raw("../supabase/migrations/0002_auth_and_rls.sql");
const bell = raw("../client/src/components/NotificationBell.tsx");
const adminUi = codeOf("../client/src/components/AdminInstructorsExperience.tsx");
const routers = raw("./routers.ts");

const migration = raw("../supabase/migrations/0024_notifications_conflict_target_is_inferable.sql");
/** The executable half — the commentary quotes the broken statement it replaces. */
const statement = migration.slice(migration.indexOf("drop index"));

describe("the root cause: the conflict target could not be inferred", () => {
  it("replaces the partial unique index with a total one", () => {
    expect(statement).toContain("drop index if exists public.notifications_recipient_idempotency_idx;");
    expect(statement).toContain("create unique index if not exists notifications_recipient_idempotency_idx");
    expect(statement).toContain("on public.notifications (user_id, idempotency_key);");
    // The predicate is what made it un-inferable by `on conflict (columns)`.
    const create = statement.slice(statement.indexOf("create unique index"), statement.indexOf("comment on index"));
    expect(create).not.toContain("where idempotency_key is not null");
  });

  it("still writes through the same conflict target it always did", () => {
    // The application statement is unchanged; only the index it needs to match.
    expect(notifications).toContain('{ onConflict: "user_id,idempotency_key", ignoreDuplicates: true }');
  });

  it("adds no column, policy or trigger", () => {
    for (const forbidden of ["alter table", "create policy", "drop policy", "create trigger", "add column"]) {
      expect(statement.toLowerCase(), `0024 must not ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("exists, and no later migration takes the conflict target away again", () => {
    // The guarantee is the index the upsert needs, not 0024's position in the
    // sequence — later migrations are expected and must simply leave it alone.
    const dir = new URL("../supabase/migrations/", import.meta.url);
    const files = readdirSync(dir);
    expect(files).toContain("0024_notifications_conflict_target_is_inferable.sql");

    for (const file of files.filter((name) => Number(name.slice(0, 4)) > 24)) {
      const later = readFileSync(new URL(file, dir), "utf8")
        .split("\n").map((line) => line.replace(/--.*$/, "")).join("\n");
      expect(later, `${file} must not drop the conflict target`).not.toMatch(/drop\s+(index|constraint)[\s\S]*notifications_user_idempotency/i);
      expect(later, `${file} must not alter the notifications unique index`).not.toMatch(/alter\s+table\s+public\.notifications[\s\S]*idempotency/i);
    }
  });
});

describe("(6) a repeated decision does not raise a second notification", () => {
  it("keys every raise on the decision, never on the clock", () => {
    for (const [name, source] of [["admin-instructors", adminInstructors], ["admin-courses", adminCourses], ["verification", verification]] as const) {
      const keys = source.match(/idempotencyKey: `[^`]*`/g) ?? [];
      expect(keys.length, `${name} raises at least one notification`).toBeGreaterThan(0);
      for (const key of keys) {
        expect(key, `${name}: ${key} must not include a timestamp`).not.toContain("Date.now()");
        expect(key, `${name}: ${key} must not include a random value`).not.toMatch(/Math\.random|randomUUID/);
      }
    }
  });

  it("names the decision in the key, so the same decision collapses", () => {
    expect(adminInstructors).toContain("idempotencyKey: `verification-changes:${input.instructorId}`,");
    expect(verification).toContain("idempotencyKey: `verification:${input.instructorId}:${input.status}` });");
    expect(adminCourses).toContain("idempotencyKey: `course-moderation:${input.courseId}:${input.action}`,");
  });

  it("ignores the duplicate rather than overwriting the original", () => {
    expect(notifications).toContain("ignoreDuplicates: true");
  });
});

describe("(7) each decision reaches the right person and nobody else", () => {
  it("addresses the instructor whose profile was decided", () => {
    // The recipient is the subject of the decision, never the actor.
    expect(verification).toContain('await notify({ userId: input.instructorId, type: "verification_decided",');
    expect(adminInstructors).toContain("    userId: input.instructorId,");
    // The acting administrator is never a recipient.
    expect(verification).not.toContain("userId: identity.id");
    expect(adminInstructors).not.toContain("userId: identity.id");
  });

  it("covers approved, rejected and changes-requested", () => {
    expect(verification).toContain('input.status === "approved" ? "Your profile was approved" : "Your profile was reviewed"');
    expect(adminInstructors).toContain('title: "Changes were requested on your profile",');
    // All three go through one notification type, so the bell groups them.
    expect(verification).toContain('type: "verification_decided"');
    expect(adminInstructors).toContain('type: "verification_decided",');
  });

  it("links to the instructor's own profile, not an internal id the reader cannot use", () => {
    expect(adminInstructors).toContain('relatedEntityType: "instructor_profiles",');
    expect(adminInstructors).toContain("relatedEntityId: input.instructorId,");
  });

  it("carries no administrator identity, address or secret", () => {
    const raise = adminInstructors.slice(adminInstructors.indexOf("const raised = await notify({"));
    const body = raise.slice(0, raise.indexOf("});"));
    for (const leak of ["identity.id", "email", "token", "process.env"]) {
      expect(body, `the notification must not carry ${leak}`).not.toContain(leak);
    }
  });
});

describe("(8) the decision and its notification cannot silently diverge", () => {
  it("reports whether the person was actually told", () => {
    expect(verification).toContain("const raised = await notify({ userId: input.instructorId,");
    expect(verification).toContain("notified: raised.delivered } };");
    expect(adminInstructors).toContain("const raised = await notify({");
    expect(adminInstructors).toContain('status: "verification_pending", notified: raised.delivered } };');
    // And the delegated path passes it through rather than dropping it.
    expect(adminInstructors).toContain("status: result.data.status, notified: result.data.notified }");
  });

  it("logs a failed delivery with a reason, and no payload", () => {
    expect(verification).toContain('console.error("[verification] decision saved but notification not delivered:", { reason: raised.reason });');
    expect(adminInstructors).toContain('console.error("[admin-instructors] changes requested but notification not delivered:", { reason: raised.reason });');
  });

  it("does not fail a decision that genuinely succeeded", () => {
    // The status write happened; reporting it as an error would be its own lie.
    expect(verification).toContain("return { ok: true, data: { instructorId: input.instructorId, status: input.status, notified: raised.delivered } };");
  });

  it("(and the desk says so instead of claiming success)", () => {
    expect(adminUi).toContain('if (result.data?.notified === false) return { ok: false, text: t("adminInstructors.savedNotNotified") };');
    const catalog = raw("../client/src/i18n/catalog.ts");
    expect(catalog.match(/"adminInstructors\.savedNotNotified":/g)?.length).toBe(3);
  });
});

describe("(2, 3, 4, 5) only the recipient can read it", () => {
  it("is enforced by policy, not by the query", () => {
    expect(rls).toContain("create policy notifications_own on public.notifications for select using (user_id = auth.uid());");
    expect(rls).toContain("create policy notifications_own_update on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());");
    // No policy widens reading to admins or moderators.
    expect(rls).not.toMatch(/create policy \w+ on public\.notifications for select using \([^)]*is_admin_user/);
  });

  it("is written by the service role only", () => {
    expect(notifications).toContain("const admin = getSupabaseAdminClient();");
    // No insert policy exists, so nothing in a browser can raise one.
    expect(rls).not.toMatch(/create policy \w+ on public\.notifications for insert/);
  });
});

describe("(9, 10) the instructor sees it", () => {
  it("reads the unread count from the server, not from an opened popover", () => {
    expect(bell).toContain("trpc.scheduling.unreadNotifications.useQuery(undefined, { retry: false })");
    expect(bell).toContain("trpc.scheduling.inbox.useQuery");
    expect(bell).not.toMatch(/mock|fake|sample|dummy/i);
  });

  it("exposes the inbox, the count and mark-read as authenticated procedures", () => {
    expect(routers).toContain("inbox: supabaseOnlyProcedure.query(({ ctx }) => listOwnNotifications(ctx.supabaseIdentity)),");
    expect(routers).toContain("unreadNotifications: supabaseOnlyProcedure.query(({ ctx }) => countOwnUnread(ctx.supabaseIdentity)),");
  });

  it("never parses an HTML response as JSON", () => {
    const guard = codeOf("../client/src/lib/api-response.ts");
    expect(guard).toContain("export class NonJsonApiResponseError");
    expect(raw("../client/src/main.tsx")).toContain("assertJsonResponse");
  });
});

describe("nothing outside this workflow changed", () => {
  it("adds no new notification type or call site", () => {
    // Anchored so `relatedEntityType:` and `entityType:` are not swept up as
    // notification types — they are audit fields, not notification kinds.
    const kinds = (source: string) => (source.match(/(?:^|[\s{,(])type: "[a-z_]+"/gm) ?? []).map((match) => match.trim());
    const types = [...kinds(adminInstructors), ...kinds(verification)];
    expect(types.length).toBeGreaterThan(0);
    for (const type of types) expect(type).toBe('type: "verification_decided"');
  });

  it("leaves the notification helper's contract intact", () => {
    expect(notifications).toContain("export async function notify(input: NotifyInput): Promise<{ delivered: boolean; reason?: string }> {");
    expect(notifications).toContain('if (!admin) return { delivered: false, reason: "not_configured" };');
    expect(notifications).toContain('return { delivered: false, reason: "declined" };');
  });
});
