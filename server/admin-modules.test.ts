import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { actionsForStatus } from "../client/src/components/AdminCoursesExperience";
import { reviewActionsFor } from "../client/src/components/AdminModerationExperience";
import { adminNav, activeAdminNavKey, isAdminPageBuilt } from "../client/src/lib/admin-nav";
import { PRIVILEGED_ROLES } from "@shared/account-roles";

/** Source with the leading documentation block removed, so no assertion is satisfied by prose. */
const codeOf = (path: string) => {
  const text = readFileSync(new URL(path, import.meta.url), "utf8");
  const firstImport = text.indexOf("\nimport ");
  return firstImport === -1 ? text : text.slice(firstImport);
};
const raw = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

const SERVER_MODULES = [
  "admin-instructors", "admin-courses", "admin-users",
  "admin-moderation", "admin-support", "admin-records", "admin-overview",
] as const;

const server = Object.fromEntries(SERVER_MODULES.map((name) => [name, codeOf(`./${name}.ts`)])) as Record<string, string>;
const guard = codeOf("./admin-guard.ts");
const routers = raw("./routers.ts");
const rls = raw("../supabase/migrations/0002_auth_and_rls.sql");
const app = raw("../client/src/App.tsx");
const catalog = raw("../client/src/i18n/catalog.ts");
const adminUI = codeOf("../client/src/components/AdminUI.tsx");

const CLIENT_PAGES = [
  "AdminOverviewExperience", "AdminInstructorsExperience", "AdminCoursesExperience",
  "AdminUsersExperience", "AdminModerationExperience", "AdminSupportExperience",
  "AdminRecordsExperience", "AdminShell", "AdminUI",
] as const;
const client = Object.fromEntries(CLIENT_PAGES.map((name) => [name, codeOf(`../client/src/components/${name}.tsx`)])) as Record<string, string>;

/** The admin router block, so assertions cannot be satisfied by an unrelated namespace. */
const adminRouter = routers.slice(routers.indexOf("  admin: router({"), routers.indexOf("  auth: router({"));

describe("every admin procedure is gated on the server", () => {
  it("routes every read and write through requireAdmin before touching data", () => {
    for (const [name, source] of Object.entries(server)) {
      if (name === "admin-overview") continue; // has its own gate, covered by admin-overview.test.ts
      const exported = source.match(/export async function (\w+)/g) ?? [];
      expect(exported.length, `${name} exports procedures`).toBeGreaterThan(0);
      for (const declaration of exported) {
        const fn = declaration.replace("export async function ", "");
        const body = source.slice(source.indexOf(declaration));
        const gate = body.indexOf("await requireAdmin(identity)");
        const firstRead = body.indexOf("admin.from(");
        expect(gate, `${name}.${fn} calls requireAdmin`).toBeGreaterThan(-1);
        if (firstRead > -1) expect(gate, `${name}.${fn} gates before its first query`).toBeLessThan(firstRead);
      }
    }
  });

  it("admits administrators only — a moderator is a reviewer, not an operator", () => {
    expect(guard).toContain("if (!roles.isAdmin) return { ok: false, failure: forbidden() };");
    expect(guard).not.toContain("isReviewer");
  });

  it("registers every admin procedure under one namespace on supabaseOnlyProcedure", () => {
    const procedures = adminRouter.match(/^\s{4}(\w+): supabaseOnlyProcedure/gm) ?? [];
    expect(procedures.length).toBeGreaterThanOrEqual(22);
    // No admin procedure may be public or fall back to the unconfigured OAuth scaffold.
    expect(adminRouter).not.toContain("publicProcedure");
    expect(adminRouter).not.toContain("adminProcedure");
  });

  it("hands out the service client only after the role check passes", () => {
    const gateFn = guard.slice(guard.indexOf("export async function requireAdmin"));
    expect(gateFn.indexOf("if (!roles.isAdmin)")).toBeLessThan(gateFn.indexOf("getSupabaseAdminClient()"));
  });
});

