import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { routeGroups } from "../client/src/lib/lms-data";
import { hrefForModule } from "../client/src/components/DashboardChrome";

const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("../client/src/components/DashboardSidebar.tsx", import.meta.url), "utf8");
const overview = readFileSync(new URL("../client/src/components/DashboardOverview.tsx", import.meta.url), "utf8");
const quickLinks = readFileSync(new URL("../client/src/components/DashboardQuickLinks.tsx", import.meta.url), "utf8");

/** Every dashboard route with the role its guard enforces. */
const guarded = [...app.matchAll(/path="(\/dashboard\/[^"]+)">\{\(\)\s*=>\s*<(\w+)(?:\s+role="(\w+)")?/g)]
  .map((m) => ({ path: m[1], guard: m[2], role: m[3] ?? "" }));

describe("dashboard navigation is role-specific", () => {
  it("keeps AI Tutor for students and admins, and off the tutor sidebar", () => {
    // Out of both sidebars now — students reach it from the quick-links strip instead.
    expect(routeGroups.learner).not.toContain("AI Tutor");
    expect(routeGroups.instructor).not.toContain("AI Tutor");
    expect(quickLinks).toContain('label: "AI Tutor", href: "/dashboard/learner/ai-tutor"');
    // Admin keeps it as an oversight view; only the tutor sidebar loses it.
    expect(routeGroups.admin).toContain("AI Tutor");
  });

  it("still routes students to a real AI Tutor page", () => {
    expect(hrefForModule("learner", "AI Tutor")).toBe("/dashboard/learner/ai-tutor");
    expect(app).toContain('path="/dashboard/learner/ai-tutor"');
    expect(app).toContain("LearnerAITutorSetupPage");
    // The student's sub-pages are untouched.
    for (const sub of ["practice", "progress"]) {
      expect(app, `learner ai-tutor/${sub} must survive`).toContain(`path="/dashboard/learner/ai-tutor/${sub}"`);
    }
  });

  it("points the tutor at the real classroom dashboard, not the demo", () => {
    expect(routeGroups.instructor).toContain("Classrooms");
    expect(routeGroups.instructor).not.toContain("Classroom demo");
    expect(hrefForModule("instructor", "Classrooms")).toBe("/dashboard/instructor/classrooms");
    expect(app).toContain('path="/dashboard/instructor/classrooms"');
  });

  it("sends students to teacher discovery, reached from the quick-links strip only", () => {
    // A sidebar entry would be a second copy of the promoted link.
    expect(routeGroups.learner).not.toContain("Find Quran Teacher");
    expect(routeGroups.learner).not.toContain("Tutors");
    // Destination assertions live in "teacher discovery stays inside the authenticated area".
    expect(quickLinks).toContain('label: "Find Quran Teacher"');
    expect(app).toContain('path="/teachers"');
  });

  it("puts the promoted links inline in the header, beside the sidebar toggle", () => {
    const chrome = readFileSync(new URL("../client/src/components/DashboardChrome.tsx", import.meta.url), "utf8");
    const headerRow = chrome.slice(chrome.indexOf("<SidebarToggle"), chrome.indexOf("<LocaleSelector"));
    expect(headerRow).toContain("<DashboardQuickLinks role={role} />");
    // The old "{role} dashboard" caption is gone for learner and instructor.
    expect(headerRow).toContain('role === "admin" ?');
    // Mounted once, so the links cannot render twice in the top area.
    expect(chrome.match(/<DashboardQuickLinks/g)).toHaveLength(1);
    // Laid out on one horizontal line rather than stacked.
    expect(quickLinks).toContain('className="flex min-w-0 items-center gap-1.5 overflow-x-auto"');
    expect(quickLinks).not.toContain("flex-col");
  });

  it("shows each role only its own three links", () => {
    const learnerBlock = quickLinks.slice(quickLinks.indexOf("learner: ["), quickLinks.indexOf("instructor: ["));
    const instructorBlock = quickLinks.slice(quickLinks.indexOf("instructor: ["));
    for (const label of ["Find Quran Teacher", "Messages", "AI Tutor"]) expect(learnerBlock).toContain(`label: "${label}"`);
    for (const label of ["Find Students", "Schedule", "Messages"]) expect(instructorBlock).toContain(`label: "${label}"`);
    // No cross-role leakage in either direction.
    for (const label of ["Find Students", "Schedule"]) expect(learnerBlock).not.toContain(`label: "${label}"`);
    for (const label of ["Find Quran Teacher", "AI Tutor"]) expect(instructorBlock).not.toContain(`label: "${label}"`);
    // Every href points at a route that exists.
    for (const href of ["/dashboard/learner/teachers", "/dashboard/learner/messages", "/dashboard/learner/ai-tutor",
      "/dashboard/instructor/requirements", "/dashboard/instructor/schedule", "/dashboard/instructor/messages"]) {
      expect(app, `${href} must be a real route`).toContain(`path="${href}"`);
    }
  });

  it("offers each promoted student feature once, not in two places", () => {
    for (const label of ["Find Quran Teacher", "Messages", "AI Tutor"]) {
      expect(routeGroups.learner, `${label} must not be duplicated in the sidebar`).not.toContain(label);
      expect(quickLinks, `${label} must still be reachable from the top strip`).toContain(`label: "${label}"`);
    }
  });

  it("carries no tutor-only module in the student sidebar", () => {
    const tutorOnly = ["Find Students", "Training", "Verification", "Withdrawals", "Billing", "Availability", "Credentials"];
    for (const item of tutorOnly) {
      expect(routeGroups.learner, `${item} is tutor-only`).not.toContain(item);
    }
  });

  it("carries no student-only module in the tutor sidebar", () => {
    const studentOnly = ["AI Tutor", "Tutors", "Progress", "Wallet", "Requirements", "Bookings"];
    for (const item of studentOnly) {
      expect(routeGroups.instructor, `${item} is student-only`).not.toContain(item);
    }
  });

  it("keeps every student module the student still needs", () => {
    for (const item of ["Overview", "Edit Profile", "Courses", "Requirements",
      "Bookings", "Schedule", "Sessions", "Progress", "Reports", "Reviews", "Wallet"]) {
      expect(routeGroups.learner, `${item} must remain for students`).toContain(item);
    }
    expect(routeGroups.learner).toHaveLength(11);
  });

  it("keeps every tutor module the tutor still needs", () => {
    for (const item of ["Overview", "Edit Profile", "Courses", "Classrooms", "Training",
      "Billing", "Withdrawals"]) {
      expect(routeGroups.instructor, `${item} must remain for tutors`).toContain(item);
    }
    expect(routeGroups.instructor).toHaveLength(7);
    // Find Students, Schedule and Messages moved to the quick-links strip, not away.
    for (const label of ["Find Students", "Schedule", "Messages"]) {
      expect(quickLinks, `${label} must be promoted, not dropped`).toContain(`label: "${label}"`);
    }
  });
});

