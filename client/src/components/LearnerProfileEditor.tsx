/**
 * Learner "Edit Profile" page.
 *
 * Section order and grouping follow the reference student profile screen: Change Password first,
 * then Personal Info, then Subjects with the tutor-messaging consent note, then Location. Rendered
 * in Noor Ilm's own tokens and typography rather than the reference's colours.
 *
 * Password changes go through Supabase Auth; profile fields go through the server-owned
 * updateLearnerProfile procedure, which scopes both writes to the caller's own id.
 */
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { useLocale } from "../contexts/LocaleContextState";
import { SearchableMultiSelect, SearchableSelect } from "./SearchableSelect";
import { countryOptions, languageOptions, subjectOptions, timezoneOptions } from "../lib/reference-data";

// Subjects come from the list Noor Ilm already recommends (categories in lms-data).
const SUBJECT_OPTIONS = subjectOptions;

type CoreProfiles = {
  profile: Record<string, unknown> | null;
  learnerProfile: Record<string, unknown> | null;
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-[var(--ni-sage)] pb-8 last:border-b-0 last:pb-0">
      <h2 className="mb-5 font-display text-2xl text-[var(--ni-moss)]">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, htmlFor, children, hint }: { label: string; htmlFor?: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-4 grid gap-1.5 sm:grid-cols-[10rem_1fr] sm:items-start sm:gap-4">
      <label htmlFor={htmlFor} className="pt-2.5 text-sm font-semibold text-[var(--ni-moss-deep)] sm:text-end">{label}</label>
      <div className="min-w-0">
        {children}
        {hint && <p className="mt-1.5 text-xs leading-5 text-[var(--ni-muted-soft)]">{hint}</p>}
      </div>
    </div>
  );
}

const fieldClass = "w-full rounded-xl border border-[var(--ni-sage-line)] bg-[var(--ni-field)] px-4 py-2.5 text-sm text-[var(--ni-ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)] disabled:cursor-not-allowed disabled:bg-[var(--ni-sage-soft)] disabled:text-[var(--ni-muted)]";

