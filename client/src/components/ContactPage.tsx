/**
 * Contact.
 *
 * The form is back, and this time it goes somewhere. What was here originally took a name, an email
 * and a message, and on submit did exactly one thing: `setSent(true)`. Somebody describing a problem
 * with a teacher was shown a tick and a thank-you, and their words went nowhere.
 *
 * `submitContactMessage` writes a row to `contact_messages`, which a reviewer reads on the admin
 * desk. No email provider is involved — a row somebody actually reads is a working channel, and
 * waiting for a mail integration would have meant leaving the form broken for longer.
 *
 * Three things follow from that, and they are the whole design:
 *
 *  - **The tick only appears when the row exists.** A failed write says so and keeps what was
 *    typed, because losing someone's message twice would be worse than the first time.
 *  - **"I am writing as"** is asked because a teacher and a parent need answering in different
 *    terms, and the reviewer sees it beside the message.
 *  - **Anyone may write**, signed in or not. A person who cannot sign in is exactly the person most
 *    likely to need to. Where a human-verification provider is configured the gate stands in front;
 *    where none is, it lets the form through rather than inventing a pass.
 */
import { useState } from "react";
import { Link } from "wouter";
import { Check, Send } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "../contexts/LocaleContextState";
import HumanVerificationGate from "./HumanVerificationGate";
import type { TranslationKey } from "@/i18n/catalog";

type Role = "student" | "teacher" | "other";

const ROLES: { value: Role; labelKey: TranslationKey }[] = [
  { value: "student", labelKey: "contact.asStudent" },
  { value: "teacher", labelKey: "contact.asTeacher" },
  { value: "other", labelKey: "contact.asOther" },
];

const field =
  "mt-2 w-full rounded-xl border border-[var(--ni-sage-line)] bg-[var(--ni-field)] px-4 py-3 text-sm ni-t-ink outline-none focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]";

function ContactForm({ humanToken }: { humanToken?: string }) {
  const { t } = useLocale();
  const { currentSession } = useAuth();
  const send = trpc.supabase.submitContactMessage.useMutation();

  // Seeded from the account when there is one, so a signed-in member is not retyping what we know.
  const [role, setRole] = useState<Role>(currentSession?.role === "instructor" ? "teacher" : "student");
  // The session has an email and a role; a display name is not on it, so the field starts empty.
  const [name, setName] = useState("");
  const [email, setEmail] = useState(currentSession?.email ?? "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sent, setSent] = useState(false);
  const [failed, setFailed] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFailed("");
    const result = await send.mutateAsync({ name, email, role, subject, body, humanToken }).catch(() => null);
    // The tick is shown only for a row that exists. Anything else keeps the text and says why.
    if (!result || !result.ok) {
      setFailed(result && !result.ok ? result.error : t("courseStudio.saveError"));
      return;
    }
    setSent(true);
    setSubject("");
    setBody("");
  };

  if (sent) {
    return (
      <div className="ni-ed-card p-10 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-[var(--ni-moss)] bg-[var(--ni-sage-soft)] ni-t-moss-deep">
          <Check size={26} aria-hidden="true" />
        </span>
        <h2 className="mt-5 font-display text-2xl ni-t-ink">{t("contact.sentTitle")}</h2>
        <p className="mx-auto mt-3 max-w-[54ch] text-sm leading-7 ni-t-muted">{t("contact.sentCopy")}</p>
        <button type="button" onClick={() => setSent(false)} className="ni-btn ni-btn--outline mt-6 text-sm">
          {t("contact.sendAnother")}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="ni-ed-card p-6 lg:p-7">
      <fieldset>
        <legend className="text-sm font-bold ni-t-gold">{t("contact.asWho")}</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {ROLES.map((option) => (
            <label
              key={option.value}
              className={`cursor-pointer rounded-full border px-4 py-2 text-sm font-semibold transition ${
                role === option.value
                  ? "border-[var(--ni-gold)] bg-[var(--ni-gold)] text-[var(--ni-on-gold)]"
                  : "border-[var(--ni-sage-line)] ni-t-muted hover:bg-[var(--ni-field)]"}`}
            >
              <input
                type="radio"
                name="contact-role"
                value={option.value}
                checked={role === option.value}
                onChange={() => setRole(option.value)}
                className="sr-only"
              />
              {t(option.labelKey)}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <label className="block text-sm font-semibold ni-t-ink">
          {t("contact.name")}
          <input required value={name} onChange={(event) => setName(event.target.value)} maxLength={120} className={field} />
        </label>
        <label className="block text-sm font-semibold ni-t-ink">
          {t("contact.email")}
          <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={200} className={field} />
        </label>
      </div>

      <label className="mt-5 block text-sm font-semibold ni-t-ink">
        {t("contact.subject")}
        <input required value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={160} className={field} />
      </label>

      <label className="mt-5 block text-sm font-semibold ni-t-ink">
        {t("contact.message")}
        <textarea required value={body} onChange={(event) => setBody(event.target.value)} maxLength={4000} rows={7} className={field} />
      </label>

      {failed && (
        <p role="alert" className="mt-5 rounded-xl border border-[var(--ni-clay)] bg-[var(--ni-clay-soft)] p-3.5 text-sm ni-t-clay-ink">
          {failed}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={send.isPending} className="ni-btn ni-btn--primary text-sm">
          <Send size={15} aria-hidden="true" /> {send.isPending ? t("contact.sending") : t("contact.send")}
        </button>
        <span className="text-xs ni-t-muted">
          {t("contact.faqHint")}{" "}
          <Link href="/faqs" className="ni-link font-bold">{t("nav.faqs")}</Link>
        </span>
      </div>
    </form>
  );
}

export default function ContactPage() {
  const { t } = useLocale();
  return (
    <main className="mx-auto max-w-3xl px-5 py-12 lg:px-8 lg:py-16">
      <h1 className="font-display text-4xl ni-t-ink">{t("contact.title")}</h1>
      <p className="mt-3 max-w-[66ch] text-sm leading-7 ni-t-muted">{t("contact.formIntro")}</p>

      <div className="mt-8">
        {/* Where a provider is configured this stands in front of the form; where none is, it lets
            the form through and invents no pass. The token it yields is checked on the server. */}
        <HumanVerificationGate>
          {(token) => <ContactForm humanToken={token} />}
        </HumanVerificationGate>
      </div>
    </main>
  );
}
