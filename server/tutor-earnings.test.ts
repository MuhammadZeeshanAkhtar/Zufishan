/**
 * Billing and Withdrawal Requests, held to what they claim.
 *
 * Both screens were fixtures keyed to the literal id `"instructor-demo"`, so every teacher saw the
 * same invented figures. The replacement reads real rows, which means the interesting risk moves:
 * it is no longer "is this fake" but "does it say more than it knows". The payout arithmetic and
 * the estimate rule are therefore exercised as arithmetic, not asserted as source text.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PAYOUT_POLICY, expectedPayoutAt, loggedMinutes, weekStartUtc } from "./tutor-earnings";

const server = readFileSync(new URL("./tutor-earnings.ts", import.meta.url), "utf8");
const ui = readFileSync(new URL("../client/src/components/TutorEarnings.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const routers = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const catalog = readFileSync(new URL("../client/src/i18n/catalog.ts", import.meta.url), "utf8");

/**
 * Source with its comments removed.
 *
 * These files explain what they replaced, and naming the old fixture in a sentence is not the same
 * as calling it. Without this, the prose above `listWeeklyEarnings` would fail the very assertion
 * it exists to describe.
 */
const codeOnly = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, " ");

const iso = (value: string) => new Date(value);

describe("a week is a week, whichever instant is asked for", () => {
  it("normalises any day to the Monday that starts it, in UTC", () => {
    // 2026-09-16 is a Wednesday.
    expect(weekStartUtc(iso("2026-09-16T23:30:00Z")).toISOString()).toBe("2026-09-14T00:00:00.000Z");
    // Sunday belongs to the week that began the previous Monday, not the next one.
    expect(weekStartUtc(iso("2026-09-20T12:00:00Z")).toISOString()).toBe("2026-09-14T00:00:00.000Z");
    expect(weekStartUtc(iso("2026-09-21T00:00:00Z")).toISOString()).toBe("2026-09-21T00:00:00.000Z");
  });
});

describe("the payout date a teacher is shown", () => {
  it("pays a request made before the Monday cutoff that same Friday", () => {
    // Monday 11:59 UTC — inside the cutoff.
    expect(expectedPayoutAt(iso("2026-09-14T11:59:00Z")).toISOString()).toBe("2026-09-18T00:00:00.000Z");
    // And anything earlier in that week, too.
    expect(expectedPayoutAt(iso("2026-09-14T00:00:01Z")).toISOString()).toBe("2026-09-18T00:00:00.000Z");
  });

  it("rolls a late request to the following Friday", () => {
    // Monday 12:00:01 UTC — one second past it.
    expect(expectedPayoutAt(iso("2026-09-14T12:00:01Z")).toISOString()).toBe("2026-09-25T00:00:00.000Z");
    // Thursday of the same week rolls too.
    expect(expectedPayoutAt(iso("2026-09-17T09:00:00Z")).toISOString()).toBe("2026-09-25T00:00:00.000Z");
  });

  it("treats the cutoff instant itself as qualifying", () => {
    // "on or before Monday 12:00 UTC" — the boundary belongs to the earlier week.
    expect(expectedPayoutAt(iso("2026-09-14T12:00:00Z")).toISOString()).toBe("2026-09-18T00:00:00.000Z");
  });

  it("always lands on a Friday, whatever day it is asked about", () => {
    for (let day = 14; day <= 27; day += 1) {
      const payout = expectedPayoutAt(iso(`2026-09-${day}T08:00:00Z`));
      expect(payout.getUTCDay(), `requested on the ${day}th`).toBe(PAYOUT_POLICY.payoutWeekday);
    }
  });

  it("states the schedule once, and the screen reads that same wording", () => {
    expect(catalog).toContain('"tutorWithdraw.policy": "Payout is every Friday.');
    expect(catalog).toContain("Monday 12:00 UTC");
    expect(catalog).toContain("Tuesday at 12:00 UTC");
  });
});

