import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const authContext = readFileSync(new URL("../client/src/contexts/AuthContext.tsx", import.meta.url), "utf8");
const router = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const core = readFileSync(new URL("./supabase-core.ts", import.meta.url), "utf8");
const catalog = readFileSync(new URL("../client/src/i18n/catalog.ts", import.meta.url), "utf8");

// Regression cover for the onboarding completion bug: Finish onboarding ran a handler whose
// three bare `return` statements swallowed validation, mutation failure and thrown errors, so
// the button appeared to do nothing and the learner never reached a dashboard.
const onboardingPage = app.slice(app.indexOf("function OnboardingPage"), app.indexOf("function OnboardingPage") + 12000);

describe("onboarding completion", () => {
  it("never fails silently: every guard sets a visible error", () => {
    // The original bug: `if (!profile.fullName || ... ) return;` with no user-facing state.
    expect(onboardingPage).not.toMatch(/\|\| !currentSession\) return;/);
    expect(onboardingPage).toContain('setError(t("onboarding.errorStepOne"))');
    expect(onboardingPage).toContain('setError(t("onboarding.errorConsent"))');
    expect(onboardingPage).toContain('setError(t("onboarding.errorSession"))');
    // A rejected mutation must surface its message rather than being swallowed by `catch { return; }`.
    expect(onboardingPage).not.toContain("catch { return; }");
    expect(onboardingPage).toContain("catch (cause)");
    expect(onboardingPage).toContain('setError(result.error || t("common.error"))');
  });

  it("renders the error to the user with an alert role", () => {
    expect(onboardingPage).toContain('role="alert"');
    expect(onboardingPage).toContain('data-testid="onboarding-error"');
  });

  it("validates step one before advancing instead of relying on unmounted required inputs", () => {
    // Step 1 inputs are unmounted on step 2, so browser `required` validation cannot catch them.
    expect(onboardingPage).toContain("const stepOneMissing =");
    expect(onboardingPage).toContain("goToStepTwo");
    expect(onboardingPage).not.toContain('onClick={() => setStep(2)}');
  });

  it("shows a disabled saving state while the mutation is in flight", () => {
    expect(onboardingPage).toContain("const [saving, setSaving] = useState(false)");
    expect(onboardingPage).toContain("setSaving(true)");
    expect(onboardingPage).toContain("finally { setSaving(false); }");
    expect(onboardingPage).toContain('disabled={saving}');
    expect(onboardingPage).toContain('t("onboarding.saving")');
  });

  it("persists through the server-owned identity and never sends a client user id or role", () => {
    expect(onboardingPage).toContain("profileMutation.mutateAsync");
    expect(router).toContain("updateProfile: supabaseOnlyProcedure");
    expect(router).toContain("updateOwnProfile(ctx.supabaseIdentity, input)");
    // The accepted input shape carries no identity or role fields.
    const updateProfileInput = router.slice(router.indexOf("updateProfile: supabaseOnlyProcedure"), router.indexOf("updateProfile: supabaseOnlyProcedure") + 320);
    expect(updateProfileInput).not.toMatch(/userId|user_id|\brole\b/);
    // The server scopes the write to its own resolved identity.
    expect(core).toContain('.eq("id", identity.id)');
    expect(core).toContain("onboarding_completed: true");
  });

  it("redirects using the server-resolved role, not the client route parameter", () => {
    expect(authContext).toContain("const nextRole = publicRole(roleFromRoles(refreshed.roles))");
    expect(authContext).toContain("next: `/dashboard/${nextRole}`");
    expect(onboardingPage).toContain("const completion = await completeOnboarding(profile)");
    expect(onboardingPage).toContain("setLocation(returnTo || completion.next)");
    // The old hardcoded client-role redirect must be gone.
    expect(onboardingPage).not.toContain("setLocation(returnTo || `/dashboard/${role}`)");
  });

  it("confirms the profile was persisted before navigating so the guard cannot bounce back", () => {
    // ProtectedRoute sends users back to /onboarding when onboarding_completed is false.
    expect(app).toContain("else if (!currentSession.onboardingCompleted) setLocation(`/onboarding/${role}`)");
    expect(authContext).toContain("if (!refreshed.profile?.onboarding_completed) return { ok: false");
    expect(authContext).toContain("await profilesQuery.refetch()");
  });

  it("keeps onboarding behind authentication and role guards", () => {
    expect(app).toContain('path="/onboarding/learner">{() => <AuthenticatedRoute>');
    expect(app).toContain('path="/onboarding/instructor">{() => <AuthenticatedRoute>');
    expect(app).toContain("if (!currentSession) setLocation(`/login?returnTo=");
    expect(app).toContain("else if (currentSession.role !== role) setLocation(`/dashboard/${currentSession.role}`)");
  });

  it("does not use localStorage as production onboarding persistence", () => {
    const models = readFileSync(new URL("../client/src/lib/auth-models.ts", import.meta.url), "utf8");
    expect(models).toContain("if (isClientFixtureMode) localStorage.setItem");
    expect(models).toContain("if (!isClientFixtureMode) return null");
  });

  it("translates every new onboarding state into all three locales", () => {
    for (const key of ["onboarding.saving", "onboarding.errorStepOne", "onboarding.errorConsent", "onboarding.errorSession"]) {
      expect(catalog.split(`"${key}":`).length - 1).toBe(3);
    }
  });
});

describe("onboarding role selection", () => {
  it("follows the server-resolved role instead of the client-chosen route", () => {
    // Picking "Instructor" at signup only sets requested_public_role metadata; the signup trigger
    // always grants 'learner'. The onboarding page must therefore follow the resolved session role.
    expect(onboardingPage).toContain("if (currentSession && currentSession.role !== role) setLocation(`/onboarding/${currentSession.role}`)");
  });

  it("does not let the client grant itself the instructor role", () => {
    const trigger = readFileSync(new URL("../supabase/migrations/0002_auth_and_rls.sql", import.meta.url), "utf8");
    expect(trigger).toContain("insert into public.user_roles (user_id, role) values (new.id, 'learner')");
    expect(trigger).not.toMatch(/requested_public_role/);
    expect(authContext).toContain("requested_public_role");
    // The client may request a role, but never writes user_roles itself.
    expect(authContext).not.toMatch(/from\(["']user_roles["']\)\s*\.\s*(insert|upsert|update)/);
  });
});
