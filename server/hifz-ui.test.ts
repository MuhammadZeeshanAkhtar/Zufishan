import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ui = readFileSync(new URL("../client/src/components/HifzTrackerExperience.tsx", import.meta.url), "utf8");
/** The file without its opening doc comment, which quotes the pattern it replaced. */
const code = ui.slice(ui.indexOf("*/") + 2);
const nav = readFileSync(new URL("../client/src/lib/lms-data.ts", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("../client/src/components/DashboardSidebar.tsx", import.meta.url), "utf8");
const chrome = readFileSync(new URL("../client/src/components/DashboardChrome.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const catalog = readFileSync(new URL("../client/src/i18n/catalog.ts", import.meta.url), "utf8");

describe("the module is reachable", () => {
  it("appears in the navigation for both roles", () => {
    const groups = nav.slice(nav.indexOf("export const routeGroups"));
    const learner = groups.slice(groups.indexOf("learner: ["), groups.indexOf("instructor: ["));
    const instructor = groups.slice(groups.indexOf("instructor: ["), groups.indexOf("admin: ["));
    expect(learner, "learner nav needs Hifz").toContain('"Hifz"');
    expect(instructor, "instructor nav needs Hifz").toContain('"Hifz"');
  });

  it("resolves to the route that already existed, for either role", () => {
    // "hifz" is not in the special-case map, so it falls through to /dashboard/<role>/hifz.
    expect(chrome).toContain('return mapped[slug] || `/dashboard/${role}/${slug === "overview" ? "" : slug}`;');
    expect(app).toContain('<Route path="/dashboard/learner/hifz">');
    expect(app).toContain('<Route path="/dashboard/instructor/hifz">');
  });

  it("has an icon of its own rather than the fallback", () => {
    expect(sidebar).toContain("hifz: BookOpen,");
  });
});

describe("routes no longer discard the parameter they carry", () => {
  it("passes the plan id and the learner id through", () => {
    expect(app).toContain('<Route path="/dashboard/learner/hifz/:planId">{(params) => <ProtectedRoute role="learner"><HifzPlanDetailPage planId={params.planId}/></ProtectedRoute>}</Route>');
    expect(app).toContain('<Route path="/dashboard/instructor/hifz/:learnerId">{(params) => <ProtectedRoute role="instructor"><InstructorHifzLearnerPage learnerId={params.learnerId}/></ProtectedRoute>}</Route>');
  });

  it("actually uses them, rather than accepting and ignoring them", () => {
    expect(ui).toContain("export function HifzPlanDetailPage({ planId }: { planId?: string } = {}) { return <HifzTrackerPage planId={planId} />; }");
    expect(ui).toContain("export function InstructorHifzLearnerPage({ learnerId }: { learnerId?: string } = {}) { return <InstructorHifzPage learnerId={learnerId} />; }");
    expect(ui).toContain("useEffect(() => { if (planId && planRows.some((plan) => plan.id === planId)) setSelectedId(planId); }, [planId, planRows]);");
    expect(ui).toContain("const input = useMemo(() => (learnerId ? { learnerId } : {}), [learnerId]);");
  });
});

describe("a failure is no longer told as emptiness", () => {
  it("has removed every ok-or-empty-array read", () => {
    // The exact shape that turned any failure into "no plans yet".
    expect(code).not.toMatch(/\.data\?\.ok \? \w+\.data\.data : \[\]/);
    expect(code).not.toMatch(/\.data\?\.ok \? \w+\.data\.data : null/);
  });

  it("derives every panel through the shared helper", () => {
    expect(ui).toContain('function usePanelState(query: { isLoading: boolean; isError: boolean; data?: unknown }, hasRows: boolean, online: boolean): Exclude<State, "ready"> | null {');
    // Definition, plus: tracker plans, tracker records, progress plans, reminders, instructor records.
    expect(ui.match(/usePanelState\(/g)?.length).toBe(6);
    expect(ui.match(/resultRows</g)?.length).toBe(6);
  });

  it("offers retry on every list that can fail", () => {
    expect(ui.match(/onRetry=\{/g)?.length).toBe(5);
    expect(ui).toContain('<button type="button" onClick={() => { void plans.refetch(); void recordQuery.refetch(); }} className="font-bold underline">{t("common.retry")}</button>');
  });

  it("reports a plan problem on the progress screen rather than 'not enough data'", () => {
    expect(ui).toContain('const rawProgress = plan ? resultState(progress as never, online) : "empty";');
    expect(ui).toContain('message={progressState === "empty" ? (planRows.length ? t("hifz.noData") : t("hifz.noPlans")) : resultError(plans as never) ?? resultError(progress as never)}');
  });

  it("separates a success notice from a failure, instead of one shared string", () => {
    // Both mutations used to write into a single `notice`, so an error read like a confirmation.
    expect(ui).toContain('<p role="status"');
    expect(ui).toContain('<p role="alert"');
    expect(ui.match(/setFailure\(/g)?.length).toBeGreaterThanOrEqual(8);
  });
});

describe("nothing is fabricated", () => {
  it("still calls the real procedures for every read and write", () => {
    for (const proc of [
      "advancedHifzPlans", "createAdvancedHifzPlan", "hifzRecords", "hifzProgress", "createHifzRecord",
      "submitHifzRecordForReview", "hifzReminders", "assignedHifzRecords", "assignedHifzReviews", "reviewHifzRecord",
    ]) {
      expect(ui, `${proc} must be called`).toContain(`trpc.supabaseCore.${proc}`);
    }
  });

  it("invents no plan, record, review or metric", () => {
    expect(code).not.toMatch(/demoPlan|fakeRecord|sampleHifz|mockProgress|seedRecords/i);
    // Metrics are read from the procedure, never computed from an assumption.
    expect(ui).toContain('const data = (progress.data as { ok?: boolean; data?: Metrics } | undefined)?.ok ? (progress.data as { data: Metrics }).data : null;');
  });

  it("says plainly that Quran content and reminder delivery are not connected", () => {
    expect(ui).toContain('<ResultState state="setup" message={t("hifz.setupNeeded")} />');
    expect(ui).toContain('<ResultState state="setup" message={t("notifPrefs.emailNotConnected")} />');
  });

  it("offers submit-for-review only on a record that has been practised", () => {
    expect(ui).toContain('{row.status === "practiced" && (');
  });
});

describe("states, translation and direction", () => {
  it("shows a pending state on every write", () => {
    expect(ui.match(/animate-spin/g)?.length).toBe(4);
    expect(ui.match(/aria-busy/g)?.length).toBe(3);
  });

  it("renders no raw database value where a label exists", () => {
    expect(ui).toContain("label.status(plan.status)");
    expect(ui).toContain("label.section(row.section_type)");
    for (const key of ["hifz.status.planned", "hifz.status.practiced", "hifz.status.needsRevision", "hifz.status.paused", "hifz.status.submitted", "hifz.status.reviewed", "hifz.status.approved"]) {
      expect(catalog.match(new RegExp(`"${key.replace(/\./g, "\\.")}":`, "g"))?.length, `${key} needs en/ur/ar`).toBe(3);
    }
  });

  it("uses logical spacing, mirrors the back arrow, and isolates numbers and dates", () => {
    expect(ui).not.toMatch(/\b(ml|mr|pl|pr)-\d/);
    expect(ui).toContain('className="rtl:rotate-180"');
    // `text-start`, not `text-left`, so the plan list aligns correctly in Arabic and Urdu.
    expect(ui).toContain("w-full rounded-xl p-4 text-start");
    expect(ui).not.toMatch(/\btext-left\b/);
    // Every numeric input, date and surah:ayah reference is isolated so it reads correctly
    // when the surrounding paragraph is right-to-left.
    expect(ui.match(/ltr-embed/g)?.length).toBe(12);
  });

  it("keeps the grids responsive rather than fixed-column", () => {
    expect(ui).toContain("grid gap-4 sm:grid-cols-2 lg:grid-cols-4");
    expect(ui).toContain("grid gap-6 lg:grid-cols-[.7fr_1.3fr]");
  });
});
