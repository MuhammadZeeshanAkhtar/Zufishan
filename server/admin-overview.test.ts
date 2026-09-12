import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { describeProviders, METRIC_KEYS } from "./admin-overview";

/** Source with the leading documentation block removed, so no assertion can be satisfied by prose. */
const codeOf = (url: URL) => {
  const text = readFileSync(url, "utf8");
  const firstImport = text.indexOf("\nimport ");
  return firstImport === -1 ? text : text.slice(firstImport);
};

const overview = codeOf(new URL("./admin-overview.ts", import.meta.url));
const routers = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const experience = codeOf(new URL("../client/src/components/AdminOverviewExperience.tsx", import.meta.url));
const shell = codeOf(new URL("../client/src/components/AdminShell.tsx", import.meta.url));
const nav = codeOf(new URL("../client/src/lib/admin-nav.ts", import.meta.url));
const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const catalog = readFileSync(new URL("../client/src/i18n/catalog.ts", import.meta.url), "utf8");

describe("provider status carries names, never values", () => {
  // The strings below stand in for real secrets. If any of them can reach the
  // payload, the same is true of a real key.
  const configured = {
    CLASSROOM_PROVIDER: "acme-rooms",
    CLASSROOM_PROVIDER_API_KEY: "SECRET-CLASSROOM-VALUE",
    PAYMENT_PROVIDER: "acme-pay",
    PAYMENT_PROVIDER_SECRET: "SECRET-PAYMENT-VALUE",
    PAYOUT_PROVIDER: "acme-payouts",
    PAYOUT_PROVIDER_SECRET: "SECRET-PAYOUT-VALUE",
    NOTIFICATION_PROVIDER: "acme-mail",
    NOTIFICATION_PROVIDER_API_KEY: "SECRET-NOTIFICATION-VALUE",
  } as unknown as NodeJS.ProcessEnv;

  it("never serialises a configured value", () => {
    const serialised = JSON.stringify(describeProviders(configured));
    for (const secret of ["SECRET-CLASSROOM-VALUE", "SECRET-PAYMENT-VALUE", "SECRET-PAYOUT-VALUE", "SECRET-NOTIFICATION-VALUE", "acme-rooms", "acme-pay"]) {
      expect(serialised).not.toContain(secret);
    }
    // The variable NAME is what an operator needs, and it is present.
    expect(serialised).toContain("CLASSROOM_PROVIDER");
  });

  it("reports configured providers as ready and unset ones as needing setup", () => {
    const ready = describeProviders(configured);
    expect(ready.find((row) => row.key === "classroom")?.state).toBe("ready");
    expect(ready.find((row) => row.key === "payments")?.state).toBe("ready");
    expect(ready.find((row) => row.key === "payouts")?.state).toBe("ready");
    expect(ready.find((row) => row.key === "notifications")?.state).toBe("ready");

    const bare = describeProviders({} as NodeJS.ProcessEnv);
    for (const key of ["classroom", "payments", "payouts", "notifications"]) {
      expect(bare.find((row) => row.key === key)?.state).toBe("setup_needed");
    }
  });

  it("separates 'not implemented' from 'setup needed'", () => {
    // FX and refunds have no boundary in this codebase. Reporting them as
    // "setup needed" would point an operator at variables nothing reads.
    for (const key of ["fx", "refunds"]) {
      const row = describeProviders(configured).find((entry) => entry.key === key);
      expect(row?.state).toBe("not_implemented");
      expect(row?.requiredEnv).toEqual([]);
    }
  });

  it("covers every provider the overview is required to warn about", () => {
    const keys = describeProviders({} as NodeJS.ProcessEnv).map((row) => row.key);
    expect(keys).toEqual(["classroom", "payments", "fx", "refunds", "payouts", "notifications"]);
  });
});

