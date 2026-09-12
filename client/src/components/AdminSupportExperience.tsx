/**
 * Booking and support review.
 *
 * Read-only, and the page says so rather than implying otherwise. The booking
 * and session lifecycles authorise the learner and the instructor — the two
 * people the appointment belongs to — and no administrative override exists on
 * the server. Rendering buttons that would be refused would be worse than
 * rendering none, so this screen offers the information support actually needs
 * and stops there.
 *
 * Message bodies are not fetched at all: `learner_message`,
 * `instructor_response` and `cancellation_reason` are never selected by the
 * procedure, so nothing here could display them even by mistake. What is shown
 * is who, when, in which timezone, and in what state — plus a flag when the two
 * sides recorded different timezones, which is the usual cause of a support ticket.
 */
import { useState } from "react";
import { CalendarClock, Eye, Globe2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLocale } from "../contexts/LocaleContextState";
import AdminShell from "./AdminShell";
import ResultState from "./ResultState";
import { AdminPanel, AdminTable, FilterBar, Pager, StatusBadge, statusLabel } from "./AdminUI";
import { resultError } from "../lib/result-state";
import { objectData, pagedMeta, pagedRows, pagedState } from "../lib/admin-paged";
import { useOnlineStatus } from "../lib/use-online-status";
import type { TranslationKey } from "@/i18n/catalog";

type Row = {
  id: string; scope: "trials" | "bookings" | "sessions"; subject: string; status: string;
  learnerName: string | null; instructorName: string | null;
  startAt: string | null; endAt: string | null;
  learnerTimezone: string | null; instructorTimezone: string | null;
  createdAt: string; updatedAt: string | null; timezoneMismatch: boolean;
};

type Summary = {
  trials: Array<{ status: string; count: number }>;
  bookings: Array<{ status: string; count: number }>;
  sessions: Array<{ status: string; count: number }>;
  upcoming: number;
};

const SCOPES = ["trials", "bookings", "sessions"] as const;
type Scope = (typeof SCOPES)[number];

const SCOPE_LABEL: Record<Scope, TranslationKey> = {
  trials: "adminBookings.trials",
  bookings: "adminBookings.bookings",
  sessions: "adminBookings.sessions",
};

const STATUS_OPTIONS: Record<Scope, readonly string[]> = {
  trials: ["all", "pending", "requested", "proposed", "accepted", "declined", "cancelled", "completed", "no_show", "disputed"],
  bookings: ["all", "confirmed", "cancelled", "expired", "completed", "no_show", "disputed"],
  sessions: ["all", "scheduled", "waiting_room", "live", "completed", "cancelled", "no_show"],
};

const PAGE = 25;

