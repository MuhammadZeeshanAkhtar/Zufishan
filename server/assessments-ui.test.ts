import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { markAttempt } from "./assessments";

const ui = readFileSync(new URL("../client/src/components/AssessmentsExperience.tsx", import.meta.url), "utf8");
const server = readFileSync(new URL("./assessments.ts", import.meta.url), "utf8");
const routers = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const guard = readFileSync(new URL("../supabase/migrations/0016_scores_are_not_self_assigned.sql", import.meta.url), "utf8");
const rls = readFileSync(new URL("../supabase/migrations/0002_auth_and_rls.sql", import.meta.url), "utf8");
const catalog = readFileSync(new URL("../client/src/i18n/catalog.ts", import.meta.url), "utf8");

describe("the screens reach the real procedures", () => {
  it("calls every assessment procedure a learner or instructor needs", () => {
    for (const proc of ["courseQuizzes", "courseAssignments", "myQuizAttempts", "courseSubmissions", "submitQuizAttempt", "submitAssignment", "gradeSubmission"]) {
      expect(ui, `${proc} must be called`).toContain(`trpc.scheduling.${proc}`);
    }
    expect(ui).not.toMatch(/mockResolved|fakeAttempt|fakeSubmission|demoQuiz/);
  });

  it("registers the two read procedures that had no server-side path before", () => {
    expect(routers).toContain("myQuizAttempts: supabaseOnlyProcedure.input(z.object({ quizId: z.string().uuid().optional() })).query(({ ctx, input }) => listOwnQuizAttempts(ctx.supabaseIdentity, input)),");
    expect(routers).toContain("courseSubmissions: supabaseOnlyProcedure.input(z.object({ courseId: z.string().uuid() })).query(({ ctx, input }) => listCourseSubmissions(ctx.supabaseIdentity, input)),");
  });

  it("routes both screens, with the specific learner path before the workspace path", () => {
    expect(app).toContain('<Route path="/dashboard/learner/courses/:courseId/assessments">');
    expect(app).toContain('<Route path="/dashboard/instructor/courses/:courseId/submissions">');
    expect(app.indexOf("/dashboard/learner/courses/:courseId/assessments"))
      .toBeLessThan(app.indexOf('<Route path="/dashboard/learner/courses/:courseId">'));
  });
});

describe("answer keys never reach a learner", () => {
  it("strips the stored answer for anyone who does not own the course", () => {
    expect(server).toContain("return { ...quiz, questions: questions.map(({ answer: _answer, ...rest }) => rest) };");
    expect(server).toContain('const isOwner = String((course as { instructor_id?: string } | null)?.instructor_id ?? "") === identity.id;');
  });

  it("does not carry an answer field into the player at all", () => {
    // The learner-facing type has no `answer`, so a key could not be rendered even by mistake.
    expect(ui).toContain("type Question = { id?: string; prompt?: string };");
    expect(ui).not.toMatch(/question\.answer|\.answer\b/);
  });

  it("keeps attempts unreadable by anyone but the learner who made them", () => {
    expect(rls).toContain("create policy quiz_attempts_own on public.quiz_attempts for all using (learner_id = auth.uid()) with check (learner_id = auth.uid());");
    expect(server).toContain('let query = db.from("quiz_attempts").select("id,quiz_id,answers,score,submitted_at,created_at")');
  });
});

describe("a learner cannot set their own score", () => {
  it("offers no score field on either learner path", () => {
    // submitQuizAttempt takes answers only; submitAssignment takes body/objectPath only.
    expect(routers).toContain("submitQuizAttempt: supabaseOnlyProcedure\n      .input(z.object({ quizId: z.string().uuid(), answers: z.record(z.string(), z.unknown()) }))");
    expect(routers).toContain("submitAssignment: supabaseOnlyProcedure\n      .input(z.object({ assignmentId: z.string().uuid(), body: z.string().max(20000).optional(), objectPath: z.string().max(500).optional() }))");
    expect(server).toContain("/** A learner submits their work. `score` is deliberately not accepted here. */");
  });

  it("marks through the service role, so the score has an author who is not the learner", () => {
    expect(server).toContain('const { error: scoreError } = await admin.from("quiz_attempts").update({ score }).eq("id", attemptId);');
  });

  it("is rejected at the database too, on insert and on update", () => {
    expect(guard).toContain("if new.learner_id = auth.uid() then");
    expect(guard).toContain("before insert or update on public.quiz_attempts");
    expect(guard).toContain("before insert or update on public.submissions");
  });

  it("displays the server's score, never one computed in the browser", () => {
    expect(ui).toContain("const data = response.data as { score: number; markable: number };");
    expect(ui).toContain("setResult({ score: data.score, markable: data.markable });");
    // No local marking: the client has no answers to mark against.
    expect(ui).not.toMatch(/markAttempt|toLowerCase\(\) === /);
  });
});

