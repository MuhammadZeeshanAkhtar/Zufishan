import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Source with the leading documentation block removed, so no assertion is met by prose. */
const codeOf = (path: string) => {
  const text = readFileSync(new URL(path, import.meta.url), "utf8");
  const firstImport = text.indexOf("\nimport ");
  return firstImport === -1 ? text : text.slice(firstImport);
};

const nav = codeOf("../client/src/components/SiteNav.tsx");
const sections = codeOf("../client/src/components/HomeSections.tsx");
const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const home = readFileSync(new URL("../client/src/components/HomeExperience.tsx", import.meta.url), "utf8");
const catalog = readFileSync(new URL("../client/src/i18n/catalog.ts", import.meta.url), "utf8");
const routers = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");

// Six when this was written; Pricing joined later as a seventh, so the list below is the guarantee
// rather than the count. What must stay true is that each named item is in the header and each
// retired label is not.
describe("the homepage header carries the requested items", () => {
  it("renders one navigation for desktop and mobile so they cannot drift", () => {
    expect(app).toContain("<SiteNav/>");
    expect(app).toContain("<SiteNavMobile onNavigate={() => setOpen(false)}/>");
  });

  it("names the items and drops the old labels from the header", () => {
    // `nav.howItWorks` left the header with the section it scrolled to, on the owner's decision.
    for (const key of ["nav.ourCourses", "nav.findTeachers", "nav.aiTutor", "nav.contact", "nav.blog", "nav.pricing", "nav.faqs"]) {
      expect(nav, `${key} must be in the navigation`).toContain(key);
    }
    // The old labels stay in the catalogue because other surfaces still use them; what
    // must be gone is the header rendering them.
    const header = app.slice(app.indexOf("function Header()"), app.indexOf("function Footer()"));
    for (const gone of ["nav.courses", "nav.tutors", "nav.requirements", "nav.help"]) {
      expect(header, `${gone} must no longer be a header item`).not.toContain(gone);
    }
  });

  it("keeps the brand, theme, locale, login and join controls", () => {
    const header = app.slice(app.indexOf("function Header()"), app.indexOf("function Footer()"));
    for (const kept of ["<Logo />", "<ThemeToggle/>", "<LocaleSelector/>", 't("nav.login")', 't("nav.join")']) {
      expect(header, `${kept} must survive the redesign`).toContain(kept);
    }
  });
});

describe("the course menu lists every subject Zufishan teaches", () => {
  it("reuses the one subject list instead of hand-writing a second", () => {
    // `subjectOptions` re-exports `categories`, the list the learner and instructor
    // profile forms already use, so the menu cannot drift from what people can study.
    expect(nav).toContain('import { subjectOptions } from "../lib/reference-data";');
    expect(nav).toContain("[...subjectOptions, ...extra]");
    const reference = readFileSync(new URL("../client/src/lib/reference-data.ts", import.meta.url), "utf8");
    expect(reference).toContain("export const subjectOptions: string[] = [...categories];");
  });

  it("keeps a published subject reachable even if it is not on the curated list", () => {
    expect(nav).toContain("published.filter((subject) => !subjectOptions.includes(subject))");
  });

  it("sends each subject to the existing courses module", () => {
    expect(nav).toContain("href: `/courses?subject=${encodeURIComponent(subject)}`");
    expect(app).toContain('<Route path="/courses">{() => <CoursesRoute/>}</Route>');
  });

  it("cannot surface a draft, rejected or unpublished course", () => {
    // Naming a subject is not the same as showing a course. The listing the menu links
    // to reads only published rows, so an empty subject lands on an empty catalogue.
    const core = readFileSync(new URL("./supabase-core.ts", import.meta.url), "utf8");
    const listing = core.slice(core.indexOf("export async function listPublicPublishedCourses"));
    expect(listing.slice(0, 700)).toContain('.eq("status", "published")');
  });

  it("is a list of subjects and nothing else", () => {
    // The view-all action was removed: picking any subject already opens the courses
    // page, so it was a second door to the same room.
    expect(nav).not.toContain("nav.viewAllCourses");
    expect(nav).not.toContain('href="/courses"');
    // The panel is a list of subjects, nothing more: the courses page reports an empty
    // catalogue for itself, so the menu does not carry a second, staler copy of that.
    expect(nav).not.toContain("noCoursesYet");
    expect(catalog).not.toContain("nav.noCoursesYet");
  });
});