export default function LearnerProfileEditor() {
  const { t } = useLocale();
  const { user, updatePassword, refreshProfile } = useAuth();
  const profilesQuery = trpc.supabaseCore.profiles.useQuery(undefined, { retry: false });
  const saveProfile = trpc.supabaseCore.updateLearnerProfile.useMutation();

  const core = profilesQuery.data?.ok ? profilesQuery.data.data as CoreProfiles : null;

  const [fullName, setFullName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [timezone, setTimezone] = useState("");
  const [languages, setLanguages] = useState<string[]>([]);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [profileError, setProfileError] = useState("");
  const [profileSaved, setProfileSaved] = useState(false);

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  // Seed the form once the real profile arrives; never invent placeholder values.
  useEffect(() => {
    if (!core?.profile) return;
    const p = core.profile;
    setFullName(String(p.full_name ?? ""));
    setDisplayName(String(p.display_name ?? ""));
    setCountry(String(p.country ?? ""));
    setCity(String(p.city ?? ""));
    setTimezone(String(p.timezone ?? ""));
    setLanguages(((p.supported_languages as string[] | null) ?? []));
    setSubjects(((core.learnerProfile?.learning_subjects as string[] | null) ?? []));
  }, [core]);

  const submitProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    setProfileError(""); setProfileSaved(false);
    if (!fullName.trim() || !displayName.trim()) { setProfileError(t("learnerProfile.nameRequired")); return; }
    try {
      const result = await saveProfile.mutateAsync({
        fullName, displayName,
        learningSubjects: subjects,
        country: country || undefined,
        city: city || undefined,
        timezone: timezone || undefined,
        supportedLanguages: languages,
      });
      if (!result.ok) { setProfileError(result.error || t("common.error")); return; }
      setProfileSaved(true);
      await refreshProfile();
    } catch (cause) {
      setProfileError(cause instanceof Error && cause.message ? cause.message : t("common.error"));
    }
  };

  const submitPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordError(""); setPasswordSaved(false);
    if (newPassword.length < 8) { setPasswordError(t("auth.passwordMin")); return; }
    if (newPassword !== confirmPassword) { setPasswordError(t("learnerProfile.passwordMismatch")); return; }
    setSavingPassword(true);
    try {
      const result = await updatePassword(newPassword);
      if (!result.ok) { setPasswordError(result.error || t("common.error")); return; }
      setPasswordSaved(true);
      setOldPassword(""); setNewPassword(""); setConfirmPassword("");
    } finally { setSavingPassword(false); }
  };

  if (profilesQuery.isLoading) {
    return <div className="mx-auto max-w-4xl px-5 py-10 lg:px-10" aria-live="polite"><p className="rounded-2xl bg-[var(--ni-sage-soft)] p-5 text-sm text-[var(--ni-muted)]">{t("dashboard.loading")}</p></div>;
  }

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 lg:px-10 lg:py-10">
      <h1 className="mb-8 font-display text-3xl text-[var(--ni-ink)]">{t("learnerProfile.title")}</h1>

      <div className="space-y-8 rounded-[1.35rem] border border-[var(--ni-sage)] bg-[var(--ni-paper)] p-6 lg:p-8">
        <Section title={t("learnerProfile.changePassword")}>
          <form onSubmit={submitPassword}>
            <Row label={t("learnerProfile.oldPassword")} htmlFor="old-password">
              <input id="old-password" type="password" autoComplete="current-password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} className={fieldClass}/>
            </Row>
            <Row label={t("learnerProfile.newPassword")} htmlFor="new-password">
              <input id="new-password" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={fieldClass}/>
            </Row>
            <Row label={t("learnerProfile.confirmPassword")} htmlFor="confirm-password">
              <input id="confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={fieldClass}/>
            </Row>
            {passwordError && <p role="alert" className="mb-3 rounded-xl bg-[var(--ni-clay-soft)] px-4 py-2.5 text-sm text-[var(--ni-clay)]">{passwordError}</p>}
            {passwordSaved && <p className="mb-3 rounded-xl bg-[var(--ni-sage-soft)] px-4 py-2.5 text-sm text-[var(--ni-moss-deep)]"><Check size={14} className="me-1 inline"/>{t("learnerProfile.passwordSaved")}</p>}
            <div className="flex justify-end">
              <button type="submit" disabled={savingPassword} className="rounded-full bg-[var(--ni-moss)] px-6 py-2.5 text-sm font-semibold text-white outline-none transition-colors hover:bg-[var(--ni-teal-soft)] focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)] disabled:cursor-not-allowed disabled:opacity-60">
                {savingPassword ? t("onboarding.saving") : t("common.save")}
              </button>
            </div>
          </form>
        </Section>

        <form onSubmit={submitProfile}>
          <Section title={t("learnerProfile.personalInfo")}>
            <Row label={t("learnerProfile.name")} htmlFor="full-name">
              <input id="full-name" required value={fullName} onChange={(e) => setFullName(e.target.value)} className={fieldClass}/>
            </Row>
            <Row label={t("learnerProfile.displayName")} htmlFor="display-name">
              <input id="display-name" required value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={fieldClass}/>
            </Row>
            <Row label={t("learnerProfile.email")} htmlFor="email">
              {/* Email is the Auth identity and is not editable from the profile form. */}
              <input id="email" type="email" value={user?.email ?? ""} disabled readOnly className={`${fieldClass} ltr-embed`}/>
            </Row>
            <Row label={t("learnerProfile.languages")} htmlFor="languages" hint={t("learnerProfile.languagesHint")}>
              <SearchableMultiSelect id="languages" options={languageOptions()} values={languages} onChange={setLanguages} placeholder={t("learnerProfile.languagesPlaceholder")}/>
            </Row>
          </Section>

          <Section title={t("learnerProfile.subjects")}>
            <fieldset>
              <legend className="mb-3 text-sm font-semibold text-[var(--ni-moss-deep)]">{t("learnerProfile.wantToLearn")}</legend>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {SUBJECT_OPTIONS.map((subject) => (
                  <label key={subject} className="flex cursor-pointer items-center gap-2.5 text-sm text-[var(--ni-ink)]">
                    <input
                      type="checkbox"
                      checked={subjects.includes(subject)}
                      onChange={() => setSubjects((current) => current.includes(subject) ? current.filter((s) => s !== subject) : [...current, subject])}
                      className="h-4 w-4 accent-[var(--ni-moss)]"
                    />
                    {subject}
                  </label>
                ))}
              </div>
              <p className="mt-3 text-xs leading-5 text-[var(--ni-gold-ink)]">{t("learnerProfile.subjectsNote")}</p>
            </fieldset>
          </Section>

          <Section title={t("learnerProfile.location")}>
            <Row label={t("learnerProfile.country")} htmlFor="country">
              <SearchableSelect id="country" options={countryOptions()} value={country} onChange={setCountry}/>
            </Row>
            <Row label={t("learnerProfile.timezone")} htmlFor="timezone" hint={t("learnerProfile.timezoneHint")}>
              <SearchableSelect id="timezone" options={timezoneOptions()} value={timezone} onChange={setTimezone} placeholder="Asia/Karachi"/>
            </Row>
            <Row label={t("learnerProfile.city")} htmlFor="city">
              <input id="city" value={city} onChange={(e) => setCity(e.target.value)} className={fieldClass}/>
            </Row>
          </Section>

          {profileError && <p role="alert" className="mt-6 rounded-xl bg-[var(--ni-clay-soft)] px-4 py-2.5 text-sm text-[var(--ni-clay)]">{profileError}</p>}
          {profileSaved && <p className="mt-6 rounded-xl bg-[var(--ni-sage-soft)] px-4 py-2.5 text-sm text-[var(--ni-moss-deep)]"><Check size={14} className="me-1 inline"/>{t("learnerProfile.profileSaved")}</p>}

          <div className="mt-7 flex justify-end gap-3">
            <button type="button" onClick={() => { if (core?.profile) { const p = core.profile; setFullName(String(p.full_name ?? "")); setDisplayName(String(p.display_name ?? "")); setCountry(String(p.country ?? "")); setCity(String(p.city ?? "")); setTimezone(String(p.timezone ?? "")); setLanguages(((p.supported_languages as string[] | null) ?? [])); setSubjects(((core.learnerProfile?.learning_subjects as string[] | null) ?? [])); setProfileError(""); setProfileSaved(false); } }}
              className="rounded-full border border-[var(--ni-sage-mid)] px-6 py-2.5 text-sm font-semibold text-[var(--ni-muted)] outline-none hover:bg-[var(--ni-sage-soft)] focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]">
              {t("onboarding.back")}
            </button>
            <button type="submit" disabled={saveProfile.isPending}
              className="rounded-full bg-[var(--ni-moss)] px-6 py-2.5 text-sm font-semibold text-white outline-none transition-colors hover:bg-[var(--ni-teal-soft)] focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)] disabled:cursor-not-allowed disabled:opacity-60">
              {saveProfile.isPending ? t("onboarding.saving") : t("common.save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
