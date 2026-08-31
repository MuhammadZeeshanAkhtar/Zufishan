import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getInstructorDashboardData, getLearnerDashboardData } from "../client/src/lib/dashboard-data";

describe("dashboard data boundaries", () => {
  it("uses real auth in protected dashboard shells while retaining fail-closed empty data", () => {
    const overview = readFileSync(resolve(process.cwd(), "client/src/components/DashboardOverview.tsx"), "utf8");
    const subpage = readFileSync(resolve(process.cwd(), "client/src/components/DashboardSubpage.tsx"), "utf8");
    expect(overview).toContain("useAuth");
    expect(subpage).toContain("useAuth");
    expect(overview).not.toContain("useDemoAuth");
    expect(subpage).not.toContain("useDemoAuth");
    expect(subpage).toContain('t("common.setupNeeded")');
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
