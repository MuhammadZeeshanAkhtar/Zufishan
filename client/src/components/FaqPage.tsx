/**
 * Frequently asked questions.
 *
 * What was here before was a single list of five questions, hardcoded in English, every one of
 * which opened to the same placeholder sentence. A page where every answer is identical answers
 * nothing.
 *
 * This is the reference marketplace's shape — four headed groups, each question a box that opens on
 * a plus — with two differences that matter. The headings are gold rather than green, which is this
 * project's own accent. And the questions cover what Zufishan actually has, including the modules
 * the reference does not: the AI Tutor, the currency switch on Pricing, courses, the Hifz tracker.
 *
 * Every answer is written to be true today. Where something is not connected — payments, the live
 * classroom, Quran text — the answer says so plainly rather than describing an intention as a
 * feature. That is the same rule the rest of the project holds itself to, and a help page is the
 * last place it should be relaxed.
 */
import { useState } from "react";
import { Link } from "wouter";
import { Minus, Plus } from "lucide-react";
import { useLocale } from "../contexts/LocaleContextState";
import type { TranslationKey } from "@/i18n/catalog";

type Entry = { id: string; question: TranslationKey; answer: TranslationKey };
type Group = { id: string; heading: TranslationKey; entries: Entry[] };

/** Built from key ids so a question and its answer cannot drift apart. */
const entry = (id: string): Entry => ({ id, question: `faq.${id}.q` as TranslationKey, answer: `faq.${id}.a` as TranslationKey });

const GROUPS: Group[] = [
  { id: "students", heading: "faq.cat.students", entries: ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"].map(entry) },
  { id: "teachers", heading: "faq.cat.teachers", entries: ["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8"].map(entry) },
  { id: "general", heading: "faq.cat.general", entries: ["g1", "g2", "g3", "g4", "g5", "g6"].map(entry) },
  { id: "billing", heading: "faq.cat.billing", entries: ["b1", "b2", "b3", "b4", "b5"].map(entry) },
];

function Question({ item, open, onToggle }: { item: Entry; open: boolean; onToggle: () => void }) {
  const { t } = useLocale();
  return (
    <li className="ni-ed-card overflow-hidden">
      <h3>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={`faq-${item.id}`}
          className="flex w-full items-center justify-between gap-4 px-5 py-4 text-start outline-none transition hover:bg-[var(--ni-field)] focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]"
        >
          <span className="min-w-0 font-semibold ni-t-ink">{t(item.question)}</span>
          {/* Plus to open, minus to close — the control says which way it goes. */}
          <span
            aria-hidden="true"
            className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border transition ${
              open
                ? "border-[var(--ni-gold)] bg-[var(--ni-gold)] text-[var(--ni-on-gold)]"
                : "border-[var(--ni-sage-line)] ni-t-gold"}`}
          >
            {open ? <Minus size={15} /> : <Plus size={15} />}
          </span>
        </button>
      </h3>
      {open && (
        <div id={`faq-${item.id}`} className="border-t border-[var(--ni-sage-line)] px-5 py-4">
          <p className="max-w-[72ch] text-sm leading-7 ni-t-muted">{t(item.answer)}</p>
        </div>
      )}
    </li>
  );
}

export default function FaqPage() {
  const { t } = useLocale();
  // One open question at a time, across every group: the page stays readable rather than unrolling.
  const [open, setOpen] = useState<string | null>(null);

  return (
    <main className="mx-auto max-w-4xl px-5 py-12 lg:px-8 lg:py-16">
      <h1 className="font-display text-4xl ni-t-ink">{t("faq.title")}</h1>
      <p className="mt-3 max-w-[68ch] text-sm leading-7 ni-t-muted">{t("faq.intro")}</p>

      {/* The four groups, each headed in gold. */}
      <nav aria-label={t("faq.title")} className="mt-7 flex flex-wrap gap-2">
        {GROUPS.map((group) => (
          <a key={group.id} href={`#faq-group-${group.id}`} className="ni-btn ni-btn--outline text-sm">
            {t(group.heading)}
          </a>
        ))}
      </nav>

      <div className="mt-10 grid gap-10">
        {GROUPS.map((group) => (
          <section key={group.id} id={`faq-group-${group.id}`} aria-labelledby={`faq-heading-${group.id}`}>
            <h2
              id={`faq-heading-${group.id}`}
              className="border-b-2 border-[var(--ni-gold)] pb-2.5 font-display text-2xl ni-t-gold"
            >
              {t(group.heading)}
            </h2>
            <ul className="mt-4 grid gap-3">
              {group.entries.map((item) => (
                <Question
                  key={item.id}
                  item={item}
                  open={open === item.id}
                  onToggle={() => setOpen(open === item.id ? null : item.id)}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="mt-12 rounded-2xl border border-[var(--ni-gold-mid)] bg-[var(--ni-gold-soft)] p-6 ni-t-gold">
        <h2 className="font-display text-xl">{t("faq.more")}</h2>
        <p className="mt-2 max-w-[62ch] text-sm leading-7">{t("faq.moreCopy")}</p>
        {/* It goes to Contact, so it says Contact. It said "Help", which is a different page. */}
        <Link href="/contact-lms" className="ni-btn ni-btn--primary mt-4 text-sm">{t("faq.contactCta")}</Link>
      </div>
    </main>
  );
}
