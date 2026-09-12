/**
 * Messaging follows a connection, and only a connection that actually holds.
 *
 * THE DEFECT. The rule was written down correctly and never implemented. The old
 * check asked whether a row existed and ignored `status` entirely, so a trial the
 * instructor had DECLINED, a booking that had been CANCELLED, a requirement
 * response that was REJECTED and an enrolment still PENDING all opened a thread.
 * Every status below is one the live schema actually permits — the vocabularies
 * were read from the CHECK constraints on the real database.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CONNECTED_TRIAL_STATUSES, CONNECTED_BOOKING_STATUSES,
  CONNECTED_RESPONSE_STATUSES, CONNECTED_ENROLMENT_STATUSES,
  PENDING_TRIAL_STATUSES, PENDING_RESPONSE_STATUSES, PENDING_ENROLMENT_STATUSES,
} from "./connection-eligibility";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const eligibility = read("./connection-eligibility.ts");
const conversation = read("./conversation-start.ts");
const routers = read("./routers.ts");
const learnerPage = read("../client/src/components/LearnerProfilePage.tsx");
const canonical = read("../supabase/migrations/0001_noor_ilm_lms_canonical.sql");

/**
 * Every status a table permits, according to the migrations.
 *
 * Scanned across ALL of them, newest last, because several vocabularies were
 * widened after the canonical migration — `trial_requests` gained `scheduled`,
 * `waiting_room` and `live` later, and reading only 0001 would have declared
 * those illegal. The last definition wins, which is what the database does too.
 *
 * These lists were also checked against the live CHECK constraints directly; this
 * test is the standing guard so a future migration cannot silently retire a
 * status the rule still names.
 */
function vocabularyOf(table: string): string[] {
  const dir = new URL("../supabase/migrations/", import.meta.url);
  const files = readdirSync(dir).filter((name) => name.endsWith(".sql")).sort();
  let found: string[] = [];
  for (const file of files) {
    const sql = readFileSync(new URL(file, dir), "utf8");
    // Either the original column definition or a later added constraint.
    const patterns = [
      new RegExp(`create table public\\.${table} \\(([\\s\\S]*?)\\n\\);`),
      new RegExp(`alter table public\\.${table}[\\s\\S]*?check \\(status in \\(([^)]*)\\)\\)`, "i"),
      new RegExp(`${table}_status_check[\\s\\S]{0,200}?check \\(status in \\(([^)]*)\\)\\)`, "i"),
    ];
    for (const pattern of patterns) {
      const block = sql.match(pattern);
      if (!block) continue;
      const check = block[1].match(/status text[^,]*?check \(status in \(([^)]*)\)\)/)
        ?? [null, block[1]] as unknown as RegExpMatchArray;
      const statuses = Array.from(String(check[1]).matchAll(/'([a-z_]+)'/g)).map((m) => m[1]);
      if (statuses.length) found = statuses;
    }
  }
  return found;
}

const asStrings = (values: readonly string[]) => [...values];

describe("a refused or abandoned connection never opens a thread", () => {
  const mustNeverConnect: Array<[string, string[], readonly string[]]> = [
    ["trial_requests", ["draft", "declined", "rejected", "cancelled"], CONNECTED_TRIAL_STATUSES],
    ["bookings", ["cancelled", "expired"], CONNECTED_BOOKING_STATUSES],
    ["requirement_responses", ["rejected", "withdrawn"], CONNECTED_RESPONSE_STATUSES],
    ["enrolments", ["cancelled"], CONNECTED_ENROLMENT_STATUSES],
  ];

  for (const [table, refused, connected] of mustNeverConnect) {
    it(`refuses every dead ${table} status`, () => {
      for (const status of refused) {
        expect(asStrings(connected), `${table}.${status} must not connect`).not.toContain(status);
      }
    });
  }

  it("treats a request that has not been answered as blocked, not connected", () => {
    for (const status of asStrings(PENDING_TRIAL_STATUSES)) {
      expect(asStrings(CONNECTED_TRIAL_STATUSES), `trial ${status}`).not.toContain(status);
    }
    for (const status of asStrings(PENDING_RESPONSE_STATUSES)) {
      expect(asStrings(CONNECTED_RESPONSE_STATUSES), `response ${status}`).not.toContain(status);
    }
    for (const status of asStrings(PENDING_ENROLMENT_STATUSES)) {
      expect(asStrings(CONNECTED_ENROLMENT_STATUSES), `enrolment ${status}`).not.toContain(status);
    }
  });

  it("counts shortlisted as interest, not agreement", () => {
    expect(asStrings(PENDING_RESPONSE_STATUSES)).toContain("shortlisted");
    expect(asStrings(CONNECTED_RESPONSE_STATUSES)).toEqual(["accepted"]);
  });
});

