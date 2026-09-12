import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AccountRole, OnboardingProfile, PublicRole } from "../lib/auth-models";
import { clearOnboardingDraft, demoAuthNotice, getOnboardingDraft, isClientFixtureMode, isPublicSignupRole, normalizeEmail, saveOnboardingDraft, type LoginContext } from "../lib/auth-models";
import { isReservedDemoClassroomEmail } from "../lib/classroom-data";
import { supabaseClient } from "../lib/supabase-client";
import { isGoogleEnabled, isProviderDisabled, oauthRedirectTarget, type OAuthIntent } from "../lib/auth-oauth";
import { authErrorCode, type AuthErrorCode } from "../lib/auth-errors";
import type { Session } from "@supabase/supabase-js";
import { trpc } from "../lib/trpc";

// `role` is nullable because an account can genuinely hold no public role — an
// account created outside the signup form, or one whose grant failed. Guessing
// "learner" there is precisely the bug this replaced.
type AuthSession = { email: string; role: PublicRole | null; onboardingCompleted: boolean; userId: string; expiresAt?: number };
// Onboarding completion resolves the destination from the server-owned role and the persisted
// onboarding flag, so the caller never has to guess a redirect from client-held state.
export type OnboardingResult = { ok: true; next: string; role: PublicRole } | { ok: false; error: string };
/**
 * `isAdmin` and `roles` are the SERVER-resolved answer, carried back so the login
 * screen can tell a role mismatch ("you chose Board/Admin, this account is not")
 * apart from a wrong password. They are for the message only — the destination is
 * already decided in `next`.
 */
/**
 * `decision` is the server's verdict as a CODE, not a sentence.
 *
 * The exact wording each refusal shows lives in the translation catalogue, so
 * the same decision reads correctly in English, Urdu and Arabic and no
 * user-facing string has to travel in a response body. "network" is the one
 * client-side code: the check itself could not be reached.
 */
type AuthDecision =
  | "ok" | "admin_reserved" | "not_admin" | "already_learner"
  | "already_instructor" | "duplicate_email" | "role_not_assigned" | "network"
  // Google is offered but not configured on this Supabase project. A distinct
  // code because the fix is an operator's, not the reader's, and because it must
  // never be mistaken for a sign-in that worked.
  | "oauth_disabled" | "oauth_failed";
type AuthResult = { ok: boolean; error?: string; errorCode?: AuthErrorCode; next?: string; needsVerification?: boolean; isAdmin?: boolean; roles?: AccountRole[]; decision?: AuthDecision };
type AuthContextValue = {
  currentUser: { email: string; id: string; name?: string } | null;
  user: { email: string; id: string; name?: string } | null;
  currentSession: AuthSession | null;
  currentProfile: OnboardingProfile | null;
  currentRoles: AccountRole[];
  isLoading: boolean;
  loading: boolean;
  isAuthenticated: boolean;
  roleResolved: boolean;
  authError: string | null;
  error: string | null;
  logout: () => Promise<void>;
  signUp: (email: string, password: string, role: PublicRole) => Promise<AuthResult>;
  signIn: (email: string, password: string, context?: LoginContext) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<AuthResult>;
  updatePassword: (password: string) => Promise<AuthResult>;
  completeOnboarding: (profile: OnboardingProfile) => Promise<OnboardingResult>;
  /**
   * Starts a real Google sign-in. Resolves only when the redirect could NOT be
   * started — a success never returns, because the tab has already left.
   */
  signInWithGoogle: (intent: OAuthIntent) => Promise<AuthResult>;
  /**
   * Where an already-authenticated identity belongs, decided entirely by the
   * server. Used by the OAuth return, which has a session but no form state.
   */
  resolveAfterOAuth: (intent: OAuthIntent | null) => Promise<AuthResult>;
  refreshProfile: () => Promise<void>;
  hasRole: (role: AccountRole) => boolean;
  hasPermission: (permission: string) => boolean;
};
const AuthContext = createContext<AuthContextValue | null>(null);

