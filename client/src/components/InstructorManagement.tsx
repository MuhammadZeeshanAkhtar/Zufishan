import { useEffect, useMemo, useState } from "react";
import { trpc } from "../lib/trpc";
import TutorQualifications from "./TutorQualifications";
import { COMPLETION_LABEL_KEYS, useInstructorCompletion } from "../lib/use-instructor-completion";
import type { TranslationKey } from "@/i18n/catalog";
import { supabaseClient } from "../lib/supabase-client";
import { Link } from "wouter";
import { ArrowRight, BadgeCheck, Check, Globe2, ShieldCheck } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useLocale } from "../contexts/LocaleContextState";
import { useHasDashboardChrome } from "../lib/use-dashboard-chrome";
import { TrialCTA } from "./RequirementsExperience";
import MessageAction from "./MessageAction";
import InstructorAvailabilityCalendar from "./InstructorAvailabilityCalendar";
import InstructorIntroMedia from "./InstructorIntroMedia";
import { InstructorRating } from "./ReviewsExperience";
import { getTestStatus, getVerificationStatus, validateInstructorProfile, type AvailabilityInterval, type InstructorProfile } from "../lib/instructor-data";
import { displayableImageSrc } from "../lib/safe-url";
import { Chip, Fact, InstructorAvatar, Rating, useHourlyRate, useInstructorFacts, type DiscoveryInstructor } from "./InstructorPresentation";
import { instructorFormCompletion } from "../lib/profile-completion";
import GenderSelect from "./GenderSelect";
import { SearchableMultiSelect, SearchableSelect } from "./SearchableSelect";
import { countryOptions, languageOptions, fiqhValues, levelOptions, nextTimezoneForCountry, sectValues, subjectOptions, timezoneOptionsForCountry } from "../lib/reference-data";

