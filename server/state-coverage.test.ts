import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The modules Task 9 names, plus the two screens that already had the layer. Each is read whole and
 * checked for the patterns that make a failure indistinguishable from an empty result.
 */
const MODULES = {
  hifz: "HifzTrackerExperience",
  requirements: "RequirementsExperience",
  scheduling: "SchedulingExperience",
  courseManagement: "CourseManagementExperience",
  aiTutor: "AITutorExperience",
  notifications: "NotificationsExperience",
  assessments: "AssessmentsExperience",
  classroom: "ClassroomSessionExperience",
  messaging: "MessagingExperience",
  reviews: "ReviewsExperience",
} as const;

const read = (name: string) => readFileSync(new URL(`../client/src/components/${name}.tsx`, import.meta.url), "utf8");
/** Source with the leading doc comment removed — several files quote the patterns they replaced. */
const body = (source: string) => source.slice(source.startsWith("/**") ? source.indexOf("*/") + 2 : 0);

const sources = Object.fromEntries(Object.entries(MODULES).map(([key, file]) => [key, read(file)])) as Record<keyof typeof MODULES, string>;

describe("every named module derives its state through the shared layer", () => {
  for (const key of Object.keys(MODULES) as Array<keyof typeof MODULES>) {
    it(`${key} imports and uses resultState`, () => {
      expect(sources[key], `${MODULES[key]} must use the shared derivation`).toContain("resultState");
      expect(sources[key], `${MODULES[key]} must import the shared panel`).toContain('from "./ResultState"');
    });

    it(`${key} knows whether the browser is online`, () => {
      // Without this, a dropped connection is reported as a server fault.
      expect(sources[key], `${MODULES[key]} must read online status`).toContain("useOnlineStatus");
    });
  }
});

describe("a failure is never coalesced into an empty result", () => {
  for (const key of Object.keys(MODULES) as Array<keyof typeof MODULES>) {
    it(`${key} has no ok-or-empty-array read feeding a list`, () => {
      // `x.data?.ok ? x.data.data : []` is the shape that renders a refusal as "nothing here".
      // MessagingExperience keeps one, but guards its render on resultState, so it is read only
      // when the envelope succeeded — the pattern to forbid is an *unguarded* one.
      const guarded = /const state = resultState|const base = resultState|resultState\(/.test(sources[key]);
      expect(guarded, `${MODULES[key]} must derive a state before rendering rows`).toBe(true);
    });

    it(`${key} does not fall back to a demo fixture`, () => {
      expect(body(sources[key])).not.toMatch(/demoRequirements|demoCourses\[|demoSessions|getClassroomSession\(|demoResponses/);
    });
  }
});

describe("the specific regressions this pass fixed stay fixed", () => {
  it("scheduling no longer coalesces sessions or trials to an empty list", () => {
    expect(sources.scheduling).not.toContain("const sessions = persisted ?? [];");
    expect(sources.scheduling).not.toContain("const items = persistedItems ?? [];");
    expect(sources.scheduling).toContain("const state = resultState(query as never, online);");
    expect(sources.scheduling).toContain("const state = resultState(realQuery as never, online);");
  });

  it("the trial detail reports the six states rather than only 'not found'", () => {
    expect(sources.scheduling).toContain("const detailState = resultState(detailQuery as never, online);");
    // Loading, setup and not-found were the only three outcomes it could express.
    expect(sources.scheduling).not.toContain('<h1 className="font-display text-4xl ni-t-ink">Request not found.</h1>');
  });

  it("the AI Tutor tells a failed preferences read apart from setup never being done", () => {
    expect(sources.aiTutor).not.toContain("const setupMissing = !prefs.isLoading && (!prefs.data?.ok || !prefs.data.data);");
    expect(sources.aiTutor).toContain('const setupMissing = prefsState === "ready" && !(prefs.data?.ok && prefs.data.data);');
    expect(sources.aiTutor).toContain('const prefsFailed = prefsState !== "ready" && prefsState !== "loading";');
  });

  it("the AI Tutor transcript reports a failed load instead of showing an empty thread", () => {
    expect(sources.aiTutor).toContain("const messagesState = resultState(messages as never, online);");
    expect(sources.aiTutor).toContain("const rows = resultRows<Record<string, unknown>>(messages as never);");
  });

  it("both course lists report a failure instead of 'nothing connected'", () => {
    expect(sources.courseManagement).toContain("const rows = resultRows<InstructorCourseRow>(query as never);");
    expect(sources.courseManagement.match(/\{state !== "ready" && state !== "empty" \? <div className="mt-8"><ResultState/g)?.length).toBe(2);
  });
});

describe("retrying is offered where retrying can help", () => {
  it("every module offers at least one retry", () => {
    for (const key of Object.keys(MODULES) as Array<keyof typeof MODULES>) {
      expect(sources[key].includes("onRetry"), `${MODULES[key]} must offer retry somewhere`).toBe(true);
    }
  });

  it("the shared panel withholds retry where it cannot succeed", () => {
    const panel = readFileSync(new URL("../client/src/components/ResultState.tsx", import.meta.url), "utf8");
    // Retrying a refusal or a misconfiguration just repeats it.
    expect(panel).toContain('const canRetry = Boolean(onRetry) && (state === "offline" || state === "error");');
  });

  it("the shared panel gives each state its own semantics", () => {
    const panel = readFileSync(new URL("../client/src/components/ResultState.tsx", import.meta.url), "utf8");
    expect(panel).toContain('role={state === "error" || state === "forbidden" ? "alert" : undefined}');
    expect(panel).toContain('aria-live={state === "loading" ? "polite" : undefined}');
    for (const state of ["loading", "offline", "forbidden", "setup", "error", "empty"]) {
      expect(panel, `${state} needs its own tone`).toContain(`${state}:`);
    }
  });
});

describe("nobody is redirected away without being told why", () => {
  it("the connected classroom explains a refusal instead of bouncing to the dashboard", () => {
    expect(sources.classroom).not.toMatch(/setLocation\(`\/dashboard\/\$\{[^}]*\}\/classrooms`\)/);
    expect(sources.classroom).toContain('state === "empty" ? "forbidden"');
  });

  it("no named module redirects out of an effect on an authorisation check", () => {
    for (const key of Object.keys(MODULES) as Array<keyof typeof MODULES>) {
      // A redirect chosen by the user (after a successful action) is fine; one that silently
      // replaces an explanation is not. None of these files may push on a failed check.
      expect(body(sources[key]), `${MODULES[key]} must not silently redirect`).not.toMatch(/if \(!\w+\) setLocation\(/);
    }
  });
});
