import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PUBLIC_ROLES, LOGIN_CONTEXTS, ROLE_DECISIONS, publicRoleOf, isAdminRole } from "./role-identity";

/** Source with the leading documentation block removed, so no assertion is met by prose. */
const codeOf = (path: string) => {
  const text = readFileSync(new URL(path, import.meta.url), "utf8");
  const firstImport = text.indexOf("\nimport ");
  return firstImport === -1 ? text : text.slice(firstImport);
};
const raw = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

const identity = codeOf("./role-identity.ts");
const routers = raw("./routers.ts");
const authCtx = raw("../client/src/contexts/AuthContext.tsx");
const app = raw("../client/src/App.tsx");
const catalog = raw("../client/src/i18n/catalog.ts");
const adminUsersServer = codeOf("./admin-users.ts");
const adminUsersClient = codeOf("../client/src/components/AdminUsersExperience.tsx");

/** The migration's executable half. Its commentary quotes the old, wrong statement. */
const migration = raw("../supabase/migrations/0023_signup_role_is_the_requested_one.sql");
const statement = migration.slice(migration.indexOf("create or replace function"));

describe("the root cause: the signup trigger no longer hardcodes learner", () => {
  it("reads the requested role instead of inserting one", () => {
    expect(statement).toContain("new.raw_user_meta_data->>'requested_public_role'");
    expect(statement).toContain("values (new.id, granted)");
    // The exact line that caused every account to be a learner.
    expect(statement).not.toContain("values (new.id, 'learner')");
  });

  it("(1) a learner signup creates a learner, and its learner record", () => {
    expect(statement).toContain("case when requested in ('learner', 'instructor') then requested else null end");
    expect(statement).toContain("if granted = 'learner' then");
    expect(statement).toContain("insert into public.learner_profiles (user_id) values (new.id)");
  });

  it("(2, 3) an instructor signup creates an instructor and nothing else", () => {
    // One insert of the granted role, guarded — not one per role, and not a default.
    const inserts = statement.match(/insert into public\.user_roles/g) ?? [];
    expect(inserts.length).toBe(1);
    expect(statement).toContain("if granted is not null then");
    // The learner record is conditional, so an instructor does not get one.
    const learnerInsert = statement.indexOf("insert into public.learner_profiles");
    const guard = statement.indexOf("if granted = 'learner' then");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(learnerInsert);
  });

  it("cannot be talked into a privileged role by signup metadata", () => {
    // Metadata is client-controlled at signup; the allow-list is the whole defence.
    for (const privileged of ["admin", "super_admin", "moderator", "finance", "advisory_board"]) {
      expect(statement).not.toContain(`'${privileged}'`);
    }
  });

  it("leaves no role at all when nothing valid was requested", () => {
    expect(statement).toContain("else null end");
    expect(identity).toContain('return { ok: true, data: { granted: false, role: null, decision: "role_not_assigned" } };');
  });
});

describe("the allow-list and the vocabulary", () => {
  it("offers exactly three contexts and two public roles, and no vendor", () => {
    expect(PUBLIC_ROLES).toEqual(["learner", "instructor"]);
    expect(LOGIN_CONTEXTS).toEqual(["learner", "instructor", "admin"]);
    expect(identity.toLowerCase()).not.toContain("vendor");
    expect(app.toLowerCase()).not.toContain("vendor");
  });

  it("validates both inputs at the router edge", () => {
    expect(routers).toContain("role: z.enum(PUBLIC_ROLES)");
    expect(routers).toContain("context: z.enum(LOGIN_CONTEXTS)");
  });

  it("resolves a held role without ever defaulting", () => {
    expect(publicRoleOf(["instructor"])).toBe("instructor");
    expect(publicRoleOf(["learner"])).toBe("learner");
    expect(publicRoleOf(["admin"])).toBe(null);
    expect(publicRoleOf([])).toBe(null);
    // An account holding both — the pre-fix state — reports the higher-privilege
    // public role rather than silently picking learner.
    expect(publicRoleOf(["learner", "instructor"])).toBe("instructor");
    expect(isAdminRole(["admin"])).toBe(true);
    expect(isAdminRole(["super_admin"])).toBe(true);
    expect(isAdminRole(["learner"])).toBe(false);
  });
});

