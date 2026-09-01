import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboard = readFileSync(new URL("../client/src/components/InstructorDashboard.tsx", import.meta.url), "utf8");
const overview = readFileSync(new URL("../client/src/components/DashboardOverview.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const chrome = readFileSync(new URL("../client/src/components/DashboardChrome.tsx", import.meta.url), "utf8");

describe("tutor dashboard", () => {
  it("is a separate component so the learner dashboard cannot be affected", () => {
    expect(app).toContain('return role === "instructor" ? <InstructorDashboard /> : <DashboardOverview role={role} />;');
    // The learner path still goes through the untouched overview.
    expect(overview).toContain("export default function DashboardOverview");
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
    expect(dashboard).toContain('aria-live="polite"');
    expect(dashboard).toContain('role="alert"');
    expect(dashboard).toContain("function EmptyPanel");
  });

  it("routes Find Students to the existing requirements page instead of a new dead link", () => {
    expect(chrome).toContain('"find-students": `/dashboard/${role}/requirements`');
    expect(app).toContain('path="/dashboard/instructor/requirements"');
  });

  it("uses palette tokens and keeps currency and dates LTR-isolated", () => {
    expect(dashboard).not.toMatch(/#[0-9a-fA-F]{6}\b/);
    expect(dashboard).toContain("ltr-embed");
  });
});
