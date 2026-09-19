/**
 * The help page, and the one risk a help page carries.
 *
 * What was here before was five questions hardcoded in English, every one of which opened to the
 * same placeholder sentence — a page where every answer is identical answers nothing.
 *
 * The replacement follows the reference marketplace's shape: four headed groups, each question a
 * box that opens on a plus. The interesting part is not the accordion, though. It is that a help
 * page is the easiest place in a project to start describing intentions as features — "you can pay
 * with…", "join the live classroom…" — about things that are not connected. The rest of this
 * project refuses to do that, and this file holds the FAQ to the same standard: where an answer
 * touches payments, the live classroom or Quran text, it must say plainly that it is not there yet.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("../client/src/components/FaqPage.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const catalog = readFileSync(new URL("../client/src/i18n/catalog.ts", import.meta.url), "utf8");

/** Every question id the page renders, in group order. */
const IDS = [
  ...["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"],
  ...["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8"],
  ...["g1", "g2", "g3", "g4", "g5", "g6"],
  ...["b1", "b2", "b3", "b4", "b5"],
];

/**
 * Source with its comments removed.
 *
 * `ContactPage` explains the `setSent(true)` form it replaced. Naming that in a sentence is not
 * calling it, and without this the explanation would fail the assertion it exists to describe.
 */
const codeOnly = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, " ");

/** The English text of one catalog key, as written in the `en` block. */
function english(key: string): string {
  const match = catalog.match(new RegExp(`"${key.replace(/\./g, "\\.")}": "((?:[^"\\\\]|\\\\.)*)"`));
  return match ? match[1] : "";
}

describe("four groups, as the reference has", () => {
  it("heads them in gold, not green", () => {
    // This project's accent. The reference uses green; the owner asked for gold.
    expect(page).toContain('className="border-b-2 border-[var(--ni-gold)] pb-2.5 font-display text-2xl ni-t-gold"');
    expect(page).not.toMatch(/ni-t-moss[^-]/);
  });

  it("names the four the reference names, plus this project's own vocabulary", () => {
    for (const key of ["faq.cat.students", "faq.cat.teachers", "faq.cat.general", "faq.cat.billing"]) {
      expect(page, key).toContain(key);
    }
  });

  it("opens a question on a plus and closes it on a minus", () => {
    expect(page).toContain("{open ? <Minus size={15} /> : <Plus size={15} />}");
    expect(page).toContain("aria-expanded={open}");
    expect(page).toContain("aria-controls={`faq-${item.id}`}");
  });

  it("gives each question its own box", () => {
    expect(page).toContain('<li className="ni-ed-card overflow-hidden">');
  });
});

describe("every question has its own answer", () => {
  it("pairs a question and an answer by one id, so they cannot drift apart", () => {
    expect(page).toContain("question: `faq.${id}.q` as TranslationKey, answer: `faq.${id}.a` as TranslationKey");
  });

  it("has all of them written in all three languages", () => {
    for (const id of IDS) {
      for (const suffix of ["q", "a"]) {
        const key = `faq.${id}.${suffix}`;
        expect(catalog.match(new RegExp(`"${key.replace(/\./g, "\\.")}":`, "g")), key).toHaveLength(3);
      }
    }
  });

  it("never gives two questions the same answer", () => {
    // The fault in the page this replaced: five questions, one shared placeholder.
    const answers = IDS.map((id) => english(`faq.${id}.a`));
    expect(answers.every((text) => text.length > 40)).toBe(true);
    expect(new Set(answers).size).toBe(answers.length);
  });
});

describe("it covers the modules the reference does not have", () => {
  it("explains the AI Tutor, the currency switch, courses and Hifz", () => {
    expect(english("faq.s3.q")).toContain("AI Tutor");
    expect(english("faq.s4.q").toLowerCase()).toContain("currency");
    expect(english("faq.s5.q").toLowerCase()).toContain("course");
    expect(english("faq.s6.q")).toContain("Hifz");
  });

  it("explains this project's own publication rule to a teacher", () => {
    // Published AND verified — the thing a teacher is most likely to be confused by.
    expect(english("faq.t2.a")).toContain("published it");
    expect(english("faq.t2.a")).toContain("verified you");
    expect(english("faq.t3.a")).toContain("hourly rate");
  });
});

describe("an answer never promises what is not connected", () => {
  it("says payments cannot be taken yet", () => {
    const answer = english("faq.b3.a");
    expect(answer).toContain("No payment provider is connected");
    expect(answer.toLowerCase()).not.toMatch(/you can (pay|buy|purchase) (now|today)/);
  });

  it("says the live classroom is not open yet", () => {
    expect(english("faq.g4.a")).toContain("Not yet");
  });

  it("says no Quran text is shown until a source is approved", () => {
    expect(english("faq.g5.a")).toContain("no Quran text");
  });

  it("says the AI Tutor needs a key, and does not claim it replaces a teacher", () => {
    const answer = english("faq.s3.a");
    expect(answer).toContain("never replaces your teacher");
    expect(answer).toContain("administrator configures");
  });

  it("does not invent a free trial or free minutes anywhere", () => {
    // The reference offers thirty free classroom minutes. There is no such policy here.
    for (const id of IDS) {
      expect(english(`faq.${id}.a`).toLowerCase(), id).not.toMatch(/free (minutes|classroom|trial)/);
    }
  });
});

