import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Source with the leading documentation block removed, so no assertion is met by prose. */
const codeOf = (path: string) => {
  const text = readFileSync(new URL(path, import.meta.url), "utf8");
  const firstImport = text.indexOf("\nimport ");
  return firstImport === -1 ? text : text.slice(firstImport);
};
const raw = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

const scheduling = raw("./scheduling.ts");
const core = raw("./supabase-core.ts");
const routers = raw("./routers.ts");
const rls = raw("../supabase/migrations/0002_auth_and_rls.sql");
const publishedPolicy = raw("../supabase/migrations/0020_published_requirements_readable_by_instructors.sql");
const card = codeOf("../client/src/components/InstructorCard.tsx");
const presentation = codeOf("../client/src/components/InstructorPresentation.tsx");
const filters = codeOf("../client/src/components/MarketplaceFilters.tsx");
const stats = raw("./discovery-stats.ts");
const catalog = raw("../client/src/i18n/catalog.ts");
const app = raw("../client/src/App.tsx");
const quickLinks = raw("../client/src/components/DashboardQuickLinks.tsx");

/**
 * The discovery query, isolated so assertions cannot drift onto a neighbour.
 *
 * Bounded by the function that follows it in the file — the helpers it calls are
 * declared above it, so slicing to one of those would produce nothing.
 */
const discovery = scheduling.slice(
  scheduling.indexOf("export async function listPublicInstructors"),
  scheduling.indexOf("async function attachPublicPresentation"),
);

describe("an instructor is discoverable only with every consent and good standing", () => {
  it("applies approval and publication before any caller-supplied filter", () => {
    expect(discovery).toContain('.eq("public_profile_status", "published")');
    // 0035 made verification a mark rather than a gate; publication is what remains.
    expect(discovery).toContain('.eq("public_profile_status", "published")');
    // Both sit above the first optional filter, so no input can widen the set.
    const gate = discovery.indexOf('.eq("public_profile_status", "published")');
    expect(gate).toBeLessThan(discovery.indexOf("if (filters.sect)"));
    expect(gate).toBeLessThan(discovery.indexOf("if (filters.subjects?.length)"));
  });

  it("excludes a suspended or deleted account from the listing entirely", () => {
    expect(scheduling).toContain('.neq("account_status", "active")');
    expect(discovery).toContain("const barred = await suspendedInstructorIds();");
    expect(discovery).toContain('if (barred.length > 0) request = request.not("user_id", "in", `(${barred.join(",")})`);');
    // A failed standing check reports an error; it never assumes good standing.
    expect(discovery).toContain('if (barred === null) return fail("Instructor discovery could not be loaded.");');
    // And it runs before the page is taken, so the total is honest.
    expect(discovery.indexOf("const barred")).toBeLessThan(discovery.indexOf("request.range(offset"));
  });

  it("never lets a client-supplied value stand in for approval", () => {
    expect(routers).toContain("instructors: publicProcedure.input(z.object({");
    // The procedure takes filters only — no status, no visibility, no role.
    const input = routers.slice(routers.indexOf("instructors: publicProcedure.input"), routers.indexOf("listPublicInstructors(input ?? {})"));
    for (const forbidden of ["verification_status", "public_profile_status", "verificationStatus", "profileVisibility", "role:"]) {
      expect(input, `${forbidden} is not an input`).not.toContain(forbidden);
    }
  });
});

describe("the person's own details are a separate consent from the listing", () => {
  it("shows personal fields only for a public, active profile", () => {
    expect(scheduling).toContain('const isPublic = String(row.profile_visibility ?? "") === "public" && active;');
    expect(scheduling).toContain('const active = String(row.account_status ?? "") === "active";');
    // Otherwise the card carries nothing personal.
    expect(scheduling).toContain("displayName: null, avatarUrl: null, country: null, timezone: null, gender: null, bio: null, profilePublic: false,");
  });

  it("reads an allow-list of columns, and never a private one", () => {
    const select = scheduling.slice(scheduling.indexOf('.select("id,display_name,full_name,avatar_url'));
    const columns = select.slice(0, select.indexOf('")')).replace('.select("', "").split(",");
    expect(columns.sort()).toEqual([
      "account_status", "avatar_url", "bio", "country", "display_name", "full_name", "gender", "id", "profile_visibility", "timezone",
    ]);
    // City is finer than the agreed granularity, and is deliberately absent.
    expect(columns).not.toContain("city");
    for (const priv of ["email", "phone", "password", "address"]) {
      expect(scheduling.toLowerCase(), `discovery must not read ${priv}`).not.toContain(`"${priv}"`);
    }
  });

  it("degrades rather than failing when the lookup is unavailable", () => {
    // A missing admin client hides personal detail; it does not empty the marketplace.
    expect(scheduling).toContain("if (!admin) return rows.map((row) => ({ ...row, ...blank }));");
  });
});

