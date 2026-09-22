import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getInstructorDashboardData, getLearnerDashboardData } from "../client/src/lib/dashboard-data";

describe("dashboard data boundaries", () => {
  it("uses real auth in protected dashboard shells while retaining fail-closed empty data", () => {
    const overview = readFileSync(resolve(process.cwd(), "client/src/components/DashboardOverview.tsx"), "utf8");
    const subpage = readFileSync(resolve(process.cwd(), "client/src/components/DashboardSubpage.tsx"), "utf8");
    expect(overview).toContain("useAuth");
    expect(overview).not.toContain("useDemoAuth");
    expect(subpage).not.toContain("useDemoAuth");
    /*
     * The catch-all used to read the session and the fixture dashboard data so it could greet the
     * reader by name under a "Setup needed" banner, above a hardcoded English line about the
     * module they had asked for — lines that went on claiming Availability, Billing and the rest
     * were unconnected long after each was built.
     *
     * It shows none of that now, so it needs neither the session nor that data, and asserting it
     * reads them would be asserting the fault back into place. What has to stay true is that it
     * never reaches for fixture data and never tells anybody a built module is pending.
     */
    expect(subpage).not.toContain("getLearnerDashboardData");
    expect(subpage).not.toContain("getInstructorDashboardData");
    expect(subpage).not.toContain('t("common.setupNeeded")');
    expect(subpage).toContain('t("common.notFound")');
    // Translated, like every other page: the map it replaced was English only.
    expect(subpage).toContain('t("subpage.copy")');
    expect(overview).toContain("trpc.supabaseCore.enrolments.useQuery");
    expect(overview).toContain("trpc.supabaseCore.requirements.useQuery");
    expect(overview).toContain('value: learnerEnrolments.data?.ok');
  });
  it("returns a transparent empty learner dashboard", () => {
    const data = getLearnerDashboardData("Amina");
    expect(data.displayName).toBe("Amina");
    expect(data.activeCourses).toHaveLength(0);
    expect(data.metrics.every((metric) => metric.status === "empty")).toBe(true);
    expect(data.notifications).toHaveLength(0);
  });

  it("does not claim instructor approval or financial activity", () => {
    const data = getInstructorDashboardData("Maryam");
    expect(data.verificationStatus).not.toBe("Approved Instructor");
    expect(data.bookings).toHaveLength(0);
    expect(data.students).toHaveLength(0);
    expect(data.metrics.every((metric) => metric.status === "empty")).toBe(true);
  });
});
