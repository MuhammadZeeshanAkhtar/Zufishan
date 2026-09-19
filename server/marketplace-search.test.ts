import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const scheduling = readFileSync(new URL("./scheduling.ts", import.meta.url), "utf8");
const core = readFileSync(new URL("./supabase-core.ts", import.meta.url), "utf8");
const routers = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");

const instructorFn = scheduling.slice(
  scheduling.indexOf("export async function listPublicInstructors"),
  scheduling.indexOf("export async function listInstructorFilterFacets"),
);
const courseFn = core.slice(
  core.indexOf("export async function listPublicPublishedCourses"),
  core.indexOf("export async function listCourseFilterFacets"),
);

describe("marketplace search", () => {
  it("accepts filter input instead of returning everything", () => {
    // Both queries previously took no input at all, so no filtering was possible server-side.
    expect(routers).not.toContain("instructors: publicProcedure.query(() => listPublicInstructors())");
    expect(routers).not.toContain("publishedCourses: publicProcedure.query(() => listPublicPublishedCourses())");
    expect(routers).toContain("listPublicInstructors(input ?? {})");
    expect(routers).toContain("listPublicPublishedCourses(input ?? {})");
  });

  it("applies every instructor filter to the database query, not the UI", () => {
    expect(instructorFn).toContain('request.overlaps("subjects", filters.subjects)');
    expect(instructorFn).toContain('request.overlaps("teaching_languages", filters.languages)');
    expect(instructorFn).toContain('request.overlaps("teaching_levels", filters.levels)');
    expect(instructorFn).toContain('request.gte("hourly_rate_minor", filters.minRateMinor)');
    expect(instructorFn).toContain('request.lte("hourly_rate_minor", filters.maxRateMinor)');
    expect(instructorFn).toContain('request.gte("years_experience", filters.minYearsExperience)');
    expect(instructorFn).toContain('request.eq("currency", filters.currency)');
    expect(instructorFn).toContain("request.or(");
  });

  it("applies every course filter to the database query", () => {
    expect(courseFn).toContain('request.in("subject", filters.subjects)');
    expect(courseFn).toContain('request.in("level", filters.levels)');
    expect(courseFn).toContain('request.in("language", filters.languages)');
    expect(courseFn).toContain("request.or(");
  });

  it("never lets a filter reach an unpublished or unverified profile", () => {
    // The visibility gate is unconditional and precedes any caller-supplied filter.
    expect(instructorFn).toContain('.eq("public_profile_status", "published")');
    // Publication is the gate now (0035); verification is a mark, not a filter.
    expect(instructorFn).toContain('.eq("public_profile_status", "published")');
    expect(courseFn).toContain('.eq("status", "published")');
    // No filter field can target those columns.
    const inputBlock = routers.slice(routers.indexOf("instructors: publicProcedure"), routers.indexOf("instructorFacets"));
    expect(inputBlock).not.toMatch(/public_profile_status|verification_status|status:/);
  });

  it("bounds paging so a caller cannot request an unbounded scan", () => {
    expect(instructorFn).toContain("Math.min(Math.max(filters.limit ?? 24, 1), MAX_DISCOVERY_PAGE)");
    expect(courseFn).toContain("Math.min(Math.max(filters.limit ?? 24, 1), 48)");
    expect(instructorFn).toContain("request.range(offset, offset + limit - 1)");
    expect(routers).toContain("limit: z.number().int().min(1).max(48).optional()");
  });

  it("returns a total count so paging can be rendered honestly", () => {
    expect(instructorFn).toContain('{ count: "exact" }');
    expect(instructorFn).toContain("total: count ?? 0");
    expect(courseFn).toContain("total: count ?? 0");
  });

  it("supports sorting without allowing arbitrary column input", () => {
    expect(routers).toContain('sort: z.enum(["relevance", "rate_asc", "rate_desc", "experience_desc"]).optional()');
    expect(routers).toContain('sort: z.enum(["newest", "title_asc"]).optional()');
    expect(instructorFn).toContain("switch (filters.sort)");
  });

  it("offers filter facets built from real published rows", () => {
    expect(scheduling).toContain("export async function listInstructorFilterFacets");
    expect(core).toContain("export async function listCourseFilterFacets");
    expect(routers).toContain("instructorFacets: publicProcedure.query(() => listInstructorFilterFacets())");
    expect(routers).toContain("courseFacets: publicProcedure.query(() => listCourseFilterFacets())");
    // Facets are derived, never a hardcoded list that could offer a dead option.
    const facets = scheduling.slice(scheduling.indexOf("export async function listInstructorFilterFacets"));
    expect(facets).toContain('.eq("public_profile_status", "published")');
    expect(facets).not.toMatch(/\["Recitation"|\["Arabic", "Hifz"/);
  });

  it("sanitises free-text search before it reaches the query string", () => {
    expect(instructorFn).toContain('term.replace(/[%,()]/g, " ")');
    expect(courseFn).toContain('term.replace(/[%,()]/g, " ")');
  });
});