describe("the numbers are real or they are absent", () => {
  it("counts exactly, and never estimates", () => {
    expect(overview).toContain(`select("*", { count: "exact", head: true })`);
    // No default, no fallback figure, no sample data anywhere in the module.
    expect(overview).not.toMatch(/mock|fake|sample|dummy|placeholder|seed/i);
  });

  it("returns null rather than zero when a count fails", () => {
    expect(overview).toContain("return null;");
    expect(overview).toContain("available: values[key] !== null,");
    // A successful query with no rows is still a real zero.
    expect(overview).toContain("return value ?? 0;");
  });

  it("does not sum two tables when only one of them could be read", () => {
    expect(overview).toContain("const reportedTotal = openReports === null || openReviewReports === null ? null : openReports + openReviewReports;");
  });

  it("distinguishes an unreadable audit trail from an empty one", () => {
    expect(overview).toContain("activityUnavailable: Boolean(auditError),");
    expect(experience).toContain(`if (unavailable) return <ResultState state="error"`);
  });

  it("reports every metric the overview is required to show", () => {
    // "admins" joined the list when role figures moved from counting role ROWS
    // to counting accounts: administrators were previously counted inside
    // "learners" and had no figure of their own.
    expect([...METRIC_KEYS]).toEqual([
      "learners", "instructors", "admins", "courses", "publishedCourses", "pendingVerifications",
      "coursesInReview", "pendingReviews", "upcomingBookings", "openReports", "openCases",
    ]);
  });
});