describe("it replaced the placeholder rather than sitting beside it", () => {
  it("is what /help/lms and /faqs both render", () => {
    expect(app).toContain('<Route path="/help/lms">{() => <><Header/><FaqPage/><Footer/></>}</Route>');
    expect(app).toContain('<Route path="/faqs">{() => <><Header/><FaqPage/><Footer/></>}</Route>');
  });

  it("leaves no hardcoded English question list behind", () => {
    expect(app).not.toContain("function HelpPage()");
    expect(app).not.toContain('"How do I find a tutor?"');
  });
});

describe("the page after it, and how anyone reaches either", () => {
  const contact = readFileSync(new URL("../client/src/components/ContactPage.tsx", import.meta.url), "utf8");
  const nav = readFileSync(new URL("../client/src/components/SiteNav.tsx", import.meta.url), "utf8");

  it("labels the closing button for where it actually goes", () => {
    // It read "Help" and led to Contact, which are two different pages.
    expect(page).toContain('href="/contact-lms" className="ni-btn ni-btn--primary mt-4 text-sm">{t("faq.contactCta")}');
    expect(page).not.toContain('t("nav.help")');
  });

  it("puts FAQs in the header, not only in the footer", () => {
    expect(nav).toContain('<Link href="/faqs" className={triggerClass}>{t("nav.faqs")}</Link>');
    expect(app).toContain('<Link href="/faqs">{t("nav.faqs")}</Link>');
  });

  it("shows the tick only for a message that was actually stored", () => {
    /*
     * The page this replaced had a form whose submit handler was `setSent(true)` and nothing else:
     * a person describing a problem was thanked and their words discarded. The form is back and it
     * writes a row, so the guard is no longer "there must be no success state" — it is that the
     * success state must depend on the row.
     */
    expect(contact).toContain("const result = await send.mutateAsync(");
    expect(contact).toContain("if (!result || !result.ok) {");
    expect(contact).toContain("trpc.supabase.submitContactMessage.useMutation()");
  });

  it("asks which side the sender is writing from", () => {
    // A teacher and a parent need answering in different terms, and the reviewer sees which.
    for (const key of ["contact.asStudent", "contact.asTeacher", "contact.asOther"]) {
      expect(contact, key).toContain(key);
    }
  });

  it("tells a reviewer that a message arrived, rather than waiting to be found", () => {
    const contactServer = readFileSync(new URL("./contact-messages.ts", import.meta.url), "utf8");
    const queue = readFileSync(new URL("./review-queue.ts", import.meta.url), "utf8");
    expect(contactServer).toContain("await notifyReviewersOfContactMessage({");
    /*
     * The id is generated, not read back. `.insert().select()` asks for RETURNING, and RETURNING is
     * a read — Postgres applies the SELECT policy to it, and reading this table is a reviewer's
     * alone. A sender's own insert was refused with 42501 for wanting its own row back.
     */
    expect(contactServer).toContain("const id = randomUUID();");
    expect(contactServer).not.toContain('.select("id")');
    expect(queue).toContain('type: "contact_message"');
    // Every message raises its own notice; the key is the message, not the sender.
    expect(queue).toContain("idempotency_key: `contact-${input.messageId}`");
    // Raised after the row exists, and never able to fail the write that produced it.
    expect(contactServer.indexOf('if (!data) return fail')).toBeLessThan(contactServer.indexOf("await notifyReviewersOfContactMessage"));
  });

  it("uses no email address of the project's own", () => {
    const contactServer = readFileSync(new URL("./contact-messages.ts", import.meta.url), "utf8");
    // ADMIN_EMAIL is a server-only bootstrap for granting a role; it is not a mailbox, and this
    // flow must never reach for it. The only address here is the sender's, for replying to.
    expect(contactServer).not.toContain("ADMIN_EMAIL");
    expect(contactServer).not.toMatch(/nodemailer|sendgrid|resend|smtp/i);
  });

  it("puts the message somewhere a reviewer can read it", () => {
    const admin = readFileSync(new URL("../client/src/components/AdminContactMessages.tsx", import.meta.url), "utf8");
    expect(admin).toContain("trpc.admin.contactMessages.useQuery");
    // A page nobody can navigate to would make the form a slower way of discarding messages.
    const adminNav = readFileSync(new URL("../client/src/lib/admin-nav.ts", import.meta.url), "utf8");
    expect(adminNav).toContain('href: "/admin/support"');
  });

  it("prints no email address in the client bundle", () => {
    expect(contact).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    expect(contact).not.toContain("mailto:");
  });

  it("is headed in the same gold as the FAQ, so the two read as one product", () => {
    expect(contact).toContain('className="text-sm font-bold ni-t-gold"');
  });
});
