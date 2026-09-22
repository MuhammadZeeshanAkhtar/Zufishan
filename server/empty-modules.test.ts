/**
 * The modules that were listed and not served.
 *
 * An audit of every entry in the sidebar against what actually rendered behind it turned up four
 * different ways a module can be present and empty, and they are not the same fault:
 *
 *  1. **No page at all.** `Progress` had no `<Route>`, so it fell through to the dashboard
 *     catch-all and printed "Lesson completion will be tracked here" — while `lesson_progress`,
 *     `enrolments`, `certificates` and `class_sessions` were all already recording exactly that.
 *  2. **A page bound to a fixture.** `Sessions` built its ledger from
 *     `createSessionLedgerEntry("session-101")` and `Archives` from
 *     `getClassroomSession("session-101")` — one hardcoded id, the same for every account, so
 *     nobody ever saw their own.
 *  3. **A page whose links went nowhere.** All eleven of the board's modules resolved to
 *     `/dashboard/admin/…`, a prefix with no routes; the desk is mounted at `/admin`.
 *  4. **A page that lied about the others.** The catch-all's title map still described built
 *     modules as unconnected.
 *
 * What is guarded here is the shape of the fix, and one line that must not come back: a module
 * blocked on a provider says so, and a module that is not blocked reads real rows. Neither is
 * allowed to show a number nobody earned.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const record = readFileSync(new URL("./session-record.ts", import.meta.url), "utf8");
const recordUi = readFileSync(new URL("../client/src/components/SessionRecord.tsx", import.meta.url), "utf8");
const progress = readFileSync(new URL("../client/src/components/LearnerProgress.tsx", import.meta.url), "utf8");
const classroom = readFileSync(new URL("../client/src/components/ClassroomExperience.tsx", import.meta.url), "utf8");
const addOns = readFileSync(new URL("../client/src/components/LearnerAddOns.tsx", import.meta.url), "utf8");
const ops = readFileSync(new URL("../client/src/components/RelationshipOpsExperience.tsx", import.meta.url), "utf8");
const subpage = readFileSync(new URL("../client/src/components/DashboardSubpage.tsx", import.meta.url), "utf8");
const routers = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const catalog = readFileSync(new URL("../client/src/i18n/catalog.ts", import.meta.url), "utf8");
const reports = readFileSync(new URL("./reports.ts", import.meta.url), "utf8");
const reportsUi = readFileSync(new URL("../client/src/components/ReportsDesk.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/0038_a_report_carries_its_own_words.sql", import.meta.url), "utf8");

const codeOnly = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, " ");

/** Every key the three rebuilt modules render, and nothing else. */
const KEYS = [
  ...["progress.title", "progress.coursesActive", "progress.lessonsDone", "progress.classesAttended",
      "progress.certificates", "progress.byCourse", "progress.noCourses", "progress.browseCourses",
      "progress.notStarted", "progress.complete", "progress.ofLessons", "progress.openCourse",
      "progress.hifz", "progress.noHifz", "progress.openHifz", "progress.ayahsPerDay"],
  ...["sessionRecord.title", "sessionRecord.noMoney", "sessionRecord.none", "sessionRecord.joined",
      "sessionRecord.didNotJoin", "sessionRecord.you", "sessionRecord.them", "sessionRecord.trial",
      "sessionRecord.course", "sessionRecord.open"],
  ...["archives.title", "archives.copy", "archives.soon", "archives.openSessions"],
  "classroomDesk.title",
  "classroomDesk.none",
  "classroomDesk.enter",
  "reports.title",
  "reports.privacy",
  "reports.whichClass",
  "reports.chooseClass",
  "reports.reason",
  "reports.description",
  "reports.send",
  "reports.filed",
  "reports.failed",
  "reports.yours",
  "reports.noneYet",
  "reports.nothingToReport",
  "subpage.copy",
];

/** The English text of one catalog key, as written in the `en` block. */
function english(key: string): string {
  const match = catalog.match(new RegExp(`"${key.replace(/\./g, "\\.")}": "((?:[^"\\\\]|\\\\.)*)"`));
  return match ? match[1] : "";
}