describe("the role is verified on the server", () => {
  it("admits administrators only, before it reads anything", () => {
    const gate = overview.slice(overview.indexOf("export async function getAdminOverview"));
    const roleCheck = gate.indexOf("if (!roles.isAdmin) return forbidden();");
    const firstRead = gate.indexOf("getSupabaseAdminClient()");
    expect(roleCheck).toBeGreaterThan(-1);
    expect(roleCheck).toBeLessThan(firstRead);
    // A moderator is a reviewer, not an operator of this desk.
    expect(gate).not.toContain("roles.isReviewer");
  });

  it("takes no input, so a caller cannot name whose platform to read", () => {
    expect(routers).toContain("overview: supabaseOnlyProcedure.query(({ ctx }) => getAdminOverview(ctx.supabaseIdentity)),");
    expect(routers).not.toMatch(/overview:[^\n]*\.input\(/);
  });

  it("logs failures without the row or the connection", () => {
    const logs = overview.match(/console\.error\([^;]*\)/g) ?? [];
    expect(logs.length).toBeGreaterThan(0);
    for (const line of logs) {
      expect(line).toMatch(/code: \w+\.code, message: \w+\.message/);
      expect(line).not.toMatch(/data|rows|SUPABASE|process\.env/);
    }
  });
});

describe("the audit summary carries a transition, not a dossier", () => {
  it("copies only allow-listed metadata fields", () => {
    const mapper = overview.slice(overview.indexOf("const recentActivity"), overview.indexOf("return {\n    ok: true,"));
    expect(mapper).toContain(`from: typeof metadata.from === "string" ? metadata.from : null,`);
    expect(mapper).toContain(`to: typeof metadata.to === "string" ? metadata.to : null,`);
    // Measured on code with the comments stripped, so the assertion cannot be
    // satisfied by a sentence that merely mentions a field.
    const code = mapper.split("\n").filter((line) => !line.trim().startsWith("//")).join("\n");
    // Exactly two fields are lifted out of the row, each read twice by the guard.
    expect([...code.matchAll(/metadata\.(\w+)/g)].map((match) => match[1]).sort()).toEqual(["from", "from", "to", "to"]);
    // The metadata object itself never reaches the browser.
    expect(code).not.toMatch(/^\s*metadata,\s*$/m);
  });

  it("identifies an actor by display name, never by email", () => {
    expect(overview).toContain("profiles:actor_id(display_name,full_name)");
    expect(overview).not.toContain("email");
  });
});

describe("a non-admin is refused, not redirected", () => {
  it("states the refusal instead of bouncing to a dashboard", () => {
    // Scoped to the admin gate itself: ProtectedRoute legitimately still sends a
    // learner who opens the instructor dashboard back to their own, and that
    // behaviour is unchanged.
    const gate = app.slice(app.indexOf("function AdminProtectedRoute"), app.indexOf("function AuthenticatedRoute"));
    expect(gate).toContain(`if (!currentRoles.some((role) => isAdminRole(role))) return <AdminForbidden role={currentSession.role} />;`);
    expect(gate).not.toContain("setLocation(`/dashboard/");
    expect(app).toContain(`<h1 className="mt-3 font-display text-3xl leading-tight ni-t-ink" role="alert">{t("adminDesk.forbiddenTitle")}</h1>`);
  });

  it("still sends an unauthenticated visitor through the normal login flow", () => {
    expect(app).toContain("setLocation(`/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);");
  });

  it("leaves the learner and instructor routes exactly as they were", () => {
    expect(app).toContain(`<Route path="/dashboard/learner"><ProtectedRoute role="learner">`);
    expect(app).toContain(`<Route path="/dashboard/instructor"><ProtectedRoute role="instructor">`);
  });
});

describe("the desk does not promise pages it has not built", () => {
  it("renders an unbuilt destination as a disabled row, never a link", () => {
    expect(nav).toContain("built: boolean;");
    expect(shell).toContain(`if (!item.built) {`);
    expect(shell).toContain(`aria-disabled="true"`);
  });

  it("matches the longest nav prefix, so a detail route does not highlight Overview", () => {
    expect(nav).toContain(".sort((a, b) => b.href.length - a.href.length);");
  });

  it("only links a metric card when its destination exists", () => {
    expect(experience).toContain("const linked = Boolean(destination?.built);");
    expect(experience).toContain("return linked && destination");
  });

  it("names every admin page the brief asks for", () => {
    for (const href of [
      "/admin", "/admin/instructors", "/admin/courses", "/admin/users", "/admin/content",
      "/admin/reviews", "/admin/bookings", "/admin/audit-logs", "/admin/system-status", "/admin/settings",
    ]) {
      expect(nav).toContain(`href: "${href}"`);
    }
  });

  it("has no Vendor anywhere in the admin surface", () => {
    for (const source of [nav, shell, experience, overview]) {
      expect(source.toLowerCase()).not.toContain("vendor");
    }
  });
});

describe("the admin chrome carries the global controls", () => {
  it("puts the theme toggle beside the notification bell", () => {
    const header = shell.slice(shell.indexOf("<header"), shell.indexOf("</header>"));
    expect(header).toContain("<ThemeToggle />");
    expect(header).toContain("<NotificationBell role=\"admin\"");
    expect(header.indexOf("<ThemeToggle />")).toBeLessThan(header.indexOf("<NotificationBell"));
    expect(header).toContain("<LocaleSelector compact />");
  });

  it("offers no link to a notifications page that does not exist yet", () => {
    expect(shell).toContain("viewAllHref={null}");
  });

  it("mirrors for Urdu and Arabic without a second layout", () => {
    // Logical properties only: nothing is pinned to a physical left or right.
    expect(shell).not.toMatch(/\bleft-\d|\bright-\d|\bml-\d|\bmr-\d|\bpl-\d|\bpr-\d|border-l\b|border-r\b/);
    expect(shell).toContain("border-e border-[var(--ni-sage)]");
    expect(shell).toContain("inset-y-0 start-0");
  });

  it("is reachable and dismissible from the keyboard", () => {
    expect(shell).toContain("adminDesk.skipToContent");
    expect(shell).toContain(`if (event.key === "Escape") setDrawerOpen(false);`);
    expect(shell).toContain("document.removeEventListener(\"keydown\", onKey)");
    expect(shell).toContain("drawerCloseRef.current?.focus();");
    expect(shell).toContain(`aria-current={active ? "page" : undefined}`);
  });
});

describe("every state is rendered, in every language", () => {
  it("routes the whole payload through the shared state layer", () => {
    expect(experience).toContain("const state = resultState(query as never, online);");
    expect(experience).toContain(`{state !== "ready" ? (`);
    expect(experience).toContain("onRetry={() => query.refetch()}");
  });

  it("has an empty state that is not the same as a failure", () => {
    expect(experience).toContain("adminOverview.activityEmpty");
    expect(experience).toContain("adminOverview.activityUnavailable");
    expect(experience).toContain("adminOverview.metricUnavailable");
    expect(experience).toContain("adminOverview.nothingPending");
  });

  it("carries English, Urdu and Arabic for every new key", () => {
    const keys = [
      "adminDesk.brandLine", "adminDesk.nav.overview", "adminDesk.nav.systemStatus",
      "adminDesk.forbiddenTitle", "adminDesk.inProgress",
      "adminOverview.eyebrow", "adminOverview.metric.learners", "adminOverview.metric.openCases",
      "adminOverview.provider.fx", "adminOverview.providerNotImplemented",
      "adminOverview.activityEmpty", "adminOverview.action.pendingVerifications",
    ];
    for (const key of keys) {
      expect(catalog.match(new RegExp(`"${key.replace(/\./g, "\\.")}":`, "g"))?.length, `${key} in all three catalogs`).toBe(3);
    }
  });
});