describe("(4, 5) an address cannot change sides", () => {
  it("refuses an instructor signup on an address already registered as a learner", () => {
    expect(identity).toContain('if (roles.includes("learner") && role === "instructor") return answer("already_learner");');
  });

  it("refuses a learner signup on an address already registered as an instructor", () => {
    expect(identity).toContain('if (roles.includes("instructor") && role === "learner") return answer("already_instructor");');
  });

  it("reports a repeat of the same role as a duplicate rather than creating a second", () => {
    expect(identity).toContain('return answer("duplicate_email");');
    // The check runs BEFORE the account is created.
    const signUp = authCtx.slice(authCtx.indexOf("const signUp = useCallback"));
    // The account-creation call is now made through a locally bound client, so
    // match the call itself rather than the identifier it is reached through.
    expect(signUp.indexOf("eligibilityMutation.mutateAsync")).toBeLessThan(signUp.search(/\bclient\.auth\.signUp\(/));
  });

  it("never switches or duplicates a role that already exists", () => {
    expect(identity).toContain('if (held) return { ok: true, data: { granted: false, role: held, decision: "ok" } };');
    expect(identity).toContain('.upsert({ user_id: identity.id, role: requested }, { onConflict: "user_id,role" });');
  });
});

describe("(6, 7, 8, 9) the board address", () => {
  it("is compared server-side and never reaches the browser", () => {
    expect(identity).toContain("const configured = normalise(process.env.ADMIN_EMAIL);");
    for (const [name, source] of [["AuthContext", authCtx], ["App", app], ["catalog", catalog]] as const) {
      expect(source, `${name} must not read the value`).not.toMatch(/process\.env\.ADMIN_EMAIL|import\.meta\.env\.[A-Z_]*ADMIN/);
      expect(source, `${name} must not carry a VITE_-prefixed admin address`).not.toContain("VITE_ADMIN");
    }
  });

  it("(6, 7) cannot be registered as a learner or an instructor", () => {
    expect(identity).toContain('if (isAdminAddress(email)) return answer("admin_reserved");');
    // And it holds no public role even if a claim is attempted later.
    expect(identity).toContain('if (isAdminAddress(data.user.email ?? "")) {');
    expect(identity).toContain('return { ok: true, data: { granted: false, role: null, decision: isAdminRole(roles) ? "ok" : "admin_reserved" } };');
  });

  it("(8) with the Board/Admin context lands on /admin", () => {
    expect(identity).toContain('if (admin_) return context === "admin" ? shape("ok", "/admin") : shape("admin_reserved");');
  });

  it("(9) a normal address choosing Board/Admin gets the unauthorised message, not the reserved one", () => {
    expect(identity).toContain('if (context === "admin") return shape("not_admin");');
    // Two different codes, so the two audiences cannot be shown the same sentence.
    expect(ROLE_DECISIONS).toContain("admin_reserved");
    expect(ROLE_DECISIONS).toContain("not_admin");
    expect(catalog).toContain('"auth.decision.not_admin": "This email is not authorized for the Board/Admin account.');
    expect(catalog).toContain('"auth.decision.admin_reserved": "This email is reserved for the Board/Admin account.');
  });

  it("still grants admin only through the existing idempotent bootstrap", () => {
    const bootstrap = codeOf("./admin-bootstrap.ts");
    expect(bootstrap).toContain('.upsert({ user_id: identity.id, role: "admin" }, { onConflict: "user_id,role" })');
    expect(bootstrap).not.toContain('role: "super_admin"');
    // Nothing in the role-identity module grants a privileged role.
    expect(identity).not.toMatch(/role:\s*"(admin|super_admin|moderator|finance|advisory_board)"/);
  });
});

describe("(10, 11) login context mismatch", () => {
  it("(10) a learner choosing the instructor card is told which card to use", () => {
    expect(identity).toContain('if (holds !== context) return shape(holds === "instructor" ? "already_instructor" : "already_learner");');
    expect(catalog).toContain('"auth.decision.login.already_learner": "This account is registered as a Learner. Please select Learner/Student."');
  });

  it("(11) an instructor choosing the learner card is told the same, the other way", () => {
    expect(catalog).toContain('"auth.decision.login.already_instructor": "This account is registered as an Instructor. Please select Ustaz/Instructor."');
  });

  it("says something different at signup than at login for the same fact", () => {
    expect(catalog).toContain('"auth.decision.signup.already_learner": "This email is already registered as a Learner.');
    expect(catalog).toContain('"auth.decision.signup.already_instructor": "This email is already registered as an Instructor.');
    expect(app).toContain('return t(`auth.decision.${phase}.${code}` as TranslationKey);');
  });

  it("carries every decision message in all three languages", () => {
    const keys = [
      "auth.decision.admin_reserved", "auth.decision.not_admin",
      "auth.decision.signup.already_learner", "auth.decision.signup.already_instructor",
      "auth.decision.login.already_learner", "auth.decision.login.already_instructor",
      "auth.decision.duplicate_email", "auth.decision.role_not_assigned", "auth.decision.network",
      "auth.roleNotAssignedTitle", "adminUsers.roleNotAssigned",
    ];
    for (const key of keys) {
      const count = catalog.match(new RegExp(`"${key.replace(/\./g, "\\.")}":`, "g"))?.length ?? 0;
      expect(count, `${key} appears in en, ur and ar`).toBe(3);
    }
  });
});

describe("(12, 13) a role cannot open another role's desk", () => {
  it("keeps the per-role route guards", () => {
    expect(app).toContain('<Route path="/dashboard/learner"><ProtectedRoute role="learner">');
    expect(app).toContain('<Route path="/dashboard/instructor"><ProtectedRoute role="instructor">');
    expect(app).toContain("else if (currentSession.role !== role) setLocation(`/dashboard/${currentSession.role}`);");
  });

  it("refuses /admin to anyone without the role, in the browser and on the server", () => {
    expect(app).toContain("if (!currentRoles.some((role) => isAdminRole(role))) return <AdminForbidden role={currentSession.role} />");
    // The guard that actually matters: every admin procedure re-checks the role.
    const guard = codeOf("./admin-guard.ts");
    expect(guard).toContain("if (!roles.isAdmin) return { ok: false, failure: forbidden() };");
    expect(guard).toContain("const roles = await readOwnRoles(identity);");
  });

  it("and the database refuses a self-granted role regardless of the UI", () => {
    const rls = raw("../supabase/migrations/0002_auth_and_rls.sql");
    expect(rls).toContain("create policy user_roles_admin_insert on public.user_roles for insert with check (public.is_admin_user() and (role <> 'super_admin' or public.is_super_admin_user()));");
    expect(rls).toContain("create policy user_roles_select_own_or_admin on public.user_roles for select using (auth.uid() = user_id or public.is_admin_user());");
  });
});

describe("(14) the role survives reload, logout and an incomplete onboarding", () => {
  it("re-reads roles from the server on every session, never from storage", () => {
    expect(authCtx).toContain("const profilesQuery = trpc.supabaseCore.profiles.useQuery(undefined,");
    expect(authCtx).toContain("const roles = roleFromRoles(bootstrappedProfiles?.roles);");
    // No role is ever persisted client-side.
    expect(authCtx).not.toMatch(/localStorage\.setItem\([^)]*role/i);
  });

  it("sends an unfinished account to onboarding for the role it actually holds", () => {
    expect(identity).toContain('return shape("ok", done ? `/dashboard/${holds}` : `/onboarding/${holds}`);');
    expect(identity).toContain('.from("profiles").select("onboarding_completed").eq("id", identity.id).maybeSingle();');
  });

  it("shows a stated notice rather than a dashboard when no role is held", () => {
    expect(app).toContain("if (currentSession && !currentSession.role) return <RoleNotice userId={currentSession.userId} />;");
    const notice = codeOf("../client/src/components/RoleNotice.tsx");
    expect(notice).toContain('t("auth.roleNotAssignedTitle")');
  });
});

describe("(15, 16) nothing leaks, and nothing returns HTML", () => {
  it("logs no address and no metadata value", () => {
    for (const line of identity.match(/console\.error\([^;]*\)/g) ?? []) {
      expect(line).not.toMatch(/email|ADMIN_EMAIL|connectionString|process\.env/);
    }
  });

  it("answers with codes, never with a server-authored sentence", () => {
    // The exact wording lives in the catalogue; the server returns a decision.
    const eligibility = identity.slice(identity.indexOf("export async function checkSignupEligibility"));
    expect(eligibility).not.toMatch(/error: "This email/);
    expect(eligibility).toContain("const answer = (decision: RoleDecision) =>");
  });

  it("keeps every auth response inside the JSON envelope", () => {
    // The shared guard rejects a non-JSON response before it can be parsed.
    const apiResponse = codeOf("../client/src/lib/api-response.ts");
    expect(apiResponse).toContain("export class NonJsonApiResponseError");
    expect(raw("../client/src/main.tsx")).toContain("assertJsonResponse");
  });
});

describe("the admin desk reports roles instead of guessing them", () => {
  it("returns the real rows with no fallback", () => {
    // Every role the account holds is read, and nothing stands in for a missing
    // one. The row now also carries the resolved role, because leaving the
    // browser to pick one from the array is how it could disagree with the
    // counts.
    expect(adminUsersServer).toContain('const { data, error } = await admin.from("user_roles").select("user_id,role").in("user_id", ids);');
    expect(adminUsersServer).toContain("effectiveRole: String(row.effective_role) as AccountRoleKey,");
    // No literal "learner" is ever substituted for a missing role.
    expect(adminUsersServer).not.toMatch(/\?\?\s*\["learner"\]|\|\|\s*"learner"/);
  });

  it("labels a missing role as missing, never as Learner", () => {
    // The label comes from the account's effective role, and the bucket for "no
    // role at all" maps to the missing-role string rather than to a guess.
    expect(adminUsersClient).toContain('unassigned: "adminUsers.roleNotAssigned"');
    expect(adminUsersClient).toContain("label={t(ROLE_LABEL[effectiveRole])}");
    expect(adminUsersClient).not.toMatch(/roles\.length === 0.*learner/i);
  });

  it("can filter for the accounts that have no role at all", () => {
    // The filter is resolved by the database through the effective-role view
    // instead of an id list, so it can no longer be silently truncated.
    expect(adminUsersServer).toContain('.eq("effective_role", FILTER_BUCKET[input.role])');
    expect(adminUsersServer).toContain('unassigned: "unassigned",');
    expect(adminUsersClient).toContain('"unassigned"] as const;');
  });

  it("keeps the signup-role trigger the work of exactly one migration", () => {
    const migrations = readdirSync(new URL("../supabase/migrations/", import.meta.url));
    expect(migrations).toContain("0023_signup_role_is_the_requested_one.sql");
    // This used to assert that no second role-related migration existed at all.
    // That is no longer the right invariant: 0026 adds a read-only view for
    // counting accounts by role, which is a different concern and deliberately
    // additive. What must stay true is that only ONE migration decides the role
    // a signup receives, so a later file cannot quietly reintroduce a default.
    // Statements only — `--` commentary is stripped first, so a migration that
    // merely explains the trigger is not mistaken for one that redefines it.
    const statementsOf = (file: string) =>
      readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8").replace(/^\s*--.*$/gm, "");
    const touchTrigger = migrations.filter((file) => /function public\.handle_new_auth_user/.test(statementsOf(file)));
    expect(touchTrigger).toEqual(["0002_auth_and_rls.sql", "0023_signup_role_is_the_requested_one.sql"]);
    // And that the counting migration writes no role data of its own.
    const counting = readFileSync(new URL("../supabase/migrations/0026_role_totals_are_per_account.sql", import.meta.url), "utf8");
    expect(counting).not.toMatch(/\binsert into\b|\bupdate public\.user_roles\b|\bdelete from\b/i);
  });
});
