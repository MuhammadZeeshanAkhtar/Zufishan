/**
 * The admin desk's shared vocabulary.
 *
 * Ten pages need the same seven things — a section card, a status pill, a filter
 * bar, a table, a pager, a confirmation dialog and a label/value list — and
 * writing each of them ten times is how ten pages end up with nine different
 * ideas of what "rejected" looks like. So they live here once.
 *
 * Two decisions worth stating:
 *
 *  - **`AdminTable` renders a real table on wide screens and cards on narrow
 *    ones**, from one column definition. A table that merely scrolls sideways on
 *    a phone is unusable, and a card list on a desktop wastes the comparison a
 *    table exists to give.
 *  - **`ConfirmDialog` is the gate on every state change.** Nothing in this desk
 *    writes without passing through it, and the destructive variants require a
 *    typed reason, because a decision nobody can explain later is not an
 *    operational record.
 *
 * Every colour is a token and every inset is logical (`start`/`end`), so the
 * dark theme and the Urdu/Arabic mirror both follow without a second implementation.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { useLocale } from "../contexts/LocaleContextState";
import type { TranslationKey } from "@/i18n/catalog";

/* ------------------------------------------------------------------- panels */

export function AdminPanel({ title, description, actions, children, id }: {
  title?: string; description?: string; actions?: ReactNode; children: ReactNode; id?: string;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={title ? headingId : undefined} id={id} className="ni-ed-card p-5 sm:p-6">
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 id={headingId} className="font-display text-xl ni-t-ink">{title}</h2>}
            {description && <p className="mt-1.5 max-w-[68ch] text-sm leading-6 ni-t-muted">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {(title || actions) && <hr className="ni-rule mt-4" />}
      <div className={title || actions ? "mt-4" : ""}>{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ badges */

export type BadgeTone = "positive" | "waiting" | "negative" | "neutral";

/**
 * The tone a status carries.
 *
 * Kept as one map so "rejected" is never emerald on one page and clay on
 * another. Unknown values fall to neutral rather than throwing — a status added
 * to the database later must render, not crash the screen.
 */
const TONES: Record<string, BadgeTone> = {
  approved: "positive", published: "positive", active: "positive", ready: "positive",
  resolved: "positive", accepted: "positive", completed: "positive", confirmed: "positive", live: "positive",
  pending: "waiting", verification_pending: "waiting", in_review: "waiting", open: "waiting",
  investigating: "waiting", requested: "waiting", proposed: "waiting", proposed_new_time: "waiting",
  waiting_room: "waiting", scheduled: "waiting", setup_needed: "waiting", process_coming_soon: "waiting",
  rejected: "negative", suspended: "negative", hidden: "negative", cancelled: "negative",
  declined: "negative", no_show: "negative", disputed: "negative", failed: "negative",
  draft: "neutral", archived: "neutral", dismissed: "neutral", expired: "neutral",
  not_implemented: "neutral", closed: "neutral", matched: "neutral", paused: "neutral", deleted: "neutral",
};

const TONE_STYLE: Record<BadgeTone, { border: string; bg: string; fg: string }> = {
  positive: { border: "var(--ni-sage-line)", bg: "var(--ni-sage-soft)", fg: "var(--ni-moss-deep)" },
  waiting:  { border: "var(--ni-gold-mid)",  bg: "var(--ni-gold-soft)", fg: "var(--ni-gold-ink)" },
  negative: { border: "var(--ni-clay-ink)",  bg: "var(--ni-clay-soft)", fg: "var(--ni-clay-ink)" },
  neutral:  { border: "var(--ni-sage-line)", bg: "transparent",         fg: "var(--ni-muted)" },
};

export function toneFor(status: string): BadgeTone {
  return TONES[status] ?? "neutral";
}

/** Turns `verification_pending` into `Verification pending` for display. */
export function humanise(value: string): string {
  const spaced = value.replace(/[._]/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function StatusBadge({ status, label, tone }: { status: string; label?: string; tone?: BadgeTone }) {
  const style = TONE_STYLE[tone ?? toneFor(status)];
  return (
    <span className="ni-verify shrink-0 whitespace-nowrap" style={{ borderColor: style.border, background: style.bg, color: style.fg }}>
      {label ?? humanise(status)}
    </span>
  );
}

/* -------------------------------------------------------------- filter bar */

export type SelectFilter = {
  id: string;
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
};

export function FilterBar({ search, filters, resultLabel }: {
  search?: { value: string; placeholder: string; onChange: (value: string) => void };
  filters?: SelectFilter[];
  resultLabel?: string;
}) {
  const { t } = useLocale();
  const searchId = useId();
  return (
    <div className="flex flex-wrap items-end gap-3">
      {search && (
        <div className="min-w-[13rem] flex-1">
          <label htmlFor={searchId} className="ni-label block">{t("adminUI.search")}</label>
          <div className="relative mt-1.5">
            <Search size={15} aria-hidden="true" className="pointer-events-none absolute top-1/2 start-3 -translate-y-1/2 ni-t-muted-soft" />
            <input
              id={searchId}
              type="search"
              value={search.value}
              placeholder={search.placeholder}
              onChange={(event) => search.onChange(event.target.value)}
              className="ni-input py-2.5 pe-3 ps-9"
            />
          </div>
        </div>
      )}
      {(filters ?? []).map((filter) => (
        <div key={filter.id} className="min-w-[9.5rem]">
          <label htmlFor={filter.id} className="ni-label block">{filter.label}</label>
          <select
            id={filter.id}
            value={filter.value}
            onChange={(event) => filter.onChange(event.target.value)}
            className="ni-select mt-1.5"
          >
            {filter.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
      ))}
      {resultLabel && <p className="ms-auto pb-2.5 text-xs ni-t-muted" aria-live="polite">{resultLabel}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ tables */

export type Column<T> = {
  key: string;
  header: string;
  /** Rendered in both the table cell and the mobile card. */
  cell: (row: T) => ReactNode;
  /** Hidden on the mobile card when the value repeats the card's own title. */
  primary?: boolean;
  align?: "start" | "end";
};

export function AdminTable<T>({ columns, rows, rowKey, caption, actions }: {
  columns: Array<Column<T>>;
  rows: T[];
  rowKey: (row: T) => string;
  caption: string;
  /** Trailing controls for each row, rendered in their own cell and card footer. */
  actions?: (row: T) => ReactNode;
}) {
  return (
    <>
      {/* Wide: a real table, scrollable inside its own container so the page never
          scrolls sideways. */}
      {/* `.ni-table-wrap` and `.ni-table` are the shared design-system classes.
          This block used to hand-roll the same rules in Tailwind, which meant the
          admin desk and the rest of the product could drift apart on row rules,
          header treatment and hover — the duplication flagged when the system was
          built. The row hover now also lifts rather than darkens in dark theme,
          which only the shared rule does. */}
      <div className="ni-table-wrap hidden md:block">
        <table className="ni-table">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} scope="col" className={column.align === "end" ? "text-end" : "text-start"}>
                  {column.header}
                </th>
              ))}
              {actions && <th scope="col" className="text-end">&nbsp;</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className="align-top">
                {columns.map((column) => (
                  <td key={column.key} className={column.align === "end" ? "text-end" : "text-start"}>
                    {column.cell(row)}
                  </td>
                ))}
                {actions && <td className="text-end"><div className="inline-flex flex-wrap justify-end gap-1.5">{actions(row)}</div></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Narrow: the same columns as a stacked card, so nothing is lost on a phone. */}
      <ul className="space-y-3 md:hidden">
        {rows.map((row) => (
          <li key={rowKey(row)} className="rounded-[9px] border border-[var(--ni-sage-line)] bg-[var(--ni-field)] p-4">
            {columns.map((column) => (
              <div key={column.key} className={column.primary ? "" : "mt-2.5 flex flex-wrap items-baseline justify-between gap-2"}>
                {!column.primary && <span className="ni-label">{column.header}</span>}
                <span className="min-w-0 text-sm ni-t-ink">{column.cell(row)}</span>
              </div>
            ))}
            {actions && <div className="mt-3.5 flex flex-wrap gap-1.5 border-t border-[var(--ni-sage)] pt-3">{actions(row)}</div>}
          </li>
        ))}
      </ul>
    </>
  );
}

/* ------------------------------------------------------------------- pager */

export function Pager({ total, limit, offset, onOffset }: {
  total: number; limit: number; offset: number; onOffset: (offset: number) => void;
}) {
  const { t, formatNumber } = useLocale();
  if (total <= limit) return null;
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.max(Math.ceil(total / limit), 1);
  const control = "inline-flex items-center gap-1 rounded-[7px] border border-[var(--ni-sage-line)] px-3 py-2 text-xs font-bold ni-t-ink outline-none disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]";
  return (
    <nav aria-label={t("adminUI.pagination")} className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--ni-sage)] pt-4">
      <button type="button" className={control} disabled={offset <= 0} onClick={() => onOffset(Math.max(offset - limit, 0))}>
        <ChevronLeft size={14} aria-hidden="true" className="rtl:-scale-x-100" />
        {t("adminUI.previous")}
      </button>
      <p className="text-xs ni-t-muted" aria-live="polite">
        {t("adminUI.pageOf", { page: formatNumber(page), pages: formatNumber(pages), total: formatNumber(total) })}
      </p>
      <button type="button" className={control} disabled={offset + limit >= total} onClick={() => onOffset(offset + limit)}>
        {t("adminUI.next")}
        <ChevronRight size={14} aria-hidden="true" className="rtl:-scale-x-100" />
      </button>
    </nav>
  );
}

/* -------------------------------------------------------- confirmation gate */

export type ConfirmRequest = {
  title: string;
  body: string;
  confirmLabel: string;
  /** A typed reason is mandatory before the action can proceed. */
  requireReason?: boolean;
  reasonLabel?: string;
  destructive?: boolean;
  onConfirm: (reason: string) => Promise<void> | void;
};

export function ConfirmDialog({ request, onClose, busy }: {
  request: ConfirmRequest | null; onClose: () => void; busy?: boolean;
}) {
  const { t } = useLocale();
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const firstRef = useRef<HTMLTextAreaElement | HTMLButtonElement | null>(null);
  const titleId = useId();
  const bodyId = useId();
  const reasonId = useId();

  useEffect(() => {
    if (!request) return;
    setReason("");
    setTouched(false);
    firstRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [request, onClose, busy]);

  if (!request) return null;
  const missingReason = Boolean(request.requireReason) && reason.trim().length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label={t("adminUI.cancel")}
        onClick={() => { if (!busy) onClose(); }}
        className="ni-scrim"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className="ni-modal"
      >
        <div aria-hidden="true" className="ni-stripe" />
        <div className="ni-modal__body">
          <div className="flex items-start gap-3">
            {request.destructive && <AlertTriangle size={20} aria-hidden="true" className="mt-0.5 shrink-0 ni-t-clay-ink" />}
            <div className="min-w-0">
              <h2 id={titleId} className="font-display text-xl ni-t-ink">{request.title}</h2>
              <p id={bodyId} className="mt-2 text-sm leading-6 ni-t-muted">{request.body}</p>
            </div>
          </div>

          {request.requireReason && (
            <div className="mt-5">
              <label htmlFor={reasonId} className="ni-label block">{request.reasonLabel ?? t("adminUI.reason")}</label>
              <textarea
                id={reasonId}
                ref={firstRef as React.RefObject<HTMLTextAreaElement>}
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                onBlur={() => setTouched(true)}
                aria-invalid={touched && missingReason}
                aria-describedby={touched && missingReason ? `${reasonId}-error` : undefined}
                className="ni-textarea mt-1.5"
              />
              {touched && missingReason && (
                <p id={`${reasonId}-error`} role="alert" className="mt-1.5 text-xs font-semibold ni-t-clay-ink">
                  {t("adminUI.reasonRequired")}
                </p>
              )}
              <p className="mt-1.5 text-[11px] leading-4 ni-t-muted-soft">{t("adminUI.reasonRecorded")}</p>
            </div>
          )}

          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <button type="button" disabled={busy} onClick={onClose} className="ni-btn ni-btn--outline text-sm disabled:opacity-50">
              {t("adminUI.cancel")}
            </button>
            <button
              type="button"
              disabled={busy || missingReason}
              onClick={async () => { setTouched(true); if (!missingReason) await request.onConfirm(reason.trim()); }}
              className="ni-btn ni-btn--primary text-sm disabled:opacity-50"
            >
              {busy ? t("adminUI.working") : request.confirmLabel}
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => { if (!busy) onClose(); }}
          aria-label={t("adminUI.cancel")}
          className="absolute top-4 end-4 rounded-[7px] p-1.5 ni-t-muted outline-none hover:bg-[var(--ni-sage-soft)] focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- detail list */

export function DefinitionList({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
      {items.map((item, index) => (
        <div key={`${item.label}-${index}`} className="min-w-0">
          <dt className="ni-label">{item.label}</dt>
          <dd className="mt-1 break-words text-sm ni-t-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A row action. Small, quiet, and never a link — every one of these writes. */
export function RowAction({ onClick, children, tone = "quiet", disabled }: {
  onClick: () => void; children: ReactNode; tone?: "quiet" | "primary" | "danger"; disabled?: boolean;
}) {
  const style =
    tone === "primary"
      ? "border-[var(--ni-gold-mid)] bg-[var(--ni-gold-soft)] text-[var(--ni-gold-ink)]"
      : tone === "danger"
        ? "border-[var(--ni-clay-ink)] bg-[var(--ni-clay-soft)] text-[var(--ni-clay-ink)]"
        : "border-[var(--ni-sage-line)] ni-t-ink hover:bg-[var(--ni-sage-soft)]";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-[7px] border px-2.5 py-1.5 text-xs font-bold outline-none transition-colors disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)] ${style}`}
    >
      {children}
    </button>
  );
}

/** A short-lived confirmation or failure line, announced to assistive technology. */
export function Outcome({ outcome }: { outcome: { ok: boolean; text: string } | null }) {
  if (!outcome) return null;
  return (
    <p
      role={outcome.ok ? "status" : "alert"}
      className={`mt-3 rounded-[7px] border px-3 py-2 text-sm ${
        outcome.ok
          ? "border-[var(--ni-sage-line)] bg-[var(--ni-sage-soft)] ni-t-moss-deep"
          : "border-[var(--ni-clay-ink)] bg-[var(--ni-clay-soft)] ni-t-clay-ink"
      }`}
    >
      {outcome.text}
    </p>
  );
}

/** Translation-key helper so status vocabularies stay in the catalogue. */
export function statusLabel(t: (key: TranslationKey) => string, status: string): string {
  const key = `adminStatus.${status}` as TranslationKey;
  const translated = t(key);
  // `t` returns the key itself when it is missing, which is the signal to fall
  // back to a humanised form rather than printing `adminStatus.something`.
  return translated === key ? humanise(status) : translated;
}
