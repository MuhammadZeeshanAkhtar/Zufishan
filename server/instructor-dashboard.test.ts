import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboard = readFileSync(new URL("../client/src/components/InstructorDashboard.tsx", import.meta.url), "utf8");
const overview = readFileSync(new URL("../client/src/components/DashboardOverview.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const chrome = readFileSync(new URL("../client/src/components/DashboardChrome.tsx", import.meta.url), "utf8");

describe("tutor dashboard", () => {
  it("is a separate component so the learner dashboard cannot be affected", () => {
    // Each desk now resolves to its own component, which makes the separation
    // stronger than the single ternary this used to pin: the learner desk moved
    // to LearnerOverview, so a change to either can no longer reach the other.
    expect(app).toContain('if (role === "instructor") return <InstructorDashboard />;');
    expect(app).toContain('if (role === "learner") return <LearnerOverview />;');
    expect(overview).toContain("export default function DashboardOverview");
    // Three distinct components, not one shared body branching on a role prop.
    const learner = readFileSync(new URL("../client/src/components/LearnerOverview.tsx", import.meta.url), "utf8");
    expect(learner).toContain("export default function LearnerOverview");
    expect(learner).not.toContain("InstructorDashboard");
    expect(dashboard).not.toContain("LearnerOverview");
  });

  it("follows the reference layout: wallet strip, training strip, tabs, current students", () => {
    expect(dashboard).toContain('tone="wallet"');
    expect(dashboard).toContain('tone="training"');
    for (const tab of ["recommended", "invites", "bookings"]) expect(dashboard).toContain(`"${tab}"`);
    expect(dashboard).toContain('t("tutorDesk.currentStudents")');
    expect(dashboard).toContain('t("tutorDesk.nobodyHired")');
  });

  it("builds every list from real server data, never from fixtures", () => {
    expect(dashboard).toContain("trpc.supabaseCore.publishedRequirements.useQuery");
    expect(dashboard).toContain("trpc.scheduling.instructorTrials.useQuery");
    expect(dashboard).toContain("trpc.scheduling.instructorBookings.useQuery");
    expect(dashboard).not.toMatch(/getInstructorDashboardData|mock|fake|sample|dummy/i);
  });

  it("states the wallet and training position honestly rather than showing a balance", () => {
    // No provider is configured, so no credit figure may be implied.
    expect(dashboard).toContain('t("tutorDesk.walletSetupNeeded")');
    expect(dashboard).not.toMatch(/0\.0 credit|balance:\s*\d/i);
  });

  it("has accessible tabs and real loading, error and empty states", () => {
    expect(dashboard).toContain('role="tablist"');
    expect(dashboard).toContain('role="tab"');
    expect(dashboard).toContain("aria-selected={tab === item.key}");
    expect(dashboard).toContain('role="tabpanel"');
    expect(dashboard).toContain("function EmptyPanel");

    // The announcement roles moved into ResultState rather than being dropped:
    // this desk used to hand-roll `aria-live` and `role="alert"` for one of its
    // three queries and announce nothing for the other two. The shared component
    // owns both roles, and now all three queries route through it — so the
    // guarantee is wider than the two literals this used to pin.
    expect(dashboard).toContain("<ResultState");
    const shared = readFileSync(new URL("../client/src/components/ResultState.tsx", import.meta.url), "utf8");
    expect(shared).toContain(`aria-live={state === "loading" ? "polite" : undefined}`);
    expect(shared).toContain(`role={state === "error" || state === "forbidden" ? "alert" : undefined}`);
    for (const query of ["suggestedState", "invitesState", "bookingsState"]) {
      expect(dashboard, `${query} is derived from the shared state layer`).toContain(query);
    }
  });

  it("routes Find Students to a desk that exists, never to a dead link", () => {
    // This used to point at the requirements page, because Find Students had no
    // desk of its own and a near-miss beat a dead link. The desk exists now, so
    // the link goes there — and the invariant that mattered is unchanged: the
    // destination is a real, routed page.
    expect(chrome).toContain('"find-students": `/dashboard/${role}/students`');
    expect(app).toContain('path="/dashboard/instructor/students"');
    // The requirements desk is still routed; it is simply a different link.
    expect(app).toContain('path="/dashboard/instructor/requirements"');
  });

  it("uses palette tokens and keeps currency and dates LTR-isolated", () => {
    expect(dashboard).not.toMatch(/#[0-9a-fA-F]{6}\b/);
    expect(dashboard).toContain("ltr-embed");
  });
});