describe("the panels sit against the item they belong to", () => {
  it("has no gap the pointer could fall through on the way down", () => {
    const panel = nav.slice(nav.indexOf('className="absolute start-0 top-full'));
    expect(panel.slice(0, 120)).not.toMatch(/\bmt-\d/);
  });
});

describe("the teacher menu uses the discovery page that already exists", () => {
  it("points at the existing routes with a real gender filter", () => {
    expect(nav).toContain('href="/teachers/male"');
    expect(nav).toContain('href="/teachers/female"');
    expect(app).toContain('<Route path="/teachers/male">{() => <TeachersPage initialGender="male"/>}</Route>');
    expect(app).toContain('<Route path="/teachers/female">{() => <TeachersPage initialGender="female"/>}</Route>');
    // Seeded into the same filter state the sidebar edits, so the reader can clear it.
    expect(app).toContain("gender: initialGender || undefined");
  });

  it("builds no second discovery system", () => {
    expect(nav).not.toContain("instructor_profiles");
    expect(nav).not.toMatch(/schedulingPublic\.instructors\b/);
  });
});

describe("Find Students left the public header but not the product", () => {
  it("is no longer offered in the homepage navigation", () => {
    expect(nav).not.toContain("nav.findStudents");
    expect(nav).not.toContain("/dashboard/instructor/students");
  });

  it("keeps its route, its guard and its way in from the instructor dashboard", () => {
    expect(app).toContain('<Route path="/dashboard/instructor/students">{() => <ProtectedRoute role="instructor"><FindStudentsPage/></ProtectedRoute>}</Route>');
    const quickLinks = readFileSync(new URL("../client/src/components/DashboardQuickLinks.tsx", import.meta.url), "utf8");
    expect(quickLinks).toContain('href: "/dashboard/instructor/students"');
  });
});

describe("AI Tutor is explained publicly and entered privately", () => {
  it("scrolls to a homepage section rather than linking at the dashboard", () => {
    expect(nav).toContain('export const AI_TUTOR_ID = "ai-tutor";');
    expect(nav).toContain("goToSection(AI_TUTOR_ID)");
    // The navigation item is a scroll, not a route: no private surface is linked.
    expect(nav).not.toContain('href="/dashboard/learner/ai-tutor"');
    expect(sections).toContain("id={AI_TUTOR_ID}");
  });

  it("carries the requested content and the disclaimer", () => {
    for (const key of ["aiTutor.title", "aiTutor.intro", "aiTutor.f1", "aiTutor.f2", "aiTutor.f3", "aiTutor.f4", "aiTutor.f5", "aiTutor.disclaimer", "aiTutor.start"]) {
      expect(sections, `${key} must be rendered`).toContain(key);
    }
  });

  it("claims only what the tutor implementation actually supports", () => {
    const shared = readFileSync(new URL("../shared/ai-tutor.ts", import.meta.url), "utf8");
    const en = catalog.slice(catalog.indexOf('"aiTutor.f2Copy"'), catalog.indexOf('"aiTutor.f3"'));
    // Every language named for practice is a real AI_TUTOR_LANGUAGES entry.
    for (const language of ["Arabic", "English", "Urdu", "French", "Turkish", "Spanish"]) {
      expect(shared, `${language} must exist in AI_TUTOR_LANGUAGES`).toContain(`"${language}"`);
      expect(en, `${language} must be offered in the copy`).toContain(language);
    }
    // The tutor refuses religious rulings at runtime, so the copy must not promise them.
    const tutor = readFileSync(new URL("./ai-tutor.ts", import.meta.url), "utf8");
    expect(tutor).toContain("You assist only with language learning and practice.");
    expect(catalog).toContain("it is not a Quran authority and will not give religious rulings");
  });

  it("sends a visitor through login, never straight into the dashboard", () => {
    expect(sections).toContain('const AI_TUTOR_ROUTE = "/dashboard/learner/ai-tutor";');
    expect(sections).toContain("`/signup?returnTo=${encodeURIComponent(AI_TUTOR_ROUTE)}`");
    // An instructor or admin goes to their own desk rather than a learner route.
    expect(sections).toContain('currentSession.role === "learner" ? AI_TUTOR_ROUTE');
    expect(sections).toContain("currentSession.role ? `/dashboard/${currentSession.role}`");
    // Nothing secret travels in the URL, and no guard is re-implemented here — the
    // pattern is narrowed to code because the comments name ProtectedRoute to explain
    // that the existing one is what decides, which is the point.
    expect(sections).not.toMatch(/password|token|apiKey|secret/i);
    expect(sections).not.toMatch(/<ProtectedRoute|import\s.*ProtectedRoute/);
  });

  it("changes nothing about the tutor itself", () => {
    // Scoped to the AI Tutor section: the file also holds the blog preview, which does
    // call a public procedure. What matters is that the tutor section calls none.
    // Bounded by the next export, whatever it happens to be: `HowItWorksSection` was the
    // boundary until it was removed, and a slice that ends at a missing marker reads to the end
    // of the file — which would have quietly swept in the blog preview's own procedure call.
    const section = sections.slice(sections.indexOf("export function AITutorSection"), sections.indexOf("export function BlogSection"));
    expect(section).not.toContain("trpc.");
    expect(sections).not.toMatch(/gemini|generateContent|systemPrompt|apiKey/i);
  });
});

