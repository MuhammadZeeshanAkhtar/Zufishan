/**
 * Instructor Dashboard → Find Students.
 *
 * What was actually missing was the ROUTE. The procedure, the RLS policy and the
 * list component all existed and were correct; nothing pointed at them, so the
 * "Find Students" links went to the requirements desk instead — deliberately, to
 * avoid a dead link. These cover the shell that was added and, more importantly,
 * pin the boundaries that must not have moved while adding it.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { describeHumanVerification, verifyHumanToken } from "./human-verification";
import { learnerProfileIsComplete, statusAfterSave, REQUIRED_PROFILE_FIELDS } from "@shared/learner-publication";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const withoutComments = (text: string) => {
  const firstImport = text.indexOf("\nimport ");
  return (firstImport === -1 ? text : text.slice(firstImport))
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
};

const discovery = read("./learner-discovery.ts");
const routers = read("./routers.ts");
const app = read("./../client/src/App.tsx");
const page = read("../client/src/components/FindStudentsPage.tsx");
const list = read("../client/src/components/DiscoverableLearners.tsx");
const gate = read("../client/src/components/HumanVerificationGate.tsx");
const chrome = read("../client/src/components/DashboardChrome.tsx");
const quickLinks = read("../client/src/components/DashboardQuickLinks.tsx");
const policy = read("../supabase/migrations/0025_discoverable_learners_readable_by_instructors.sql");

describe("the desk exists and only an instructor reaches it", () => {
  it("has a route of its own, behind the instructor guard", () => {
    expect(app).toContain('<Route path="/dashboard/instructor/students">{() => <ProtectedRoute role="instructor"><FindStudentsPage/></ProtectedRoute>}</Route>');
  });

  it("is what Find Students now links to, from both the strip and the desk", () => {
    expect(quickLinks).toContain('{ label: "Find Students", href: "/dashboard/instructor/students", icon: UserSearch },');
    expect(chrome).toContain('"find-students": `/dashboard/${role}/students`');
    // Both "Find Students" calls to action on the tutor desk now reach the desk
    // itself. The separate "Open requirements" link is a different destination
    // and is deliberately left pointing at the requirements page.
    const desk = read("../client/src/components/InstructorDashboard.tsx");
    expect(desk.split('href="/dashboard/instructor/students"').length - 1).toBe(2);
    expect(desk).toContain('{t("tutorDesk.findStudents")}');
    /*
     * The "Open requirements" link is gone, and its absence is the point rather than a regression.
     * It sat inside the Received invites tab back when that tab had nothing in it but a count, and
     * pointed somewhere else for want of anything to show. The tab now holds the invites
     * themselves; Requirements keeps its own entry in the rail, which is where a module belongs.
     */
    expect(desk).not.toContain('t("tutorDesk.openRequirements")');
  });

  it("refuses a caller who does not hold the instructor role, on the server", () => {
    expect(discovery).toContain('if (!roles.roles.includes("instructor")) return forbidden();');
    // Admins have their own desk; this one is not theirs either.
    expect(withoutComments(discovery)).not.toMatch(/isAdmin|includes\("admin"\)/);
  });

  it("reads through the caller's own client, so RLS is the real gate", () => {
    expect(discovery).toContain("const db = getSupabaseUserClient(identity.accessToken);");
    // The service role appears only for display names, never for the row filter.
    const listFn = discovery.slice(discovery.indexOf("export async function listDiscoverableLearners"), discovery.indexOf("type LearnerPerson"));
    expect(listFn).not.toContain("getSupabaseAdminClient()");
  });

  it("keeps the policy that admits published learner rows and nothing else", () => {
    expect(policy).toContain("profile_status = 'published' and public.is_user_role('instructor')");
    expect(policy).toContain("for select");
  });
});

