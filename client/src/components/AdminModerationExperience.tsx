/**
 * Content moderation and review moderation.
 *
 * Two pages, one file, because they call the same four procedures and share the
 * same decision grammar: read what was flagged, take a bounded action, record why.
 *
 * `/admin/content` answers "what exists and what has been flagged" — an
 * inventory of every content type by status, plus the reported items and the
 * open cases. `/admin/reviews` is the review queue on its own, where "reported"
 * is a real filter rather than a fifth status: it resolves to the reviews that
 * currently carry an open report.
 *
 * A learner cannot publish their own review — migration 0017 enforces that in
 * the database, and this desk is the reviewed path that was missing. Every
 * decision here is audited, and case decisions are additionally written to
 * `moderation_actions`, which is the case's own history.
 */
import { useState } from "react";
import { Flag, FolderTree, Gavel, Star } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLocale } from "../contexts/LocaleContextState";
import AdminShell from "./AdminShell";
import ResultState from "./ResultState";
import {
  AdminPanel, AdminTable, ConfirmDialog, FilterBar, Outcome, Pager,
  RowAction, StatusBadge, statusLabel, type ConfirmRequest,
} from "./AdminUI";
import { resultError } from "../lib/result-state";
import { objectData, pagedMeta, pagedRows, pagedState } from "../lib/admin-paged";
import { useOnlineStatus } from "../lib/use-online-status";
import { useDebounced } from "../lib/use-debounced";
import type { TranslationKey } from "@/i18n/catalog";

const PAGE = 25;

type ReviewRow = {
  id: string; rating: number | null; body: string; status: string;
  reviewerName: string | null; instructorName: string | null; instructorId: string;
  createdAt: string; reportCount: number;
};
type ReportRow = {
  id: string; kind: "content" | "review"; targetType: string; targetId: string;
  reason: string; status: string; reporterName: string | null; createdAt: string;
};
type CaseRow = {
  id: string; targetType: string; targetId: string; status: string; priority: string;
  openedByName: string | null; createdAt: string; updatedAt: string; actionCount: number;
};
type Inventory = {
  courses: Array<{ status: string; count: number }>;
  modules: Array<{ status: string; count: number }>;
  lessons: Array<{ status: string; count: number }>;
  assignments: number;
  quizzes: number;
  reviews: Array<{ status: string; count: number }>;
};

type ReviewAction = "publish" | "reject" | "hide" | "restore";

/** Only the actions the server will accept from this status are offered. */
export function reviewActionsFor(status: string): ReviewAction[] {
  if (status === "pending") return ["publish", "reject"];
  if (status === "published") return ["hide", "reject"];
  if (status === "hidden") return ["restore", "reject"];
  if (status === "rejected") return ["publish"];
  return [];
}

const REVIEW_ACTION_LABEL: Record<ReviewAction, TranslationKey> = {
  publish: "adminReviews.publish",
  reject: "adminReviews.reject",
  hide: "adminReviews.hide",
  restore: "adminReviews.restore",
};

/* --------------------------------------------------------- reviews queue UI */