describe("How it works is gone; Contact is still a homepage section", () => {
  /*
   * The owner asked for the How it works module to be removed from the homepage entirely — the
   * section, its copy and the navigation item that scrolled to it. These assertions used to pin it
   * in place, so they now pin its absence: a module removed by request should not creep back in.
   *
   * Contact is untouched and still anchors on the homepage, which is what the rest of this case
   * protects.
   */
  it("no longer renders the section, its anchor or its navigation item", () => {
    expect(home).not.toContain("<HowItWorksSection />");
    expect(sections).not.toContain("export function HowItWorksSection");
    expect(nav).not.toContain("HOW_IT_WORKS_ID");
    expect(nav).not.toContain("nav.howItWorks");
  });

  it("leaves none of its copy on the homepage", () => {
    for (const key of ["howWorks.title", "howWorks.intro", "howWorks.s1", "howWorks.aiTitle", "home.stepsTitle", "home.seeHow"]) {
      expect(sections, `${key} must be gone from the homepage sections`).not.toContain(key);
      expect(home, `${key} must be gone from the homepage`).not.toContain(key);
    }
  });

  it("sends Contact to its own page rather than scrolling the homepage", () => {
    /*
     * Contact followed How it works off the homepage, on the owner's decision: clicking it should
     * open a page the way FAQs and Blog do. The form itself did not disappear — it lives on
     * `/contact-lms`, which is also where the FAQ's closing button has always pointed.
     */
    expect(home).not.toContain("<ContactSection />");
    expect(sections).not.toContain("export function ContactSection");
    expect(nav).not.toContain("CONTACT_ID");
    expect(nav).toContain('<Link href="/contact-lms" className={triggerClass}>{t("nav.contact")}</Link>');
    // The mobile drawer navigates to the same place, so the two cannot drift.
    expect(nav).toContain('<Link href="/contact-lms" onClick={onNavigate} className="ni-t-ink">{t("nav.contact")}</Link>');
  });

  it("still honours reduced motion for the anchors that remain", () => {
    expect(nav).toContain("target.scrollIntoView({ behavior: reduced ? \"auto\" : \"smooth\", block: \"start\" });");
    expect(nav).toContain('window.matchMedia("(prefers-reduced-motion: reduce)").matches');
  });
});

