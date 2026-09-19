/**
 * "Choose the shape" — the first step of an invite.
 *
 * Two things were wrong with it. The Instructor box said "No instructor selected" whoever the
 * learner had clicked: the profile query was asked for the `instructorSlug` *prop*, and the route
 * renders `<TrialRequestFlow/>` with no props at all, so it always ran with an empty slug. And the
 * subject was a read-only box showing `courseTitle`, a field that is never submitted — the request
 * carried the hardcoded default instead, whatever the box said.
 *
 * The box is now a chooser over the whole catalogue with an "Other" option the learner can write
 * into, and the value it holds is the value that is sent.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { categories } from "../client/src/lib/lms-data";

const flow = readFileSync(new URL("../client/src/components/SchedulingExperience.tsx", import.meta.url), "utf8");
const desk = readFileSync(new URL("../client/src/components/LearnerTutorDesk.tsx", import.meta.url), "utf8");
const routers = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const catalog = readFileSync(new URL("../client/src/i18n/catalog.ts", import.meta.url), "utf8");

describe("the teacher the learner clicked is the teacher named", () => {
  it("asks for the slug that arrived, not the prop the route never passes", () => {
    expect(flow).toContain("const activeSlug = draft.instructorSlug.trim();");
    expect(flow).toContain("instructorBySlug.useQuery({ slug: activeSlug }");
    // The old spelling would silently return to an empty slug.
    expect(flow).not.toContain("instructorBySlug.useQuery({ slug: instructorSlug }");
  });

  it("seeds the draft from the query string at mount, so there is no empty first paint", () => {
    expect(flow).toContain('instructorSlug: instructorSlug || searchParam("instructorSlug")');
  });

  it("does not ask the server for nobody", () => {
    expect(flow).toContain("enabled: realMode && activeSlug.length > 0");
  });

  it("is reached by a link carrying that very parameter", () => {
    // The desk's invite button and this page have to agree on the name, or the box is empty again.
    expect(desk).toContain("/trial/request?instructorSlug=");
  });

  it("says what to do when there genuinely is no teacher, instead of a bare placeholder", () => {
    expect(flow).toContain('t("trial.instructorMissing")');
    expect(flow).toContain('instructorQuery.isLoading ? t("trial.instructorLoading") : t("trial.noInstructor")');
  });
});

describe("the subject is chosen, not assumed", () => {
  it("offers the whole catalogue", () => {
    // Ten, as the site has carried since the categories were written.
    expect(categories).toHaveLength(10);
    expect(flow).toContain("{categories.map((name) => <option key={name} value={name}>{name}</option>)}");
  });

  it("lets the learner write their own", () => {
    expect(flow).toContain('<option value={OTHER_SUBJECT}>{t("trial.subjectOther")}</option>');
    expect(flow).toContain('{isOtherSubject && <Field label={t("trial.subjectOwnLabel")}>');
    expect(flow).toContain('onChange={(e) => update("subject", e.target.value)}');
  });

  it("keeps a subject the catalogue does not list rather than snapping it back", () => {
    expect(flow).toContain("const isOtherSubject = ownSubject || (draft.subject.trim() !== \"\" && !categories.includes(draft.subject));");
  });

  it("caps the free text where the server caps it", () => {
    /*
     * Read from `createTrial` specifically, not from the first `subject` in the file. A second
     * procedure with its own subject — the contact form's, capped at 160 — was added later and a
     * loose match silently started checking the wrong number.
     */
    const createTrial = routers.slice(routers.indexOf("createTrial: supabaseOnlyProcedure"));
    const max = createTrial.match(/subject: z\.string\(\)\.min\(1\)\.max\((\d+)\)/);
    expect(max, "createTrial must still validate subject").toBeTruthy();
    expect(flow).toContain(`maxLength={${max![1]}}`);
  });

  it("sends the value the chooser holds, and reviews the same one", () => {
    expect(flow).toContain("subject: draft.subject,");
    expect(flow).toContain('<p><strong>Subject:</strong> {draft.subject || "—"}</p>');
    // `courseTitle` is display-only and was never submitted; showing it here read as a promise.
    expect(flow).not.toContain("{draft.courseTitle || draft.subject}");
  });

  it("will not let an empty subject leave the step or reach the server", () => {
    expect(flow).toContain('if (step === 1 && !draft.subject.trim()) { setError(t("trial.subjectRequired")); return; }');
    expect(flow).toContain('if (!draft.subject.trim()) { setError(t("trial.subjectRequired")); setStep(1); return; }');
  });

  it("opens on a real option rather than a value missing from the list", () => {
    expect(flow).toContain("subject: initialSubject(courseTitle)");
    expect(flow).toContain("return categories.find((name) => name.toLowerCase() === title.toLowerCase()) ?? title;");
  });
});

describe("the step speaks all three languages", () => {
  it("has every new string in en, ur and ar", () => {
    const keys = [
      "trial.stepShape", "trial.instructor", "trial.instructorLoading", "trial.noInstructor",
      "trial.instructorMissing", "trial.subjectLabel", "trial.subjectOther", "trial.subjectOwnLabel",
      "trial.subjectOwnPlaceholder", "trial.subjectRequired", "trial.classType", "trial.duration",
    ];
    for (const key of keys) {
      expect(catalog.match(new RegExp(`"${key.replace(".", "\.")}":`, "g")), key).toHaveLength(3);
    }
  });

  it("no longer hardcodes the labels it replaced", () => {
    for (const literal of ['label="Instructor"', 'label="Course or subject"', 'label="Duration"', '>Choose the shape<']) {
      expect(flow, literal).not.toContain(literal);
    }
  });
});
