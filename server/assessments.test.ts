import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { markAttempt } from "./assessments";

const assessments = readFileSync(new URL("./assessments.ts", import.meta.url), "utf8");
const guard = readFileSync(new URL("../supabase/migrations/0016_scores_are_not_self_assigned.sql", import.meta.url), "utf8");
const rls = readFileSync(new URL("../supabase/migrations/0002_auth_and_rls.sql", import.meta.url), "utf8");
const routers = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");

describe("marking is explicit and predictable", () => {
  const questions = [
    { id: "q1", answer: "Fatiha" },
    { id: "q2", answer: "Baqarah" },
    { id: "q3", answer: "Ikhlas" },
  ];

  it("scores exact matches, ignoring case and surrounding space", () => {
    expect(markAttempt(questions, { q1: "Fatiha", q2: "  baqarah ", q3: "Ikhlas" })).toEqual({ score: 100, markable: 3 });
    expect(markAttempt(questions, { q1: "Fatiha", q2: "wrong", q3: "wrong" })).toEqual({ score: 33.3, markable: 3 });
    expect(markAttempt(questions, {})).toEqual({ score: 0, markable: 3 });
  });

  it("ignores questions that carry no answer to mark against", () => {
    const mixed = [{ id: "q1", answer: "yes" }, { id: "q2", prompt: "essay" }];
    expect(markAttempt(mixed, { q1: "yes", q2: "anything" })).toEqual({ score: 100, markable: 1 });
  });

  it("returns zero rather than dividing by nothing when a quiz is unmarkable", () => {
    expect(markAttempt([{ prompt: "no id" }], { a: "b" })).toEqual({ score: 0, markable: 0 });
    expect(markAttempt([], {})).toEqual({ score: 0, markable: 0 });
  });

  it("does not credit a non-string answer", () => {
    expect(markAttempt(questions, { q1: 1 as never, q2: null as never, q3: true as never }).score).toBe(0);
  });
});

describe("a learner cannot mark their own work", () => {
  it("names why the policies alone are not enough", () => {
    // Both are right about ownership and silent about columns.
    expect(rls).toContain("create policy quiz_attempts_own on public.quiz_attempts for all using (learner_id = auth.uid())");
    expect(rls).toContain("create policy submissions_learner_write on public.submissions for all using (learner_id = auth.uid())");
  });

  it("blocks a self-assigned score at the database", () => {
    expect(guard).toContain("if new.learner_id = auth.uid() then");
    expect(guard).toContain("42501");
    expect(guard).toContain("before insert or update on public.quiz_attempts");
    expect(guard).toContain("before insert or update on public.submissions");
  });

  it("only reacts when the score actually changes", () => {
    expect(guard).toContain("if new_score is distinct from old_score then");
  });

  it("leaves the marking service and graders able to write", () => {
    expect(guard).toContain("if auth.uid() is null then");
    expect(guard).toContain("if public.is_admin_user() or public.is_moderator_user() then");
  });

  it("adds a constraint without touching the policies", () => {
    expect(guard).not.toMatch(/create policy|alter policy|drop policy/i);
  });
});

describe("scores are written by the server, never accepted from the learner", () => {
  it("marks the attempt through the service role", () => {
    expect(assessments).toContain('admin.from("quiz_attempts").update({ score })');
  });

  it("does not accept a score on submission", () => {
    const submit = assessments.slice(assessments.indexOf("export async function submitAssignment"));
    expect(submit.slice(0, 900)).not.toMatch(/score:/);
  });

  it("verifies course ownership before an instructor grades", () => {
    expect(assessments).toContain('if (String(course?.instructor_id ?? "") !== identity.id) {');
    expect(assessments).toContain("You cannot grade your own submission.");
  });
});

describe("stored answers never reach a learner", () => {
  it("strips answers from a quiz for anyone but the course owner", () => {
    expect(assessments).toContain("questions: questions.map(({ answer: _answer, ...rest }) => rest)");
  });
});

describe("procedures run on the verified identity", () => {
  it("registers the assessment surface", () => {
    for (const proc of ["courseQuizzes", "createQuiz", "submitQuizAttempt", "courseAssignments", "createAssignment", "submitAssignment", "gradeSubmission"]) {
      expect(routers, `${proc} must be registered`).toContain(`${proc}:`);
    }
    expect(routers).toContain("gradeSubmission(ctx.supabaseIdentity, input)");
  });
});
