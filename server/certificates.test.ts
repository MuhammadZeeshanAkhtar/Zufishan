import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decideEligibility, verifyByCode } from "./certificates";

const server = readFileSync(new URL("./certificates.ts", import.meta.url), "utf8");
const ui = readFileSync(new URL("../client/src/components/CertificatesExperience.tsx", import.meta.url), "utf8");
const routers = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../client/src/index.css", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/0021_certificate_rule_and_verification_code.sql", import.meta.url), "utf8");
const rls = readFileSync(new URL("../supabase/migrations/0002_auth_and_rls.sql", import.meta.url), "utf8");
const catalog = readFileSync(new URL("../client/src/i18n/catalog.ts", import.meta.url), "utf8");

const lessons = (n: number) => Array.from({ length: n }, (_, i) => `lesson-${i}`);

describe("the agreed rule, as behaviour", () => {
  it("issues when every lesson is done and the course has no assessment", () => {
    const result = decideEligibility({ publishedLessonIds: lessons(3), completedLessonIds: lessons(3), passMark: null, assessmentScores: [] });
    expect(result).toMatchObject({ eligible: true, reason: "eligible", hasAssessment: false });
  });

  it("refuses while any lesson is outstanding, and says how many", () => {
    const result = decideEligibility({ publishedLessonIds: lessons(4), completedLessonIds: lessons(2), passMark: null, assessmentScores: [] });
    expect(result).toMatchObject({ eligible: false, reason: "lessons_incomplete", lessonsCompleted: 2, lessonsTotal: 4 });
  });

  it("issues when the assessment average meets the pass mark", () => {
    const result = decideEligibility({ publishedLessonIds: lessons(2), completedLessonIds: lessons(2), passMark: 70, assessmentScores: [80, 60] });
    expect(result).toMatchObject({ eligible: true, reason: "eligible", averageScore: 70 });
  });

  it("refuses when the average falls below the pass mark", () => {
    const result = decideEligibility({ publishedLessonIds: lessons(2), completedLessonIds: lessons(2), passMark: 70, assessmentScores: [80, 50] });
    expect(result).toMatchObject({ eligible: false, reason: "assessment_failed", averageScore: 65 });
  });

  it("treats an unattempted assessment as unfinished, not as a zero", () => {
    // Scoring it 0 would average 40 and read as "failed", which is a different and wrong sentence.
    const result = decideEligibility({ publishedLessonIds: lessons(1), completedLessonIds: lessons(1), passMark: 70, assessmentScores: [80, null] });
    expect(result).toMatchObject({ eligible: false, reason: "assessment_incomplete", assessmentsScored: 1, assessmentsTotal: 2 });
    expect(result.averageScore).toBe(80);
  });

  it("refuses rather than inventing a pass mark when the instructor has not set one", () => {
    const result = decideEligibility({ publishedLessonIds: lessons(1), completedLessonIds: lessons(1), passMark: null, assessmentScores: [95] });
    expect(result).toMatchObject({ eligible: false, reason: "pass_mark_not_set" });
  });

  it("never issues for a course with nothing published in it", () => {
    const result = decideEligibility({ publishedLessonIds: [], completedLessonIds: [], passMark: null, assessmentScores: [] });
    expect(result).toMatchObject({ eligible: false, reason: "no_lessons" });
  });

  it("cannot be satisfied by completing lessons that are not part of the course", () => {
    const result = decideEligibility({ publishedLessonIds: ["a", "b"], completedLessonIds: ["a", "x", "y", "z"], passMark: null, assessmentScores: [] });
    expect(result).toMatchObject({ eligible: false, reason: "lessons_incomplete", lessonsCompleted: 1 });
  });

  it("counts a lesson once, however many progress rows name it", () => {
    const result = decideEligibility({ publishedLessonIds: ["a", "b"], completedLessonIds: ["a", "a", "a"], passMark: null, assessmentScores: [] });
    expect(result.lessonsCompleted).toBe(1);
  });
});