describe("grading is the instructor's, and only on their own course", () => {
  it("verifies course ownership server-side before writing through the service role", () => {
    expect(server).toContain('return { ok: false, error: "Only the course\'s instructor can grade this.", code: "FORBIDDEN" };');
    expect(server).toContain('return { ok: false, error: "You cannot grade your own submission.", code: "FORBIDDEN" };');
  });

  it("lets the read policy decide who sees whose submissions, rather than branching in the query", () => {
    expect(rls).toMatch(/create policy submissions_own_or_course_owner on public\.submissions for select using \(learner_id = auth\.uid\(\) or exists/);
    expect(server).toContain(".eq(\"assignments.course_id\", input.courseId)");
  });

  it("tells a non-owner what they are actually looking at", () => {
    expect(ui).toContain("{payload && !payload.isCourseOwner && <ResultState state=\"forbidden\" message={t(\"assess.notCourseOwner\")} />}");
    expect(ui).toContain("{state === \"ready\" && payload?.isCourseOwner && rows.map((submission) => (");
  });

  it("reads only the display name, and only after ownership is confirmed", () => {
    expect(server).toContain("if (!isCourseOwner || !rows.length) return { ok: true, data: { submissions: rows, isCourseOwner } };");
    expect(server).toContain('const { data: people } = await admin.from("profiles").select("id,display_name").in("id", learnerIds);');
    // Nothing else about the learner is read.
    expect(server).not.toMatch(/select\("id,display_name,[^"]*email/);
  });

  it("validates the score before sending, and the server validates it again", () => {
    expect(ui).toContain("if (raw.trim() === \"\" || !Number.isFinite(score) || score < 0 || score > 100) {");
    expect(server).toContain("if (!Number.isFinite(input.score) || input.score < 0 || input.score > 100) {");
  });
});

describe("marking rule", () => {
  it("scores exact matches, case- and space-insensitively", () => {
    const questions = [{ id: "a", answer: "Alif" }, { id: "b", answer: "Ba" }];
    expect(markAttempt(questions, { a: " alif ", b: "Ba" })).toEqual({ score: 100, markable: 2 });
    expect(markAttempt(questions, { a: "alif", b: "wrong" })).toEqual({ score: 50, markable: 2 });
  });

  it("counts only questions that can be marked at all", () => {
    expect(markAttempt([{ id: "a", answer: "x" }, { prompt: "no id" }], { a: "x" })).toEqual({ score: 100, markable: 1 });
    expect(markAttempt([{ prompt: "unmarkable" }], {})).toEqual({ score: 0, markable: 0 });
  });
});

describe("every state is distinct", () => {
  it("reports a failure on either list rather than letting the other's success hide it", () => {
    expect(ui).toContain('const problem = [quizState, assignmentState].find((state) => state !== "ready" && state !== "empty");');
    expect(ui).toContain('const bothEmpty = quizState === "empty" && assignmentState === "empty";');
  });

  it("derives grading state through the shared helper", () => {
    expect(ui).toContain('const state: State = base === "ready" && !rows.length ? "empty" : base;');
  });

  it("offers retry wherever retrying can help", () => {
    expect(ui).toContain("onRetry={refetchAll}");
    expect(ui).toContain("onRetry={() => query.refetch()}");
    expect(ui.match(/\{t\("common\.retry"\)\}/g)?.length).toBe(2);
  });

  it("blocks an incomplete attempt and an empty submission", () => {
    expect(ui).toContain("const complete = questions.length > 0 && answered === questions.length;");
    expect(ui).toContain("disabled={!complete || submit.isPending}");
    expect(ui).toContain("disabled={!body.trim() || submit.isPending}");
  });

  it("closes a graded submission instead of silently invalidating the grade", () => {
    expect(ui).toContain('const graded = submission?.status === "graded" || submission?.score !== null && submission?.score !== undefined;');
    expect(ui).toContain('t("assess.gradedLocked")');
  });

  it("treats a signed-out visitor as forbidden on both screens", () => {
    expect(ui.match(/if \(!signedIn\) \{/g)?.length).toBe(2);
  });

  it("says attachments are not connected rather than offering a control that does nothing", () => {
    expect(ui).toContain('t("assess.attachmentsNotConnected")');
  });
});

describe("translation and direction", () => {
  it("translates every new string in all three locales", () => {
    for (const key of ["assess.title", "assess.start", "assess.submitAttempt", "assess.scored", "assess.yourGrade", "assess.gradingTitle", "assess.noSubmissions", "assess.notCourseOwner", "assess.status.graded"]) {
      expect(catalog.match(new RegExp(`"${key.replace(/\./g, "\\.")}":`, "g"))?.length, `${key} needs en/ur/ar`).toBe(3);
    }
  });

  it("uses logical spacing, mirrors directional icons, and isolates numbers and dates", () => {
    expect(ui).not.toMatch(/\b(ml|mr|pl|pr)-\d/);
    expect(ui).toContain('className="rtl:rotate-180"');
    expect(ui.match(/icon-directional/g)?.length).toBe(2);
    expect(ui.match(/ltr-embed/g)?.length).toBe(3);
  });
});
