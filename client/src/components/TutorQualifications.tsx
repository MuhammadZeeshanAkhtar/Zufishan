/**
 * Employment history, certifications and ijazah, on the teacher's profile editor.
 *
 * The reference marketplace gives a tutor three repeatable lists here, each with an "Add Another"
 * row. Zufishan had none of them: `has_ijazah` was a single yes/no box, which cannot say *which*
 * ijazah, from whom, or when — and there was nowhere at all to state where someone had taught.
 *
 * Each list saves on its own. That is deliberate rather than lazy: the profile form above sends one
 * large mutation, and folding three variable-length lists into it would mean a teacher who fixes a
 * typo in one entry re-submits their rate, subjects and visibility with it. One list, one save.
 *
 * An empty row is not an error. The editor always keeps a blank line at the end to type into, and
 * the server drops any entry without a title, so "I changed my mind about this one" is just
 * clearing the box.
 */
import { useEffect, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLocale } from "../contexts/LocaleContextState";
import type { TranslationKey } from "@/i18n/catalog";

type Kind = "employment" | "certification" | "ijazah";
type Entry = { title: string; organisation: string; period: string; detail: string };
type StoredEntry = { id: string; kind: Kind; title: string; organisation: string | null; period: string | null; detail: string | null; position: number };

const KINDS: { key: Kind; labelKey: TranslationKey }[] = [
  { key: "employment", labelKey: "tutorQual.employment" },
  { key: "certification", labelKey: "tutorQual.certification" },
  { key: "ijazah", labelKey: "tutorQual.ijazah" },
];

const blank = (): Entry => ({ title: "", organisation: "", period: "", detail: "" });
const field = "w-full rounded-xl border border-[var(--ni-sage-line)] bg-[var(--ni-field)] px-3 py-2 text-sm ni-t-ink outline-none focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]";

function List({ kind, labelKey, stored, onSaved }: {
  kind: Kind; labelKey: TranslationKey; stored: StoredEntry[]; onSaved: () => void;
}) {
  const { t } = useLocale();
  const save = trpc.scheduling.saveQualifications.useMutation();
  const [rows, setRows] = useState<Entry[]>([blank()]);
  const [notice, setNotice] = useState("");

  // Reload whenever the server's copy changes, keeping one empty row to type into.
  useEffect(() => {
    const mine = stored
      .filter((row) => row.kind === kind)
      .map((row) => ({ title: row.title, organisation: row.organisation ?? "", period: row.period ?? "", detail: row.detail ?? "" }));
    setRows([...mine, blank()]);
  }, [stored, kind]);

  const set = (index: number, key: keyof Entry, value: string) =>
    setRows((current) => current.map((row, at) => (at === index ? { ...row, [key]: value } : row)));

  const submit = async () => {
    setNotice("");
    const entries = rows.filter((row) => row.title.trim().length > 0);
    const result = await save.mutateAsync({ kind, entries }).catch(() => null);
    if (!result || !result.ok) {
      setNotice(result && !result.ok ? result.error : t("courseStudio.saveError"));
      return;
    }
    setNotice(t("tutorQual.saved"));
    onSaved();
  };

  return (
    <section className="ni-ed-card p-5">
      <h3 className="font-display text-base ni-t-ink">{t(labelKey)}</h3>

      <ul className="mt-4 grid gap-4">
        {rows.map((row, index) => (
          <li key={index} className="rounded-xl border border-[var(--ni-sage-line)] bg-[var(--ni-paper)] p-3.5">
            <div className="grid gap-2.5 sm:grid-cols-2">
              <label className="block text-xs font-bold uppercase tracking-[.08em] ni-t-muted">
                {t("tutorQual.fieldTitle")}
                <input value={row.title} onChange={(event) => set(index, "title", event.target.value)} maxLength={160} className={`mt-1.5 ${field}`} />
              </label>
              <label className="block text-xs font-bold uppercase tracking-[.08em] ni-t-muted">
                {t("tutorQual.fieldOrganisation")}
                <input value={row.organisation} onChange={(event) => set(index, "organisation", event.target.value)} maxLength={160} className={`mt-1.5 ${field}`} />
              </label>
              <label className="block text-xs font-bold uppercase tracking-[.08em] ni-t-muted">
                {t("tutorQual.fieldPeriod")}
                <input
                  value={row.period}
                  onChange={(event) => set(index, "period", event.target.value)}
                  maxLength={80}
                  placeholder={t("tutorQual.periodHint")}
                  className={`mt-1.5 ${field}`}
                />
              </label>
              <label className="block text-xs font-bold uppercase tracking-[.08em] ni-t-muted sm:col-span-2">
                {t("tutorQual.fieldDetail")}
                <textarea value={row.detail} onChange={(event) => set(index, "detail", event.target.value)} maxLength={600} rows={2} className={`mt-1.5 ${field}`} />
              </label>
            </div>
            {rows.length > 1 && (
              <div className="mt-2.5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setRows((current) => current.filter((_, at) => at !== index))}
                  className="ni-btn ni-btn--quiet text-xs"
                >
                  <X size={13} aria-hidden="true" /> {t("tutorQual.remove")}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setRows((current) => [...current, blank()])} className="ni-btn ni-btn--outline text-sm">
          <Plus size={14} aria-hidden="true" /> {t("tutorQual.addAnother")}
        </button>
        <button type="button" onClick={() => void submit()} disabled={save.isPending} className="ni-btn ni-btn--primary text-sm">
          {t("tutorQual.save")}
        </button>
        {notice && (
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold ni-t-moss-deep" role="status">
            <Check size={14} aria-hidden="true" /> {notice}
          </span>
        )}
      </div>
    </section>
  );
}

export default function TutorQualifications() {
  const { t } = useLocale();
  const query = trpc.scheduling.qualifications.useQuery(undefined, { retry: false });

  const stored = (query.data?.ok ? query.data.data : []) as StoredEntry[];
  // The one failure worth naming: the table is not there yet, which is a migration, not an outage.
  const notMigrated = query.data !== undefined && !query.data.ok && query.data.code === "SETUP_NEEDED";

  return (
    <section className="mt-10">
      <h2 className="font-display text-xl ni-t-ink">{t("tutorQual.title")}</h2>
      <p className="mt-1.5 max-w-[66ch] text-sm leading-6 ni-t-muted">{t("tutorQual.copy")}</p>

      {notMigrated ? (
        <p className="mt-4 rounded-2xl border border-[var(--ni-gold-mid)] bg-[var(--ni-gold-soft)] px-4 py-3.5 text-sm leading-6 ni-t-gold" role="status">
          {t("tutorQual.setupNeeded")}
        </p>
      ) : (
        <div className="mt-4 grid gap-4">
          {KINDS.map((entry) => (
            <List key={entry.key} kind={entry.key} labelKey={entry.labelKey} stored={stored} onSaved={() => query.refetch()} />
          ))}
        </div>
      )}
    </section>
  );
}
