/**
 * Role counting: one account, one role, no overlap.
 *
 * The defect these cover is specific. The admin overview counted rows in
 * `user_roles`, which is a many-to-one table, so an account holding both `admin`
 * and `learner` — as every account created before migration 0023 does, because
 * the old signup trigger inserted `learner` unconditionally — was counted in
 * both totals. The administrator was reported as a learner and the figures
 * overlapped.
 *
 * Most of what follows exercises the real ladder rather than reading source
 * text. The few source assertions that remain guard things behaviour cannot
 * reach: that the SQL ladder and the TypeScript ladder are the same list, that
 * the fix was not a subtraction, and that no address was hardcoded to make a
 * particular account disappear.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_ROLE_KEYS, PRIVILEGED_ROLES, ROLE_PRECEDENCE,
  effectiveRoleOf, sortRolesByPrecedence, topRoleOf,
} from "@shared/account-roles";

const raw = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = raw("../supabase/migrations/0026_role_totals_are_per_account.sql");
const canonical = raw("../supabase/migrations/0001_noor_ilm_lms_canonical.sql");
const overview = raw("./admin-overview.ts");
const users = raw("./admin-users.ts");
const usersPage = raw("../client/src/components/AdminUsersExperience.tsx");
const overviewPage = raw("../client/src/components/AdminOverviewExperience.tsx");

/** Source with its leading documentation block removed, so no assertion is satisfied by prose. */
const withoutComments = (text: string) => {
  const firstImport = text.indexOf("\nimport ");
  return (firstImport === -1 ? text : text.slice(firstImport)).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
};

describe("an account is counted as the highest role it holds", () => {
  it("counts the live administrator as an administrator, not a learner", () => {
    // This is the exact role set the live admin account holds.
    expect(effectiveRoleOf(["admin", "learner"])).toBe("admins");
    expect(effectiveRoleOf(["learner", "admin"])).toBe("admins");
  });

  it("keeps super_admin out of the learner and instructor totals", () => {
    expect(effectiveRoleOf(["super_admin", "learner", "instructor"])).toBe("admins");
    expect(effectiveRoleOf(["super_admin"])).toBe("admins");
  });

  it("counts a genuine learner as a learner and a genuine instructor as an instructor", () => {
    expect(effectiveRoleOf(["learner"])).toBe("learners");
    expect(effectiveRoleOf(["instructor"])).toBe("instructors");
  });

  it("prefers instructor over a leftover learner row", () => {
    expect(effectiveRoleOf(["instructor", "learner"])).toBe("instructors");
  });

  it("never reports a missing or unrecognised role as a learner", () => {
    expect(effectiveRoleOf([])).toBe("unassigned");
    expect(effectiveRoleOf(["not_a_real_role"])).toBe("unassigned");
    expect(topRoleOf([])).toBeNull();
  });

  it("puts every combination in exactly one bucket", () => {
    // Every subset of the role vocabulary lands in one bucket and one only,
    // which is what makes the totals mutually exclusive rather than overlapping.
    const roles = [...ROLE_PRECEDENCE];
    for (let mask = 0; mask < 1 << roles.length; mask += 1) {
      const held = roles.filter((_, index) => mask & (1 << index));
      const bucket = effectiveRoleOf(held);
      expect(ACCOUNT_ROLE_KEYS).toContain(bucket);
      const matches = ACCOUNT_ROLE_KEYS.filter((key) => key === bucket);
      expect(matches).toHaveLength(1);
      if (held.some((role) => role === "admin" || role === "super_admin")) expect(bucket).toBe("admins");
      if (bucket === "learners") expect(held).toEqual(["learner"]);
    }
  });

  it("orders roles so the account's real identity leads", () => {
    expect(sortRolesByPrecedence(["learner", "admin"])[0]).toBe("admin");
    expect(sortRolesByPrecedence(["learner", "finance", "super_admin"])).toEqual(["super_admin", "finance", "learner"]);
    // An unrecognised role is kept and shown, never silently dropped.
    expect(sortRolesByPrecedence(["learner", "mystery"])).toEqual(["learner", "mystery"]);
  });

  it("treats operator roles, and only operator roles, as privileged", () => {
    expect([...PRIVILEGED_ROLES].sort()).toEqual(["admin", "advisory_board", "finance", "moderator", "super_admin"]);
    expect(PRIVILEGED_ROLES).not.toContain("learner");
    expect(PRIVILEGED_ROLES).not.toContain("instructor");
  });
});