function ReviewsQueue({ compact }: { compact?: boolean }) {
  const { t, formatNumber, formatDate } = useLocale();
  const online = useOnlineStatus();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>(compact ? "pending" : "all");
  const [offset, setOffset] = useState(0);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string } | null>(null);

  const debounced = useDebounced(search);
  const query = trpc.admin.reviews.useQuery(
    { search: debounced || undefined, status: status as never, limit: PAGE, offset },
    { retry: false },
  );
  const decide = trpc.admin.decideReview.useMutation();

  const state = pagedState<ReviewRow>(query as never, online);
  const rows = pagedRows<ReviewRow>(query as never);
  const meta = pagedMeta<ReviewRow>(query as never);

  const ask = (row: ReviewRow, action: ReviewAction) => {
    setConfirm({
      title: t(`adminReviews.confirm.${action}` as TranslationKey),
      body: t("adminReviews.confirmBody", { name: row.instructorName ?? t("adminUI.none") }),
      confirmLabel: t(REVIEW_ACTION_LABEL[action]),
      requireReason: action !== "publish",
      destructive: action === "reject" || action === "hide",
      onConfirm: async (reason) => {
        const result = (await decide.mutateAsync({ reviewId: row.id, action, note: reason || undefined })) as { ok: boolean; error?: string };
        setOutcome({ ok: result.ok, text: result.ok ? t("adminReviews.saved") : result.error ?? t("common.error") });
        setConfirm(null);
        query.refetch();
      },
    });
  };

  return (
    <>
      <FilterBar
        search={{ value: search, placeholder: t("adminReviews.searchPlaceholder"), onChange: (value) => { setSearch(value); setOffset(0); } }}
        filters={[{
          id: "review-status", label: t("adminUI.filterStatus"), value: status,
          options: (["all", "pending", "published", "rejected", "hidden", "reported"] as const)
            .map((value) => ({ value, label: value === "reported" ? t("adminReviews.reported") : statusLabel(t, value) })),
          onChange: (value) => { setStatus(value); setOffset(0); },
        }]}
        resultLabel={state === "ready" ? t("adminUI.resultCount", { count: formatNumber(meta.total) }) : undefined}
      />

      <Outcome outcome={outcome} />

      <div className="mt-5">
        {state !== "ready" ? (
          <ResultState
            state={state}
            message={state === "empty" ? t("adminReviews.empty") : resultError(query as never)}
            onRetry={() => query.refetch()}
            retrying={query.isFetching}
          />
        ) : (
          <>
            <AdminTable<ReviewRow>
              caption={t("adminReviews.tableCaption")}
              rows={rows}
              rowKey={(row) => row.id}
              columns={[
                {
                  key: "body", header: t("adminReviews.colReview"), primary: true,
                  cell: (row) => (
                    <span className="block min-w-0 max-w-[38ch]">
                      <span className="block text-sm leading-6 ni-t-ink">{row.body.slice(0, 220)}{row.body.length > 220 ? "…" : ""}</span>
                      {row.reportCount > 0 && (
                        <span className="mt-1.5 inline-flex items-center gap-1 ni-label" style={{ color: "var(--ni-clay-ink)" }}>
                          <Flag size={11} aria-hidden="true" />
                          {t("adminReviews.reportsAgainst", { count: formatNumber(row.reportCount) })}
                        </span>
                      )}
                    </span>
                  ),
                },
                {
                  key: "rating", header: t("adminReviews.colRating"),
                  cell: (row) => (
                    <span className="inline-flex items-center gap-1 text-sm ni-t-ink">
                      <Star size={13} aria-hidden="true" className="ni-t-gold" />
                      <span className="ltr-embed">{row.rating === null ? "—" : formatNumber(row.rating)}</span>
                    </span>
                  ),
                },
                { key: "reviewer", header: t("adminReviews.colReviewer"), cell: (row) => <span className="text-sm ni-t-muted">{row.reviewerName ?? t("adminUI.none")}</span> },
                { key: "instructor", header: t("adminReviews.colInstructor"), cell: (row) => <span className="text-sm ni-t-muted">{row.instructorName ?? t("adminUI.none")}</span> },
                { key: "status", header: t("adminUI.filterStatus"), cell: (row) => <StatusBadge status={row.status} label={statusLabel(t, row.status)} /> },
                {
                  key: "created", header: t("adminUI.created"), align: "end",
                  cell: (row) => <span className="whitespace-nowrap text-xs ni-t-muted ltr-embed">{formatDate(row.createdAt, { dateStyle: "medium" })}</span>,
                },
              ]}
              actions={(row) => {
                const available = reviewActionsFor(row.status);
                if (available.length === 0) return <span className="ni-label">{t("adminUI.noAction")}</span>;
                return (
                  <>
                    {available.map((action) => (
                      <RowAction
                        key={action}
                        onClick={() => ask(row, action)}
                        tone={action === "publish" || action === "restore" ? "primary" : "danger"}
                        disabled={decide.isPending}
                      >
                        {t(REVIEW_ACTION_LABEL[action])}
                      </RowAction>
                    ))}
                  </>
                );
              }}
            />
            <Pager total={meta.total} limit={meta.limit} offset={meta.offset} onOffset={setOffset} />
          </>
        )}
      </div>

      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} busy={decide.isPending} />
    </>
  );
}

export function AdminReviewsExperience() {
  const { t } = useLocale();
  return (
    <AdminShell activeKey="reviews" eyebrow={t("adminDesk.nav.reviews")} title={t("adminReviews.title")} copy={t("adminReviews.copy")}>
      <div className="space-y-6">
        <div className="rounded-[9px] border border-[var(--ni-sage-line)] bg-[var(--ni-sage-soft)] px-4 py-3 text-sm leading-6 ni-t-muted">
          <Gavel size={15} aria-hidden="true" className="me-2 inline ni-t-moss" />
          {t("adminReviews.selfPublishNote")}
        </div>
        <AdminPanel><ReviewsQueue /></AdminPanel>
      </div>
    </AdminShell>
  );
}