function SummaryStrip({ summary }: { summary: Summary }) {
  const { t, formatNumber } = useLocale();
  const groups: Array<{ scope: Scope; buckets: Array<{ status: string; count: number }> }> = [
    { scope: "trials", buckets: summary.trials },
    { scope: "bookings", buckets: summary.bookings },
    { scope: "sessions", buckets: summary.sessions },
  ];
  return (
    <div className="space-y-5">
      <p className="text-sm ni-t-muted">
        {t("adminBookings.upcomingCount", { count: formatNumber(summary.upcoming) })}
      </p>
      {groups.map((group) => {
        // Only states that actually have rows are listed: a wall of zeros tells
        // an operator nothing, and the totals for empty states are still real.
        const present = group.buckets.filter((bucket) => bucket.count > 0);
        return (
          <div key={group.scope}>
            <p className="ni-label">{t(SCOPE_LABEL[group.scope])}</p>
            {present.length === 0 ? (
              <p className="mt-1.5 text-sm ni-t-muted-soft">{t("adminBookings.noneInThisSet")}</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {present.map((bucket) => (
                  <span key={bucket.status} className="inline-flex items-center gap-2 rounded-[7px] border border-[var(--ni-sage-line)] bg-[var(--ni-field)] px-2.5 py-1.5">
                    <StatusBadge status={bucket.status} label={statusLabel(t, bucket.status)} />
                    <span className="text-sm font-bold ni-t-ink ltr-embed">{formatNumber(bucket.count)}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function AdminSupportExperience() {
  const { t, formatNumber, formatDate } = useLocale();
  const online = useOnlineStatus();
  const [scope, setScope] = useState<Scope>("trials");
  const [status, setStatus] = useState("all");
  const [offset, setOffset] = useState(0);

  const summaryQuery = trpc.admin.supportSummary.useQuery(undefined, { retry: false });
  const query = trpc.admin.support.useQuery({ scope, status, limit: PAGE, offset }, { retry: false });

  const summaryState = pagedState<never>(summaryQuery as never, online);
  const summary = objectData<Summary>(summaryQuery as never);
  const state = pagedState<Row>(query as never, online);
  const rows = pagedRows<Row>(query as never);
  const meta = pagedMeta<Row>(query as never);

  return (
    <AdminShell activeKey="bookings" eyebrow={t("adminDesk.nav.bookings")} title={t("adminBookings.title")} copy={t("adminBookings.copy")}>
      <div className="space-y-6">
        <div className="rounded-[9px] border border-[var(--ni-sage-line)] bg-[var(--ni-sage-soft)] px-4 py-3 text-sm leading-6 ni-t-muted">
          <Eye size={15} aria-hidden="true" className="me-2 inline ni-t-moss" />
          {t("adminBookings.readOnlyNote")}
        </div>

        <AdminPanel title={t("adminBookings.summary")} description={t("adminBookings.summaryCopy")}>
          {summaryState !== "ready" || !summary ? (
            <ResultState
              state={summaryState === "ready" ? "error" : summaryState}
              message={resultError(summaryQuery as never)}
              onRetry={() => summaryQuery.refetch()}
              retrying={summaryQuery.isFetching}
            />
          ) : (
            <SummaryStrip summary={summary} />
          )}
        </AdminPanel>

        <AdminPanel title={t("adminBookings.records")} description={t("adminBookings.recordsCopy")}>
          <FilterBar
            filters={[
              {
                id: "support-scope", label: t("adminUI.filterScope"), value: scope,
                options: SCOPES.map((value) => ({ value, label: t(SCOPE_LABEL[value]) })),
                onChange: (value) => { setScope(value as Scope); setStatus("all"); setOffset(0); },
              },
              {
                id: "support-status", label: t("adminUI.filterStatus"), value: status,
                options: STATUS_OPTIONS[scope].map((value) => ({ value, label: statusLabel(t, value) })),
                onChange: (value) => { setStatus(value); setOffset(0); },
              },
            ]}
            resultLabel={state === "ready" ? t("adminUI.resultCount", { count: formatNumber(meta.total) }) : undefined}
          />

          <div className="mt-5">
            {state !== "ready" ? (
              <ResultState
                state={state}
                message={state === "empty" ? t("adminBookings.empty") : resultError(query as never)}
                onRetry={() => query.refetch()}
                retrying={query.isFetching}
              />
            ) : (
              <>
                <AdminTable<Row>
                  caption={t("adminBookings.tableCaption")}
                  rows={rows}
                  rowKey={(row) => row.id}
                  columns={[
                    {
                      key: "subject", header: t("adminBookings.colSubject"), primary: true,
                      cell: (row) => (
                        <span className="block min-w-0">
                          <span className="flex items-center gap-2 font-semibold ni-t-ink">
                            <CalendarClock size={14} aria-hidden="true" className="shrink-0 ni-t-gold" />
                            <span className="min-w-0">{row.subject || t("adminUI.none")}</span>
                          </span>
                          <span className="mt-0.5 block text-xs ni-t-muted-soft ltr-embed">{row.id.slice(0, 8)}…</span>
                        </span>
                      ),
                    },
                    { key: "learner", header: t("adminBookings.colLearner"), cell: (row) => <span className="text-sm ni-t-muted">{row.learnerName ?? t("adminUI.none")}</span> },
                    { key: "instructor", header: t("adminBookings.colInstructor"), cell: (row) => <span className="text-sm ni-t-muted">{row.instructorName ?? t("adminUI.none")}</span> },
                    {
                      key: "when", header: t("adminBookings.colWhen"),
                      cell: (row) => (
                        <span className="whitespace-nowrap text-sm ni-t-muted ltr-embed">
                          {row.startAt ? formatDate(row.startAt, { dateStyle: "medium", timeStyle: "short" }) : t("adminUI.none")}
                        </span>
                      ),
                    },
                    {
                      key: "timezones", header: t("adminBookings.colTimezones"),
                      cell: (row) => (
                        <span className="flex flex-wrap items-center gap-1.5 text-xs ni-t-muted ltr-embed">
                          <Globe2 size={12} aria-hidden="true" className="shrink-0" />
                          {row.learnerTimezone ?? "—"} / {row.instructorTimezone ?? "—"}
                          {row.timezoneMismatch && <StatusBadge status="waiting" tone="waiting" label={t("adminBookings.mismatch")} />}
                        </span>
                      ),
                    },
                    { key: "status", header: t("adminUI.filterStatus"), align: "end", cell: (row) => <StatusBadge status={row.status} label={statusLabel(t, row.status)} /> },
                  ]}
                />
                <Pager total={meta.total} limit={meta.limit} offset={meta.offset} onOffset={setOffset} />
              </>
            )}
          </div>
        </AdminPanel>
      </div>
    </AdminShell>
  );
}