type CoreProfiles = { profile: Record<string, unknown> | null; learnerProfile: Record<string, unknown> | null; instructorProfile: Record<string, unknown> | null; roles: Array<{ role?: string }> };
const coreProfiles = (value: unknown): CoreProfiles | null => value && typeof value === "object" ? value as CoreProfiles : null;
const roleFromRoles = (roles: Array<{ role?: string }> | null | undefined): AccountRole[] => {
  const allowed: AccountRole[] = ["learner", "instructor", "moderator", "admin", "advisory_board", "super_admin"];
  return Array.from(new Set((roles ?? []).map((row) => row.role).filter((role): role is AccountRole => Boolean(role && allowed.includes(role as AccountRole)))));
};
/**
 * The public role an account holds, or null.
 *
 * This used to end `: "learner"`, which meant an account with no role at all —
 * or one whose role lookup failed — read as a learner everywhere. That is the
 * client half of the bug that showed every user as a Learner. A missing role is
 * now missing, and every caller has to say what it does about that.
 */
const publicRole = (roles: AccountRole[]): PublicRole | null =>
  roles.includes("instructor") ? "instructor" : roles.includes("learner") ? "learner" : null;
/**
 * Where an authenticated account belongs, decided by its granted roles.
 *
 * Admin outranks the rest: an account holding admin lands in the operations
 * centre regardless of what the login form had selected. The form never appears
 * in this decision — it only shapes the message when the two disagree.
 */
const homeForRoles = (roles: AccountRole[]): string | null => {
  if (roles.some((role) => role === "admin" || role === "super_admin")) return "/admin";
  const held = publicRole(roles);
  return held ? `/dashboard/${held}` : null;
};
const profileToOnboarding = (profile: Record<string, unknown> | null | undefined, role: PublicRole): OnboardingProfile | null => {
  if (!profile) return null;
  return {
    role,
    gender: String(profile.gender ?? ""),
    fullName: String(profile.full_name ?? ""),
    displayName: String(profile.display_name ?? ""),
    countryCity: "",
    timezone: "",
    preferredLanguage: profile.preferred_language === "Urdu" ? "Urdu" : profile.preferred_language === "Arabic" ? "Arabic" : "English",
    subjects: [],
    level: "Beginner",
    goal: "",
    classFormat: "One-to-one",
    availability: "",
    budget: "",
    visibility: "private",
    consent: Boolean(profile.onboarding_completed),
  };
};
const sessionModel = (session: Session, role: PublicRole | null, onboardingCompleted: boolean): AuthSession => ({
  userId: session.user.id,
  email: session.user.email || "",
  role,
  onboardingCompleted,
  expiresAt: session.expires_at ? session.expires_at * 1000 : undefined,
});
const friendlyAuthError = (error: { message?: string } | null | undefined) => error?.message || "Authentication could not be completed.";

/**
 * Runs a Supabase auth call and reports its failure as a CODE.
 *
 * The try/catch is the point as much as the mapping is. supabase-js throws
 * rather than resolving when the response is not JSON at all — a proxy's HTML
 * error page, a captive portal, a dropped connection — and an uncaught throw
 * here would surface as a blank screen or, worse, be caught somewhere upstream
 * and reported as bad credentials. A transport failure is a transport failure.
 */
type SupabaseAuthFailure = { message?: string; code?: string; status?: number; name?: string };

async function attemptAuth<T>(
  call: () => PromiseLike<{ data: unknown; error: SupabaseAuthFailure | null }>,
): Promise<{ ok: true; data: T } | { ok: false; errorCode: AuthErrorCode }> {
  try {
    const { data, error } = await call();
    if (error) return { ok: false, errorCode: authErrorCode(error) };
    return { ok: true, data: data as T };
  } catch (cause) {
    return { ok: false, errorCode: authErrorCode(cause as SupabaseAuthFailure) };
  }
}