describe("nothing writes a role, and nothing edits the audit trail", () => {
  it("has no procedure anywhere that mutates user_roles", () => {
    for (const [name, source] of Object.entries(server)) {
      expect(source, `${name} must not write user_roles`).not.toMatch(/from\("user_roles"\)\s*\.\s*(insert|update|upsert|delete)/);
      expect(source, `${name} must not write user_roles`).not.toMatch(/from\("user_roles"\)\.(insert|update|upsert|delete)/);
    }
    expect(adminRouter).not.toMatch(/role.*(grant|assign|escalat)/i);
  });

  it("appends audit rows through one helper and never updates or deletes them", () => {
    expect(guard).toContain(`admin.from("audit_logs").insert({`);
    for (const [name, source] of Object.entries(server)) {
      expect(source, `${name} must not edit audit rows`).not.toMatch(/from\("audit_logs"\)\.(update|delete|upsert)/);
    }
    // The database is the real guarantee: a select policy exists, and no write policy does.
    expect(rls).toContain("create policy audit_logs_admin_select on public.audit_logs for select using (public.is_admin_user());");
    expect(rls).not.toMatch(/create policy \w+ on public\.audit_logs for (insert|update|delete)/);
  });

  it("offers no delete or edit control on the audit page", () => {
    expect(client.AdminRecordsExperience).not.toMatch(/deleteAudit|removeAudit|editAudit/);
    expect(adminRouter).not.toMatch(/auditLogs:[^\n]*mutation/);
  });
});

describe("private content is never fetched", () => {
  it("leaves message bodies and cancellation notes out of the support query", () => {
    for (const column of ["learner_message", "instructor_response", "cancellation_reason"]) {
      expect(server["admin-support"], `support must not select ${column}`).not.toContain(column);
    }
  });

  it("never reads an email address on any admin surface", () => {
    for (const [name, source] of Object.entries(server)) {
      expect(source, `${name} must not read an email`).not.toMatch(/\bemail\b/);
    }
  });

  it("redacts any platform setting whose key reads like a credential", () => {
    expect(server["admin-records"]).toContain("const SECRET_LIKE = /secret|key|token|password|credential|signature/i;");
    expect(server["admin-records"]).toContain(`value: redacted ? "" : JSON.stringify`);
  });

  it("reports provider readiness as variable names, never values", () => {
    const status = server["admin-records"].slice(server["admin-records"].indexOf("export async function getSystemStatus"));
    expect(status).toContain("requiredEnv");
    // The only use of process.env is a presence test; no value is ever carried.
    for (const match of status.match(/process\.env\[[^\]]+\][^,;]*/g) ?? []) {
      expect(match, "env is only tested for presence").toMatch(/\?\.trim\(/);
    }
    expect(status).not.toMatch(/value: process\.env|env\[[^\]]+\] \}/);
  });
});

describe("state transitions are validated, not assumed", () => {
  it("only offers course actions the server will accept", () => {
    expect(actionsForStatus("in_review")).toEqual(["publish", "request_changes", "reject"]);
    expect(actionsForStatus("published")).toEqual(["unpublish"]);
    expect(actionsForStatus("archived")).toEqual(["restore"]);
    // A draft or rejected course belongs to its instructor.
    expect(actionsForStatus("draft")).toEqual([]);
    expect(actionsForStatus("rejected")).toEqual([]);
  });

  it("checks the same transitions again on the server", () => {
    expect(server["admin-courses"]).toContain(`publish:         { from: "in_review", to: "published"`);
    expect(server["admin-courses"]).toContain(`unpublish:       { from: "published", to: "archived"`);
    expect(server["admin-courses"]).toContain(`restore:         { from: "archived",  to: "draft"`);
    expect(server["admin-courses"]).toContain("if (row.status !== transition.from) {");
    // The UPDATE re-asserts the status, so a decision that landed in between cannot be overwritten.
    expect(server["admin-courses"]).toContain(`.eq("status", transition.from);`);
  });

  it("only offers review actions the server will accept", () => {
    expect(reviewActionsFor("pending")).toEqual(["publish", "reject"]);
    expect(reviewActionsFor("published")).toEqual(["hide", "reject"]);
    expect(reviewActionsFor("hidden")).toEqual(["restore", "reject"]);
    expect(reviewActionsFor("rejected")).toEqual(["publish"]);
    expect(server["admin-moderation"]).toContain("if (!transition.from.includes(row.status)) {");
  });

  it("refuses a decision the operator is party to", () => {
    // Refused with its own wording, not the generic role refusal: an operator who
    // holds the role must not be told they lack it.
    expect(server["admin-instructors"]).toContain("if (input.instructorId === identity.id) return selfReview();");
    expect(server["admin-instructors"]).toContain("if (row.instructor_id === identity.id) return selfReview();");
    expect(server["admin-instructors"]).toContain(`error: "You cannot record a decision on your own application.",`);
    expect(server["admin-moderation"]).toContain("if (row.reviewer_id === identity.id || row.instructor_id === identity.id) {");
    expect(server["admin-users"]).toContain(`if (input.userId === identity.id) return invalid("You cannot change your own account status.");`);
  });

  it("will not suspend a privileged account from a screen", () => {
    // The list of privileged roles now lives in the shared role ladder, so the
    // server, the browser and the counting view cannot disagree about who is an
    // operator. What matters here is unchanged: holding one refuses the write.
    expect([...PRIVILEGED_ROLES].sort()).toEqual(["admin", "advisory_board", "finance", "moderator", "super_admin"]);
    expect(server["admin-users"]).toContain("if (held.some((role) => PRIVILEGED_ROLES.includes(role))) return forbidden();");
  });
});

