import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AccountRole, OnboardingProfile, PublicRole } from "../lib/auth-models";
import { clearOnboardingDraft, demoAuthNotice, getOnboardingDraft, isClientFixtureMode, isPublicSignupRole, normalizeEmail, saveOnboardingDraft } from "../lib/auth-models";
import { isReservedDemoClassroomEmail } from "../lib/classroom-data";
import { supabaseClient } from "../lib/supabase-client";
import type { Session } from "@supabase/supabase-js";
import { trpc } from "../lib/trpc";

type AuthSession = { email: string; role: PublicRole; onboardingCompleted: boolean; userId: string; expiresAt?: number };
// Onboarding completion resolves the destination from the server-owned role and the persisted
// onboarding flag, so the caller never has to guess a redirect from client-held state.
export type OnboardingResult = { ok: true; next: string; role: PublicRole } | { ok: false; error: string };
type AuthResult = { ok: boolean; error?: string; next?: string; needsVerification?: boolean };
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
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<AuthResult>;
  updatePassword: (password: string) => Promise<AuthResult>;
  completeOnboarding: (profile: OnboardingProfile) => Promise<OnboardingResult>;
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
const publicRole = (roles: AccountRole[]): PublicRole => roles.includes("instructor") ? "instructor" : "learner";
const profileToOnboarding = (profile: Record<string, unknown> | null | undefined, role: PublicRole): OnboardingProfile | null => {
  if (!profile) return null;
  return {
    role,
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
const sessionModel = (session: Session, role: PublicRole, onboardingCompleted: boolean): AuthSession => ({
  userId: session.user.id,
  email: session.user.email || "",
  role,
  onboardingCompleted,
  expiresAt: session.expires_at ? session.expires_at * 1000 : undefined,
});
const friendlyAuthError = (error: { message?: string } | null | undefined) => error?.message || "Authentication could not be completed.";

export function SupabaseAuthProvider({ children }: { children: ReactNode }) {
  const [supabaseSession, setSupabaseSession] = useState<Session | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const profilesQuery = trpc.supabaseCore.profiles.useQuery(undefined, { enabled: Boolean(supabaseClient && supabaseSession), retry: false });
  // The signup trigger only ever grants "learner". This asks the server to honour a signup that
  // requested instructor, reading that request from auth metadata server-side — never from here.
  const claimRoleMutation = trpc.supabaseCore.claimPublicRole.useMutation();
  const bootstrappedProfiles = profilesQuery.data?.ok ? coreProfiles(profilesQuery.data.data) : null;
  const roles = roleFromRoles(bootstrappedProfiles?.roles);
  const resolvedRole = publicRole(roles);
  const profileRecord = bootstrappedProfiles?.profile ?? null;
  const onboardingCompleted = Boolean(profileRecord?.onboarding_completed);
  const currentProfile = profileToOnboarding(profileRecord, resolvedRole);
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
    if (!supabaseClient) return { ok: false, error: demoAuthNotice() };
    const { data, error } = await supabaseClient.auth.signUp({ email: normalizedEmail, password, options: { data: { requested_public_role: role } } });
    if (error) return { ok: false, error: friendlyAuthError(error) };
    if (!data.session) return { ok: true, needsVerification: true };
    setSupabaseSession(data.session);
    await claimRoleMutation.mutateAsync().catch(() => undefined);
    const signUpProfiles = await profilesQuery.refetch();
    const granted = signUpProfiles.data?.ok ? coreProfiles(signUpProfiles.data.data) : null;
    // Route by the role the server actually granted, not the one the form asked for.
    const grantedRole = publicRole(roleFromRoles(granted?.roles));
    return { ok: true, next: "/onboarding/" + grantedRole };
  }, [claimRoleMutation, profilesQuery]);

  const signIn = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || password.length < 8) return { ok: false, error: "Enter your email and a password to continue." };
    if (!supabaseClient) return { ok: false, error: demoAuthNotice() };
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email: normalizedEmail, password });
    if (error) return { ok: false, error: friendlyAuthError(error) };
    if (!data.session) return { ok: false, error: "Your account needs email verification before it can sign in." };
    setSupabaseSession(data.session);
    // Idempotent, and it also repairs accounts created before the role claim existed.
    await claimRoleMutation.mutateAsync().catch(() => undefined);
    const refreshedResult = await profilesQuery.refetch();
    const refreshed = refreshedResult.data?.ok ? coreProfiles(refreshedResult.data.data) : null;
    const nextRole = publicRole(roleFromRoles(refreshed?.roles));
    const done = Boolean(refreshed?.profile?.onboarding_completed);
    return { ok: true, next: done ? `/dashboard/${nextRole}` : `/onboarding/${nextRole}` };
  }, [claimRoleMutation, profilesQuery]);

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
    refreshProfile,
    hasRole: (role) => roles.includes(role),
    hasPermission: (permission) => { const actor = roles.some((role) => role === "admin" || role === "super_admin") ? "admin" : roles[0] ?? "guest"; return permission.startsWith(`${actor}:`); },
  }), [authError, completeOnboarding, currentProfile, currentSession, isLoading, refreshProfile, roleResolved, roles, signIn, signOut, signUp, updatePassword, requestPasswordReset]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error("useAuth must be used inside SupabaseAuthProvider"); return value; }