describe("navigation cannot drift out of sync", () => {
  it("has one href mapping, not a copy per dashboard", () => {
    expect(overview).not.toContain("const hrefFor");
    expect(overview).not.toContain("DashboardSidebar");
  });

  it("renders desktop rail and mobile drawer from the same list", () => {
    // Both call renderNav over the same primary/footer split, so a removed module cannot linger
    // in the drawer after being dropped from the rail.
    expect(sidebar.match(/renderNav\(primary/g)).toHaveLength(2);
    expect(sidebar.match(/renderNav\(footer/g)).toHaveLength(2);
    expect(sidebar).toContain("const items = routeGroups[role];");
  });

  it("gives every remaining module its own icon", () => {
    const icons = sidebar.slice(sidebar.indexOf("MODULE_ICONS"), sidebar.indexOf("FOOTER_MODULES"));
    for (const role of ["learner", "instructor", "admin"] as const) {
      for (const item of routeGroups[role]) {
        expect(icons, `${item} needs an icon`).toContain(`${item.toLowerCase().includes(" ") ? `"${item.toLowerCase()}"` : item.toLowerCase()}:`);
      }
    }
  });
});

describe("teacher discovery stays inside the authenticated area", () => {
  it("sends the learner to a guarded dashboard route, not the public marketplace page", () => {
    // The public page renders the site header and reads as the logged-out experience, so the
    // dashboard link must not point at it.
    expect(quickLinks).toContain('label: "Find Quran Teacher", href: "/dashboard/learner/teachers"');
    expect(quickLinks).not.toContain('href: "/teachers"');
    expect(hrefForModule("learner", "Find Quran Teacher")).toBe("/dashboard/learner/teachers");
  });

  it("guards the new routes to the learner role", () => {
    for (const path of ["/dashboard/learner/teachers", "/dashboard/learner/teachers/:slug"]) {
      const at = app.indexOf(`path="${path}"`);
      expect(at, `${path} must exist`).toBeGreaterThan(-1);
      expect(app.slice(at, at + 170)).toContain('ProtectedRoute role="learner"');
    }
  });

  it("reuses the existing discovery page rather than duplicating it", () => {
    // One component serves both surfaces; embedded only drops the public chrome.
    expect(app).toContain("<TeachersPage embedded/>");
    expect(app).toContain('embedded = false }: { initialSubject?: string; embedded?: boolean }');
    expect(app).toContain("{!embedded && <Header/>}");
    expect(app).toContain("{!embedded && <Footer/>}");
    // Cards keep the learner inside the dashboard when embedded.
    expect(app).toContain('href={(embedded ? "/dashboard/learner/teachers/" : "/teachers/") + instructor.public_slug}');
  });

  it("leaves the public marketplace exactly as it was", () => {
    expect(app).toContain('path="/teachers" component={() => <TeachersPage/>}');
    expect(app).toContain('path="/teachers/:slug"');
    for (const subject of ["quran", "tajweed", "arabic"]) {
      expect(app).toContain(`path="/teachers/subject/${subject}"`);
    }
  });
});

describe("direct routes stay role-guarded", () => {
  it("guards every dashboard route with the role its own path names", () => {
    expect(guarded.length).toBeGreaterThan(50);
    for (const route of guarded) {
      expect(route.guard, `${route.path} must use ProtectedRoute`).toBe("ProtectedRoute");
      expect(route.path.startsWith(`/dashboard/${route.role}`), `${route.path} is guarded as ${route.role}`).toBe(true);
    }
  });

  it("bounces a mismatched role rather than rendering the page", () => {
    expect(app).toContain("else if (currentSession.role !== role) setLocation(`/dashboard/${currentSession.role}`)");
  });

  it("leaves the underlying pages in place — navigation was trimmed, features were not deleted", () => {
    // Removed from the tutor sidebar, still reachable by URL and still guarded to instructors.
    expect(app).toContain('path="/dashboard/instructor/ai-tutor"');
    expect(app).toContain('path="/dashboard/instructor/classroom-demo"');
  });
});