describe("no module is still bound to one fixture id", () => {
  it("reads the caller's own sessions rather than session-101", () => {
    expect(codeOnly(recordUi)).not.toContain("session-101");
    expect(codeOnly(classroom)).not.toContain('getClassroomSession("session-101")');
    expect(record).toContain('const own = role === "learner" ? "learner_id" : "instructor_id";');
    expect(record).toContain(".eq(own, identity.id)");
    expect(record).toContain("const client = getSupabaseUserClient(identity.accessToken);");
  });

  it("removed the ledger built from it rather than leaving it beside the replacement", () => {
    expect(codeOnly(ops)).not.toContain("export function LedgerPage");
    expect(codeOnly(app)).not.toContain("LedgerPage");
    expect(app).toContain('<SessionRecord role="learner"/>');
    expect(app).toContain('<SessionRecord role="instructor"/>');
    expect(routers).toContain("sessionRecord: supabaseOnlyProcedure");
  });

  it("writes nothing while reading a record", () => {
    for (const write of [".insert(", ".update(", ".delete(", ".upsert(", ".rpc("]) {
      expect(codeOnly(record), `session-record must not ${write}`).not.toContain(write);
    }
  });
});

describe("a record with no payment provider shows no figures", () => {
  it("says so once instead of printing a zero against every row", () => {
    expect(recordUi).toContain('t("sessionRecord.noMoney")');
    expect(english("sessionRecord.noMoney")).toContain("No payment provider is connected");
    // The words a ledger would use if somebody wired fixtures back in.
    for (const money of ["amountCents", "platformFee", "payout", "grossAmount", "netAmount"]) {
      expect(codeOnly(recordUi), `must not compute ${money}`).not.toContain(money);
    }
  });

  it("reports attendance as a fact, not as a tick that could mean either", () => {
    expect(recordUi).toContain('t(joinedAt ? "sessionRecord.joined" : "sessionRecord.didNotJoin")');
    expect(record).toContain('const ownJoin = role === "learner" ? row.learner_joined_at : row.instructor_joined_at;');
  });
});

describe("Progress reads what was already being recorded", () => {
  it("takes its four numbers from four reads that already existed", () => {
    for (const call of [
      "trpc.supabaseCore.learnerWorkspace.useQuery",
      "trpc.supabaseCore.hifzPlans.useQuery",
      "trpc.scheduling.myCertificates.useQuery",
      "trpc.scheduling.learnerSessions.useQuery",
    ]) {
      expect(progress, call).toContain(call);
    }
  });

  it("never invents a percentage for a course with no lessons", () => {
    // "Nothing to do yet" and "none of it done" look identical as a number and are not the same.
    expect(progress).toContain("percent: lessonIds.length === 0 ? null : Math.round((done / lessonIds.length) * 100)");
    expect(progress).toContain('course.percent === null ? t("progress.notStarted")');
    expect(progress).toContain("{course.percent !== null && (");
  });

  it("counts a class as attended only once it was completed", () => {
    expect(progress).toContain('const attended = sessions.filter((session) => session.status === "completed").length;');
  });

  it("lets a decorating read fail without taking the page with it", () => {
    // The workspace is the page; certificates and Hifz are beside it.
    expect(progress).toContain("const state = resultState(workspaceQuery as never, online);");
    expect(progress).not.toContain("resultState(certificatesQuery");
  });
});

describe("Classrooms is reachable by an account that is not seeded", () => {
  it("no longer gates the desk on the two demo addresses", () => {
    /*
     * `resolveDemoActorId` maps exactly two seeded addresses to an actor and returns null for
     * everything else, and the desk refused anyone it returned null for. So every real account —
     * every account that has ever signed up — was told "This classroom desk is restricted".
     */
    const desk = classroom.slice(classroom.indexOf("export function ClassroomDashboard"));
    expect(codeOnly(desk)).not.toContain("resolveDemoActorId");
    expect(codeOnly(desk)).not.toContain("getClassroomSession");
    expect(desk).toContain('trpc.scheduling.sessionRecord.useQuery({ role }');
  });

  it("lists the rooms still ahead, and leaves the finished ones to Sessions", () => {
    expect(classroom).toContain('["scheduled", "waiting_room", "live"].includes(row.status)');
    expect(classroom).toContain('t("classroomDesk.enter")');
  });

  it("dropped the demo page that was imported and routed nowhere", () => {
    expect(codeOnly(classroom)).not.toContain("export function ClassroomDemoPage");
    expect(codeOnly(app)).not.toContain("ClassroomDemoPage");
    // The route that looks like it was for it renders a different component entirely.
    expect(app).toContain('<TutorClassroomDemo/>');
  });
});

describe("a module blocked on a provider says which provider", () => {
  it("holds Archives on the classroom provider and points at what does work", () => {
    expect(classroom).toContain('titleKey="archives.title"');
    expect(classroom).toContain('action={{ href: `/dashboard/${role}/sessions`');
    expect(english("archives.soon")).toContain("classroom provider");
    // No sample recording stands in for the real thing.
    expect(english("archives.soon")).toContain("no sample is shown");
  });

  it("uses the same held-module shape the other blocked modules use", () => {
    expect(addOns).toContain("export function HeldModule(");
    expect(classroom).toContain('import { HeldModule } from "./LearnerAddOns";');
  });
});