export function SupabaseAuthProvider({ children }: { children: ReactNode }) {
  const [supabaseSession, setSupabaseSession] = useState<Session | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const profilesQuery = trpc.supabaseCore.profiles.useQuery(undefined, { enabled: Boolean(supabaseClient && supabaseSession), retry: false });
  // The signup trigger only ever grants "learner". This asks the server to honour a signup that
  // requested instructor, reading that request from auth metadata server-side — never from here.
  const claimRoleMutation = trpc.supabaseCore.claimPublicRole.useMutation();
  const claimAdminMutation = trpc.supabaseCore.claimAdminRole.useMutation();
  // Pre-signup eligibility and post-login context resolution. Both decide on the
  // server; both return a code that the page turns into the wording.
  const eligibilityMutation = trpc.supabaseCore.signupEligibility.useMutation();
  const contextMutation = trpc.supabaseCore.loginContext.useMutation();
  const bootstrappedProfiles = profilesQuery.data?.ok ? coreProfiles(profilesQuery.data.data) : null;
  const roles = roleFromRoles(bootstrappedProfiles?.roles);
  const resolvedRole = publicRole(roles);
  const profileRecord = bootstrappedProfiles?.profile ?? null;
  const onboardingCompleted = Boolean(profileRecord?.onboarding_completed);
  // The onboarding form needs a shape to render; that is a form default, not a
  // granted role, and it never reaches user_roles.
  const currentProfile = profileToOnboarding(profileRecord, resolvedRole ?? "learner");
  const currentSession = supabaseSession ? sessionModel(supabaseSession, resolvedRole, onboardingCompleted) : null;
  const roleResolved = !supabaseSession || profilesQuery.isFetched;
  const isLoading = sessionLoading || (Boolean(supabaseSession) && profilesQuery.isLoading);

  useEffect(() => {
    if (!supabaseClient) {
      setSessionLoading(false);
      setAuthError(demoAuthNotice());
      return;
    }
    let active = true;
    void supabaseClient.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setAuthError(friendlyAuthError(error));
      setSupabaseSession(data.session);
      setSessionLoading(false);
    });
    const { data: listener } = supabaseClient.auth.onAuthStateChange((_event, next) => {
      if (!active) return;
      setSupabaseSession(next);
      setAuthError(null);
      setSessionLoading(false);
      if (!next) clearOnboardingDraft();
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  const signUp = useCallback(async (email: string, password: string, role: PublicRole): Promise<AuthResult> => {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || password.length < 8) return { ok: false, error: "Use an email and a password with at least 8 characters." };
    if (isReservedDemoClassroomEmail(normalizedEmail)) return { ok: false, error: "This demo classroom identity is reserved and cannot be claimed through public signup." };
    const client = supabaseClient;
    if (!client) return { ok: false, error: demoAuthNotice() };
    // Asked BEFORE the account is created: the server compares the address with
    // ADMIN_EMAIL and with what is already registered, and answers with a code.
    // Nothing is granted here — this only decides whether to proceed.
    const eligibility = await eligibilityMutation.mutateAsync({ email: normalizedEmail, role }).catch(() => null);
    const verdict = eligibility?.ok ? eligibility.data.decision : null;
    if (!verdict) return { ok: false, error: "We could not check this email just now. Please try again.", decision: "network" };
    if (verdict !== "ok") return { ok: false, decision: verdict };

    const created = await attemptAuth<{ session: Session | null }>(() => client.auth.signUp({
      email: normalizedEmail, password, options: { data: { requested_public_role: role } },
    }));
    if (!created.ok) return { ok: false, errorCode: created.errorCode };
    // No session means the project requires the address to be confirmed first.
    if (!created.data.session) return { ok: true, needsVerification: true };
    const data = created.data;
    setSupabaseSession(data.session);
    await claimRoleMutation.mutateAsync().catch(() => undefined);
    const signUpProfiles = await profilesQuery.refetch();
    const granted = signUpProfiles.data?.ok ? coreProfiles(signUpProfiles.data.data) : null;
    // Route by the role the server actually granted, not the one the form asked for.
    const grantedRole = publicRole(roleFromRoles(granted?.roles));
    // If the grant did not land, say so rather than sending them to a dashboard
    // their account has no role for.
    if (!grantedRole) return { ok: false, decision: "role_not_assigned" };
    return { ok: true, next: "/onboarding/" + grantedRole, roles: roleFromRoles(granted?.roles) };
  }, [claimRoleMutation, profilesQuery]);

  const signIn = useCallback(async (email: string, password: string, context: LoginContext = "learner"): Promise<AuthResult> => {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || password.length < 8) return { ok: false, error: "Enter your email and a password to continue." };
    const client = supabaseClient;
    if (!client) return { ok: false, error: demoAuthNotice() };
    const signedIn = await attemptAuth<{ session: Session | null }>(() => client.auth.signInWithPassword({ email: normalizedEmail, password }));
    if (!signedIn.ok) return { ok: false, errorCode: signedIn.errorCode };
    const data = signedIn.data;
    if (!data.session) return { ok: false, errorCode: "email_not_confirmed" };
    setSupabaseSession(data.session);
    // Idempotent, and it also repairs accounts created before the role claim existed.
    await claimRoleMutation.mutateAsync().catch(() => undefined);
    // Grants admin only when the verified account email matches the server-side
    // ADMIN_EMAIL. Returns the same answer for everyone else, so calling it for
    // every sign-in reveals nothing.
    await claimAdminMutation.mutateAsync().catch(() => undefined);
    const refreshedResult = await profilesQuery.refetch();
    const refreshed = refreshedResult.data?.ok ? coreProfiles(refreshedResult.data.data) : null;
    const nextRoles = roleFromRoles(refreshed?.roles);

    // The destination and the verdict both come from the server, computed from
    // the roles this verified identity actually holds. The selected card is sent
    // only so the server can say whether it disagrees — it never widens access.
    const resolved = await contextMutation.mutateAsync({ context }).catch(() => null);
    if (!resolved?.ok) return { ok: false, error: "We could not confirm your account role. Please try again.", decision: "network", roles: nextRoles };
    const { decision, next, isAdmin } = resolved.data;
    if (decision !== "ok" || !next) return { ok: false, decision, isAdmin, roles: nextRoles };
    return { ok: true, next, isAdmin, roles: nextRoles, decision: "ok" };
  }, [claimRoleMutation, profilesQuery]);

  /**
   * A real Google sign-in, or an honest refusal.
   *
   * This calls Supabase's own OAuth entry point — the same auth system the email
   * form uses, not a second one. There is no fallback path that fabricates a
   * session: if the provider is not configured on the project, the call fails
   * here and the reader is told, with the reason kept distinct from a network
   * failure. Nothing is written, no role is granted, and no navigation happens.
   *
   * On success this function never resolves in any meaningful sense: the browser
   * is already navigating to Google.
   */
  const signInWithGoogle = useCallback(async (intent: OAuthIntent): Promise<AuthResult> => {
    if (!supabaseClient) return { ok: false, error: demoAuthNotice() };
    // Asked before the tab is allowed to leave. `signInWithOAuth` redirects
    // rather than returning an error, so an unconfigured provider would strand
    // the reader on the provider's own 400 page with the application gone.
    if (!(await isGoogleEnabled())) return { ok: false, decision: "oauth_disabled" };
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: "google",
      options: {
        // Fixed and same-origin, so the return address cannot be steered.
        redirectTo: oauthRedirectTarget(),
        // Ask Google to show the chooser rather than silently reusing whichever
        // account happens to be signed in on the device.
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) return { ok: false, decision: isProviderDisabled(error.message) ? "oauth_disabled" : "oauth_failed", error: error.message };
    return { ok: true };
  }, []);

  /**
   * Where a Google-authenticated identity belongs.
   *
   * The session already exists by the time this runs, so nothing here decides
   * access — it reads the server's answer. The order matters and mirrors the
   * password path exactly:
   *
   *  1. The role card chosen before the redirect is recorded as a REQUEST on the
   *     account's own auth metadata. It is written by the reader's own session,
   *     carries no privilege, and is the same request the email signup form makes
   *     through `options.data`.
   *  2. `claimPublicRole` decides whether to honour it. That procedure refuses
   *     the board address, refuses to overwrite an existing role, and accepts
   *     nothing outside learner/instructor. This is the only thing that grants.
   *  3. `claimAdminRole` grants admin only when the verified address matches the
   *     server-held one — so Google cannot be a way around admin authorization.
   *  4. `loginContext` returns the destination, including whether onboarding is
   *     still outstanding.
   */
  const resolveAfterOAuth = useCallback(async (intent: OAuthIntent | null): Promise<AuthResult> => {
    if (!supabaseClient) return { ok: false, error: demoAuthNotice() };
    const { data: sessionData } = await supabaseClient.auth.getSession();
    const session = sessionData.session;
    if (!session) return { ok: false, decision: "oauth_failed", error: "No session was returned." };
    setSupabaseSession(session);

    // Only ever recorded when the account has no public role yet, so a returning
    // reader who picks the other card cannot rewrite what they already are.
    if (intent?.mode === "signup" && intent.role) {
      const beforeResult = await profilesQuery.refetch();
      const before = beforeResult.data?.ok ? coreProfiles(beforeResult.data.data) : null;
      if (!publicRole(roleFromRoles(before?.roles))) {
        await supabaseClient.auth.updateUser({ data: { requested_public_role: intent.role } }).catch(() => undefined);
      }
    }

    await claimRoleMutation.mutateAsync().catch(() => undefined);
    await claimAdminMutation.mutateAsync().catch(() => undefined);
    const refreshedResult = await profilesQuery.refetch();
    const refreshed = refreshedResult.data?.ok ? coreProfiles(refreshedResult.data.data) : null;
    const nextRoles = roleFromRoles(refreshed?.roles);

    // Without a chosen desk, ask about the role the account actually holds, so a
    // returning reader is not refused for a card they never saw.
    const context: LoginContext = intent?.context ?? (nextRoles.some((role) => role === "admin" || role === "super_admin")
      ? "admin"
      : publicRole(nextRoles) ?? "learner");

    const resolved = await contextMutation.mutateAsync({ context }).catch(() => null);
    if (!resolved?.ok) return { ok: false, error: "We could not confirm your account role. Please try again.", decision: "network", roles: nextRoles };
    const { decision, next, isAdmin } = resolved.data;
    if (decision !== "ok" || !next) return { ok: false, decision, isAdmin, roles: nextRoles };
    return { ok: true, next, isAdmin, roles: nextRoles, decision: "ok" };
  }, [claimAdminMutation, claimRoleMutation, contextMutation, profilesQuery]);

  const signOut = useCallback(async () => {
    if (supabaseClient) await supabaseClient.auth.signOut();
    setSupabaseSession(null);
    clearOnboardingDraft();
  }, []);
  const requestPasswordReset = useCallback(async (email: string): Promise<AuthResult> => {
    if (!supabaseClient) return { ok: false, error: demoAuthNotice() };
    const { error } = await supabaseClient.auth.resetPasswordForEmail(normalizeEmail(email), { redirectTo: `${window.location.origin}/reset-password` });
    return error ? { ok: false, error: friendlyAuthError(error) } : { ok: true };
  }, []);
  const updatePassword = useCallback(async (password: string): Promise<AuthResult> => {
    if (password.length < 8) return { ok: false, error: "Password must be at least 8 characters." };
    if (!supabaseClient) return { ok: false, error: demoAuthNotice() };
    const { error } = await supabaseClient.auth.updateUser({ password });
    return error ? { ok: false, error: friendlyAuthError(error) } : { ok: true };
  }, []);
  const completeOnboarding = useCallback(async (nextProfile: OnboardingProfile): Promise<OnboardingResult> => {
    if (!supabaseClient || !supabaseSession) return { ok: false, error: demoAuthNotice() };
    saveOnboardingDraft(nextProfile);
    const refreshedResult = await profilesQuery.refetch();
    const refreshed = refreshedResult.data?.ok ? coreProfiles(refreshedResult.data.data) : null;
    if (!refreshed) return { ok: false, error: "Your saved profile could not be reloaded. Please try again." };
    // The dashboard guard reads onboarding_completed, so confirm the server recorded it before
    // navigating — otherwise the guard would bounce straight back to onboarding.
    if (!refreshed.profile?.onboarding_completed) return { ok: false, error: "Onboarding was not recorded on your profile. Please try again." };
    const nextRole = publicRole(roleFromRoles(refreshed.roles));
    if (!nextRole) return { ok: false, error: "No role is assigned to this account, so it has no dashboard yet. Please contact support." };
    return { ok: true, next: `/dashboard/${nextRole}`, role: nextRole };
  }, [profilesQuery, supabaseSession]);
  const refreshProfile = useCallback(async () => { await profilesQuery.refetch(); }, [profilesQuery]);
  const value = useMemo<AuthContextValue>(() => ({
    currentUser: currentSession ? { email: currentSession.email, id: currentSession.userId, name: currentProfile?.displayName || undefined } : null,
    user: currentSession ? { email: currentSession.email, id: currentSession.userId, name: currentProfile?.displayName || undefined } : null,
    currentSession,
    currentProfile,
    currentRoles: roles,
    isLoading,
    loading: isLoading,
    isAuthenticated: Boolean(currentSession),
    roleResolved,
    authError,
    error: authError,
    logout: signOut,
    signUp,
    signIn,
    signOut,
    requestPasswordReset,
    updatePassword,
    completeOnboarding,
    signInWithGoogle,
    resolveAfterOAuth,
    refreshProfile,
    hasRole: (role) => roles.includes(role),
    hasPermission: (permission) => { const actor = roles.some((role) => role === "admin" || role === "super_admin") ? "admin" : roles[0] ?? "guest"; return permission.startsWith(`${actor}:`); },
  }), [authError, completeOnboarding, currentProfile, currentSession, isLoading, refreshProfile, resolveAfterOAuth, roleResolved, roles, signIn, signInWithGoogle, signOut, signUp, updatePassword, requestPasswordReset]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error("useAuth must be used inside SupabaseAuthProvider"); return value; }
