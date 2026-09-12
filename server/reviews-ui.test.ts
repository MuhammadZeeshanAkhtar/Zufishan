import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ui = readFileSync(new URL("../client/src/components/ReviewsExperience.tsx", import.meta.url), "utf8");
const ops = readFileSync(new URL("../client/src/components/RelationshipOpsExperience.tsx", import.meta.url), "utf8");
const instructors = readFileSync(new URL("../client/src/components/InstructorManagement.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const reviews = readFileSync(new URL("./reviews.ts", import.meta.url), "utf8");
const routers = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const guard = readFileSync(new URL("../supabase/migrations/0017_review_status_is_moderated.sql", import.meta.url), "utf8");
const rls = readFileSync(new URL("../supabase/migrations/0002_auth_and_rls.sql", import.meta.url), "utf8");
const catalog = readFileSync(new URL("../client/src/i18n/catalog.ts", import.meta.url), "utf8");

describe("the screens reach the real procedures", () => {
  it("calls every review procedure that previously had no caller", () => {
    expect(ui).toContain("trpc.scheduling.createReview.useMutation()");
    expect(ui).toContain("trpc.scheduling.myReviews.useQuery");
    expect(ui).toContain("trpc.scheduling.reviewsAboutMe.useQuery");
    expect(ui).toContain("trpc.schedulingPublic.instructorReviews.useQuery");
    expect(routers).toContain("reviewsAboutMe: supabaseOnlyProcedure.query(({ ctx }) => listReviewsAboutMe(ctx.supabaseIdentity)),");
  });

  it("routes the three pages at the real module, not the fixture one", () => {
    for (const page of ["PublicReviewsPage", "ReviewFormPage", "ReviewListPage"]) {
      expect(app).toContain(`import("./components/ReviewsExperience").then(m => ({ default: m.${page} }))`);
      expect(app).not.toContain(`import("./components/RelationshipOpsExperience").then(m => ({ default: m.${page} }))`);
    }
  });

  it("leaves no fixture-backed copy of those pages behind to be re-imported", () => {
    for (const page of ["export function PublicReviewsPage", "export function ReviewFormPage", "export function ReviewListPage"]) {
      expect(ops, `${page} must exist in one place only`).not.toContain(page);
    }
    // The hardcoded demo session the old form posted against is gone. The check is for a quoted
    // literal, since the new module names it in prose while explaining what it replaced.
    expect(ops).not.toContain('const event = { id: "session-101"');
    expect(ui).not.toContain('"session-101"');
  });

  it("fakes nothing", () => {
    expect(ui).not.toMatch(/setTimeout\(.*ok: true|mockResolved|fakeReview|demoReviews/);
  });
});

describe("eligibility mirrors the database rather than inventing its own", () => {
  it("offers only finished sessions the caller attended", () => {
    expect(ui).toContain('row.status === "completed" && row.learner_id === currentSession?.userId');
    expect(rls).toContain("create policy reviews_eligible_insert on public.reviews for insert with check (reviewer_id = auth.uid() and exists (select 1 from public.class_sessions s where s.id = session_id and s.learner_id = auth.uid() and s.status = 'completed'));");
  });

  it("keeps the server's own eligibility checks in place", () => {
    expect(reviews).toContain('return { ok: false, error: "Only the learner who attended can review a session.", code: "FORBIDDEN" };');
    expect(reviews).toContain('return { ok: false, error: "A session can be reviewed once it has finished.", code: "CONFLICT" };');
  });
});

describe("one review per session, enforced twice", () => {
  it("hides a session that the caller already reviewed", () => {
    expect(ui).toContain("resultRows<ReviewRow>(mine as never).map((row) => row.session_id)");
    expect(ui).toContain("!reviewed.has(row.id)");
  });

  it("still translates the unique-constraint violation, because the UI filter is not the guarantee", () => {
    expect(reviews).toContain('if (error?.code === "23505") return { ok: false, error: "You have already reviewed this session.", code: "CONFLICT" };');
    expect(rls.includes("unique(session_id,reviewer_id)") || readFileSync(new URL("../supabase/migrations/0001_noor_ilm_lms_canonical.sql", import.meta.url), "utf8").includes("unique(session_id,reviewer_id)")).toBe(true);
  });
});

describe("publishing is a moderation decision, not the author's", () => {
  it("closes the self-publish hole with a trigger and leaves the policies alone", () => {
    expect(guard).toContain("if new.status is distinct from old.status then");
    expect(guard).toContain("if not (public.is_admin_user() or public.is_moderator_user()) then");
    // The service role carries no auth.uid(); moderation procedures run there after their own check.
    expect(guard).toContain("if auth.uid() is null then");
    expect(guard).toContain("create trigger reviews_status_guard");
    expect(guard.toLowerCase()).not.toMatch(/\b(drop table|delete from|truncate|drop policy)\b/);
  });

  it("tells the author their review is waiting rather than implying it is live", () => {
    expect(ui).toContain('t("reviews.savedPending")');
    expect(catalog).toContain("A moderator will check it before it appears on the tutor's profile.");
  });

  it("shows a pending status to the author and the instructor, never on a public card", () => {
    expect(ui).toContain('{status && status !== "published" && (');
    // The public page renders ReviewCard without a status prop.
    expect(ui).toContain("<ReviewCard key={row.id} rating={row.rating} body={row.body} createdAt={row.created_at} />");
  });
});

describe("ratings on the tutor profile", () => {
  it("is mounted on the public profile and reads the published-only procedure", () => {
    expect(instructors).toContain("<InstructorRating instructorId={profile.user_id}/>");
    expect(reviews).toContain('.eq("status", "published")');
  });

  it("computes the average from the rows it shows, so the two cannot disagree", () => {
    expect(reviews).toContain("average: averageOf(rows)");
    expect(ui).toContain("<Stars value={summary!.average} size={18} />");
  });

  it("resolves the slug the route actually passes into an instructor id", () => {
    expect(app).toContain('<Route path="/teachers/:slug/reviews">{(params) => <PublicReviewsPage instructorId={params.slug}/>}</Route>');
    expect(ui).toContain("trpc.schedulingPublic.instructorBySlug.useQuery({ slug: instructorId ?? \"\" }");
  });

  it("says course reviews are not connected instead of showing an empty list", () => {
    expect(ui).toContain('t("reviews.courseNotConnected")');
  });
});

describe("every state is distinct", () => {
  it("derives panel state through the shared helper on each screen", () => {
    expect(ui.match(/resultState\(/g)?.length).toBe(3);
    // An object-shaped payload is never an empty array, so emptiness is read from the rows.
    expect(ui).toContain('const state: State = base === "ready" && !rows.length ? "empty" : base;');
    expect(ui).toContain('const state: State = listState === "ready" && !eligible.length ? "empty" : listState;');
  });

  it("offers retry on load and on a failed submit", () => {
    expect(ui.match(/onRetry=\{\(\) =>/g)?.length).toBe(4);
    expect(ui).toContain('<button type="button" onClick={submit} className="font-bold underline">{t("common.retry")}</button>');
  });

  it("shows a pending submit and blocks an incomplete one", () => {
    expect(ui).toContain("const complete = Boolean(sessionId) && rating > 0 && body.trim().length > 0;");
    expect(ui).toContain("disabled={!complete || create.isPending}");
    expect(ui).toContain("aria-busy={create.isPending}");
  });

  it("treats a signed-out visitor as unauthorised rather than letting the call fail", () => {
    expect(ui).toContain("if (!signedIn) {");
  });
});

describe("accessibility, translation and direction", () => {
  it("uses real radios for the rating, not clickable icons alone", () => {
    expect(ui).toContain('<input type="radio" name="rating"');
    expect(ui).toContain('<legend className="sr-only">{t("reviews.rating")}</legend>');
    expect(ui).toContain('aria-label={t("reviews.ratingOf", { rating: String(value) })}');
  });

  it("translates every new string in all three locales", () => {
    for (const key of ["reviews.newTitle", "reviews.rating", "reviews.submit", "reviews.savedPending", "reviews.noEligible", "reviews.noneYet", "reviews.countLabel", "reviews.courseNotConnected", "reviews.status.pending"]) {
      expect(catalog.match(new RegExp(`"${key.replace(/\./g, "\\.")}":`, "g"))?.length, `${key} needs en/ur/ar`).toBe(3);
    }
  });

  it("uses no physical-direction spacing that would break in RTL", () => {
    expect(ui).not.toMatch(/\b(ml|mr|pl|pr)-\d/);
    expect(ui).toContain('className="rtl:rotate-180"');
  });
});
