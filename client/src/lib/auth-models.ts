export type PublicRole = "learner" | "instructor";
export type PrivilegedRole = "moderator" | "admin" | "advisory_board" | "super_admin";
export type AccountRole = PublicRole | PrivilegedRole;
export type ProfileVisibility = "public" | "private";

export type OnboardingProfile = {
  role: PublicRole;
  fullName: string;
  displayName: string;
  countryCity: string;
  timezone: string;
  preferredLanguage: "English" | "Urdu" | "Arabic";
  subjects: string[];
  level: string;
  goal: string;
  classFormat: string;
  availability: string;
  budget: string;
  visibility: ProfileVisibility;
  consent: boolean;
  bio?: string;
  teachingApproach?: string;
  yearsExperience?: string;
  teachingLanguages?: string;
  guidelinesAcknowledged?: boolean;
  verificationAcknowledged?: boolean;
};

export const publicRoles: { value: PublicRole; label: string; copy: string }[] = [
  { value: "learner", label: "Learner / student", copy: "Find a course, meet a tutor, and create a learning rhythm." },
  { value: "instructor", label: "Instructor / tutor", copy: "Share your teaching approach and prepare a public profile." },
];

const STORAGE_KEY = "noor-ilm-onboarding-draft";
export const isClientFixtureMode = import.meta.env.DEV && import.meta.env.VITE_ENABLE_TEST_FIXTURES === "true";
export function saveOnboardingDraft(profile: OnboardingProfile) { if (isClientFixtureMode) localStorage.setItem(STORAGE_KEY, JSON.stringify(profile)); return profile; }
export function getOnboardingDraft(): OnboardingProfile | null { if (!isClientFixtureMode) return null; try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) as OnboardingProfile : null; } catch { return null; } }
export function clearOnboardingDraft() { if (isClientFixtureMode) localStorage.removeItem(STORAGE_KEY); }
export function isPublicSignupRole(role: string): role is PublicRole { return role === "learner" || role === "instructor"; }
export function isAdminRole(role: AccountRole | string | undefined): role is "admin" | "super_admin" { return role === "admin" || role === "super_admin"; }
export function canAssignRole(actor: AccountRole, requested: AccountRole) { return isAdminRole(actor) && requested !== "super_admin"; }
export function verificationLabel(status: string) { return status === "approved" ? "Verified instructor" : "Verification process"; }
export function demoAuthNotice() { return "Supabase Auth is not configured. Sign-in and onboarding persistence are unavailable until the required connection is enabled."; }
export function normalizeEmail(value: string) { return value.trim().toLowerCase(); }
export function isSafeInternalReturn(value: string | null | undefined) { return Boolean(value && value.startsWith("/") && !value.startsWith("//") && !value.includes("://")) ? value : null; }
export function isSessionExpired(expiresAt: number | undefined, now = Date.now()) { return typeof expiresAt === "number" && expiresAt <= now; }
