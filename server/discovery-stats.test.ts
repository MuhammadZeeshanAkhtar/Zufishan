import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Source with the leading documentation block removed, so no assertion is met by prose. */
const codeOf = (path: string) => {
  const text = readFileSync(new URL(path, import.meta.url), "utf8");
  const firstImport = text.indexOf("\nimport ");
  return firstImport === -1 ? text : text.slice(firstImport);
};

const stats = codeOf("./discovery-stats.ts");
const scheduling = readFileSync(new URL("./scheduling.ts", import.meta.url), "utf8");
const routers = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");

describe("discovery figures are counted, never invented", () => {
  it("takes the rating from published reviews only", () => {
    expect(stats).toContain('.from("reviews")');
    expect(stats).toContain('.eq("status", "published")');
    // The mean comes from the rows just read, so it cannot drift from them, and no
    // denormalised column is trusted in its place.
    expect(stats).toContain("ratings.reduce((sum, n) => sum + n, 0) / ratings.length");
    expect(stats).not.toMatch(/average_rating|rating_cache/);
  });

  it("counts only sessions that were actually taught", () => {
    // A cancelled or no-show session was scheduled, not taught. Counting it would
    // overstate what the instructor has done.
    expect(stats).toContain('.from("class_sessions")');
    expect(stats).toContain('.eq("status", "completed")');
  });

  it("never fabricates a figure", () => {
    for (const invented of ["Math.random", "faker", "Math.floor(Math.random", "|| 100", "?? 42"]) {
      expect(stats, `${invented} would be a made-up figure`).not.toContain(invented);
    }
  });

  it("exposes no presence, because nothing records it", () => {
    // There is no last_seen_at column, no heartbeat and no realtime presence channel,
    // so any online/offline value could only be guessed. lastActiveAt is a session
    // join time, which is a recorded fact rather than a presence claim.
    for (const invented of ["isOnline", "onlineStatus", "last_seen", "presenceChannel"]) {
      expect(stats, `${invented} has no real source`).not.toContain(invented);
    }
    expect(stats).toContain("lastActiveAt");
    expect(stats).toContain("instructor_joined_at");
  });

  it("reads sessions through the admin client and returns only aggregates", () => {
    // class_sessions is participant-or-moderator only under RLS, so a browsing learner
    // may not read it. Counting therefore needs the admin client — and what leaves the
    // module is two totals and one timestamp, never a session row or a learner id.
    const sessionLookup = stats.slice(stats.indexOf("async function sessionStatsByInstructor"), stats.indexOf("export async function attachInstructorStats"));
    expect(sessionLookup).toContain("getSupabaseAdminClient()");
    expect(sessionLookup).toContain("seen.size");
    expect(stats).not.toMatch(/learnerIds|learner_ids:/);
  });

  it("treats an unrated instructor as unrated, not as zero and not as passing", () => {
    const filter = stats.slice(stats.indexOf("export async function instructorIdsWithMinRating"));
    expect(filter).toContain("if (average !== null && average >= minimum) matched.push(id);");
  });

  it("counts instructors, not reviews, beside each rating threshold", () => {
    const buckets = stats.slice(stats.indexOf("export async function ratingBucketCounts"));
    expect(buckets).toContain("averages.filter((average) => average >= minimum).length");
  });
});

describe("discovery wires the figures in behind the published gate", () => {
  it("attaches the aggregates only to rows the published+approved filter allowed", () => {
    const listing = scheduling.slice(
      scheduling.indexOf("export async function listPublicInstructors"),
      scheduling.indexOf("Attaches the person-level fields"),
    );
    expect(listing.indexOf('.eq("verification_status", "approved")'))
      .toBeLessThan(listing.indexOf("attachInstructorStats"));
    expect(listing).toContain("attachInstructorStats(await attachPublicPresentation(data ?? []))");
  });

  it("filters by rating before the page and the count, so the total stays honest", () => {
    const listing = scheduling.slice(scheduling.indexOf("export async function listPublicInstructors"));
    expect(listing.indexOf("instructorIdsWithMinRating")).toBeLessThan(listing.indexOf(".range(offset,"));
  });

  it("accepts only the thresholds the sidebar offers", () => {
    expect(routers).toContain("minRating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(4.5)]).optional()");
  });
});
