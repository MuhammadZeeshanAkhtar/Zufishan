/**
 * The invite desks, and the notice that has to stop counting once it is read.
 *
 * Received invites used to render a count and a link somewhere else; Bookings rendered a status
 * word and a raw timestamp. Neither said who was writing or what for — and a teacher cannot decide
 * whether to teach somebody from a number.
 *
 * Two things here are load-bearing, and they pull against each other:
 *
 *  1. **A teacher must be able to see who invited them.** `trial_requests` carries a `learner_id`
 *     and no name, and `profiles_select_own_or_admin` lets an account read exactly one profile —
 *     its own. So the lookup has to be elevated, which means it has to be bounded: only the people
 *     who appear in the caller's own rows, and only the columns they already publish.
 *  2. **The bell must stop counting an invite the teacher has opened.** A count that keeps counting
 *     what you have read stops meaning anything, and the fix must not become "mark everything read
 *     when the page loads" — a card scrolling past is not a teacher reading it.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const desk = readFileSync(new URL("./invite-desk.ts", import.meta.url), "utf8");
const notifications = readFileSync(new URL("./notifications.ts", import.meta.url), "utf8");
const scheduling = readFileSync(new URL("./scheduling.ts", import.meta.url), "utf8");
const routers = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const cards = readFileSync(new URL("../client/src/components/InviteCards.tsx", import.meta.url), "utf8");
const tutorDesk = readFileSync(new URL("../client/src/components/InstructorDashboard.tsx", import.meta.url), "utf8");
const learnerDesk = readFileSync(new URL("../client/src/components/LearnerTutorDesk.tsx", import.meta.url), "utf8");
const catalog = readFileSync(new URL("../client/src/i18n/catalog.ts", import.meta.url), "utf8");

const codeOnly = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, " ");

describe("a teacher can see who invited them", () => {
  it("resolves the name the invite row does not carry", () => {
    const lookup = desk.slice(desk.indexOf("async function peopleByIds"), desk.indexOf("async function unseenInviteIds"));
    expect(lookup).toContain("const admin = getSupabaseAdminClient();");
    // Bounded by the ids the caller's own client returned, never a free read of `profiles`.
    expect(lookup).toContain('.in("id", unique)');
    expect(lookup).toContain("const unique = Array.from(new Set(ids.filter(Boolean)));");
  });

  it("reads only what a learner already publishes", () => {
    const lookup = desk.slice(desk.indexOf("async function peopleByIds"), desk.indexOf("async function unseenInviteIds"));
    expect(lookup).toContain('.select("id,display_name,full_name,avatar_url,country,timezone,gender,preferred_language")');
    for (const column of ["email", "phone", "address", "date_of_birth"]) {
      expect(lookup, `must not read ${column}`).not.toContain(column);
    }
  });

  it("reads the invites themselves on the caller's own client", () => {
    const fn = desk.slice(desk.indexOf("export async function listReceivedInvites"), desk.indexOf("export async function listSentInvites"));
    expect(fn).toContain("getSupabaseUserClient(identity.accessToken)");
    expect(fn).toContain('.eq("instructor_id", identity.id)');
  });

  it("carries what the learner asked for, not just that they asked", () => {
    const fn = desk.slice(desk.indexOf("export async function listReceivedInvites"), desk.indexOf("export async function listSentInvites"));
    // The linked requirement is the fullest statement of what somebody wants.
    expect(fn).toContain('.from("learner_requirements").select("id,subject,level,goal,preferred_language,timezone,availability")');
    expect(cards).toContain('t("invite.requirement")');
    expect(cards).toContain('t("invite.theirMessage")');
  });

  it("writes nothing", () => {
    for (const write of [".insert(", ".update(", ".delete(", ".upsert("]) {
      expect(codeOnly(desk), `invite-desk must not ${write}`).not.toContain(write);
    }
  });
});

describe("the notice stops counting once the invite is opened", () => {
  it("can be cleared by the thing opened, not only by the notice id", () => {
    const fn = notifications.slice(notifications.indexOf("export async function markNotificationsRead"));
    expect(fn).toContain('if (input.relatedEntityType) query = query.eq("related_entity_type", input.relatedEntityType);');
    expect(fn).toContain('if (input.relatedEntityId) query = query.eq("related_entity_id", input.relatedEntityId);');
    // Still the caller's own client, so it can only ever clear a notice addressed to them.
    expect(fn).toContain("getSupabaseUserClient(identity.accessToken)");
    expect(fn).toContain('.is("read_at", null)');
  });

  it("is cleared by opening, never by rendering", () => {
    // The mutation is bound to the link's onClick, not to an effect that runs on mount.
    expect(tutorDesk).toContain("const openInvite = (inviteId: string) => {");
    expect(tutorDesk).toContain('markRead.mutate({ relatedEntityType: "trial_request", relatedEntityId: inviteId }');
    expect(tutorDesk).toContain("onOpen={() => openInvite(invite.id)}");
    expect(cards).toContain("<Link href={href} onClick={onOpen}");
    expect(codeOnly(tutorDesk)).not.toMatch(/useEffect\([^)]*markRead/);
  });

  it("counts what is new on the tab, not what exists", () => {
    expect(tutorDesk).toContain("const newInvites = invites.filter((invite) => invite.unseen).length;");
    expect(tutorDesk).toContain('label: t("tutorDesk.receivedInvites"), count: newInvites');
  });

  it("decides unseen from the notice itself, matched to the invite", () => {
    const fn = desk.slice(desk.indexOf("async function unseenInviteIds"), desk.indexOf("export async function listReceivedInvites"));
    expect(fn).toContain('.eq("related_entity_type", "trial_request")');
    expect(fn).toContain('.in("related_entity_id", inviteIds)');
    expect(fn).toContain('.is("read_at", null)');
    // A desk that cannot read its notices still shows its invites.
    expect(fn).toContain("return unseen;");
  });
});

describe("the notice says who and what for", () => {
  it("names the learner and the subject instead of 'a learner'", () => {
    expect(scheduling).toContain("const inviteFrom = await learnerDisplayName(identity.id);");
    expect(scheduling).toContain("`${inviteFrom} invited you to teach`");
    expect(scheduling).toContain("asked for ${input.subject.trim()}");
    // The old wording, which told a teacher nothing they could act on.
    expect(codeOnly(scheduling)).not.toContain('"A learner has requested a trial time."');
  });

  it("falls back to general wording rather than failing the request", () => {
    const fn = scheduling.slice(scheduling.indexOf("async function learnerDisplayName"), scheduling.indexOf("export async function createTrialRequest"));
    expect(fn).toContain("if (error || !data) return null;");
    expect(scheduling).toContain('inviteFrom ? `${inviteFrom} invited you to teach` : "New trial request"');
  });
});

describe("both desks, and the bookings beside them", () => {
  it("shows the person on every card, with the shared avatar", () => {
    expect(cards).toContain('import LearnerAvatar from "./LearnerAvatar";');
    expect(cards).toContain("export function ReceivedInviteCard(");
    expect(cards).toContain("export function SentInviteCard(");
    expect(cards).toContain("export function BookingCard(");
  });

  it("gives the learner the teacher their invite went to, and the reply", () => {
    expect(learnerDesk).toContain("trpc.scheduling.sentInvites.useQuery");
    expect(cards).toContain('t("invite.theirReply")');
    expect(cards).toContain('t("invite.awaitingReply")');
  });

  it("makes bookings readable rather than a status word and a timestamp", () => {
    expect(tutorDesk).toContain('trpc.scheduling.deskBookings.useQuery({ role: "instructor" }');
    expect(cards).toContain('t("booking.yourTime")');
    // Shown in the reader's own zone, and an unknown zone name must not blank the card.
    expect(cards).toContain('const ownZone = role === "learner" ? booking.learnerTimezone : booking.instructorTimezone;');
    expect(cards).toContain("} catch {");
  });

  it("adds three reads to the router and no writes", () => {
    expect(routers).toContain("receivedInvites: supabaseOnlyProcedure.query(");
    expect(routers).toContain("sentInvites: supabaseOnlyProcedure.query(");
    expect(routers).toContain("deskBookings: supabaseOnlyProcedure.input(");
  });

  it("is written in all three languages, and uses no new colour", () => {
    for (const key of ["invite.new", "invite.requirement", "invite.theirReply", "booking.yourTime"]) {
      expect(catalog.match(new RegExp(`"${key.replace(/\./g, "\\.")}":`, "g")), key).toHaveLength(3);
    }
    expect(codeOnly(cards)).not.toMatch(/#[0-9a-fA-F]{6}\b/);
  });
});