describe("every write passes through a confirmation", () => {
  it("opens the shared dialog rather than firing on click", () => {
    for (const page of ["AdminInstructorsExperience", "AdminCoursesExperience", "AdminUsersExperience", "AdminModerationExperience"]) {
      const source = client[page];
      const mutations = source.match(/trpc\.admin\.\w+\.useMutation/g) ?? [];
      expect(mutations.length, `${page} has mutations`).toBeGreaterThan(0);
      expect(source, `${page} confirms before writing`).toContain("<ConfirmDialog request={confirm}");
      // Every mutateAsync sits inside an onConfirm handler, never in an onClick.
      for (const call of source.match(/onClick=\{[^}]*mutateAsync/g) ?? []) {
        throw new Error(`${page} calls a mutation directly from onClick: ${call}`);
      }
    }
  });

  it("requires a typed reason for anything that removes access or visibility", () => {
    expect(adminUI).toContain("const missingReason = Boolean(request.requireReason) && reason.trim().length === 0;");
    expect(adminUI).toContain("disabled={busy || missingReason}");
    // Suspension always needs one, on the server as well as in the dialog.
    expect(server["admin-users"]).toContain(`if (!input.reason?.trim()) return invalid("A reason is required to change an account status.");`);
    expect(server["admin-moderation"]).toContain(`if (!input.reason?.trim()) return invalid("A reason is required to move a case.");`);
  });

  it("closes on Escape and returns focus into the dialog", () => {
    expect(adminUI).toContain(`if (event.key === "Escape" && !busy) onClose();`);
    expect(adminUI).toContain("firstRef.current?.focus();");
    expect(adminUI).toContain(`aria-modal="true"`);
  });
});