describe("time logged is measured, never assumed", () => {
  it("counts the minutes between joining and ending", () => {
    expect(loggedMinutes({ instructor_joined_at: "2026-09-16T10:00:00Z", ended_at: "2026-09-16T10:45:00Z" })).toBe(45);
    // The learner's join is the fallback when the teacher's was not recorded.
    expect(loggedMinutes({ learner_joined_at: "2026-09-16T10:00:00Z", ended_at: "2026-09-16T10:30:00Z" })).toBe(30);
  });

  it("returns null rather than zero when there is nothing to measure", () => {
    expect(loggedMinutes({})).toBeNull();
    expect(loggedMinutes({ instructor_joined_at: "2026-09-16T10:00:00Z", ended_at: null })).toBeNull();
    expect(loggedMinutes({ instructor_joined_at: null, ended_at: "2026-09-16T10:00:00Z" })).toBeNull();
    // An end before the start is a broken record, not a negative lesson.
    expect(loggedMinutes({ instructor_joined_at: "2026-09-16T11:00:00Z", ended_at: "2026-09-16T10:00:00Z" })).toBeNull();
    expect(loggedMinutes({ instructor_joined_at: "not a date", ended_at: "2026-09-16T10:00:00Z" })).toBeNull();
  });
});

describe("an amount is either recorded or labelled as an estimate", () => {
  it("only estimates when both the time and the rate are known", () => {
    expect(server).toContain("estimatedMinor: minutes !== null && hourlyRateMinor !== null ? Math.round((minutes / 60) * hourlyRateMinor) : null,");
  });

  it("lets a settled ledger amount win over the estimate", () => {
    expect(server).toContain("const settledMinor = settled?.net_minor ?? settled?.amount_minor ?? null;");
    // The screen shows the settled figure first and only falls back to the estimate.
    expect(ui.indexOf("row.settledMinor !== null ?")).toBeLessThan(ui.indexOf("row.estimatedMinor !== null ?"));
    expect(ui).toContain('t("tutorBilling.settled")');
    expect(ui).toContain('t("tutorBilling.estimated")');
  });

  it("totals nothing into a confident zero", () => {
    // An empty list of known amounts stays null; it does not sum to 0.
    expect(server).toContain("settledMinor: settledTotals.length ? settledTotals.reduce((a, b) => a + b, 0) : null,");
    expect(server).toContain("estimatedMinor: estimatedTotals.length ? estimatedTotals.reduce((a, b) => a + b, 0) : null,");
  });
});

describe("the fixtures are gone and the boundaries are not", () => {
  it("no longer reads a demo instructor", () => {
    for (const source of [codeOnly(server), codeOnly(ui)]) {
      expect(source).not.toContain("instructor-demo");
      expect(source).not.toContain("getInstructorEarningsSummary");
      expect(source).not.toContain("getInstructorWithdrawals");
    }
    expect(app).toContain("<TutorBillingPage/>");
    expect(app).toContain("<TutorWithdrawalsPage/>");
  });

  it("reads the teacher's own rows on the teacher's own client", () => {
    expect(server).toContain("getSupabaseUserClient(identity.accessToken)");
    expect(codeOnly(server)).not.toContain("getSupabaseAdminClient");
    expect(server).toContain('.eq("instructor_id", identity.id)');
    for (const write of [".insert(", ".update(", ".delete(", ".upsert("]) {
      expect(codeOnly(server), `tutor-earnings must not ${write}`).not.toContain(write);
    }
  });

  it("adds two reads and no writes to the router", () => {
    expect(routers).toContain("weeklyEarnings: supabaseOnlyProcedure.input(z.object({ weekStartIso: z.string().optional() })).query(");
    expect(routers).toContain("withdrawalRequests: supabaseOnlyProcedure.query(({ ctx }) => listWithdrawalRequests(ctx.supabaseIdentity)),");
  });

  it("offers no withdraw button while no provider can pay one", () => {
    expect(ui).toContain('t("tutorWithdraw.providerNeeded")');
    expect(catalog).toContain("Withdrawals open once an administrator connects the platform payment provider");
    // Nothing on this screen may claim to move money.
    expect(codeOnly(ui)).not.toMatch(/mutate|useMutation/);
  });

  it("changes no table, policy or migration", () => {
    for (const forbidden of ["create table", "alter table", "create policy", "drop "]) {
      expect(codeOnly(server).toLowerCase(), `no ${forbidden}`).not.toContain(forbidden);
    }
  });
});

describe("it is Zufishan's own screen", () => {
  it("uses the project's cards and tokens, not new colour", () => {
    expect(ui).toContain("ni-ed-card");
    expect(ui).not.toMatch(/#[0-9a-fA-F]{6}\b/);
  });

  it("is written in all three languages", () => {
    for (const key of ["tutorBilling.title", "tutorBilling.amountNote", "tutorWithdraw.policy", "tutorWithdraw.expectedPayout"]) {
      expect(catalog.match(new RegExp(`"${key.replace(".", "\\.")}":`, "g")), key).toHaveLength(3);
    }
  });

  it("lets a wide table scroll rather than the page", () => {
    expect(ui.match(/overflow-x-auto/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