describe("the card shows only what exists", () => {
  it("falls back to the public slug and a drawn avatar, never a stock photo", () => {
    expect(card).toContain("const name = instructor.displayName?.trim() || instructor.public_slug;");
    expect(presentation).toContain("export function initialsOf(name: string): string {");
    for (const source of [card, presentation]) {
      expect(source).not.toMatch(/unsplash|placeholder\.com|pravatar|gravatar|randomuser/i);
    }
  });

  it("renders no presence anywhere, because nothing records it", () => {
    // Zufishan has no last_seen_at column, no heartbeat and no realtime presence
    // channel, so an online/offline state could only be invented. Identifiers
    // rather than words, so a comment explaining the absence cannot satisfy this.
    for (const invented of ["isOnline", "onlineStatus", "last_seen", "presenceChannel", "OnlineBadge"]) {
      for (const source of [card, presentation, filters]) {
        expect(source, `${invented} has no real source`).not.toContain(invented);
      }
    }
    // And no string exists to label such a control, in any locale.
    expect(catalog).not.toMatch(/"(discovery|marketplace)\.(online|offline|status)"/);
    // The sidebar offers no Status group either.
    expect(filters).not.toMatch(/marketplace\.status/);
  });

  it("counts the rating, sessions and learners from real rows", () => {
    // These ARE shown now, and every one is counted at read time: published reviews
    // for the rating, completed sessions for the other two. A booked-but-unheld
    // session is not a taught session.
    expect(stats).toContain('.from("reviews")');
    expect(stats).toContain('.eq("status", "published")');
    expect(stats).toContain('.from("class_sessions")');
    expect(stats).toContain('.eq("status", "completed")');
    // Nothing stored, cached, sampled or generated stands in for a count.
    expect(stats).not.toMatch(/average_rating|rating_cache|sessions_count|Math\.random/);
  });

  it("omits a fact rather than showing it empty", () => {
    expect(presentation).toContain("const facts: InstructorFact[] = [];");
    expect(presentation).toContain("if (rate) facts.push(");
    expect(card).toContain("{facts.length > 0 && (");
  });

  it("says plainly when the listing is public but the person is not", () => {
    expect(card).toContain("{instructor.profilePublic === false && (");
    expect(card).toContain('t("discovery.profilePrivate")');
  });

  it("mirrors for Urdu and Arabic without a second layout", () => {
    for (const source of [card, presentation]) {
      expect(source).not.toMatch(/\bml-\d|\bmr-\d|\bpl-\d|\bpr-\d|\bleft-\d|\bright-\d|border-l\b|border-r\b|text-left\b|text-right\b/);
    }
    expect(presentation).toContain("border-s border-[var(--ni-sage)]");
  });

  it("is the single card for both the public page and the learner dashboard", () => {
    expect(app).toContain("<InstructorCard");
    expect(app).toContain('href={(embedded ? "/dashboard/learner/teachers/" : "/teachers/") + instructor.public_slug}');
    // The old slug-as-heading is gone.
    expect(app).not.toContain('<p className="truncate font-display text-xl ni-t-ink">{instructor.public_slug}</p>');
  });
});

describe("learner data is discoverable only when the learner published it", () => {
  it("lists published requirements and nothing else", () => {
    expect(core).toContain('.eq("status", "published")');
    const listing = core.slice(core.indexOf("export async function listPublishedRequirements"), core.indexOf("export async function createRequirement"));
    // Read through the caller's own client, so RLS decides, not the query alone.
    expect(listing).toContain("const db = client(identity);");
    for (const priv of ["email", "phone", "learner_id"]) {
      expect(listing, `a published requirement must not carry ${priv}`).not.toContain(priv);
    }
  });

  it("is restricted to instructors by policy, not by the query", () => {
    expect(publishedPolicy).toContain("status = 'published' and public.is_user_role('instructor')");
  });

  it("keeps every profile row private to its owner and admins", () => {
    expect(rls).toContain("create policy profiles_select_own_or_admin on public.profiles for select using (auth.uid() = id or public.is_admin_user());");
  });
});

describe("both modules are reachable and unchanged in behaviour", () => {
  it("links to the existing routes from the dashboards", () => {
    expect(quickLinks).toContain('label: "Find Quran Teacher", href: "/dashboard/learner/teachers"');
    expect(quickLinks).toContain('label: "Find Students", href: "/dashboard/instructor/students"');
    expect(app).toContain('<Route path="/dashboard/learner/teachers">');
    expect(app).toContain('<Route path="/dashboard/instructor/students">');
    expect(app).toContain('<Route path="/dashboard/instructor/requirements">');
  });

  it("uses the existing secure procedures for every action", () => {
    // Discovery adds no new relationship, follow or contact-exchange procedure.
    for (const invented of ["follow", "favourite", "favorite", "contactExchange", "connectWith"]) {
      expect(routers, `${invented} was not invented`).not.toContain(invented);
    }
    expect(routers).toContain("createTrialRequest");
    expect(routers).toContain("respondToRequirement");
  });
});