describe("every nav destination is a real page", () => {
  it("has no unbuilt entry left", () => {
    for (const item of adminNav) {
      expect(item.built, `${item.key} is built`).toBe(true);
      expect(isAdminPageBuilt(item.key)).toBe(true);
    }
  });

  it("routes every nav href to a real experience, not the old placeholder", () => {
    for (const item of adminNav) {
      expect(app, `${item.href} has a route`).toContain(`<Route path="${item.href}">`);
    }
    // Nothing under /admin may resolve to the placeholder module any more.
    const adminRoutes = app.slice(app.indexOf(`<Route path="/admin">`), app.indexOf(`<Route><SimpleInfoPage eyebrow="Page not found"`));
    for (const placeholder of ["AdminCourseReviewPage", "AdminSessionsPage", "AdminReportsPage", "AdminBillingPage", "AdminSupportPage", "AdminPermissionMatrixPage"]) {
      expect(adminRoutes, `${placeholder} is no longer routed`).not.toContain(`<${placeholder}/>`);
    }
    expect(app).not.toContain(`import("./components/AdminExperience")`);
  });

  it("resolves every /admin path to a desk page, a redirect, or the stated not-found", () => {
    const adminRoutes = app.slice(app.indexOf(`<Route path="/admin">`), app.indexOf(`<Route><SimpleInfoPage eyebrow="Page not found"`));
    const paths = Array.from(adminRoutes.matchAll(/<Route path="(\/admin[^"]*)">/g)).map((match) => match[1]);
    expect(paths.length).toBeGreaterThan(20);

    const deskPages = new Set<string>([
      ...adminNav.map((item) => item.href),
      "/admin/overview", "/admin/instructors/:instructorId", "/admin/courses/:courseId", "/admin/users/:userId",
    ]);
    for (const path of paths) {
      if (path === "/admin/:rest*") continue; // the stated not-found
      const block = adminRoutes.slice(adminRoutes.indexOf(`<Route path="${path}">`));
      const element = block.slice(0, block.indexOf("</Route>"));
      const isRedirect = element.includes("<Redirect to=");
      expect(
        isRedirect || deskPages.has(path),
        `${path} must be a desk page or a redirect, not a legacy screen`,
      ).toBe(true);
      // A redirect must land on a page that exists.
      if (isRedirect) {
        const target = element.match(/<Redirect to="([^"]+)"\/>/)?.[1];
        expect(deskPages.has(target ?? ""), `${path} redirects to a real page (${target})`).toBe(true);
      }
    }
  });

  it("sends an unknown /admin path to a stated not-found, not the overview", () => {
    expect(app).toContain(`<Route path="/admin/:rest*">{() => <AdminProtectedRoute><AdminUnknownPage/></AdminProtectedRoute>}</Route>`);
    expect(app).toContain("adminDesk.unknownTitle");
  });

  it("highlights the longest matching nav entry", () => {
    expect(activeAdminNavKey("/admin")).toBe("overview");
    expect(activeAdminNavKey("/admin/instructors")).toBe("instructors");
    expect(activeAdminNavKey("/admin/instructors/abc")).toBe("instructors");
    expect(activeAdminNavKey("/admin/courses/abc")).toBe("courses");
    expect(activeAdminNavKey("/admin/system-status")).toBe("systemStatus");
  });

  it("has no page still describing itself as unimplemented", () => {
    for (const [name, source] of Object.entries(client)) {
      // Matched against the words a placeholder screen would actually show a
      // reader — "searchPlaceholder" is a prop name, not copy.
      expect(source, `${name} has no placeholder wording`).not.toMatch(/\bSOON\b|coming soon|not built yet|under construction|lorem ipsum/i);
      expect(source, `${name} has no invented data`).not.toMatch(/\bmock|\bfake|\bdummy|sampleData|seedData/i);
    }
  });
});

describe("the desk speaks three languages and mirrors for two", () => {
  it("carries every admin key in English, Urdu and Arabic", () => {
    const used = new Set<string>();
    for (const source of Object.values(client)) {
      for (const match of source.matchAll(/"(admin(?:UI|Status|Desk|Overview|Instructors|Courses|Users|Reviews|Content|Bookings|Audit|System|Settings)\.[\w.]+)"/g)) {
        used.add(match[1]);
      }
    }
    expect(used.size).toBeGreaterThan(100);
    const missing: string[] = [];
    for (const key of used) {
      // Template keys are assembled at runtime; only the literal ones are checked here.
      const count = catalog.match(new RegExp(`"${key.replace(/\./g, "\\.")}":`, "g"))?.length ?? 0;
      if (count !== 3) missing.push(`${key} (${count})`);
    }
    expect(missing, "every literal key appears in all three catalogues").toEqual([]);
  });

  it("uses logical properties so Urdu and Arabic mirror without a second layout", () => {
    for (const [name, source] of Object.entries(client)) {
      expect(source, `${name} uses logical insets`).not.toMatch(/\bml-\d|\bmr-\d|\bpl-\d|\bpr-\d|\bleft-\d|\bright-\d|border-l\b|border-r\b|text-left\b|text-right\b/);
    }
  });

  it("has a mobile rendering for every table, not a sideways scroll only", () => {
    // A real table above md, a card list below it, from one column definition.
    // The wide branch now uses the shared `.ni-table-wrap`, which owns the
    // horizontal scroll — so the class name moved but the guarantee did not.
    expect(adminUI).toContain("ni-table-wrap hidden md:block");
    expect(adminUI).toContain(`<ul className="space-y-3 md:hidden">`);
    const styles = readFileSync(new URL("../client/src/index.css", import.meta.url), "utf8");
    expect(styles).toMatch(/\.ni-table-wrap\s*\{[^}]*overflow-x:\s*auto/);
  });

  it("uses the shared design system rather than a second copy of it", () => {
    // The admin desk hand-rolled its own table, dialog and form controls while
    // the same rules existed in index.css. One vocabulary, so the desk and the
    // rest of the product cannot drift apart on rules, hover or focus.
    for (const shared of ["ni-table-wrap", "ni-table", "ni-modal", "ni-scrim", "ni-input", "ni-select", "ni-textarea"]) {
      expect(adminUI, `AdminUI uses .${shared}`).toContain(shared);
    }
    // And no longer re-declares what those classes already provide.
    expect(adminUI).not.toContain("w-full border-collapse");
    expect(adminUI).not.toContain('style={{ background: "var(--ni-overlay)" }}');
  });
});