describe("issuance cannot be reached without the rule", () => {
  it("re-decides eligibility on the server before writing", () => {
    expect(server).toContain("const decision = await getOwnEligibility(identity, input);");
    expect(server).toContain('return { ok: false, error: "This course is not complete, so no certificate can be issued.", code: "FORBIDDEN" };');
  });

  it("writes through the service role, because every certificate write is admin-only", () => {
    expect(rls).toContain("create policy certificates_admin_write on public.certificates for all using (public.is_admin_user()) with check (public.is_admin_user());");
    expect(server).toContain("const admin = getSupabaseAdminClient();");
    // The policy is supplemented, never rewritten.
    expect(migration).not.toMatch(/create policy|alter policy|drop policy/);
  });

  it("reads the learner's own rows on the learner's own client, so it cannot be aimed elsewhere", () => {
    const body = server.slice(server.indexOf("export async function getOwnEligibility"), server.indexOf("function newVerificationCode"));
    expect(body).toContain("getSupabaseUserClient(identity.accessToken)");
    expect(body).not.toContain("getSupabaseAdminClient");
    expect(body).toContain('.eq("learner_id", identity.id)');
  });

  it("cannot produce two certificates for one course", () => {
    expect(rls).toBeTruthy();
    expect(server).toContain('{ onConflict: "learner_id,course_id" }');
    expect(server).toContain('if (existing && existing.status === "issued" && existing.verification_code) {');
  });

  it("refuses to reissue a revoked certificate", () => {
    expect(server).toContain('if (existing && existing.status === "revoked") {');
  });

  it("counts only published lessons", () => {
    expect(server).toContain('.eq("status", "published");');
  });
});

describe("public verification exposes the minimum and resists enumeration", () => {
  it("rejects a malformed code without touching the database", async () => {
    for (const code of ["", "abc", "12345", "NI-1234", "'; drop table certificates; --", "NI-AAAAA-AAAAA-AAAAA"]) {
      const result = await verifyByCode({ code, clientKey: `malformed-${code}` });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data).toEqual({ valid: false, status: "unknown", verificationCode: null, courseTitle: null, learnerName: null, issuedAt: null });
    }
  });

  it("answers an unknown but well-formed code with the same empty shape", async () => {
    const result = await verifyByCode({ code: "NI-ABCDE-FGHJK-MNPQR-STUVW", clientKey: "unknown-code-probe" });
    // With no admin client configured in this environment the call reports setup rather than
    // inventing an answer; either way it must never claim a certificate exists.
    if (result.ok) expect(result.data.valid).toBe(false);
    else expect(result.code).toBe("SETUP_NEEDED");
  });

  it("throttles repeated attempts from one caller", async () => {
    const key = `throttle-probe-${Date.now()}`;
    let refused = false;
    for (let i = 0; i < 30; i += 1) {
      const result = await verifyByCode({ code: "NI-ABCDE-FGHJK-MNPQR-STUVW", clientKey: key });
      if (!result.ok && result.code === "CONFLICT") { refused = true; break; }
    }
    expect(refused, "a scripted caller must eventually be refused").toBe(true);
  });

  it("returns six fields and no private data", () => {
    expect(server).toContain("export type VerificationRecord = {");
    for (const field of ["valid", "status", "verificationCode", "courseTitle", "learnerName", "issuedAt"]) {
      expect(server).toContain(`${field}:`);
    }
    // Nothing in the verification select reaches for private columns.
    const select = server.slice(server.indexOf("export async function verifyByCode"));
    expect(select).toContain('.select("status,issued_at,verification_code,courses!inner(title),profiles!inner(display_name)")');
    expect(select).not.toMatch(/email|phone|full_name|scores?|lesson|enrol/i);
  });

  it("looks up the random code, never a row id", () => {
    // Bounded to verifyByCode itself: setCoursePassMark below it legitimately keys on a course id.
    const select = server.slice(server.indexOf("export async function verifyByCode"), server.indexOf("export async function setCoursePassMark"));
    expect(select).toContain('.eq("verification_code", code)');
    expect(select).not.toMatch(/\.eq\("id",/);
    expect(migration).toContain("Never the row id");
  });

  it("generates the code from a cryptographic source, in a shape the lookup pins", () => {
    expect(server).toContain('import { randomBytes } from "node:crypto";');
    expect(server).toContain("const bytes = randomBytes(20);");
    expect(server).toContain("/^NI-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}$/");
    // No ambiguous glyphs, so a code read off paper is not mistyped into a different one.
    expect(server).toContain('const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";');
  });

  it("is honest in the code about what the throttle is not", () => {
    expect(server).toContain("this is per-process and in memory");
  });
});