/* ------------------------------------------------------- content moderation */

function InventoryGrid({ inventory }: { inventory: Inventory }) {
  const { t, formatNumber } = useLocale();
  const groups: Array<{ labelKey: TranslationKey; buckets: Array<{ status: string; count: number }> }> = [
    { labelKey: "adminContent.courses", buckets: inventory.courses },
    { labelKey: "adminContent.modules", buckets: inventory.modules },
    { labelKey: "adminContent.lessons", buckets: inventory.lessons },
    { labelKey: "adminContent.reviewsGroup", buckets: inventory.reviews },
  ];
  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <div key={group.labelKey}>
          <p className="ni-label">{t(group.labelKey)}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {group.buckets.map((bucket) => (
              <span key={bucket.status} className="inline-flex items-center gap-2 rounded-[7px] border border-[var(--ni-sage-line)] bg-[var(--ni-field)] px-2.5 py-1.5">
                <StatusBadge status={bucket.status} label={statusLabel(t, bucket.status)} />
                <span className="text-sm font-bold ni-t-ink ltr-embed">{formatNumber(bucket.count)}</span>
              </span>
            ))}
          </div>
        </div>
      ))}
      <div>
        <p className="ni-label">{t("adminContent.assessmentsGroup")}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-2 rounded-[7px] border border-[var(--ni-sage-line)] bg-[var(--ni-field)] px-2.5 py-1.5 text-sm ni-t-ink">
            {t("adminContent.assignments")} <span className="font-bold ltr-embed">{formatNumber(inventory.assignments)}</span>
          </span>
          <span className="inline-flex items-center gap-2 rounded-[7px] border border-[var(--ni-sage-line)] bg-[var(--ni-field)] px-2.5 py-1.5 text-sm ni-t-ink">
            {t("adminContent.quizzes")} <span className="font-bold ltr-embed">{formatNumber(inventory.quizzes)}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