describe("the database and the application share one ladder", () => {
  it("covers every role the schema actually permits", () => {
    // A role added to the check constraint but not to the ladder would silently
    // fall into "unassigned", so the two lists are held equal.
    const constraint = canonical.match(/role text not null check \(role in \(([^)]*)\)\)/);
    expect(constraint).not.toBeNull();
    const permitted = Array.from(constraint![1].matchAll(/'([a-z_]+)'/g)).map((match) => match[1]);
    expect(permitted.length).toBeGreaterThan(0);
    expect([...permitted].sort()).toEqual([...ROLE_PRECEDENCE].sort());
  });

  it("orders roles in the view exactly as the application orders them", () => {
    const ladder = migration.match(/array\[([^\]]*)\]::text\[\]/);
    expect(ladder).not.toBeNull();
    const sqlOrder = Array.from(ladder![1].matchAll(/'([a-z_]+)'/g)).map((match) => match[1]);
    expect(sqlOrder).toEqual([...ROLE_PRECEDENCE]);
  });

  it("runs the view as the caller, so no row policy is bypassed", () => {
    expect(migration).toMatch(/security_invoker\s*=\s*on/);
    expect(migration).toMatch(/revoke all on public\.account_effective_role from public, anon, authenticated, service_role;/);
    expect(migration).toMatch(/grant select on public\.account_effective_role to service_role;/);
    // Read-only and additive: it must not touch role records or policies.
    for (const forbidden of [/\bdelete from\b/i, /\bupdate public\.user_roles\b/i, /\binsert into\b/i, /\bdrop policy\b/i, /\bcreate policy\b/i]) {
      expect(migration).not.toMatch(forbidden);
    }
  });
});

describe("the overview counts accounts, not role rows", () => {
  const code = withoutComments(overview);

  it("no longer counts rows in user_roles", () => {
    expect(code).not.toMatch(/count\("user_roles"/);
  });

  it("reads every role figure from the mutually exclusive view", () => {
    expect(code).toMatch(/count\("account_effective_role", \(q\) => q\.eq\("effective_role", key\)\)/);
  });

  it("reports administrators as a figure of their own", () => {
    expect(code).toMatch(/"admins",/);
    expect(code).toMatch(/admins: accountsByRole\.admins/);
  });

  it("does not subtract, offset or exclude an account by identity", () => {
    // The brief ruled out both workarounds explicitly.
    expect(code).not.toMatch(/ - 1\b/);
    expect(code).not.toMatch(/ADMIN_EMAIL|adminEmail/);
    expect(code).not.toMatch(/identity\.id/);
  });
});

describe("user management shows the real role", () => {
  const code = withoutComments(users);

  it("filters and orders through the effective role, not a role row", () => {
    expect(code).toMatch(/\.from\("account_effective_role"\)/);
    expect(code).toMatch(/\.eq\("effective_role", FILTER_BUCKET\[input\.role\]\)/);
    expect(code).toMatch(/\.order\("role_rank", \{ ascending: true \}\)/);
  });

  it("no longer truncates the role filter to an arbitrary page", () => {
    expect(code).not.toMatch(/\.limit\(1000\)/);
    expect(code).not.toMatch(/\.limit\(2000\)/);
  });

  it("sends the resolved role to the browser rather than letting it guess", () => {
    expect(code).toMatch(/effectiveRole: String\(row\.effective_role\) as AccountRoleKey/);
    expect(code).toMatch(/effectiveRole: effectiveRoleOf\(heldRoles\)/);
  });

  it("still refuses to write a role anywhere", () => {
    for (const write of [/from\("user_roles"\)\s*\.insert/, /from\("user_roles"\)\s*\.update/, /from\("user_roles"\)\s*\.delete/, /from\("user_roles"\)\s*\.upsert/]) {
      expect(code).not.toMatch(write);
    }
  });
});

describe("the screens name roles honestly", () => {
  it("labels an account by its effective role and never falls back to Learner", () => {
    const code = withoutComments(usersPage);
    expect(code).toMatch(/label=\{t\(ROLE_LABEL\[effectiveRole\]\)\}/);
    expect(code).toMatch(/unassigned: "adminUsers\.roleNotAssigned"/);
    expect(code).not.toMatch(/"Learner"|'Learner'/);
    expect(code).not.toMatch(/roles\[0\] \?\? "learner"/);
  });

  it("still shows a role the ladder does not recognise, beside the missing-role badge", () => {
    // Otherwise an account holding only an unknown role would read "Role not
    // assigned" with the one piece of evidence about it dropped from the screen.
    const code = withoutComments(usersPage);
    expect(code).toMatch(/const named = roles\.length > 0 && effectiveRole !== "unassigned" \? roles\[0\] : null;/);
    // A privileged account now shows no public role at all — the board account
    // must never read as a Learner. Every other account still shows whatever it
    // holds, including a role the ladder does not recognise.
    expect(code).toMatch(/: roles\.filter\(\(role\) => role !== named\)/);
    expect(code).toMatch(/!PUBLIC_ROLE_NAMES\.includes\(role\)/);
    expect(effectiveRoleOf(["mystery"])).toBe("unassigned");
    expect(sortRolesByPrecedence(["mystery"])).toEqual(["mystery"]);
  });

  it("shows the breakdown that proves the totals add up", () => {
    const code = withoutComments(overviewPage);
    expect(code).toMatch(/AccountRoleBreakdown/);
    expect(code).toMatch(/rolesMismatch/);
    expect(code).toMatch(/admins:\s*\{ nav: "users" \}/);
  });

  it("hardcodes no administrator address anywhere on the client", () => {
    for (const source of [usersPage, overviewPage]) {
      expect(source).not.toMatch(/@gmail\.com|@[a-z0-9-]+\.(com|net|org)/i);
      expect(source).not.toMatch(/ADMIN_EMAIL/);
    }
  });
});