describe("learner and instructor surfaces are untouched", () => {
  it("keeps their routes and their guard exactly as they were", () => {
    expect(app).toContain(`<Route path="/dashboard/learner"><ProtectedRoute role="learner">`);
    expect(app).toContain(`<Route path="/dashboard/instructor"><ProtectedRoute role="instructor">`);
    expect(routers).toContain("claimPublicRole: supabaseOnlyProcedure.mutation(({ ctx }) => claimRequestedPublicRole(ctx.supabaseIdentity)),");
  });

  it("reuses the existing decision procedures rather than forking them", () => {
    expect(server["admin-instructors"]).toContain(`import { setInstructorVerification } from "./instructor-verification";`);
    expect(server["admin-courses"]).toContain(`import { setCourseReviewDecision } from "./course-review";`);
    // The original reviewer queue still has its own procedures.
    expect(routers).toContain("instructorQueue: supabaseOnlyProcedure.query(({ ctx }) => listInstructorsForReview(ctx.supabaseIdentity)),");
  });

  it("adds no Vendor anywhere", () => {
    for (const source of [...Object.values(server), ...Object.values(client), guard, adminRouter]) {
      expect(source.toLowerCase()).not.toContain("vendor");
    }
    const files = readdirSync(new URL("../client/src/components/", import.meta.url));
    expect(files.filter((file) => /vendor/i.test(file))).toEqual([]);
  });

  it("adds no migration — every policy it needs already existed", () => {
    const migrations = readdirSync(new URL("../supabase/migrations/", import.meta.url));
    expect(migrations.filter((file) => /admin.*desk|admin.*module/i.test(file))).toEqual([]);
    expect(rls).toContain("create policy reports_moderator_update on public.reports for update using (public.is_moderator_user()) with check (public.is_moderator_user());");
    expect(rls).toContain("create policy moderation_cases_moderator_update on public.moderation_cases for update using (public.is_moderator_user()) with check (public.is_moderator_user());");
  });
});

describe("failures are reported, never hidden behind an empty list", () => {
  it("derives empty from the page envelope rather than treating any object as ready", () => {
    const paged = codeOf("../client/src/lib/admin-paged.ts");
    expect(paged).toContain(`return Array.isArray(rows) && rows.length === 0 ? "empty" : state;`);
  });

  it("renders a distinct state for forbidden, setup, offline and error on every list", () => {
    for (const page of ["AdminInstructorsExperience", "AdminCoursesExperience", "AdminUsersExperience", "AdminModerationExperience", "AdminSupportExperience", "AdminRecordsExperience"]) {
      expect(client[page], `${page} uses the shared state layer`).toContain("pagedState");
      expect(client[page], `${page} renders ResultState`).toContain("<ResultState");
      expect(client[page], `${page} offers a retry`).toContain("onRetry={()");
    }
  });

  it("logs query failures with a code and message only", () => {
    expect(guard).toContain("console.error(`[${scope}] query failed:`, { code: error.code, message: error.message });");
    for (const [name, source] of Object.entries(server)) {
      for (const line of source.match(/console\.error\([^;]*\)/g) ?? []) {
        expect(line, `${name} logs no data`).not.toMatch(/\bdata\b|\brows\b|SUPABASE|process\.env/);
      }
    }
  });
});