export default function AdminContentExperience() {
  const { t, formatNumber, formatDate } = useLocale();
  const online = useOnlineStatus();
  const [reportStatus, setReportStatus] = useState("open");
  const [reportKind, setReportKind] = useState("all");
  const [reportOffset, setReportOffset] = useState(0);
  const [caseStatus, setCaseStatus] = useState("all");
  const [caseOffset, setCaseOffset] = useState(0);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string } | null>(null);

  const inventoryQuery = trpc.admin.contentInventory.useQuery(undefined, { retry: false });
  const reportsQuery = trpc.admin.reports.useQuery({ kind: reportKind as never, status: reportStatus, limit: PAGE, offset: reportOffset }, { retry: false });
  const casesQuery = trpc.admin.cases.useQuery({ status: caseStatus as never, limit: PAGE, offset: caseOffset }, { retry: false });

  const resolveReport = trpc.admin.resolveReport.useMutation();
  const decideCase = trpc.admin.decideCase.useMutation();

  const inventoryState = pagedState<never>(inventoryQuery as never, online);
  const inventory = objectData<Inventory>(inventoryQuery as never);
  const reportsState = pagedState<ReportRow>(reportsQuery as never, online);
  const casesState = pagedState<CaseRow>(casesQuery as never, online);

  const askReport = (row: ReportRow, outcomeValue: "resolved" | "dismissed") => {
    setConfirm({
      title: t(outcomeValue === "resolved" ? "adminContent.confirmResolve" : "adminContent.confirmDismiss"),
      body: t("adminContent.reportConfirmBody", { reason: row.reason.slice(0, 120) }),
      confirmLabel: t(outcomeValue === "resolved" ? "adminContent.resolve" : "adminContent.dismiss"),
      requireReason: true,
      destructive: outcomeValue === "dismissed",
      onConfirm: async (reason) => {
        const result = (await resolveReport.mutateAsync({ reportId: row.id, kind: row.kind, outcome: outcomeValue, note: reason })) as { ok: boolean; error?: string };
        setOutcome({ ok: result.ok, text: result.ok ? t("adminContent.saved") : result.error ?? t("common.error") });
        setConfirm(null);
        reportsQuery.refetch();
      },
    });
  };

  const askCase = (row: CaseRow, next: "investigating" | "resolved" | "dismissed") => {
    setConfirm({
      title: t(`adminContent.confirmCase.${next}` as TranslationKey),
      body: t("adminContent.caseConfirmBody", { target: row.targetType }),
      confirmLabel: statusLabel(t, next),
      requireReason: true,
      destructive: next === "dismissed",
      onConfirm: async (reason) => {
        const result = (await decideCase.mutateAsync({ caseId: row.id, status: next, reason })) as { ok: boolean; error?: string };
        setOutcome({ ok: result.ok, text: result.ok ? t("adminContent.saved") : result.error ?? t("common.error") });
        setConfirm(null);
        casesQuery.refetch();
      },
    });
  };

  return (
    <AdminShell activeKey="content" eyebrow={t("adminDesk.nav.content")} title={t("adminContent.title")} copy={t("adminContent.copy")}>
      <div className="space-y-6">
        <Outcome outcome={outcome} />

        <AdminPanel title={t("adminContent.inventory")} description={t("adminContent.inventoryCopy")}>
          {inventoryState !== "ready" || !inventory ? (
            <ResultState
              state={inventoryState === "ready" ? "error" : inventoryState}
              message={resultError(inventoryQuery as never)}
              onRetry={() => inventoryQuery.refetch()}
              retrying={inventoryQuery.isFetching}
            />
          ) : (
            <InventoryGrid inventory={inventory} />
          )}
        </AdminPanel>

        <AdminPanel title={t("adminContent.reported")} description={t("adminContent.reportedCopy")}>
          <FilterBar
            filters={[
              {
                id: "report-kind", label: t("adminUI.filterKind"), value: reportKind,
                options: [
                  { value: "all", label: statusLabel(t, "all") },
                  { value: "content", label: t("adminContent.kindContent") },
                  { value: "review", label: t("adminContent.kindReview") },
                ],
                onChange: (value) => { setReportKind(value); setReportOffset(0); },
              },
              {
                id: "report-status", label: t("adminUI.filterStatus"), value: reportStatus,
                options: (["all", "open", "resolved", "dismissed"] as const).map((value) => ({ value, label: statusLabel(t, value) })),
                onChange: (value) => { setReportStatus(value); setReportOffset(0); },
              },
            ]}
          />
          <div className="mt-5">
            {reportsState !== "ready" ? (
              <ResultState
                state={reportsState}
                message={reportsState === "empty" ? t("adminContent.noReports") : resultError(reportsQuery as never)}
                onRetry={() => reportsQuery.refetch()}
                retrying={reportsQuery.isFetching}
              />
            ) : (
              <>
                <AdminTable<ReportRow>
                  caption={t("adminContent.reportsCaption")}
                  rows={pagedRows<ReportRow>(reportsQuery as never)}
                  rowKey={(row) => `${row.kind}:${row.id}`}
                  columns={[
                    { key: "reason", header: t("adminContent.colReason"), primary: true, cell: (row) => <span className="block max-w-[36ch] text-sm leading-6 ni-t-ink">{row.reason}</span> },
                    { key: "kind", header: t("adminUI.filterKind"), cell: (row) => <StatusBadge status={row.kind} tone="neutral" label={row.kind === "review" ? t("adminContent.kindReview") : t("adminContent.kindContent")} /> },
                    { key: "target", header: t("adminContent.colTarget"), cell: (row) => <span className="text-sm ni-t-muted ltr-embed">{row.targetType} · {row.targetId.slice(0, 8)}…</span> },
                    { key: "reporter", header: t("adminContent.colReporter"), cell: (row) => <span className="text-sm ni-t-muted">{row.reporterName ?? t("adminUI.none")}</span> },
                    { key: "status", header: t("adminUI.filterStatus"), cell: (row) => <StatusBadge status={row.status} label={statusLabel(t, row.status)} /> },
                    { key: "created", header: t("adminUI.created"), align: "end", cell: (row) => <span className="whitespace-nowrap text-xs ni-t-muted ltr-embed">{formatDate(row.createdAt, { dateStyle: "medium" })}</span> },
                  ]}
                  actions={(row) =>
                    row.status === "open" ? (
                      <>
                        <RowAction onClick={() => askReport(row, "resolved")} tone="primary" disabled={resolveReport.isPending}>{t("adminContent.resolve")}</RowAction>
                        <RowAction onClick={() => askReport(row, "dismissed")} tone="danger" disabled={resolveReport.isPending}>{t("adminContent.dismiss")}</RowAction>
                      </>
                    ) : (
                      <span className="ni-label">{t("adminUI.noAction")}</span>
                    )
                  }
                />
                <Pager
                  total={pagedMeta<ReportRow>(reportsQuery as never).total}
                  limit={pagedMeta<ReportRow>(reportsQuery as never).limit}
                  offset={reportOffset}
                  onOffset={setReportOffset}
                />
              </>
            )}
          </div>
        </AdminPanel>

        <AdminPanel title={t("adminContent.cases")} description={t("adminContent.casesCopy")}>
          <FilterBar
            filters={[{
              id: "case-status", label: t("adminUI.filterStatus"), value: caseStatus,
              options: (["all", "open", "investigating", "resolved", "dismissed"] as const).map((value) => ({ value, label: statusLabel(t, value) })),
              onChange: (value) => { setCaseStatus(value); setCaseOffset(0); },
            }]}
          />
          <div className="mt-5">
            {casesState !== "ready" ? (
              <ResultState
                state={casesState}
                message={casesState === "empty" ? t("adminContent.noCases") : resultError(casesQuery as never)}
                onRetry={() => casesQuery.refetch()}
                retrying={casesQuery.isFetching}
              />
            ) : (
              <>
                <AdminTable<CaseRow>
                  caption={t("adminContent.casesCaption")}
                  rows={pagedRows<CaseRow>(casesQuery as never)}
                  rowKey={(row) => row.id}
                  columns={[
                    {
                      key: "target", header: t("adminContent.colTarget"), primary: true,
                      cell: (row) => (
                        <span className="block min-w-0">
                          <span className="flex items-center gap-2 font-semibold ni-t-ink">
                            <FolderTree size={14} aria-hidden="true" className="ni-t-gold" />
                            <span className="ltr-embed">{row.targetType}</span>
                          </span>
                          <span className="mt-0.5 block text-xs ni-t-muted-soft ltr-embed">{row.targetId.slice(0, 8)}…</span>
                        </span>
                      ),
                    },
                    { key: "priority", header: t("adminContent.colPriority"), cell: (row) => <StatusBadge status={row.priority} tone="neutral" label={statusLabel(t, row.priority)} /> },
                    { key: "status", header: t("adminUI.filterStatus"), cell: (row) => <StatusBadge status={row.status} label={statusLabel(t, row.status)} /> },
                    { key: "opened", header: t("adminContent.colOpenedBy"), cell: (row) => <span className="text-sm ni-t-muted">{row.openedByName ?? t("adminUI.none")}</span> },
                    { key: "actions", header: t("adminContent.colActions"), cell: (row) => <span className="text-sm ni-t-muted ltr-embed">{formatNumber(row.actionCount)}</span> },
                    { key: "updated", header: t("adminUI.updated"), align: "end", cell: (row) => <span className="whitespace-nowrap text-xs ni-t-muted ltr-embed">{formatDate(row.updatedAt, { dateStyle: "medium" })}</span> },
                  ]}
                  actions={(row) => (
                    <>
                      {row.status === "open" && <RowAction onClick={() => askCase(row, "investigating")} disabled={decideCase.isPending}>{statusLabel(t, "investigating")}</RowAction>}
                      {row.status !== "resolved" && <RowAction onClick={() => askCase(row, "resolved")} tone="primary" disabled={decideCase.isPending}>{t("adminContent.resolve")}</RowAction>}
                      {row.status !== "dismissed" && <RowAction onClick={() => askCase(row, "dismissed")} tone="danger" disabled={decideCase.isPending}>{t("adminContent.dismiss")}</RowAction>}
                    </>
                  )}
                />
                <Pager
                  total={pagedMeta<CaseRow>(casesQuery as never).total}
                  limit={pagedMeta<CaseRow>(casesQuery as never).limit}
                  offset={caseOffset}
                  onOffset={setCaseOffset}
                />
              </>
            )}
          </div>
        </AdminPanel>

        <AdminPanel title={t("adminContent.reviewsPanel")} description={t("adminContent.reviewsPanelCopy")}>
          <ReviewsQueue compact />
        </AdminPanel>
      </div>

      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} busy={resolveReport.isPending || decideCase.isPending} />
    </AdminShell>
  );
}
