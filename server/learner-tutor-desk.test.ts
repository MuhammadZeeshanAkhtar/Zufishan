/**
 * The learner's desk, reshaped around teachers.
 *
 * The dashboard used to count courses and link out; the reference marketplace opens on the teachers
 * you work with, the ones suggested to you, and the invites you sent. This file pins the new shape
 * and — more importantly — the boundaries it had to respect: one read-only procedure was added for
 * the learner alone, and the instructor and admin desks were not touched.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const desk = readFileSync(new URL("../client/src/components/LearnerTutorDesk.tsx", import.meta.url), "utf8");
const overview = readFileSync(new URL("../client/src/components/LearnerOverview.tsx", import.meta.url), "utf8");
const scheduling = readFileSync(new URL("./scheduling.ts", import.meta.url), "utf8");
const routers = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const catalog = readFileSync(new URL("../client/src/i18n/catalog.ts", import.meta.url), "utf8");
const tutorDash = readFileSync(new URL("../client/src/components/InstructorDashboard.tsx", import.meta.url), "utf8");

describe("the desk answers the three questions the old one did not", () => {
  it("opens on the teachers the learner is actually working with", () => {
    expect(overview).toContain("<LearnerTutorDesk />");
    expect(desk).toContain('t("learnerHome.currentTutors")');
    expect(desk).toContain('t("learnerHome.noTutorsYet")');
    // Above the figures, which is what "first" means on this page.
    expect(overview.indexOf("<LearnerTutorDesk />")).toBeLessThan(overview.indexOf('t("learnerHome.figures")'));
  });

  it("offers suggestions with an invite, not just a link away", () => {
    expect(desk).toContain('t("learnerHome.inviteToTeach")');
    expect(desk).toContain("/trial/request?instructorSlug=");
    // The invite carries the chosen teacher into the flow that already exists.
    expect(desk).toContain("encodeURIComponent(tutor.public_slug)");
  });

  it("counts sent invites on the tab, as the reference does", () => {
    expect(desk).toContain('{ key: "invites", label: t("learnerHome.tabInvites"), count: invites.length }');
    // Moved to `sentInvites`, which resolves the teacher the invite went to; the raw rows name
    // them only by an id a learner's own client may not read.
    expect(desk).toContain("trpc.scheduling.sentInvites.useQuery");
    expect(desk).toContain('t("learnerHome.noInvitesYet")');
  });

  it("keeps past teachers separate from current ones", () => {
    expect(desk).toContain('t("learnerHome.tabPast")');
    expect(scheduling).toContain("(entry?.current ? current : past).push(withLesson);");
  });
});

describe("only real rows reach the screen", () => {
  it("suggests from the published, approved listing the marketplace already uses", () => {
    expect(desk).toContain("trpc.schedulingPublic.instructors.useQuery");
    // No hand-written teacher anywhere on the desk.
    expect(desk).not.toMatch(/displayName: ["']/);
  });

  it("reads the learner's own bookings, through their own token", () => {
    const fn = scheduling.slice(scheduling.indexOf("export async function listLearnerTutors"), scheduling.indexOf("export async function listTrialRequests"));
    expect(fn).toContain("const client = db(identity);");
    expect(fn).toContain('.eq("learner_id", identity.id)');
    // Read-only: a dashboard has no business writing.
    for (const write of [".insert(", ".update(", ".delete(", ".upsert("]) {
      expect(fn, `listLearnerTutors must not ${write}`).not.toContain(write);
    }
  });

  it("presents a teacher through the same two helpers discovery uses", () => {
    const fn = scheduling.slice(scheduling.indexOf("export async function listLearnerTutors"));
    expect(fn.slice(0, 3_000)).toContain("attachInstructorStats(await attachPublicPresentation(");
  });

  it("reads the listing payload by the key the listing actually answers with", () => {
    // The listing answers `{ instructors, total, limit, offset }`. Reading any other key would
    // leave the tab empty and silent — an empty state is indistinguishable from "no teachers".
    expect(scheduling).toContain("data: { instructors: [], total: 0, limit, offset }");
    expect(desk).toContain("payload?.instructors ?? []");
    expect(desk).not.toContain("payload?.rows");
  });

  it("names a teacher rather than printing an identifier", () => {
    // The reason this procedure exists: `learnerBookings` carries instructor_id and no name.
    expect(desk).toContain("tutor.displayName?.trim() || tutor.public_slug");
  });
});

describe("the other two desks are untouched", () => {
  it("adds one procedure, and only the learner calls it", () => {
    expect(routers).toContain("learnerTutors: supabaseOnlyProcedure.query(({ ctx }) => listLearnerTutors(ctx.supabaseIdentity))");
    expect(tutorDash).not.toContain("learnerTutors");
  });

  it("changes no table, policy or migration", () => {
    const fn = scheduling.slice(scheduling.indexOf("export async function listLearnerTutors"), scheduling.indexOf("export async function listTrialRequests"));
    for (const forbidden of ["create table", "alter table", "create policy", "drop "]) {
      expect(fn.toLowerCase(), `no ${forbidden}`).not.toContain(forbidden);
    }
  });
});

describe("it stays Zufishan's own design", () => {
  it("uses the project's cards, buttons and tokens rather than new colour", () => {
    expect(desk).toContain("ni-ed-card");
    expect(desk).toContain("ni-btn ni-btn--primary");
    expect(desk).toContain("ni-tabs");
    // A literal hex would be right in one theme and wrong in the other.
    expect(desk).not.toMatch(/#[0-9a-fA-F]{6}\b/);
  });

  it("is written in all three languages, like every other surface", () => {
    for (const key of ["learnerHome.currentTutors", "learnerHome.tabInvites", "learnerHome.inviteToTeach", "learnerHome.tipCopy"]) {
      expect(catalog.match(new RegExp(`"${key.replace(".", "\\.")}":`, "g")), key).toHaveLength(3);
    }
  });

  it("promises no free minutes, because no such policy exists here", () => {
    // The reference dashboard offers thirty free classroom minutes. Zufishan has agreed no such
    // thing, so the banner invites a short first lesson and claims nothing.
    expect(catalog).toContain('"learnerHome.tipCopy": "Invite a few teachers for a short first lesson each');
    expect(desk).not.toMatch(/free (classroom|minutes|30)/i);
  });
});
