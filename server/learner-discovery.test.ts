import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Source with the leading documentation block removed, so no assertion is satisfied by prose. */
const codeOf = (path: string) => {
  const text = readFileSync(new URL(path, import.meta.url), "utf8");
  const firstImport = text.indexOf("\nimport ");
  return firstImport === -1 ? text : text.slice(firstImport);
};
const raw = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

/** Every comment removed, so an assertion can only be satisfied by real code. */
const withoutComments = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, "").replace(/--.*$/, ""))
    .join("\n");

const server = codeOf("./learner-discovery.ts");
const migration = raw("../supabase/migrations/0025_discoverable_learners_readable_by_instructors.sql");
const rls = raw("../supabase/migrations/0002_auth_and_rls.sql");
const requirementsPolicy = raw("../supabase/migrations/0020_published_requirements_readable_by_instructors.sql");
const routers = raw("./routers.ts");
const card = codeOf("../client/src/components/DiscoverableLearners.tsx");
const control = codeOf("../client/src/components/DiscoverabilitySwitch.tsx");
const desk = raw("../client/src/components/RequirementsExperience.tsx");
const editor = raw("../client/src/components/LearnerProfileEditor.tsx");
const catalog = raw("../client/src/i18n/catalog.ts");
const userClient = codeOf("./supabase-user-client.ts");

describe("a learner is discoverable only by their own choice", () => {
  it("gates on profile_status alone — no approval, no moderator, no admin", () => {
    expect(migration).toContain("using (profile_status = 'published' and public.is_user_role('instructor'))");
    // The instructor rule needs an approval; the learner rule deliberately does not.
    expect(migration).not.toMatch(/verification_status|is_admin_user|is_moderator_user|approved/);
  });

  it("is the same shape as the published-requirements rule that already worked", () => {
    expect(requirementsPolicy).toContain("using (status = 'published' and public.is_user_role('instructor'))");
    expect(migration).toContain("for select");
  });

  it("adds no write policy, so an instructor cannot change a learner's visibility", () => {
    // Scoped to the statements: the comment legitimately quotes the existing
    // owner policy, which is `for all`.
    expect(withoutComments(migration)).not.toMatch(/for (insert|update|delete|all)/);
    // The owner policy that authorises the learner's own write is untouched.
    expect(rls).toContain("create policy learner_profiles_own on public.learner_profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);");
  });

  it("is invisible to anonymous visitors and to other learners", () => {
    // is_user_role('instructor') is false without a session and false for a learner.
    expect(migration).toContain("public.is_user_role('instructor')");
    expect(migration).not.toContain("is_user_role('learner')");
    expect(migration).not.toMatch(/using \(true\)|to anon/);
  });
});

describe("the server reads as the caller, so RLS is the real gate", () => {
  it("uses the caller's own client for the listing, never the service role", () => {
    const list = server.slice(server.indexOf("export async function listDiscoverableLearners"), server.indexOf("type LearnerPerson"));
    expect(list).toContain("getSupabaseUserClient(identity.accessToken)");
    expect(list).not.toContain("getSupabaseAdminClient");
  });

  it("re-checks the instructor role before it reads anything", () => {
    const list = server.slice(server.indexOf("export async function listDiscoverableLearners"));
    const gate = list.indexOf(`roles.roles.includes("instructor")`);
    const read = list.indexOf(`.from("learner_profiles")`);
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(read);
    // An administrator has their own desk; this surface is the instructor's.
    expect(list).not.toContain("isAdmin");
  });

  it("cannot be widened past published by a caller-supplied filter", () => {
    expect(server).toContain(`.eq("profile_status", "published")`);
    // No branch anywhere lets a status arrive from input.
    expect(server).not.toMatch(/filters\.status|input\.status|profile_status:\s*filters/);
  });

  it("uses the service role for presentation only, and respects the second consent", () => {
    const attach = server.slice(server.indexOf("async function attachLearnerPresentation"));
    expect(attach).toContain("getSupabaseAdminClient()");
    expect(attach).toContain(`String(row.account_status ?? "") === "active"`);
    expect(attach).toContain(`String(row.profile_visibility ?? "") === "public" && active`);
    // A learner who published their learning but not themselves stays unnamed.
    expect(attach).toContain("{ ...blankPerson,");
  });
});

