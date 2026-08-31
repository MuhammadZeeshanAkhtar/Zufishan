import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const core = readFileSync(new URL("./supabase-core.ts", import.meta.url), "utf8");
const client = readFileSync(new URL("./supabase-user-client.ts", import.meta.url), "utf8");
const router = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");

describe("public course catalogue boundary", () => {
  it("uses the anonymous publishable-key client and published filter", () => {
    expect(client).toContain("export function getSupabasePublicClient");
    expect(core).toContain("getSupabasePublicClient()");
    expect(core).toContain("listPublicPublishedCourses");
    expect(core).toContain('.eq("status", "published")');
    expect(router).toContain("publishedCourses: publicProcedure");
  });

  it("wires the public catalogue UI to Supabase without demo fallback", () => {
    const page = app.slice(app.indexOf("function CoursesPage"), app.indexOf("function CourseDetail"));
    expect(page).toContain("trpc.schedulingPublic.publishedCourses.useQuery");
    expect(page).toContain('t("catalogue.courseDiscoveryUnavailable")');
    expect(page).not.toContain("courses.map");
    const detail = app.slice(app.indexOf("function CourseDetail"), app.indexOf("function TeachersPage"));
    expect(detail).toContain("trpc.schedulingPublic.courseBySlug.useQuery");
    expect(detail).toContain('t("catalogue.courseNotPublicCopy")');
  });

  it("selects a public field allowlist rather than private course rows", () => {
    expect(core).toContain('select("id, slug, title, description, subject, level, language, status, created_at")');
    expect(core).not.toContain('select("*, instructor_id")');
  });
});