describe("only complete, published, active profiles appear", () => {
  it("asks the database for published rows only", () => {
    expect(discovery).toContain('.eq("profile_status", "published")');
  });

  it("hides a suspended or deleted account even when the row says published", () => {
    expect(discovery).toContain('const active = String(row.account_status ?? "") === "active";');
    expect(discovery).toContain('const isPublic = String(row.profile_visibility ?? "") === "public" && active;');
  });

  it("filters on the server, never by fetching everyone and hiding rows in the browser", () => {
    const code = withoutComments(list);
    // Every filter travels as a query input. The set is the five the desk offers
    // plus the search box; `level` was dropped when the sidebar was specified.
    expect(code).toMatch(/subjects: subject \? \[subject\] : undefined/);
    expect(code).toMatch(/language: language \|\| undefined/);
    expect(code).toMatch(/country: country \|\| undefined/);
    expect(code).toMatch(/timezone: timezone \|\| undefined/);
    expect(code).toMatch(/gender: \(gender \|\| undefined\)/);
    expect(code).toMatch(/query: debounced \|\| undefined/);
    // And nothing re-filters the returned rows by status in the browser.
    expect(code).not.toMatch(/profile_status|\.filter\(\(l\w*\) =>/);
  });

  it("reuses the existing status field rather than inventing a second one", () => {
    // All three values already existed on learner_profiles, so auto-publishing
    // and an explicit hide both fit the column as designed — no migration adds a
    // status, and no parallel flag was introduced.
    expect(discovery).toContain('const status = input.discoverable ? "published" : "paused";');
    const canonical = read("../supabase/migrations/0001_noor_ilm_lms_canonical.sql");
    expect(canonical).toContain("profile_status text not null default 'draft' check (profile_status in ('draft','published','paused'))");
    const backfill = read("../supabase/migrations/0028_complete_learner_profiles_are_published.sql");
    expect(backfill).not.toMatch(/alter table|add column|create table/i);
  });

  it("needs no administrator anywhere in the publication path", () => {
    const own = discovery.slice(discovery.indexOf("export async function setOwnDiscoverability"));
    expect(own).not.toMatch(/admin|approv|moderat/i);
  });
});

describe("a completed learner profile publishes itself, with no administrator", () => {
  const complete = {
    profile: { full_name: "A", display_name: "B", country: "PK", timezone: "Asia/Karachi", preferred_language: "English" },
    learnerProfile: { learning_level: "Beginner", learning_subjects: ["Tajweed"] },
  };

  it("counts a profile complete on the REQUIRED fields, not the recommended ones", () => {
    expect(learnerProfileIsComplete(complete)).toBe(true);
    // The completion banner also wants an avatar, a biography and a gender.
    // Those are encouragement; a learner without them still gets found.
    expect(learnerProfileIsComplete({
      profile: { ...complete.profile, avatar_url: null, bio: null, gender: null },
      learnerProfile: complete.learnerProfile,
    })).toBe(true);
  });

  it("does not publish a profile that is still missing a required field", () => {
    for (const field of [...REQUIRED_PROFILE_FIELDS]) {
      expect(learnerProfileIsComplete({
        profile: { ...complete.profile, [field]: "" },
        learnerProfile: complete.learnerProfile,
      }), `${field} is required`).toBe(false);
    }
    expect(learnerProfileIsComplete({ profile: complete.profile, learnerProfile: { learning_level: "Beginner", learning_subjects: [] } })).toBe(false);
    expect(learnerProfileIsComplete({ profile: complete.profile, learnerProfile: { learning_level: "", learning_subjects: ["Tajweed"] } })).toBe(false);
  });

  it("promotes a complete draft to published on save", () => {
    expect(statusAfterSave("draft", complete)).toBe("published");
    expect(statusAfterSave(null, complete)).toBe("published");
    expect(statusAfterSave(undefined, complete)).toBe("published");
  });

  it("leaves an incomplete draft alone", () => {
    expect(statusAfterSave("draft", { profile: {}, learnerProfile: {} })).toBeNull();
  });

  it("never re-publishes a learner who explicitly hid themselves", () => {
    // The whole reason `paused` is distinct from `draft`: an edit is not a
    // request to undo a hide.
    expect(statusAfterSave("paused", complete)).toBeNull();
  });

  it("writes nothing when the profile is already published", () => {
    expect(statusAfterSave("published", complete)).toBeNull();
  });

  it("hides with paused, so a later save cannot silently undo it", () => {
    expect(discovery).toContain('const status = input.discoverable ? "published" : "paused";');
  });

  it("publishes from the save path itself, guarded on the status it read", () => {
    const core = read("./supabase-core.ts");
    const fn = core.slice(core.indexOf("export async function updateOwnLearnerProfile"), core.indexOf("export async function updateOwnLocale"));
    expect(fn).toContain("const next = statusAfterSave(current, {");
    expect(fn).toContain('.eq("profile_status", current ?? "draft")');
    // Completeness is judged on the merged row, not the incoming patch.
    expect(fn).toContain('db.from("profiles").select("full_name,display_name,country,timezone,preferred_language")');
  });

  it("asks for no verification status anywhere in the learner path", () => {
    const core = read("./supabase-core.ts");
    const fn = core.slice(core.indexOf("export async function updateOwnLearnerProfile"), core.indexOf("export async function updateOwnLocale"));
    for (const source of [fn, discovery, read("../shared/learner-publication.ts")]) {
      expect(source).not.toMatch(/verification_status|verified|approved/);
    }
  });

  it("backfills only complete, active, learner-only drafts", () => {
    const migration = read("../supabase/migrations/0028_complete_learner_profiles_are_published.sql");
    const statements = migration.replace(/^\s*--.*$/gm, "");
    expect(statements).toContain("set profile_status = 'published'");
    expect(statements).toContain("and lp.profile_status = 'draft'");
    expect(statements).toContain("and p.account_status = 'active'");
    expect(statements).toContain("and r.role = 'learner'");
    expect(statements).toMatch(/not exists[\s\S]*'instructor', 'moderator', 'finance', 'advisory_board', 'admin', 'super_admin'/);
    // It must never reach a paused row, and never mention verification.
    expect(statements).not.toContain("'paused'");
    expect(statements).not.toMatch(/verification|verified|approved/);
  });
});

describe("the card opens a full profile, as a teacher card does", () => {
  const detail = read("../client/src/components/LearnerProfilePage.tsx");

  it("gives every card a way into that learner's full profile", () => {
    // The learner's NAME is the link. The card is specified to carry exactly one
    // action button — Message — so a second button would have been one too many,
    // but the detail route must not become unreachable either.
    expect(list).toContain("href={`/dashboard/instructor/students/${learner.learnerId}`}");
    expect(list).toMatch(/<h3[^>]*>\s*<Link/);
  });

  it("routes the detail view behind the same instructor guard", () => {
    expect(app).toContain('<Route path="/dashboard/instructor/students/:learnerId">{(params) => <ProtectedRoute role="instructor"><LearnerProfilePage learnerId={params.learnerId}/></ProtectedRoute>}</Route>');
  });

  it("repeats every boundary on the detail read, because a URL can be typed", () => {
    const fn = discovery.slice(discovery.indexOf("export async function getDiscoverableLearner"));
    expect(fn).toContain('if (!roles.roles.includes("instructor")) return forbidden();');
    expect(fn).toContain("const human = await verifyHumanToken(input.humanToken);");
    expect(fn).toContain("const db = getSupabaseUserClient(identity.accessToken);");
    expect(fn).toContain('.eq("profile_status", "published")');
    // Missing and unpublished give the same answer, so neither confirms an account.
    expect(fn).toContain('if (!data) return { ok: false, error: "That learner profile is not available.", code: "NOT_FOUND" };');
  });

  it("wraps the detail page in the same human check as the list", () => {
    expect(detail).toContain("<HumanVerificationGate>");
    expect(detail).toContain("<Profile learnerId={learnerId} humanToken={token} />");
  });

  it("shows the full profile the brief asks for", () => {
    for (const field of ["bio", "goal", "tutorPreference", "subjects", "level", "preferredLanguage", "supportedLanguages", "timezone", "availability", "preferredClassFormat"]) {
      expect(detail, `${field} should be rendered`).toContain(`learner.${field}`);
    }
  });

  it("offers only actions that already exist, with their existing refusal", () => {
    // MessageAction carries the relationship rule; this page does not widen it.
    expect(detail).toContain("<MessageAction");
    // The page must not reimplement the rule. Checked against the code — the
    // comments legitimately explain that `startConversation` re-checks on the
    // server whatever this screen decided to draw.
    expect(withoutComments(detail)).not.toMatch(/startConversation|relationshipExists/);
    const start = read("./conversation-start.ts");
    expect(start).toContain("if (!(await relationshipExists(admin, me, other)))");
  });

  it("renders loading, error, retry and unavailable states", () => {
    expect(detail).toContain("<ResultState");
    expect(detail).toContain("onRetry={() => query.refetch()}");
    expect(detail).toContain('t("findStudents.notAvailable")');
  });

  it("draws an avatar rather than fetching one for a private person", () => {
    expect(detail).toContain("function initialsOf(");
    expect(detail).toContain("const avatar = learner.profilePublic ? displayableImageSrc(learner.avatarUrl) : null;");
  });
});

describe("private data never leaves the server", () => {
  const listFn = discovery.slice(discovery.indexOf("const learners: DiscoverableLearner[]"), discovery.indexOf("const language = filters.language"));

  it("returns only the safe presentation fields", () => {
    const returned = Array.from(listFn.matchAll(/^\s{6}(\w+):/gm)).map((m) => m[1]).sort();
    expect(returned).toEqual([
      "availability", "avatarUrl", "bio", "country", "displayName", "gender", "goal",
      "learnerId", "level", "preferredClassFormat", "preferredLanguage", "profilePublic",
      "subjects", "supportedLanguages", "timezone", "tutorPreference",
    ]);
  });

  it("returns the same fields from the detail read as from the card", () => {
    const detailFn = discovery.slice(discovery.indexOf("export async function getDiscoverableLearner"));
    const shape = detailFn.slice(detailFn.indexOf("data: {"));
    const returned = Array.from(shape.matchAll(/^\s{6}(\w+):/gm)).map((m) => m[1]).sort();
    const cardFields = Array.from(listFn.matchAll(/^\s{6}(\w+):/gm)).map((m) => m[1]).sort();
    expect(returned).toEqual(cardFields);
  });

  it("never reads or returns the learner's budget", () => {
    // Their financial position is not needed to judge whether you can teach them.
    expect(discovery).not.toContain("budget_range,");
    expect(discovery).not.toMatch(/budgetRange/);
  });

  it("only shows person data when the person is public", () => {
    // bio and supported languages live on `profiles`, so they follow
    // profile_visibility like the name and the avatar do.
    const blank = discovery.slice(discovery.indexOf("const blankPerson"), discovery.indexOf("/**", discovery.indexOf("const blankPerson")));
    expect(blank).toContain("bio: null");
    expect(blank).toContain("supportedLanguages: []");
  });

  it("never returns an address, a role record, a budget or a moderation field", () => {
    for (const forbidden of [/email/i, /password/i, /\brole\b/, /budget/i, /account_status:/, /profile_visibility:/, /note/i]) {
      expect(listFn).not.toMatch(forbidden);
    }
  });

  it("searches only what the learner published about their learning", () => {
    expect(discovery).toContain("learning_goal.ilike");
    expect(discovery).toContain("preferred_class_format.ilike");
    // Never against a name or any column the learner did not publish.
    expect(discovery).not.toContain("display_name.ilike");
  });
});

describe("human verification is real or absent, never pretended", () => {
  it("reports which variables an operator must set when nothing is configured", () => {
    const config = describeHumanVerification({} as NodeJS.ProcessEnv);
    expect(config.configured).toBe(false);
    if (!config.configured) {
      expect(config.requiredEnv).toEqual(["CAPTCHA_PROVIDER", "CAPTCHA_SITE_KEY", "CAPTCHA_SECRET_KEY"]);
    }
  });

  it("does not report an absent provider as a pass", async () => {
    const result = await verifyHumanToken("anything", {} as NodeJS.ProcessEnv);
    expect(result.outcome).toBe("not_configured");
    expect(result.outcome).not.toBe("passed");
  });

  it("refuses a missing token once a provider IS configured", async () => {
    const env = { CAPTCHA_PROVIDER: "turnstile", CAPTCHA_SITE_KEY: "site", CAPTCHA_SECRET_KEY: "secret" } as unknown as NodeJS.ProcessEnv;
    expect(describeHumanVerification(env).configured).toBe(true);
    const result = await verifyHumanToken("   ", env);
    expect(result).toEqual({ outcome: "failed", reason: "missing_token" });
  });

  it("only ever publishes the site key, never the secret", () => {
    const env = { CAPTCHA_PROVIDER: "hcaptcha", CAPTCHA_SITE_KEY: "public-site-key", CAPTCHA_SECRET_KEY: "SECRET-VALUE" } as unknown as NodeJS.ProcessEnv;
    expect(JSON.stringify(describeHumanVerification(env))).not.toContain("SECRET-VALUE");
    expect(JSON.stringify(describeHumanVerification(env))).toContain("public-site-key");
    // And the procedure that serves it returns the description, nothing more.
    expect(routers).toContain("humanVerification: supabaseOnlyProcedure.query(() => ({ ok: true as const, data: describeHumanVerification() }))");
  });

  it("blocks the desk when the check fails, and offers a retry", () => {
    expect(discovery).toContain('if (human.outcome === "failed") {');
    expect(discovery).toContain('code: "FORBIDDEN",');
    const code = withoutComments(gate);
    expect(code).toMatch(/"expired-callback"/);
    expect(code).toMatch(/"error-callback"/);
    expect(code).toMatch(/onClick=\{reset\}/);
  });

  it("does not fake a pass with a browser-side boolean", () => {
    const code = withoutComments(gate);
    expect(code).not.toMatch(/setVerified\(true\)|verified = true|bypass/i);
    // The only thing that opens the gate is a token the provider issued.
    expect(code).toMatch(/callback: \(issued: string\) =>/);
    expect(code).toMatch(/if \(!token\)/);
  });

  it("checks the token on the server, with a secret the browser never sees", () => {
    expect(discovery).toContain("const human = await verifyHumanToken(filters.humanToken);");
    const gateCode = withoutComments(gate);
    expect(gateCode).not.toMatch(/CAPTCHA_SECRET_KEY|siteverify/);
  });
});

describe("Find Quran Teacher is untouched", () => {
  it("keeps its own routes, page and card exactly as they were", () => {
    expect(app).toContain('<Route path="/teachers" component={() => <TeachersPage/>}/>');
    expect(app).toContain('<Route path="/dashboard/learner/teachers">');
    expect(chrome).toContain('"find-quran-teacher": `/dashboard/${role}/teachers`');
    expect(quickLinks).toContain('{ label: "Find Quran Teacher", href: "/dashboard/learner/teachers"');
  });

  it("does not import the learner desk into the instructor card, or the reverse", () => {
    const instructorCard = read("../client/src/components/InstructorCard.tsx");
    expect(instructorCard).not.toContain("DiscoverableLearners");
    expect(instructorCard).not.toContain("HumanVerificationGate");
    expect(list).not.toContain("InstructorCard");
  });

  it("reuses the card STRUCTURE without importing or altering the instructor card", () => {
    // Same building blocks — a Chip row and a divided Fact strip — rebuilt for
    // learner data rather than the instructor card being made generic.
    //
    // The instructor side now keeps those blocks in InstructorPresentation, shared
    // between its card and its public profile. That sharing is within the teacher
    // surface only: the learner desk still has its own, which is what this guards.
    // The learner desk keeps its own blocks — a Chip row and a Detail line — while
            // the instructor side keeps Chip and Fact in InstructorPresentation. Neither
            // imports the other, which is what this guards.
    expect(list).toMatch(/function Chip\(/);
    expect(list).toMatch(/function Detail\(/);
    expect(list).not.toContain("InstructorPresentation");
    const instructor = read("../client/src/components/InstructorPresentation.tsx");
    expect(instructor).toMatch(/function Chip\(/);
    expect(instructor).toMatch(/function Fact\(/);
  });
});

describe("the page adds a shell and nothing else", () => {
  it("renders the existing list through the gate", () => {
    expect(page).toContain("<HumanVerificationGate>");
    expect(page).toContain("<DiscoverableLearners humanToken={token} />");
  });

  it("creates no second learner-profile table and no parallel status system", () => {
    expect(page).not.toMatch(/create table|profile_status/);
    expect(gate).not.toMatch(/create table|profile_status/);
  });

  it("names no Vendor role", () => {
    for (const source of [page, gate, list, discovery]) {
      expect(withoutComments(source).toLowerCase()).not.toContain("vendor");
    }
  });
});

describe("the gate opens quietly when no provider is configured", () => {
  /*
   * The banner that used to sit here named `TURNSTILE_SECRET_KEY` and friends to a teacher who
   * cannot set them, above a list that works. It is gone. What must NOT change with it is the
   * part that actually protects anything, so both halves are pinned together.
   */
  it("renders the desk without a setup notice", () => {
    expect(gate).toContain("if (!config || !config.configured) return <>{children(undefined)}</>;");
    expect(gate).not.toContain('t("findStudents.verifyNotConfigured")');
  });

  it("still invents no token", () => {
    // `undefined` is what the children receive; a string here would be a forged pass.
    expect(gate).not.toMatch(/children\((["'`])[^"'`]+\)/);
    expect(gate).not.toMatch(/humanToken\s*=\s*["'`][^"'`]+["'`]/);
  });

  it("still closes the desk once a provider IS configured", () => {
    // The unverified branch is untouched: no token, no children.
    expect(gate).toContain("if (!token) {");
    expect(gate).toContain("setToken(");
  });

  it("leaves the server check exactly where it was", async () => {
    // Configured and tokenless is still a refusal, decided on the server.
    const env = { CAPTCHA_PROVIDER: "turnstile", CAPTCHA_SITE_KEY: "site", CAPTCHA_SECRET_KEY: "secret" } as unknown as NodeJS.ProcessEnv;
    expect(describeHumanVerification(env).configured).toBe(true);
    expect(await verifyHumanToken("   ", env)).toEqual({ outcome: "failed", reason: "missing_token" });
  });
});