describe("Blog is offered honestly, and now has a page behind it", () => {
  it("comes last, after Contact", () => {
    expect(nav.indexOf("nav.contact")).toBeLessThan(nav.indexOf("nav.blog"));
    expect(home.indexOf("<ContactSection />")).toBeLessThan(home.indexOf("<BlogSection />"));
  });

  it("navigates to the real /blog page rather than scrolling", () => {
    expect(nav).toContain('<Link href="/blog" className={triggerClass}>{t("nav.blog")}</Link>');
    expect(nav).not.toContain("goToSection(BLOG_ID)");
    expect(app).toContain('<Route path="/blog">');
    // The homepage keeps a preview section under the same anchor.
    expect(sections).toContain("id={BLOG_ID}");
  });

  it("shows only real published articles, never invented ones", () => {
    // The preview reads the same public procedure the /blog page uses, so it can only
    // show what that shows: rows the table's one policy allows.
    expect(sections).toContain("trpc.schedulingPublic.blogArticles.useQuery({ limit: 3 }");
    expect(sections).toContain("blog.empty");
    expect(catalog).toContain("New learning articles are coming soon.");
    // No article title, excerpt or date is written into the catalogue as content.
    expect(catalog).not.toMatch(/"blog\.(sample|demo|example)/);
  });

  it("offers the listing link only now that the listing exists", () => {
    expect(sections).toContain('<Link href="/blog" className="ni-btn ni-btn--outline mt-6">{t("blog.viewAll")}</Link>');
    // Rendered inside the non-empty branch, so an empty blog shows no link to itself.
    const empty = sections.indexOf("blog.empty");
    const viewAll = sections.indexOf("blog.viewAll");
    expect(empty).toBeLessThan(viewAll);
  });
});

describe("the contact form still tells the truth about what happened", () => {
  /*
   * These guarantees were written for the homepage section. That section is gone and the form moved
   * to its own page, so they move with it rather than being deleted — the risk they guard is a
   * property of the form, not of where it is mounted.
   */
  const contactPage = readFileSync(new URL("../client/src/components/ContactPage.tsx", import.meta.url), "utf8");

  it("shows a success state only for a message that was actually stored", () => {
    expect(routers).toContain("submitContactMessage: publicProcedure");
    expect(contactPage).toContain("const result = await send.mutateAsync(");
    expect(contactPage).toContain("if (!result || !result.ok) {");
    // The tick is set after the write, never on a bare submit.
    expect(contactPage).toContain("setSent(true);");
    expect(contactPage.indexOf("if (!result || !result.ok) {")).toBeLessThan(contactPage.indexOf("setSent(true);"));
  });

  it("posts nowhere of its own and embeds no address or key", () => {
    expect(contactPage).not.toMatch(/fetch\(|axios|mailto:|@gmail|@noor|apiKey|SERVICE_ID/i);
  });

  it("requires every field and announces a failure", () => {
    // Four required inputs, and a failure the reader is told about rather than left guessing at.
    expect(contactPage.match(/required/g)?.length).toBeGreaterThanOrEqual(4);
    expect(contactPage).toContain('role="alert"');
    expect(contactPage).toContain("setFailed(result && !result.ok ? result.error");
  });

  it("asks which side the sender is writing from", () => {
    for (const key of ["contact.asStudent", "contact.asTeacher", "contact.asOther"]) {
      expect(contactPage, key).toContain(key);
    }
  });
});

describe("the dropdowns are operable without a mouse", () => {
  it("announces state, closes on Escape and returns focus", () => {
    expect(nav).toContain("aria-expanded={open}");
    expect(nav).toContain('aria-haspopup="true"');
    expect(nav).toContain("aria-controls={panelId}");
    expect(nav).toContain('if (event.key !== "Escape") return;');
    expect(nav).toContain("trigger.current?.focus();");
    expect(nav).toContain('if (event.key !== "ArrowDown") return;');
  });

  it("does not depend on hover, and does not fight a touch", () => {
    // pointerenter would fire on a tap and the click that follows would close what the
    // tap had just opened, so hover is limited to an actual mouse.
    expect(nav).toContain('if (event.pointerType === "mouse") setOpen(true);');
    expect(nav).toContain("onClick={() => setOpen((current) => !current)}");
  });

  it("stays inside the viewport in both writing directions", () => {
    expect(nav).toContain("absolute start-0 top-full");
    expect(nav).toContain("max-w-[calc(100vw-2rem)]");
    // Logical properties only, so Urdu and Arabic mirror without a second layout.
    expect(nav).not.toMatch(/\bml-\d|\bmr-\d|\bpl-\d|\bpr-\d|\bleft-\d|\bright-\d|text-left\b|text-right\b/);
    expect(sections).not.toMatch(/\bml-\d|\bmr-\d|\bpl-\d|\bpr-\d|\bleft-\d|\bright-\d|text-left\b|text-right\b/);
  });
});