describe("routes, states and print", () => {
  it("registers all five procedures, with verification public", () => {
    for (const proc of ["certificateEligibility", "myCertificates", "issueCertificate", "setCoursePassMark"]) {
      expect(routers).toContain(`${proc}: supabaseOnlyProcedure`);
    }
    expect(routers).toContain("verifyCertificate: publicProcedure");
  });

  it("routes verification without a ProtectedRoute, so no account is needed", () => {
    expect(app).toContain('<Route path="/verify/:code">{(params) => <VerifyCertificatePage code={params.code}/>}</Route>');
    expect(app).toContain('<Route path="/verify">{() => <VerifyCertificatePage/>}</Route>');
    expect(app).not.toMatch(/<Route path="\/verify[^>]*><ProtectedRoute/);
  });

  it("puts the specific certificate route before the list", () => {
    expect(app.indexOf("/dashboard/learner/certificates/:certificateId")).toBeLessThan(app.indexOf('<Route path="/dashboard/learner/certificates">'));
  });

  it("names each ineligible reason instead of one flat refusal", () => {
    for (const key of ["cert.reason.noLessons", "cert.reason.lessonsIncomplete", "cert.reason.passMarkNotSet", "cert.reason.assessmentIncomplete", "cert.reason.assessmentFailed"]) {
      expect(catalog.match(new RegExp(`"${key.replace(/\./g, "\\.")}":`, "g"))?.length, `${key} needs en/ur/ar`).toBe(3);
    }
    // A missing pass mark is the instructor's to fix, so it reads as setup, not as a refusal.
    expect(ui).toContain('const tone: State = data.reason === "pass_mark_not_set" || data.reason === "no_lessons" ? "setup" : "empty";');
  });

  it("never renders a revoked or foreign certificate as a certificate", () => {
    expect(ui).toContain('if (row.status !== "issued") {');
    expect(ui).toContain('state={state === "ready" || state === "empty" ? "forbidden" : state}');
    expect(ui).toContain('t("cert.notYours")');
  });

  it("prints the sheet alone, at real page dimensions", () => {
    expect(css).toContain("@page { size: A4 landscape; margin: 0; }");
    expect(css).toContain(".no-print,");
    expect(ui).toContain('<div className="no-print border-b');
    expect(ui).toContain("onClick={() => window.print()}");
    expect(css).toContain("width: 297mm;");
    expect(css).toContain("height: 210mm;");
    // Without this the browser drops the gold rule and the paper tint.
    expect(css).toContain("print-color-adjust: exact;");
  });

  it("prints the same code the public lookup accepts", () => {
    expect(ui).toContain('<p className="certificate-value certificate-code">{row.verification_code}</p>');
    expect(ui).toContain("const verifyUrl = `${typeof window === \"undefined\" ? \"\" : window.location.origin}/verify/${row.verification_code ?? \"\"}`;");
  });

  it("shows a name on the certificate, never an email", () => {
    expect(ui).toContain('<p className="certificate-name">{row.profiles?.display_name || ""}</p>');
    expect(ui).not.toMatch(/certificate-name[^>]*>\{[^}]*email/);
  });
});

describe("the migration is additive and invents nothing", () => {
  it("adds a nullable pass mark with no default", () => {
    expect(migration).toContain("add column if not exists pass_mark smallint;");
    expect(migration).not.toMatch(/pass_mark smallint[^;]*default/);
    expect(migration).toContain("check (pass_mark is null or (pass_mark between 0 and 100))");
  });

  it("adds the code with a unique index that tolerates existing rows", () => {
    expect(migration).toContain("create unique index if not exists certificates_verification_code_key");
    expect(migration).toContain("where verification_code is not null;");
  });

  it("drops or alters nothing", () => {
    expect(migration.toLowerCase()).not.toMatch(/\b(drop table|drop column|delete from|truncate|alter column)\b/);
  });
});