describe("the rule names only statuses the schema actually allows", () => {
  const cases: Array<[string, readonly string[][]]> = [
    ["trial_requests", [asStrings(CONNECTED_TRIAL_STATUSES), asStrings(PENDING_TRIAL_STATUSES)]],
    ["bookings", [asStrings(CONNECTED_BOOKING_STATUSES)]],
    ["requirement_responses", [asStrings(CONNECTED_RESPONSE_STATUSES), asStrings(PENDING_RESPONSE_STATUSES)]],
    ["enrolments", [asStrings(CONNECTED_ENROLMENT_STATUSES), asStrings(PENDING_ENROLMENT_STATUSES)]],
  ];

  for (const [table, sets] of cases) {
    it(`every status it names exists in ${table}`, () => {
      const allowed = vocabularyOf(table);
      if (allowed.length === 0) {
        // `bookings` has no `create table` in supabase/migrations at all — it
        // exists on the live database but outside the migration history, so
        // there is nothing here to check it against. Its vocabulary WAS read
        // from the live CHECK constraint
        // ('confirmed','cancelled','expired','completed','no_show','disputed')
        // and the constant below matches it. Flagged rather than skipped
        // silently, because a table missing from its own migrations is worth
        // knowing about.
        expect(table, "only bookings is expected to be missing from the migrations").toBe("bookings");
        expect(asStrings(CONNECTED_BOOKING_STATUSES)).toEqual(["confirmed", "completed", "no_show", "disputed"]);
        return;
      }
      for (const set of sets) {
        for (const status of set) {
          expect(allowed, `${table} has no status '${status}'`).toContain(status);
        }
      }
    });
  }
});

describe("one rule, shared by the button and the write", () => {
  it("has a single implementation, imported by the conversation writer", () => {
    expect(conversation).toContain('import { relationshipExists } from "./connection-eligibility";');
    // The old status-blind copy is gone from the writer.
    expect(conversation).not.toContain('.from(table).select("id")');
    expect(conversation).not.toMatch(/async function relationshipExists/);
  });

  it("still refuses the write when there is no connection", () => {
    expect(conversation).toContain("if (!(await relationshipExists(admin, me, other)))");
    expect(conversation).toContain('code: "FORBIDDEN"');
  });

  it("decides the screen from the same check, on the server", () => {
    expect(routers).toContain("messagingEligibility: supabaseOnlyProcedure");
    expect(routers).toContain("getMessagingEligibility(ctx.supabaseIdentity, input)");
    expect(eligibility).toContain("const verdict = await findConnection(admin, identity.id, input.counterpartId);");
  });

  it("never lets the browser decide, and never ships a canMessage flag", () => {
    expect(learnerPage).toContain("trpc.supabaseCore.messagingEligibility.useQuery");
    expect(learnerPage).not.toMatch(/canMessage|allowMessage|setEligible\(true\)/);
  });
});

describe("direction and identity", () => {
  it("matches a pair in both directions from one query", () => {
    // `.in` on BOTH participant columns is what makes learner->instructor and
    // instructor->learner the same question.
    expect(eligibility).toContain('.in("learner_id", pair).in("instructor_id", pair)');
  });

  it("never reads a row that names the same account twice as a connection", () => {
    expect(eligibility).toContain("if (!admin || a === b) return { connected: false, pending: null };");
    expect(eligibility.match(/learner === instructor/g)?.length).toBe(2);
  });

  it("does no profile-id to user-id translation, because there is none to do", () => {
    // Every participant column is a profiles.id, and profiles.id references
    // auth.users(id) — so the ids are the same value.
    expect(canonical).toContain("id uuid primary key references auth.users(id) on delete cascade");
    expect(eligibility).not.toMatch(/profile_id|user_profiles|\.from\("profiles"\)/);
  });
});

describe("the screen offers a way forward, not a dead end", () => {
  it("shows the connection action when there is no connection", () => {
    expect(learnerPage).toContain('t("connect.blockedInstructor")');
    expect(learnerPage).toContain('t("connect.openRequests")');
  });

  it("says which request is waiting when one is", () => {
    for (const key of ["connect.pendingTrial", "connect.pendingResponse", "connect.pendingEnrolment"]) {
      expect(learnerPage).toContain(key);
    }
  });

  it("names the connection that permitted it when messaging is open", () => {
    expect(learnerPage).toContain("connect.connectedVia.${verdict.via}");
    expect(learnerPage).toContain("<MessageAction");
  });

  it("has wording for each of those, in all three languages", () => {
    const catalog = read("../client/src/i18n/catalog.ts");
    for (const key of [
      "connect.blockedTitle", "connect.blockedInstructor", "connect.pendingTitle",
      "connect.pendingTrial", "connect.pendingResponse", "connect.pendingEnrolment",
      "connect.connectedVia.trial", "connect.connectedVia.booking",
      "connect.connectedVia.requirement_response", "connect.connectedVia.enrolment",
    ]) {
      expect(catalog.split(`"${key}":`).length - 1, key).toBe(3);
    }
  });
});

describe("conversations stay two-party and unduplicated", () => {
  it("reuses a thread that is exactly these two accounts", () => {
    expect(conversation).toContain("if (set.size === 2 && set.has(a) && set.has(b)) return id;");
    expect(conversation).toContain("const existing = await findExistingThread(admin, me, other);");
  });

  it("refuses a thread with oneself", () => {
    expect(conversation).toContain("if (other === me) return { ok: false, error: \"A conversation needs two different people.\", code: \"FORBIDDEN\" };");
  });
});