describe("nothing private is read or shown", () => {
  it("selects no email, phone, credential or auth column", () => {
    // Checked against the column lists themselves. `accessToken` is the caller's
    // own session, not a column, so a blanket text search would flag it wrongly.
    const selected = Array.from(withoutComments(server).matchAll(/\.select\(\s*"([^"]+)"/g)).map((m) => m[1]).join(",");
    expect(selected.length).toBeGreaterThan(0);
    // Contact and credential columns are the ones that must never be read. Gender
    // is deliberately NOT among them any more: matching teacher and learner by
    // gender is an ordinary request in Quran study, instructors already publish
    // their own, and it is gated on profile_visibility like the name and avatar.
    for (const forbidden of ["email", "phone", "password", "token", "encrypted", "address"]) {
      expect(selected, `no column named ${forbidden} is read`).not.toContain(forbidden);
    }
    expect(selected, "gender is a published person field").toContain("gender");
  });

  it("gender is published only with the person, never on its own", () => {
    // The private branch returns blankPerson, whose gender is null — so a learner
    // who published their learning but not themselves shows no gender at all.
    expect(withoutComments(server)).toContain("gender: row.gender ? String(row.gender) : null,");
    expect(withoutComments(server)).toMatch(/blankPerson[^=]*=\s*\{[^}]*gender: null/s);
  });

  it("shows only the fields the card is specified to carry", () => {
    const code = withoutComments(card);
    for (const shown of ["learner.gender", "learner.country", "learner.subjects", "learner.timezone", "supportedLanguages"]) {
      expect(code, `${shown} belongs on the card`).toContain(shown);
    }
    // Everything the brief excluded stays excluded, so the card cannot quietly
    // regrow a biography, a goal, a rating or an online badge.
    // `online` is excluded as a rendered BADGE; the word also names the network
    // hook, so the check is for the badge shapes rather than the substring.
    expect(code).not.toMatch(/isOnline|onlineStatus\s*\?|["'](Online|Offline)["']/);
    for (const hidden of ["learner.bio", "learner.goal", "learner.availability", "learner.level", "rating", "lastActive"]) {
      expect(code, `${hidden} must not be rendered`).not.toContain(hidden);
    }
  });

  it("never renders a budget", () => {
    // budget_range is read but deliberately not surfaced on the card.
    expect(card).not.toMatch(/budget/i);
  });

  it("carries no internal identifier into the card beyond the id the flows need", () => {
    expect(card).not.toMatch(/learner_id|user_id|profile_status/);
  });
});

describe("the learner's own switch", () => {
  it("writes through the learner's own session, so only they can change it", () => {
    const set = server.slice(server.indexOf("export async function setOwnDiscoverability"));
    expect(set).toContain("getSupabaseUserClient(identity.accessToken)");
    expect(set).toContain(`.upsert({ user_id: identity.id, profile_status: status }, { onConflict: "user_id" })`);
    expect(set).not.toContain("getSupabaseAdminClient");
  });

  it("maps the switch to exactly two states", () => {
    // Off now writes `paused`, not `draft`. The two used to be the same value,
    // which made "deliberately hidden" indistinguishable from "never published" —
    // and once a completed save auto-publishes, that ambiguity would have let an
    // ordinary edit silently undo a learner's decision to hide.
    expect(server).toContain(`const status = input.discoverable ? "published" : "paused";`);
  });

  it("is reachable by the learner from their own profile editor", () => {
    expect(editor).toContain("<DiscoverabilitySwitch />");
    expect(control).toContain("trpc.supabaseCore.setOwnDiscoverability.useMutation()");
    expect(control).toContain("trpc.supabaseCore.ownDiscoverability.useQuery");
  });

  it("says plainly that no approval is involved", () => {
    expect(catalog).toContain("No administrator approval is involved.");
    expect(catalog.match(/"findStudents\.controlNote":/g)?.length).toBe(3);
  });
});

describe("the procedures are registered and authenticated", () => {
  it("requires a session for all three", () => {
    for (const name of ["discoverableLearners", "ownDiscoverability", "setOwnDiscoverability"]) {
      expect(routers, `${name} is authenticated`).toMatch(new RegExp(`${name}: supabaseOnlyProcedure`));
    }
    expect(routers).not.toMatch(/discoverableLearners: publicProcedure/);
  });

  it("bounds the page size", () => {
    expect(routers).toContain("limit: z.number().int().min(1).max(48).optional()");
    expect(server).toContain("Math.min(Math.max(filters.limit ?? 24, 1), LEARNER_DISCOVERY_LIMIT)");
  });
});

describe("the two desks answer different questions", () => {
  it("keeps the requirements desk to requirements", () => {
    /*
     * This desk carried `<DiscoverableLearners />` underneath its own grid, from when Find
     * Students had no page of its own. Find Students has had its own route since, and the copy
     * left here made this module a duplicate of it — then worse: with no published requirements
     * in the project the grid renders empty, so the only thing on the page was the other module's
     * list. Opening Requirements showed you Find Students.
     */
    expect(desk).toContain('data-testid="published-requirements"');
    // Comments stripped: the note left in its place names what was removed.
    expect(withoutComments(desk)).not.toContain("<DiscoverableLearners />");
    // The requirements query itself is untouched; only the borrowed list is gone.
    expect(desk).toContain("trpc.supabaseCore.publishedRequirements.useQuery(undefined, { retry: false })");
  });

  it("leaves the learner list to the page built for it", () => {
    const page = codeOf("../client/src/components/FindStudentsPage.tsx");
    expect(page).toContain("<DiscoverableLearners humanToken={token} />");
  });

  it("renders a distinct state for loading, offline, forbidden, error and empty", () => {
    expect(card).toContain("resultState(query as never, online)");
    expect(card).toContain("<ResultState");
    expect(card).toContain("onRetry={() => query.refetch()}");
    // Empty and no-matches are different sentences, because they mean different things.
    expect(card).toContain(`active ? t("findStudents.noMatches") : t("findStudents.empty")`);
  });

  it("shows no invented card and no placeholder", () => {
    for (const [name, source] of [["card", card], ["control", control]] as const) {
      expect(source, `${name} has no invented data`).not.toMatch(/\bmock|\bfake|\bdummy|sampleData|placeholderLearner/i);
      expect(source, `${name} has no coming-soon wording`).not.toMatch(/\bSOON\b|coming soon/i);
    }
  });

  it("links only to flows that already exist", () => {
    // The raw message link was replaced by the shared MessageAction, which
    // carries the existing relationship rule and its refusal rather than dropping
    // an instructor into a thread that cannot be opened.
    expect(card).toContain("<MessageAction");
    // The requirements link left the card: it is specified to carry one action.
    expect(card).toContain("/dashboard/instructor/students/${learner.learnerId}");
    // No new relationship primitive is invented. Checked against the code, not
    // the commentary — which legitimately explains WHICH existing events connect
    // two people before a conversation may be opened.
    // The concern is that the card must not MINT a new relationship primitive.
    // `connectHref` is a link to the existing requirements desk, not a mutation, so
    // the check is for the creating verbs rather than the word "connect" anywhere.
    expect(withoutComments(card)).not.toMatch(/follow|favourite|favorite|befriend/i);
    expect(withoutComments(card)).not.toMatch(/useMutation|\.mutate|insert\(|upsert\(/);
  });

  it("mirrors for Urdu and Arabic without a second layout", () => {
    for (const [name, source] of [["card", card], ["control", control]] as const) {
      expect(source, `${name} uses logical insets`).not.toMatch(/\bml-\d|\bmr-\d|\bpl-\d|\bpr-\d|\bleft-\d|\bright-\d|border-l\b|border-r\b|text-left\b|text-right\b/);
    }
  });

  it("carries every string in all three languages", () => {
    const used = new Set<string>();
    for (const source of [card, control]) {
      for (const match of source.matchAll(/"(findStudents\.[\w]+)"/g)) used.add(match[1]);
    }
    expect(used.size).toBeGreaterThan(12);
    const missing = [...used].filter((key) => (catalog.match(new RegExp(`"${key.replace(/\./g, "\\.")}":`, "g"))?.length ?? 0) !== 3);
    expect(missing).toEqual([]);
  });
});

describe("a missing session is a refusal, not a crash", () => {
  it("guards the token before trimming it", () => {
    expect(userClient).toContain("accessToken: string | null | undefined");
    expect(userClient).toContain("!accessToken?.trim()");
  });

  it("turns a null client into a structured setup-needed answer", () => {
    const occurrences = server.match(/if \(!db\) return \{ ok: false, error: "Supabase persistence is not configured\.", code: "SETUP_NEEDED" \};/g);
    // One per procedure that reads through the caller's own client. The fourth is
    // the detail read behind a Find Students card.
    expect(occurrences?.length).toBe(4);
  });
});