describe("a report is stored, and the tick depends on the row", () => {
  it("writes a reports row instead of calling an in-memory helper", () => {
    expect(codeOnly(reportsUi)).not.toContain("submitReport");
    expect(codeOnly(ops)).not.toContain("export function ReportsPage");
    expect(reports).toContain('.from("reports").insert({');
    expect(routers).toContain("fileReport: supabaseOnlyProcedure");
    expect(routers).toContain("myReports: supabaseOnlyProcedure");
  });

  it("files it as the caller, on the caller's own client", () => {
    // `reports_own_insert` is what permits this; the server never chooses whose report it is, and
    // `reporter_id` comes from the verified identity rather than from anything the browser sent.
    expect(reports).toContain("const client = getSupabaseUserClient(identity.accessToken);");
    expect(reports).toContain("reporter_id: identity.id,");
    expect(codeOnly(reports)).not.toContain("getSupabaseAdminClient");
  });

  it("shows the confirmation only once the server accepted it", () => {
    // The precise fault this page had: a tick that was a state change and nothing else.
    expect(reportsUi).toContain("if (!result || !result.ok) { setError(result?.error || t(\"reports.failed\")); return; }");
    expect(reportsUi.indexOf("if (!result || !result.ok)")).toBeLessThan(reportsUi.indexOf("setFiled(true);"));
  });

  it("reports a missing column as a missing migration, not as 'try again'", () => {
    // Retrying fails the same way, and the person retypes their description for nothing.
    expect(reports).toContain('const MISSING_SCHEMA = ["42P01", "42703", "PGRST204", "PGRST205"];');
    expect(reports).toContain('if (MISSING_SCHEMA.includes(String(error.code))) return fail(SETUP_MESSAGE, "SETUP_NEEDED");');
  });

  it("asks for a target that could actually be stored", () => {
    // `reports.target_id` is a uuid; the page it replaced defaulted it to "conversation-trial-101".
    expect(codeOnly(reportsUi)).not.toContain("conversation-trial-101");
    expect(routers).toContain("targetId: z.string().uuid(),");
    expect(reportsUi).toContain('targetType: "session"');
  });

  it("adds the column and changes no policy", () => {
    expect(migration).toContain("add column if not exists description text");
    for (const policy of ["create policy", "drop policy", "alter policy"]) {
      expect(migration.toLowerCase(), `migration must not ${policy}`).not.toContain(policy);
    }
    // Nullable and unbackfilled, so rows written before it stay valid.
    expect(migration).toContain("description is null or length(btrim(description)) between 1 and 8000");
  });
});

describe("the catch-all no longer describes built modules as unbuilt", () => {
  it("dropped the title map entirely", () => {
    for (const stale of [
      "will be connected later",
      "are not connected yet",
      "remain placeholders",
      "will connect in Prompt 6",
      "const titles",
    ]) {
      expect(codeOnly(subpage), `stale copy: ${stale}`).not.toContain(stale);
    }
  });

  it("is a not-found page, in the reader's own language", () => {
    expect(subpage).toContain('t("common.notFound")');
    expect(subpage).toContain('t("subpage.copy")');
    expect(subpage).not.toContain('t("common.setupNeeded")');
  });
});

describe("all of it is written in all three languages", () => {
  it("has every new key in en, ur and ar", () => {
    for (const key of KEYS) {
      expect(catalog.match(new RegExp(`"${key.replace(/\./g, "\\.")}":`, "g")), key).toHaveLength(3);
    }
  });

  it("keeps every placeholder in every language", () => {
    for (const [key, token] of [["progress.complete", "{percent}"], ["progress.ofLessons", "{done}"], ["progress.ayahsPerDay", "{count}"]] as const) {
      const lines = catalog.match(new RegExp(`"${key.replace(/\./g, "\\.")}": "((?:[^"\\\\]|\\\\.)*)"`, "g")) ?? [];
      expect(lines, key).toHaveLength(3);
      for (const line of lines) expect(line, `${key}: ${line}`).toContain(token);
    }
  });

  it("hardcodes no colour of its own in the three new pages", () => {
    for (const [name, source] of [["SessionRecord", recordUi], ["LearnerProgress", progress], ["DashboardSubpage", subpage]] as const) {
      expect(codeOnly(source), name).not.toMatch(/#[0-9a-fA-F]{6}\b/);
    }
  });
});