function Frame({ children }: { children: React.ReactNode }) {
  // Inside a dashboard the sidebar already carries the brand and these destinations, and on a
  // learner's route this strip advertised the instructor desk to the wrong person.
  const hasChrome = useHasDashboardChrome();
  if (hasChrome) return <div className="min-h-screen bg-[var(--ni-bg)] ni-t-ink">{children}</div>;
  return <div className="min-h-screen bg-[var(--ni-bg)] ni-t-ink"><header className="border-b border-[var(--ni-sage)] bg-[var(--ni-field)]"><div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 lg:px-8"><Link href="/dashboard/instructor" className="font-display text-2xl">Zufishan <span className="text-xs font-sans uppercase tracking-[.18em] ni-t-gold">Instructor desk</span></Link><nav className="flex gap-4 text-sm font-semibold ni-t-sage-ink"><Link href="/dashboard/instructor/profile">Profile</Link><Link href="/dashboard/instructor/training">Training</Link><Link href="/dashboard/instructor/availability">Availability</Link></nav></div></header>{children}</div>; }
function StatusCard({ label, status, note }: { label: string; status: string; note: string }) { return <div className="rounded-2xl border border-[var(--ni-sage)] bg-[var(--ni-paper)] p-5"><p className="text-xs font-bold uppercase tracking-[.16em] ni-t-gold">{label}</p><p className="mt-3 font-display text-2xl capitalize">{status.replaceAll("_", " ")}</p><p className="mt-2 text-sm leading-6 ni-t-muted">{note}</p></div>; }
const emptyInstructorProfile: InstructorProfile = { privateAccountName: "", userId: "", publicSlug: "", publicDisplayName: "", countryRegion: "", timezone: "", preferredLanguage: "English", teachingLanguages: [], subjects: [], levels: [], yearsExperience: "", publicBio: "", gender: "", sect: "", fiqh: "", hasIjazah: false, teachingApproach: "", courseFormats: [], classDurations: [], hourlyRate: "", currency: "USD", trialRatePlaceholder: "To be connected", availabilitySummary: "", profileVisibility: "private", publicCredentialsSummary: "", verificationStatus: "not_started", trainingStatus: "not_started", testStatus: "not_started", profileCompletionPercent: 0 };
export function InstructorProfileEditor() { const { t } = useLocale(); const { currentSession } = useAuth(); const profileQuery = trpc.supabaseCore.profiles.useQuery(undefined, { enabled: Boolean(currentSession && currentSession.role === "instructor") }); const [profile, setProfile] = useState<InstructorProfile>(emptyInstructorProfile); const [saved, setSaved] = useState(false); const [dirty, setDirty] = useState(false); const [saving, setSaving] = useState(false); const [saveError, setSaveError] = useState(""); const [errors, setErrors] = useState<Record<string, string>>({}); const [step, setStep] = useState(1); useEffect(() => { const record = profileQuery.data?.ok ? (profileQuery.data.data as { profile?: Record<string, unknown> | null; instructorProfile?: Record<string, unknown> | null }).instructorProfile : null; const base = profileQuery.data?.ok ? (profileQuery.data.data as { profile?: Record<string, unknown> | null }).profile : null; if (!record && !base) return; setProfile((current) => ({ ...current, userId: currentSession?.userId ?? current.userId, privateAccountName: String(base?.full_name ?? current.privateAccountName), publicDisplayName: String(base?.display_name ?? current.publicDisplayName), publicSlug: String(record?.public_slug ?? current.publicSlug), countryRegion: String(base?.country ?? current.countryRegion), timezone: String(base?.timezone ?? current.timezone), preferredLanguage: String(base?.preferred_language ?? current.preferredLanguage), teachingLanguages: Array.isArray(record?.teaching_languages) ? record.teaching_languages.map(String) : current.teachingLanguages, subjects: Array.isArray(record?.subjects) ? record.subjects.map(String) : current.subjects, levels: Array.isArray(record?.teaching_levels) ? record.teaching_levels.map(String) : current.levels, yearsExperience: record?.years_experience == null ? current.yearsExperience : String(record.years_experience), publicBio: String(base?.bio ?? current.publicBio), gender: String(base?.gender ?? current.gender), sect: String(record?.sect ?? current.sect), fiqh: String(record?.fiqh ?? current.fiqh ?? ""), hasIjazah: Boolean(record?.has_ijazah ?? current.hasIjazah), verificationStatus: (record?.verification_status ?? current.verificationStatus) as InstructorProfile["verificationStatus"], teachingApproach: String(record?.teaching_approach ?? current.teachingApproach), hourlyRate: record?.hourly_rate_minor == null ? current.hourlyRate : String(Number(record.hourly_rate_minor) / 100), currency: String(record?.currency ?? current.currency), availabilitySummary: String(record?.availability_summary ?? current.availabilitySummary), profileVisibility: record?.public_profile_status === "published" ? "public" : "private" })); }, [currentSession?.userId, profileQuery.data]); // Same calculator the dashboard banner uses, so both surfaces always report the same number.
  const avatarUrl = profileQuery.data?.ok ? (profileQuery.data.data as { profile?: Record<string, unknown> | null }).profile?.avatar_url : undefined;
  /*
   * The score the server will apply, not a second opinion.
   *
   * `instructorFormCompletion` counted fifteen fields and knew nothing about the hours, media or
   * background that live in other tables — which is how a nearly-empty profile read 67%. This maps
   * the form onto the shared list and lets the hook add the three counts.
   */
  const completionRows = useMemo(() => ({
    profile: {
      full_name: profile.privateAccountName, display_name: profile.publicDisplayName,
      country: profile.countryRegion, timezone: profile.timezone, gender: profile.gender,
      avatar_url: avatarUrl, bio: profile.publicBio,
    },
    instructorProfile: {
      public_slug: profile.publicSlug, subjects: profile.subjects, teaching_levels: profile.levels,
      teaching_languages: profile.teachingLanguages, years_experience: profile.yearsExperience,
      teaching_approach: profile.teachingApproach, hourly_rate_minor: profile.hourlyRate,
      currency: profile.currency, availability_summary: profile.availabilitySummary,
      sect: profile.sect, fiqh: profile.fiqh,
    },
  }), [profile, avatarUrl]);
  const scored = useInstructorCompletion(completionRows);
  const completion = scored.percent; const update = (key: keyof InstructorProfile, value: string | string[]) => { setProfile((current) => ({ ...current, [key]: value })); setDirty(true); setSaved(false); setSaveError(""); }; const updateCountry = (value: string) => { setProfile((current) => ({ ...current, countryRegion: value, timezone: nextTimezoneForCountry(value, current.timezone) })); setDirty(true); setSaved(false); setSaveError(""); }; const updateInstructor = trpc.supabaseCore.updateInstructorProfile.useMutation(); const persist = async () => { const result = validateInstructorProfile(profile); setErrors(result.errors); if (!result.ok || !currentSession) { if (!currentSession) setSaveError(t("courseStudio.signInRequired")); return; } setSaving(true); setSaveError(""); try { const response = await updateInstructor.mutateAsync({ publicDisplayName: profile.publicDisplayName, publicSlug: profile.publicSlug, subjects: profile.subjects, levels: profile.levels, teachingLanguages: profile.teachingLanguages, yearsExperience: profile.yearsExperience ? Number(profile.yearsExperience) : undefined, teachingApproach: profile.teachingApproach, hourlyRateMinor: profile.hourlyRate ? Math.round(Number(profile.hourlyRate) * 100) : undefined, currency: profile.currency, availabilitySummary: profile.availabilitySummary, profileVisibility: profile.profileVisibility, preferredLanguage: profile.preferredLanguage, country: profile.countryRegion, timezone: profile.timezone, bio: profile.publicBio, gender: profile.gender === "male" || profile.gender === "female" ? profile.gender : undefined, sect: (profile.sect || undefined) as "Sunni" | "Shia" | "Other" | "Prefer not to say" | undefined, fiqh: (profile.fiqh || undefined) as "Hanafi" | "Shafii" | "Maliki" | "Hanbali" | "Other" | "Prefer not to say" | undefined, hasIjazah: profile.hasIjazah }); if (!response.ok) { setSaveError(response.error); return; } setSaved(true); setDirty(false); } catch { setSaveError(t("courseStudio.saveError")); } finally { setSaving(false); } }; if (!currentSession || currentSession.role !== "instructor") return <Frame><main className="mx-auto max-w-3xl px-5 py-20"><h1 className="font-display text-4xl">{t("courseStudio.signInRequired")}</h1></main></Frame>; return <Frame><main className="mx-auto max-w-5xl px-5 py-12 lg:px-8 lg:py-16"><div className="flex flex-wrap items-end justify-between gap-4"><div></div><Link href="/dashboard/instructor/profile/preview" className="font-bold ni-t-moss">Preview public profile <ArrowRight className="ml-1 inline" size={15}/></Link></div><div className="mt-8 rounded-2xl bg-[var(--ni-bg)] p-5"><div className="flex items-center justify-between text-sm font-bold"><span>Profile completion</span><span>{completion}%</span></div><div className="mt-3 h-3 rounded-full bg-[var(--ni-sage-line)]"><div className="h-full rounded-full bg-[var(--ni-moss)]" style={{ width: `${completion}%` }}/></div><p className="mt-3 text-xs ni-t-muted">{t("dashboard.privateCopy")}</p>{/* Three states, said in the teacher's own terms: a draft nobody can see, a published profile waiting on a reviewer, and a live one. Publishing is the teacher's act; going live is the reviewer's (migration 0036). */}{(() => { const live = profile.profileVisibility === "public" && profile.verificationStatus === "approved"; const waiting = profile.profileVisibility === "public" && !live; const tone = live ? "border-[var(--ni-sage-mid)] bg-[var(--ni-sage-soft)] ni-t-moss-deep" : "border-[var(--ni-gold-mid)] bg-[var(--ni-gold-soft)] ni-t-gold"; return (<div className={`mt-4 rounded-xl border p-4 ${tone}`} role="status"><p className="text-sm font-bold">{t(live ? "publishGate.liveTitle" : waiting ? "publishGate.reviewTitle" : "publishGate.draftTitle")}</p><p className="mt-1 text-xs leading-6">{t(live ? "publishGate.liveCopy" : waiting ? "publishGate.reviewCopy" : "publishGate.draftCopy")}</p>{scored.missing.length > 0 && (<p className="mt-2 text-xs font-semibold">{t("publishGate.guidance", { percent: String(completion) })}: <span className="font-normal">{scored.missing.map((key) => COMPLETION_LABEL_KEYS[key] ? t(COMPLETION_LABEL_KEYS[key]) : key).join(" · ")}</span></p>)}</div>); })()}</div><div className="mt-8 flex gap-2 overflow-auto">{["Basic information", "Teaching information", "Rate & availability", "Policies"].map((label, index) => <button key={label} onClick={() => setStep(index + 1)} className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-bold ${step === index + 1 ? "border-[var(--ni-moss)] ni-t-moss" : "border-transparent ni-t-muted-soft"}`}>{index + 1}. {label}</button>)}</div><section className="mt-6 rounded-[1.35rem] border border-[var(--ni-sage)] bg-[var(--ni-paper)] p-7">{step === 1 && <div className="grid gap-5 sm:grid-cols-2"><label className="text-sm font-semibold">Private account name <span className="ni-t-clay-ink" aria-label="required">*</span><input value={profile.privateAccountName} onChange={(e) => update("privateAccountName", e.target.value)} className="mt-2 w-full rounded-xl bg-[var(--ni-sage-soft)] p-3" required/>{errors.privateAccountName && <span className="mt-1 block text-xs ni-t-clay-ink">{errors.privateAccountName}</span>}</label><label className="text-sm font-semibold">{t("tutorDetail.sect")}<select value={profile.sect} onChange={(e) => update("sect", e.target.value)} className="mt-2 w-full rounded-xl bg-[var(--ni-sage-soft)] p-3"><option value="">—</option>{sectValues.map((option) => <option key={option} value={option}>{option}</option>)}</select></label><label className="text-sm font-semibold">{t("tutorQual.fiqh")}<select value={profile.fiqh} onChange={(e) => update("fiqh", e.target.value)} className="mt-2 w-full rounded-xl bg-[var(--ni-sage-soft)] p-3"><option value="">{t("tutorQual.fiqhAny")}</option>{fiqhValues.map((option) => <option key={option} value={option}>{option}</option>)}</select></label><label className="flex items-center gap-2.5 text-sm font-semibold"><input type="checkbox" checked={profile.hasIjazah} onChange={(e) => { setProfile((current) => ({ ...current, hasIjazah: e.target.checked })); setDirty(true); setSaved(false); setSaveError(""); }} className="h-4 w-4 accent-[var(--ni-moss)]"/>{t("tutorDetail.ijazah")}</label><div className="text-sm font-semibold">{t("gender.label")} <span className="ni-t-clay-ink" aria-label="required">*</span><GenderSelect value={profile.gender} onChange={(value) => update("gender", value)} required/></div><label className="text-sm font-semibold">Preferred language<select value={profile.preferredLanguage} onChange={(e) => update("preferredLanguage", e.target.value)} className="mt-2 w-full rounded-xl bg-[var(--ni-sage-soft)] p-3"><option>English</option><option>Urdu</option><option>Arabic</option></select></label><label className="text-sm font-semibold">Public display name <span className="ni-t-clay-ink" aria-label="required">*</span><input value={profile.publicDisplayName} onChange={(e) => update("publicDisplayName", e.target.value)} className="mt-2 w-full rounded-xl bg-[var(--ni-sage-soft)] p-3"/>{errors.publicDisplayName && <span className="mt-1 block text-xs ni-t-clay-ink">{errors.publicDisplayName}</span>}</label><label className="text-sm font-semibold">Public profile slug <span className="ni-t-clay-ink" aria-label="required">*</span><input value={profile.publicSlug} onChange={(e) => update("publicSlug", e.target.value)} className="mt-2 w-full rounded-xl bg-[var(--ni-sage-soft)] p-3"/>{errors.publicSlug && <span className="mt-1 block text-xs ni-t-clay-ink">{errors.publicSlug}</span>}</label><label className="text-sm font-semibold">Country / region<div className="mt-2"><SearchableSelect options={countryOptions()} value={profile.countryRegion} onChange={(value) => updateCountry(value)}/></div></label><label className="text-sm font-semibold">Timezone <span className="ni-t-clay-ink" aria-label="required">*</span><div className="mt-2"><SearchableSelect options={timezoneOptionsForCountry(profile.countryRegion)} value={profile.timezone} onChange={(value) => update("timezone", value)} placeholder="Asia/Karachi"/></div>{errors.timezone && <span className="mt-1 block text-xs ni-t-clay-ink">{errors.timezone}</span>}</label><label className="text-sm font-semibold">Teaching languages <span className="ni-t-clay-ink" aria-label="required">*</span><div className="mt-2"><SearchableMultiSelect options={languageOptions()} values={profile.teachingLanguages} onChange={(values) => update("teachingLanguages", values)}/></div>{errors.teachingLanguages && <span className="mt-1 block text-xs ni-t-clay-ink">{errors.teachingLanguages}</span>}</label><label className="text-sm font-semibold">Avatar upload<input type="file" accept="image/png,image/jpeg,image/webp" onChange={() => setDirty(true)} className="mt-2 w-full rounded-xl bg-[var(--ni-sage-soft)] p-3 text-sm"/><span className="mt-1 block text-xs font-normal ni-t-muted-soft">Secure storage connection required; no file was uploaded.</span></label></div>}{step === 2 && <div className="grid gap-5 sm:grid-cols-2"><label className="text-sm font-semibold sm:col-span-2">Subjects taught <span className="ni-t-clay-ink" aria-label="required">*</span><div className="mt-2"><SearchableMultiSelect options={subjectOptions.map((subject) => ({ value: subject, label: subject }))} values={profile.subjects} onChange={(values) => update("subjects", values)}/></div>{errors.subjects && <span className="mt-1 block text-xs ni-t-clay-ink">{errors.subjects}</span>}</label><label className="text-sm font-semibold">Levels<div className="mt-2"><SearchableMultiSelect options={levelOptions.map((level) => ({ value: level, label: level }))} values={profile.levels} onChange={(values) => update("levels", values)} max={4}/></div></label><label className="text-sm font-semibold">Years of experience<input value={profile.yearsExperience} onChange={(e) => update("yearsExperience", e.target.value)} className="mt-2 w-full rounded-xl bg-[var(--ni-sage-soft)] p-3"/></label><label className="text-sm font-semibold">Course formats<input value={profile.courseFormats.join(", ")} onChange={(e) => update("courseFormats", e.target.value.split(",").map((v) => v.trim()).filter(Boolean))} className="mt-2 w-full rounded-xl bg-[var(--ni-sage-soft)] p-3" placeholder="one-to-one, group"/></label><label className="text-sm font-semibold">Class durations<input value={profile.classDurations.join(", ")} onChange={(e) => update("classDurations", e.target.value.split(",").map((v) => v.trim()).filter(Boolean))} className="mt-2 w-full rounded-xl bg-[var(--ni-sage-soft)] p-3" placeholder="30 minutes, 60 minutes"/></label><label className="text-sm font-semibold sm:col-span-2">Public biography<textarea value={profile.publicBio} onChange={(e) => update("publicBio", e.target.value)} className="mt-2 min-h-24 w-full rounded-xl bg-[var(--ni-sage-soft)] p-3"/></label><label className="text-sm font-semibold sm:col-span-2">Detailed teaching approach<textarea value={profile.teachingApproach} onChange={(e) => update("teachingApproach", e.target.value)} className="mt-2 min-h-28 w-full rounded-xl bg-[var(--ni-sage-soft)] p-3"/></label></div>}{step === 3 && <div className="grid gap-5 sm:grid-cols-2"><label className="text-sm font-semibold">Hourly rate<input value={profile.hourlyRate} onChange={(e) => update("hourlyRate", e.target.value)} className="mt-2 w-full rounded-xl bg-[var(--ni-sage-soft)] p-3" placeholder="To be connected"/></label><label className="text-sm font-semibold">Currency<select value={profile.currency} onChange={(e) => update("currency", e.target.value)} className="mt-2 w-full rounded-xl bg-[var(--ni-sage-soft)] p-3"><option>USD</option><option>GBP</option><option>PKR</option></select></label><label className="text-sm font-semibold sm:col-span-2">Weekly availability summary<input value={profile.availabilitySummary} onChange={(e) => update("availabilitySummary", e.target.value)} className="mt-2 w-full rounded-xl bg-[var(--ni-sage-soft)] p-3" placeholder="Tuesday and Thursday evenings"/></label><div className="rounded-xl bg-[var(--ni-sage-soft)] p-4 text-sm">Trial-class rate: <strong>{profile.trialRatePlaceholder}</strong><p className="mt-1 text-xs ni-t-muted-soft">Placeholder only; no rate has been published.</p></div></div>}{step === 4 && <div className="space-y-5"><label className="text-sm font-semibold">Profile visibility<select value={profile.profileVisibility} onChange={(e) => update("profileVisibility", e.target.value)} className="mt-2 w-full rounded-xl bg-[var(--ni-sage-soft)] p-3"><option value="private">Private while preparing</option><option value="public">Public fields only</option></select></label>{["I acknowledge the instructor guidelines.", "I understand verification is a separate protected review.", "I acknowledge the content and conduct policy."].map((label) => <label key={label} className="flex gap-3 text-sm"><input type="checkbox" onChange={() => setDirty(true)}/>{label}</label>)}</div>} {dirty && <p className="mt-6 rounded-xl bg-[var(--ni-gold-soft)] p-3 text-xs ni-t-gold" role="status">{t("requirementsExp.unsaved")}</p>}{Object.keys(errors).length > 0 && <div className="mt-6 rounded-xl bg-[var(--ni-clay-soft)] p-4 text-sm ni-t-clay" role="alert"><p className="font-bold">{t("requirementsExp.unsaved")}</p><ul className="mt-2 list-disc pl-5">{Object.values(errors).map((message) => <li key={message}>{message}</li>)}</ul></div>}{saving && <p className="mt-6 rounded-xl bg-[var(--ni-sage-soft)] p-3 text-xs ni-t-sage-ink" role="status">{t("dashboard.loading")}</p>}{saveError && <p className="mt-6 rounded-xl bg-[var(--ni-clay-soft)] p-3 text-xs ni-t-clay" role="alert">{saveError}</p>}<div className="mt-8 flex flex-wrap justify-between gap-3"><button onClick={() => setStep(Math.max(1, step - 1))} className="rounded-full bg-[var(--ni-sage-soft)] px-5 py-3 text-sm font-semibold">Back</button><div className="flex gap-3"><button disabled={saving} onClick={() => void persist()} className="rounded-full border border-[var(--ni-sage-mid)] px-5 py-3 text-sm font-semibold">Save draft</button>{step < 4 ? <button onClick={() => setStep(step + 1)} className="rounded-full bg-[var(--ni-moss)] px-5 py-3 text-sm font-semibold text-white">Continue</button> : <button disabled={saving} onClick={() => void persist()} className="rounded-full bg-[var(--ni-moss)] px-5 py-3 text-sm font-semibold text-white">Request profile review</button>}</div></div>{saved && <p className="mt-5 rounded-xl bg-[var(--ni-sage-soft)] p-4 text-sm"><Check className="mr-2 inline" size={16}/>{t("courseStudio.draftSaved")}</p>}</section><InstructorIntroMedia/><TutorQualifications/></main></Frame>; }
export function InstructorProfilePreview() { const { t } = useLocale(); const { currentSession } = useAuth(); const profileQuery = trpc.supabaseCore.profiles.useQuery(undefined, { enabled: Boolean(currentSession && currentSession.role === "instructor") }); const record = profileQuery.data?.ok ? (profileQuery.data.data as { profile?: Record<string, unknown> | null; instructorProfile?: Record<string, unknown> | null }) : null; const profile = record?.instructorProfile ? { publicDisplayName: String(record.instructorProfile.public_display_name ?? record.profile?.display_name ?? ""), countryRegion: String(record.instructorProfile.country_region ?? ""), timezone: String(record.instructorProfile.timezone ?? ""), subjects: Array.isArray(record.instructorProfile.subjects) ? record.instructorProfile.subjects.map(String) : [], publicBio: String(record.instructorProfile.public_bio ?? ""), publicCredentialsSummary: "Shared after protected review", courseFormats: Array.isArray(record.instructorProfile.course_formats) ? record.instructorProfile.course_formats.map(String) : [], profileVisibility: record.instructorProfile.public_profile_status === "published" ? "public" : "private" } : null; if (profileQuery.isLoading) return <Frame><main className="mx-auto max-w-3xl px-5 py-20"><p className="text-sm ni-t-muted">{t("common.loading")}</p></main></Frame>; if (!profile) return <Frame><main className="mx-auto max-w-3xl px-5 py-20"><h1 className="font-display text-4xl">{t("courseStudio.signInRequired")}</h1><p className="mt-4 ni-t-muted">No instructor profile is available for preview yet.</p></main></Frame>; return <Frame><main className="mx-auto max-w-5xl px-5 py-12 lg:px-8 lg:py-16"><Link href="/dashboard/instructor/profile">← Edit profile</Link><div className="mt-8 rounded-[1.5rem] bg-[var(--ni-teal)] p-8 text-white"><h1 className="font-display text-4xl">{profile.publicDisplayName}</h1><p className="mt-3 text-[var(--ni-sage-line)]">{profile.countryRegion} · {profile.timezone}</p><div className="mt-8 flex flex-wrap gap-2">{profile.subjects.map((subject) => <span key={subject} className="rounded-full bg-white/10 px-3 py-1 text-sm">{subject}</span>)}</div><p className="mt-8 max-w-2xl text-lg leading-8 text-[var(--ni-sage-line)]">{profile.publicBio || "Biography pending instructor completion."}</p></div><div className="mt-6 grid gap-5 sm:grid-cols-2"><StatusCard label="Verification" status="pending review" note="Creating an account or requesting review does not mean approved verification."/><StatusCard label="Public credentials" status="summary only" note={profile.publicCredentialsSummary}/><StatusCard label="Formats" status={profile.courseFormats.join(", ")} note="Public course-format preference."/><StatusCard label="Availability" status="not published" note="Availability will appear only when profile visibility permits."/></div><div className="mt-6 rounded-2xl bg-[var(--ni-gold-soft)] p-4 text-sm ni-t-gold"><ShieldCheck className="mr-2 inline" size={17}/>Private documents, email, phone, addresses, internal notes, and storage URLs are never shown here.</div></main></Frame>; }
export function InstructorCredentials() { const { t } = useLocale(); const { currentSession } = useAuth(); const uploadPermission = trpc.storage.requestUploadPermission.useMutation(); const createCredential = trpc.supabaseCore.createCredential.useMutation(); const deleteCredential = trpc.supabaseCore.deleteCredential.useMutation(); const credentialsQuery = trpc.supabaseCore.credentials.useQuery(undefined, { enabled: Boolean(currentSession && supabaseClient) }); const signedDownload = trpc.storage.createSignedDownloadUrl.useQuery({ bucket: "instructor-credentials", objectPath: "__not_requested__" }, { enabled: false }); const [notice, setNotice] = useState(""); const handleUpload = async (file: File) => { setNotice(""); if (!currentSession || !supabaseClient) { setNotice(t("dashboard.notice")); return; } try { const permission = await uploadPermission.mutateAsync({ bucket: "instructor-credentials", filename: file.name, mimeType: file.type, sizeBytes: file.size }); if (!permission.ok) { setNotice(permission.error); return; } const { error } = await supabaseClient.storage.from(permission.data.bucket).upload(permission.data.objectPath, file, { contentType: file.type, upsert: false }); if (error) { setNotice(t("dashboard.noAuthorized")); return; } const metadata = await createCredential.mutateAsync({ objectPath: permission.data.objectPath, mimeType: file.type, sizeBytes: file.size }); if (!metadata.ok) { await supabaseClient.storage.from(permission.data.bucket).remove([permission.data.objectPath]); setNotice(t("dashboard.notice")); return; } setNotice("Private credential uploaded and awaiting protected review."); } catch { setNotice(t("courseStudio.saveError")); } }; return <Frame><main className="mx-auto max-w-4xl px-5 py-12 lg:px-8 lg:py-16"><h1 className="sr-only">Private credentials</h1><div className="mt-8 grid gap-5 md:grid-cols-2">{((credentialsQuery.data?.ok ? credentialsQuery.data.data : []) as Array<{ id: string; review_status: string; mime_type: string; size_bytes: number; object_path: string }>).map((credential) => <article key={credential.id} className="rounded-[1.35rem] border border-[var(--ni-sage)] bg-[var(--ni-paper)] p-6"><p className="text-xs font-bold uppercase tracking-[.16em] ni-t-gold">Credential document</p><label className="mt-5 block text-sm font-semibold">Institution / board<input className="mt-2 w-full rounded-xl bg-[var(--ni-sage-soft)] p-3" placeholder="Optional"/></label><label className="mt-4 block text-sm font-semibold">Public summary<textarea className="mt-2 w-full rounded-xl bg-[var(--ni-sage-soft)] p-3" placeholder="Shown only after review"/></label><input type="file" accept="application/pdf,image/png,image/jpeg" onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleUpload(file); }} className="mt-4 w-full rounded-xl bg-[var(--ni-sage-soft)] p-3 text-sm"/><p className="mt-2 text-xs ni-t-muted">{credential.review_status.replaceAll("_", " ")} · {credential.mime_type} · {Math.round(credential.size_bytes / 1024)} KB</p><button type="button" onClick={async () => { const result = await signedDownload.refetch({}); const data = result.data as { ok: true; data: { signedUrl: string } } | { ok: false; error: string } | undefined; if (data?.ok) window.open(data.data.signedUrl, "_blank", "noopener,noreferrer"); else setNotice(data?.error || "Signed download unavailable."); }} className="mt-3 rounded-full border border-[var(--ni-sage-mid)] px-4 py-2 text-xs font-bold">Open private document</button><button type="button" disabled={deleteCredential.isPending} onClick={async () => { const result = await deleteCredential.mutateAsync({ credentialId: credential.id }); if (!result.ok) { setNotice(result.error); return; } await supabaseClient?.storage.from("instructor-credentials").remove([credential.object_path]); setNotice("Private credential removed."); void credentialsQuery.refetch(); }} className="ml-2 mt-3 rounded-full border border-[var(--ni-clay-ink)] px-4 py-2 text-xs font-bold ni-t-clay">Remove document</button><label className="mt-4 flex gap-3 text-sm"><input type="checkbox" required/> I declare this information is accurate.</label><p className="mt-5 rounded-xl bg-[var(--ni-sage-soft)] p-4 text-xs ni-t-muted">New files are uploaded through authenticated private Storage and saved as pending review metadata.</p></article>)}</div><p className="mt-5 rounded-xl bg-[var(--ni-gold-soft)] p-4 text-sm ni-t-gold">{t("dashboard.privateCopy")}</p>{notice && <p className="mt-5 rounded-xl bg-[var(--ni-sage-soft)] p-4 text-sm" role="status">{notice}</p>}</main></Frame>; }
export function InstructorVerification() { const { t } = useLocale(); const verification = getVerificationStatus(); return <Frame><main className="mx-auto max-w-4xl px-5 py-12 lg:px-8 lg:py-16"><h1 className="sr-only">{t("tutorDetail.trustTitle")}</h1><div className="mt-8 grid gap-5 sm:grid-cols-2"><StatusCard label={t("common.notAvailable")} status={verification.status} note={verification.meaning}/><StatusCard label={t("common.required")} status={t("common.private")} note={verification.nextStep}/></div><p className="mt-6 rounded-xl bg-[var(--ni-gold-soft)] p-4 text-sm ni-t-gold">{t("tutorDetail.trustCopy")}</p></main></Frame>; }
export function InstructorTraining() { const { t } = useLocale(); return <Frame><main className="mx-auto max-w-4xl px-5 py-12 lg:px-8 lg:py-16"><h1 className="sr-only">{t("courseStudio.trainingTitle")}</h1><div className="mt-8 rounded-2xl bg-[var(--ni-gold-soft)] p-5 text-sm ni-t-gold" role="status">{t("courseStudio.trainingPersistenceRequired")}</div></main></Frame>; }
export function InstructorTest() { const { t } = useLocale(); const status = getTestStatus(); return <Frame><main className="mx-auto max-w-4xl px-5 py-12 lg:px-8 lg:py-16"><h1 className="sr-only">{t("courseStudio.trainingTitle")}</h1><StatusCard label={t("common.notAvailable")} status={status.status} note={status.message}/><button disabled className="mt-6 rounded-full border border-[var(--ni-sage-mid)] px-5 py-3 text-sm font-semibold ni-t-muted-soft">{t("common.comingSoon")}</button><p className="mt-5 text-sm ni-t-muted">{t("courseStudio.trainingPersistenceRequired")}</p></main></Frame>; }
/**
 * The hours a teacher opens for booking, which are what the public timetable is drawn from.
 *
 * Saving used to report success whether or not anything was written: every result was awaited and
 * none was read, so a refusal from the server arrived as "Draft saved." Two refusals were waiting
 * behind that — a weekly interval was rejected for having no date, and an edit wrote the stored row
 * back over itself — and both were invisible from here. Each result is now checked, the server's own
 * words are shown when it refuses, and nothing claims to be saved that was not.
 */
export function InstructorAvailability() {
  const { t, formatDate } = useLocale();
  const { currentSession } = useAuth();
  const realMode = Boolean(supabaseClient && currentSession);
  const availabilityQuery = trpc.scheduling.availability.useQuery(undefined, { enabled: realMode });
  const profilesQuery = trpc.supabaseCore.profiles.useQuery(undefined, { enabled: realMode, staleTime: 30_000 });
  const createAvailability = trpc.scheduling.createAvailability.useMutation();
  const updateAvailability = trpc.scheduling.updateAvailability.useMutation();
  const deleteAvailability = trpc.scheduling.deleteAvailability.useMutation();
  const [intervals, setIntervals] = useState<AvailabilityInterval[]>([]);
  const [notice, setNotice] = useState("");
  const [failure, setFailure] = useState("");
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  // The zone the profile advertises, so the hours saved here and the timetable a learner reads are
  // written on one clock. The browser's own zone stands in only until the profile has loaded.
  const profileTimezone = (() => {
    const rows = profilesQuery.data?.ok ? (profilesQuery.data.data as { profile?: { timezone?: string | null } } | null) : null;
    const stored = rows?.profile?.timezone?.trim();
    if (stored) return stored;
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
  })();

  useEffect(() => {
    if (!availabilityQuery.data?.ok) return;
    setIntervals(availabilityQuery.data.data.map((row) => ({
      id: row.id, day: dayNames[row.weekday] ?? "Sunday",
      start: String(row.start_local).slice(0, 5), end: String(row.end_local).slice(0, 5),
      timezone: row.timezone, active: row.active,
      bufferMinutes: row.buffer_minutes ?? 0, minimumNoticeMinutes: row.minimum_notice_minutes ?? 60,
    })));
  }, [availabilityQuery.data]);

  const add = () => setIntervals((current) => [...current, {
    id: `draft-${Date.now()}-${current.length}`, day: "Thursday", start: "19:00", end: "20:00",
    timezone: profileTimezone, active: true, bufferMinutes: 0, minimumNoticeMinutes: 60,
  }]);

  const save = async () => {
    setNotice("");
    setFailure("");
    if (!realMode) { setFailure(t("dashboard.notice")); return; }
    try {
      for (const interval of intervals) {
        const weekday = Math.max(0, dayNames.indexOf(interval.day));
        const payload = {
          weekday, startLocal: interval.start, endLocal: interval.end,
          timezone: interval.timezone || profileTimezone, active: interval.active,
          bufferMinutes: interval.bufferMinutes ?? 0, minimumNoticeMinutes: interval.minimumNoticeMinutes ?? 60,
          // Stated rather than left to a default, so the server and this form agree on the shape.
          exceptionType: "weekly" as const,
        };
        const result = interval.id.startsWith("draft-")
          ? await createAvailability.mutateAsync(payload)
          : await updateAvailability.mutateAsync({ id: interval.id, ...payload });
        // A refusal arrives as a successful request carrying ok: false. Reading it is the whole point.
        if (!result.ok) { setFailure(result.error || t("availability.saveFailed")); return; }
      }
      await availabilityQuery.refetch();
      setNotice(t("availability.saved"));
    } catch (error) {
      // A throw here is the request itself failing — a rejected input, a dropped connection — not a
      // rule the teacher broke, so the screen keeps plain words and the detail goes to the console,
      // where it is worth something. A silent generic message cost a long search once already.
      console.error("[availability] save failed:", error);
      setFailure(t("availability.saveFailed"));
    }
  };

  const field = "rounded-xl bg-[var(--ni-sage-soft)] p-3 text-sm";
  return <Frame><main className="mx-auto max-w-4xl px-5 py-12 lg:px-8 lg:py-16">
    <h1 className="sr-only">{t("teachers.availability")}</h1>
    <p className="text-xs ni-t-muted">{t("availability.timezoneNote", { timezone: profileTimezone })}</p>
    <div className="mt-6 space-y-4">
      {intervals.map((interval) => (
        <div key={interval.id} className="grid gap-3 rounded-2xl border border-[var(--ni-sage)] bg-[var(--ni-paper)] p-5 sm:grid-cols-6">
          {/* A free-text day silently became Sunday whenever it was not spelled exactly right. */}
          <select
            aria-label={t("availability.day")}
            value={Math.max(0, dayNames.indexOf(interval.day))}
            onChange={(e) => setIntervals((current) => current.map((item) => item.id === interval.id ? { ...item, day: dayNames[Number(e.target.value)] } : item))}
            className={field}
          >
            {dayNames.map((name, index) => (
              <option key={name} value={index}>
                {formatDate(Date.UTC(2026, 8, 13 + index), { weekday: "long", timeZone: "UTC" })}
              </option>
            ))}
          </select>
          <input type="time" aria-label={t("availability.start")} value={interval.start} onChange={(e) => setIntervals((current) => current.map((item) => item.id === interval.id ? { ...item, start: e.target.value } : item))} className={field}/>
          <input type="time" aria-label={t("availability.end")} value={interval.end} onChange={(e) => setIntervals((current) => current.map((item) => item.id === interval.id ? { ...item, end: e.target.value } : item))} className={field}/>
          <input type="number" min="0" max="1440" value={interval.bufferMinutes ?? 0} aria-label="Buffer minutes" onChange={(e) => setIntervals((current) => current.map((item) => item.id === interval.id ? { ...item, bufferMinutes: Number(e.target.value) } : item))} className={field} placeholder="Buffer min"/>
          <input type="number" min="0" max="10080" value={interval.minimumNoticeMinutes ?? 60} aria-label="Minimum notice minutes" onChange={(e) => setIntervals((current) => current.map((item) => item.id === interval.id ? { ...item, minimumNoticeMinutes: Number(e.target.value) } : item))} className={field} placeholder="Notice min"/>
          <button onClick={async () => { if (realMode && !interval.id.startsWith("draft-")) await deleteAvailability.mutateAsync({ id: interval.id }); setIntervals((current) => current.filter((item) => item.id !== interval.id)); }} className="rounded-xl bg-[var(--ni-clay-soft)] px-3 py-2 text-sm font-bold ni-t-clay">Remove</button>
        </div>
      ))}
    </div>
    <div className="mt-6 flex flex-wrap gap-3">
      <button onClick={add} className="rounded-full border border-[var(--ni-sage-mid)] px-5 py-3 text-sm font-semibold">Add interval</button>
      <button onClick={() => void save()} disabled={createAvailability.isPending || updateAvailability.isPending} className="rounded-full bg-[var(--ni-moss)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">Save availability</button>
    </div>
    {notice && <p className="mt-5 rounded-xl border border-[var(--ni-sage-mid)] bg-[var(--ni-sage-soft)] p-4 text-sm ni-t-moss-deep" role="status">{notice}</p>}
    {failure && <p className="mt-5 rounded-xl bg-[var(--ni-clay-soft)] p-4 text-sm ni-t-clay" role="alert">{failure}</p>}
  </main></Frame>;
}

export function InstructorSettings() {
  const { t } = useLocale();
  const { currentSession } = useAuth();
  const updateProfile = trpc.supabaseCore.updateProfile.useMutation();
  const [fullName, setFullName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [preferredLanguage, setPreferredLanguage] = useState("English");
  const [preferredLocale, setPreferredLocale] = useState<"en" | "ur" | "ar">("en");
  const [notice, setNotice] = useState<string | null>(null);
  const save = async () => {
    setNotice(null);
    try {
      const result = await updateProfile.mutateAsync({ fullName, displayName, preferredLanguage, preferredLocale });
      setNotice(result.ok ? "Profile preferences saved to Supabase." : result.error);
    } catch {
      setNotice("Profile preferences could not be saved.");
    }
  };
  return <Frame><main className="mx-auto max-w-4xl px-5 py-12 lg:px-8 lg:py-16"><h1 className="sr-only">{t("dashboard.settings")}</h1><div className="mt-8 grid gap-4 sm:grid-cols-2"><label className="rounded-2xl bg-[var(--ni-paper)] p-5 text-sm font-semibold">{t("dashboard.fullName")}<input value={fullName} onChange={(event) => setFullName(event.target.value)} className="mt-3 w-full rounded-xl bg-[var(--ni-sage-soft)] p-3 text-sm"/></label><label className="rounded-2xl bg-[var(--ni-paper)] p-5 text-sm font-semibold">{t("dashboard.displayName")}<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="mt-3 w-full rounded-xl bg-[var(--ni-sage-soft)] p-3 text-sm"/></label><label className="rounded-2xl bg-[var(--ni-paper)] p-5 text-sm font-semibold">Preferred language<select value={preferredLanguage} onChange={(event) => setPreferredLanguage(event.target.value)} className="mt-3 w-full rounded-xl bg-[var(--ni-sage-soft)] p-3 text-sm"><option>English</option><option>Urdu</option><option>Arabic</option></select></label><label className="rounded-2xl bg-[var(--ni-paper)] p-5 text-sm font-semibold">Interface locale<select value={preferredLocale} onChange={(event) => setPreferredLocale(event.target.value as "en" | "ur" | "ar")} className="mt-3 w-full rounded-xl bg-[var(--ni-sage-soft)] p-3 text-sm"><option value="en">English</option><option value="ur">Urdu</option><option value="ar">Arabic</option></select></label><div className="rounded-2xl bg-[var(--ni-sage-soft)] p-5 text-sm"><p className="font-semibold">{t("dashboard.notifications")}</p><p className="mt-2 ni-t-muted">{t("dashboard.notificationsSetup")}</p></div><div className="rounded-2xl bg-[var(--ni-sage-soft)] p-5 text-sm"><p className="font-semibold">{t("common.setupNeeded")}</p><p className="mt-2 ni-t-muted">{t("dashboard.verificationBoundary")}</p></div></div><button type="button" onClick={() => void save()} disabled={updateProfile.isPending} className="mt-7 rounded-full bg-[var(--ni-moss)] px-5 py-3 text-sm font-semibold text-white">{updateProfile.isPending ? t("dashboard.loading") : t("dashboard.savePreferences")}</button>{notice && <p className="mt-5 rounded-xl bg-[var(--ni-gold-soft)] p-4 text-sm ni-t-gold" role="status">{notice}</p>}</main></Frame>;
}

/** The listing row the public profile renders, as the slug procedure returns it. */
type PublicInstructorRow = DiscoveryInstructor & { user_id: string; timezone: string };

/**
 * The profile body for an instructor that loaded.
 *
 * Separate from the route component so the presentation hooks always run: a hook
 * behind a loading branch would change the hook order between renders.
 */
function PublicInstructorBody({ slug, profile }: { slug: string; profile: PublicInstructorRow }) {
  const { t, formatNumber } = useLocale();
  const name = profile.displayName?.trim() || profile.public_slug;
  const subjects = profile.subjects ?? [];
  const languages = profile.teaching_languages ?? [];
  const levels = profile.teaching_levels ?? [];
  const approved = profile.verification_status === "approved";
  const facts = useInstructorFacts(profile);

  // One formatter for the whole site; the credits half comes from the Pricing module's own rule.
  const rate = useHourlyRate(profile.hourly_rate_minor, profile.currency);

  // The detail rows, in the order the reference profile reads them. A row with nothing behind it
  // is dropped rather than printed with a dash, so a thin profile looks short instead of broken.
  const details: Array<{ label: string; value: React.ReactNode }> = [];
  if (subjects.length) details.push({ label: t("tutorProfile.courses"), value: <ChipRow items={subjects} /> });
  if (levels.length) details.push({ label: t("marketplace.level"), value: <ChipRow items={levels} /> });
  if (languages.length) details.push({ label: t("discovery.languages"), value: <ChipRow items={languages} /> });
  if (profile.gender) details.push({ label: t("gender.label"), value: profile.gender });
  if (profile.sect) details.push({ label: t("discovery.sect"), value: profile.sect });
  if (typeof profile.years_experience === "number") {
    details.push({ label: t("discovery.experience"), value: <span className="ltr-embed">{formatNumber(profile.years_experience)}</span> });
  }
  if (profile.has_ijazah) details.push({ label: t("discovery.ijazah"), value: t("adminUI.yes") });
  if (profile.timezone) details.push({ label: t("discovery.timezone"), value: <span className="ltr-embed">{profile.timezone}</span> });
  if (profile.availability_summary) details.push({ label: t("teachers.availability"), value: profile.availability_summary });

  return (
    <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start">
      <div className="min-w-0">
        <div className="flex items-start gap-5">
          <InstructorAvatar name={name} src={displayableImageSrc(profile.avatarUrl)} size="h-20 w-20" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h1 className="min-w-0 font-display text-4xl ni-t-ink">{name}</h1>
              {approved && (
                <span className="inline-flex shrink-0 items-center gap-1 ni-label" style={{ color: "var(--ni-moss-deep)" }}>
                  <BadgeCheck size={15} aria-hidden="true" />
                  {t("marketplace.verified")}
                </span>
              )}
              {profile.country && (
                <span className="inline-flex shrink-0 items-center gap-1 text-xs ni-t-muted">
                  <Globe2 size={12} aria-hidden="true" />
                  {profile.country}
                </span>
              )}
              {/* Shown only once somebody has reviewed. Five empty stars would read as a zero. */}
              {typeof profile.ratingAverage === "number" ? (
                <Rating average={profile.ratingAverage} count={profile.ratingCount ?? 0} showCount />
              ) : (
                <span className="text-xs ni-t-muted-soft">{t("discovery.noReviews")}</span>
              )}
            </div>
            {subjects.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="ni-label">{t("discovery.canTeach")}</span>
                {subjects.map((subject) => <Chip key={subject}>{subject}</Chip>)}
              </div>
            )}
          </div>
        </div>

        {/* The instructor's own words, never a generated summary. The bio introduces the person and
            the teaching approach describes the lesson; when only one was written, only one shows. */}
        {profile.bio && (
          <section className="mt-7">
            <h2 className="font-display text-xl ni-t-ink">{t("tutorProfile.about", { name })}</h2>
            <p className="mt-2.5 max-w-[68ch] whitespace-pre-line text-sm leading-7 ni-t-muted">{profile.bio}</p>
          </section>
        )}
        {profile.teaching_approach && profile.teaching_approach !== profile.bio && (
          <section className="mt-6">
            <h2 className="font-display text-xl ni-t-ink">{t("tutorProfile.howITeach")}</h2>
            <p className="mt-2.5 max-w-[68ch] whitespace-pre-line text-sm leading-7 ni-t-muted">{profile.teaching_approach}</p>
          </section>
        )}

        {facts.length > 0 && (
          <div className="mt-6 grid grid-cols-2 gap-y-4 border-t border-[var(--ni-sage)] pt-4 sm:grid-cols-3 lg:flex lg:flex-wrap">
            {facts.map((fact) => <Fact key={fact.label} label={fact.label} value={fact.value} unit={fact.unit} />)}
          </div>
        )}

        <PublicInstructorMedia slug={slug} />

        <PublicInstructorBackground instructorId={profile.user_id} />

        <InstructorAvailabilityCalendar slug={slug} instructorName={name} instructorTimezone={profile.timezone} />

        {details.length > 0 && (
          <section className="mt-10">
            <h2 className="font-display text-2xl ni-t-ink">{t("tutorProfile.details")}</h2>
            <dl className="mt-4 divide-y divide-[var(--ni-sage)] border-y border-[var(--ni-sage)]">
              {details.map((row) => (
                <div key={row.label} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-3">
                  <dt className="ni-label w-40 shrink-0">{row.label}</dt>
                  <dd className="min-w-0 flex-1 text-sm ni-t-ink">{row.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <section className="mt-10">
          <h2 className="font-display text-2xl ni-t-ink">{t("reviews.publicTitle")}</h2>
          <InstructorRating instructorId={profile.user_id}/>
        </section>
      </div>

      {/* The side rail carries the two things a reader came to do: ask for a first class, and ask a
          question. Both are the real actions; neither is a placeholder. */}
      <aside className="space-y-4 lg:sticky lg:top-24">
        <div className="rounded-2xl border border-[var(--ni-sage)] bg-[var(--ni-paper)] p-5">
          <p className="font-display text-3xl ni-t-ink ltr-embed">{rate ? rate.money : t("marketplace.rateOnRequest")}</p>
          {rate && <p className="mt-0.5 text-xs ni-t-muted">{t("tutorProfile.perHour")}</p>}
          {approved && (
            <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold ni-t-moss-deep">
              <BadgeCheck size={14} aria-hidden="true" />
              {t("tutorProfile.approved")}
            </p>
          )}
          <div className="mt-4">
            <TrialCTA context={{ instructorSlug: slug }} label={t("tutorDetail.requestTrial")}/>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--ni-sage)] bg-[var(--ni-paper)] p-5">
          <h2 className="font-display text-lg ni-t-ink">{t("tutorProfile.messageTitle", { name })}</h2>
          <p className="mt-1.5 text-xs leading-5 ni-t-muted">{t("tutorProfile.messageCopy")}</p>
          <MessageAction counterpartId={profile.user_id} tone="standard"/>
        </div>
      </aside>
    </div>
  );
}

/**
 * The teacher's introduction, when they have uploaded one and chosen to show it.
 *
 * Both players are absent unless a file exists: a dark empty video frame on every profile would
 * promise something most teachers have not recorded. The URLs are signed and expire, so nothing
 * here is a permanent public link to the bucket.
 */
/**
 * The teacher's stated background, on their public profile.
 *
 * The editor writes three lists; this is where a student reads them. Rows arrive already ordered by
 * the server, and a teacher who has written nothing simply has no section here rather than an empty
 * heading. The public policy on `instructor_qualifications` is what permits the read, so an
 * unpublished profile returns nothing and this renders nothing.
 */
function PublicInstructorBackground({ instructorId }: { instructorId: string | null | undefined }) {
  const { t } = useLocale();
  const query = trpc.schedulingPublic.instructorQualifications.useQuery(
    { instructorId: instructorId ?? "00000000-0000-0000-0000-000000000000" },
    { enabled: Boolean(instructorId), retry: false, staleTime: 60_000 },
  );
  const rows = (query.data?.ok ? query.data.data : []) as { id: string; kind: string; title: string; organisation: string | null; period: string | null; detail: string | null }[];
  if (rows.length === 0) return null;

  const groups: { kind: string; labelKey: TranslationKey }[] = [
    { kind: "employment", labelKey: "tutorQual.employment" },
    { kind: "certification", labelKey: "tutorQual.certification" },
    { kind: "ijazah", labelKey: "tutorQual.ijazah" },
  ];

  return (
    <section className="mt-10">
      <h2 className="font-display text-2xl ni-t-ink">{t("tutorQual.title")}</h2>
      <div className="mt-4 grid gap-6">
        {groups.map((group) => {
          const mine = rows.filter((row) => row.kind === group.kind);
          if (mine.length === 0) return null;
          return (
            <div key={group.kind}>
              <h3 className="ni-label">{t(group.labelKey)}</h3>
              <ul className="mt-2.5 grid gap-3">
                {mine.map((row) => (
                  <li key={row.id} className="border-s-2 border-[var(--ni-gold-mid)] ps-3.5">
                    <p className="text-sm font-bold ni-t-ink">{row.title}</p>
                    {(row.organisation || row.period) && (
                      <p className="mt-0.5 text-sm ni-t-muted">
                        {[row.organisation, row.period].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    {row.detail && <p className="mt-1 max-w-[66ch] text-sm leading-6 ni-t-muted">{row.detail}</p>}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PublicInstructorMedia({ slug }: { slug: string }) {
  const { t } = useLocale();
  const query = trpc.schedulingPublic.instructorMedia.useQuery({ slug }, { retry: false, staleTime: 300_000 });
  const items = (query.data?.ok ? query.data.data : []) as Array<{ id: string; kind: "video" | "audio" | "image"; mimeType: string; url: string }>;
  const video = items.find((item) => item.kind === "video");
  const audio = items.find((item) => item.kind === "audio");
  if (!video && !audio) return null;

  return (
    <section className="mt-7 grid gap-5 sm:grid-cols-2">
      {video && (
        <div className="min-w-0">
          <h2 className="font-display text-lg ni-t-ink">{t("tutorProfile.checkMyVideo")}</h2>
          <video controls preload="metadata" className="mt-2.5 w-full rounded-xl border border-[var(--ni-sage)] bg-black">
            <source src={video.url} type={video.mimeType} />
          </video>
        </div>
      )}
      {audio && (
        <div className="min-w-0">
          <h2 className="font-display text-lg ni-t-ink">{t("tutorProfile.recitation")}</h2>
          <audio controls preload="metadata" className="mt-2.5 w-full">
            <source src={audio.url} type={audio.mimeType} />
          </audio>
        </div>
      )}
    </section>
  );
}

/** A row of chips, used wherever a detail holds several values rather than one. */
function ChipRow({ items }: { items: string[] }) {
  return <span className="flex flex-wrap gap-1.5">{items.map((item) => <Chip key={item}>{item}</Chip>)}</span>;
}

export function PublicInstructorProfile({ slug }: { slug: string }) {
  const { t } = useLocale();
  const profileQuery = trpc.schedulingPublic.instructorBySlug.useQuery({ slug }, { retry: false });
  const profile = profileQuery.data?.ok ? profileQuery.data.data : null;

  // No `Frame` here. That strip is the instructor's own desk navigation — Profile, Training,
  // Availability — and this page is read by learners: on the public route it advertised a desk the
  // reader has no account for, and inside a learner's dashboard it sat on top of their own sidebar.
  // The public route supplies the site header and footer instead.
  return (
    <div className="min-h-screen bg-[var(--ni-bg)] ni-t-ink">
      <main className="mx-auto max-w-6xl px-5 py-16 lg:px-8 lg:py-20">
        {profileQuery.isLoading ? (
          <p className="mt-8 rounded-2xl bg-[var(--ni-sage-soft)] p-5 text-sm ni-t-muted">{t("common.loading")}</p>
        ) : profileQuery.isError || !profile ? (
          <>
            <h1 className="mt-4 font-display text-5xl">{t("tutorDetail.noVerification")}</h1>
            <p className="mt-4 ni-t-muted">{t("tutorDetail.trustCopy")}</p>
            <Link href="/teachers" className="mt-7 inline-flex rounded-full bg-[var(--ni-moss)] px-5 py-3 text-sm font-semibold text-white">{t("tutorDetail.back")}</Link>
          </>
        ) : (
          <PublicInstructorBody slug={slug} profile={profile as PublicInstructorRow} />
        )}
      </main>
    </div>
  );
}
