/**
 * Instructor verification — the queue and the review detail.
 *
 * Every row comes from `admin.instructors`, which verifies the administrator
 * role on the server before it reads anything. Nothing here is fixture data, and
 * an empty queue means the database returned no instructor profiles.
 *
 * No decision fires from a click alone: approve, reject and request-changes all
 * open the shared `ConfirmDialog` first, and the two that send the tutor back
 * require a typed reason, which is written into the audit row and into the
 * notification the tutor receives.
 */
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, BadgeCheck, ExternalLink, FileText } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLocale } from "../contexts/LocaleContextState";
import AdminShell from "./AdminShell";
import ResultState from "./ResultState";
import {
  AdminPanel, AdminTable, ConfirmDialog, DefinitionList, FilterBar, Outcome, Pager,
  RowAction, StatusBadge, statusLabel, type ConfirmRequest,
} from "./AdminUI";
import { resultError } from "../lib/result-state";
import { objectData, pagedMeta, pagedRows, pagedState } from "../lib/admin-paged";
import { useOnlineStatus } from "../lib/use-online-status";
import { useDebounced } from "../lib/use-debounced";
import type { TranslationKey } from "@/i18n/catalog";
import { COMPLETION_LABEL_KEYS } from "../lib/use-instructor-completion";

type Row = {
  id: string; displayName: string | null; slug: string; subjects: string[]; languages: string[];
  yearsExperience: number | null; sect: string | null; hasIjazah: boolean;
  verificationStatus: string; publicProfileStatus: string; updatedAt: string;
  lastDecision: { action: string; at: string } | null;
};

type DecisionResult = { ok: boolean; error?: string; data?: { notified?: boolean } };

/**
 * What the desk says after a decision.
 *
 * The decision and its notification are separate operations: the status write
 * can succeed while the notification does not. Reporting only "recorded" in that
 * case would tell an operator the instructor had been informed when they had
 * not, which is how a broken notification pipeline stayed invisible. Three
 * outcomes, three sentences.
 */
function decisionOutcome(result: DecisionResult, t: (key: TranslationKey) => string): { ok: boolean; text: string } {
  if (!result.ok) return { ok: false, text: result.error ?? t("common.error") };
  if (result.data?.notified === false) return { ok: false, text: t("adminInstructors.savedNotNotified") };
  return { ok: true, text: t("adminInstructors.saved") };
}

const FILTERS = ["all", "verification_pending", "approved", "rejected", "process_coming_soon"] as const;
const PAGE = 25;

export default function AdminInstructorsExperience() {
  const { t, formatNumber, formatDate } = useLocale();
  const online = useOnlineStatus();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [offset, setOffset] = useState(0);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string } | null>(null);

  const debounced = useDebounced(search);
  const query = trpc.admin.instructors.useQuery(
    { search: debounced || undefined, status: status as never, limit: PAGE, offset },
    { retry: false },
  );
  const decide = trpc.admin.decideInstructor.useMutation();

  const state = pagedState<Row>(query as never, online);
  const rows = pagedRows<Row>(query as never);
  const meta = pagedMeta<Row>(query as never);

  const run = (row: Row, decision: "approved" | "rejected" | "request_changes") => {
    const labels: Record<typeof decision, { title: TranslationKey; confirm: TranslationKey }> = {
      approved: { title: "adminInstructors.confirmApprove", confirm: "adminInstructors.approve" },
      rejected: { title: "adminInstructors.confirmReject", confirm: "adminInstructors.reject" },
      request_changes: { title: "adminInstructors.confirmChanges", confirm: "adminInstructors.requestChanges" },
    };
    setConfirm({
      title: t(labels[decision].title),
      body: t("adminInstructors.confirmBody", { name: row.displayName ?? row.slug }),
      confirmLabel: t(labels[decision].confirm),
      requireReason: decision !== "approved",
      destructive: decision === "rejected",
      onConfirm: async (reason) => {
        const result = (await decide.mutateAsync({ instructorId: row.id, decision, note: reason || undefined })) as DecisionResult;
        setOutcome(decisionOutcome(result, t));
        setConfirm(null);
        query.refetch();
      },
    });
  };

  return (
    <AdminShell
      activeKey="instructors"
      eyebrow={t("adminDesk.nav.instructors")}
      title={t("adminInstructors.title")}
      copy={t("adminInstructors.copy")}
    >
      <AdminPanel>
        <FilterBar
          search={{ value: search, placeholder: t("adminInstructors.searchPlaceholder"), onChange: (value) => { setSearch(value); setOffset(0); } }}
          filters={[{
            id: "instructor-status",
            label: t("adminUI.filterStatus"),
            value: status,
            options: FILTERS.map((value) => ({ value, label: statusLabel(t, value) })),
            onChange: (value) => { setStatus(value); setOffset(0); },
          }]}
          resultLabel={state === "ready" ? t("adminUI.resultCount", { count: formatNumber(meta.total) }) : undefined}
        />

        <Outcome outcome={outcome} />

        <div className="mt-5">
          {state !== "ready" ? (
            <ResultState
              state={state}
              message={state === "empty" ? t("adminInstructors.empty") : resultError(query as never)}
              onRetry={() => query.refetch()}
              retrying={query.isFetching}
            />
          ) : (
            <>
              <AdminTable<Row>
                caption={t("adminInstructors.tableCaption")}
                rows={rows}
                rowKey={(row) => row.id}
                columns={[
                  {
                    key: "name", header: t("adminInstructors.colName"), primary: true,
                    cell: (row) => (
                      <span className="block min-w-0">
                        <Link href={`/admin/instructors/${row.id}`} className="font-semibold ni-link outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]">
                          {row.displayName ?? row.slug}
                        </Link>
                        <span className="mt-0.5 block text-xs ni-t-muted ltr-embed">{row.slug}</span>
                      </span>
                    ),
                  },
                  {
                    key: "subjects", header: t("adminInstructors.colSubjects"),
                    cell: (row) => <span className="text-sm ni-t-muted">{row.subjects.length > 0 ? row.subjects.join(", ") : t("adminUI.none")}</span>,
                  },
                  {
                    key: "experience", header: t("adminInstructors.colExperience"),
                    cell: (row) => (
                      <span className="text-sm ni-t-muted">
                        {row.yearsExperience === null ? t("adminUI.none") : <span className="ltr-embed">{formatNumber(row.yearsExperience)}</span>}
                        {row.hasIjazah && <span className="ms-2 ni-label">{t("adminInstructors.ijazah")}</span>}
                      </span>
                    ),
                  },
                  {
                    key: "status", header: t("adminUI.filterStatus"),
                    cell: (row) => (
                      <span className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={row.verificationStatus} label={statusLabel(t, row.verificationStatus)} />
                        {row.lastDecision?.action === "instructor.verification.changes_requested" && (
                          <StatusBadge status="waiting" tone="waiting" label={t("adminInstructors.changesRequested")} />
                        )}
                      </span>
                    ),
                  },
                  {
                    key: "visibility", header: t("adminInstructors.colVisibility"),
                    cell: (row) => <StatusBadge status={row.publicProfileStatus} label={statusLabel(t, row.publicProfileStatus)} />,
                  },
                  {
                    key: "updated", header: t("adminUI.updated"), align: "end",
                    cell: (row) => <span className="whitespace-nowrap text-xs ni-t-muted ltr-embed">{formatDate(row.updatedAt, { dateStyle: "medium" })}</span>,
                  },
                ]}
                actions={(row) => (
                  <>
                    <RowAction onClick={() => run(row, "approved")} tone="primary" disabled={decide.isPending}>{t("adminInstructors.approve")}</RowAction>
                    <RowAction onClick={() => run(row, "request_changes")} disabled={decide.isPending}>{t("adminInstructors.requestChanges")}</RowAction>
                    <RowAction onClick={() => run(row, "rejected")} tone="danger" disabled={decide.isPending}>{t("adminInstructors.reject")}</RowAction>
                  </>
                )}
              />
              <Pager total={meta.total} limit={meta.limit} offset={meta.offset} onOffset={setOffset} />
            </>
          )}
        </div>
      </AdminPanel>

      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} busy={decide.isPending} />
    </AdminShell>
  );
}

/* -------------------------------------------------------------- detail page */

type Detail = {
  id: string;
  /* What the reviewer is deciding about: how much of the profile exists, field by field. */
  completion: { percent: number; fields: Array<{ key: string; done: boolean }>; missingRequired: string[] };
  profile: {
    displayName: string | null; fullName: string | null; country: string | null; city: string | null;
    timezone: string | null; preferredLanguage: string | null; supportedLanguages: string[];
    bio: string | null; onboardingCompleted: boolean; accountStatus: string; joinedAt: string;
  };
  instructor: {
    slug: string; subjects: string[]; teachingLevels: string[]; languages: string[];
    yearsExperience: number | null; teachingApproach: string | null; availabilitySummary: string | null;
    sect: string | null; hasIjazah: boolean; verificationStatus: string; publicProfileStatus: string;
    trainingStatus: string; testStatus: string; updatedAt: string;
  };
  credentials: Array<{ id: string; objectPath: string; mimeType: string; sizeBytes: number; reviewStatus: string; createdAt: string }>;
  responses: Array<{ id: string; status: string; createdAt: string; requirementSubject: string | null }>;
  history: Array<{ id: string; action: string; actorName: string | null; from: string | null; to: string | null; note: string | null; createdAt: string }>;
};

export function AdminInstructorDetailExperience({ instructorId }: { instructorId: string }) {
  const { t, formatNumber, formatDate } = useLocale();
  const online = useOnlineStatus();
  const [, setLocation] = useLocation();
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string } | null>(null);

  const query = trpc.admin.instructor.useQuery({ instructorId }, { retry: false });
  const decide = trpc.admin.decideInstructor.useMutation();
  const reviewCredential = trpc.admin.reviewCredential.useMutation();
  const utils = trpc.useUtils();

  const state = pagedState<never>(query as never, online);
  const detail = objectData<Detail>(query as never);

  const decideProfile = (decision: "approved" | "rejected" | "request_changes") => {
    if (!detail) return;
    setConfirm({
      title: t(decision === "approved" ? "adminInstructors.confirmApprove" : decision === "rejected" ? "adminInstructors.confirmReject" : "adminInstructors.confirmChanges"),
      body: t("adminInstructors.confirmBody", { name: detail.profile.displayName ?? detail.instructor.slug }),
      confirmLabel: t(decision === "approved" ? "adminInstructors.approve" : decision === "rejected" ? "adminInstructors.reject" : "adminInstructors.requestChanges"),
      requireReason: decision !== "approved",
      destructive: decision === "rejected",
      onConfirm: async (reason) => {
        const result = (await decide.mutateAsync({ instructorId, decision, note: reason || undefined })) as DecisionResult;
        setOutcome(decisionOutcome(result, t));
        setConfirm(null);
        query.refetch();
      },
    });
  };

  const decideCredential = (credentialId: string, next: "approved" | "rejected") => {
    setConfirm({
      title: t(next === "approved" ? "adminInstructors.confirmCredentialApprove" : "adminInstructors.confirmCredentialReject"),
      body: t("adminInstructors.credentialConfirmBody"),
      confirmLabel: t(next === "approved" ? "adminInstructors.approve" : "adminInstructors.reject"),
      requireReason: next === "rejected",
      destructive: next === "rejected",
      onConfirm: async (reason) => {
        const result = (await reviewCredential.mutateAsync({ credentialId, status: next, note: reason || undefined })) as { ok: boolean; error?: string };
        setOutcome({ ok: result.ok, text: result.ok ? t("adminInstructors.saved") : result.error ?? t("common.error") });
        setConfirm(null);
        query.refetch();
      },
    });
  };

  /**
   * Opens a credential document.
   *
   * The URL is minted on demand and expires: `storage.createSignedDownloadUrl`
   * checks the caller's role server-side and signs for a few minutes only, so no
   * durable link to a private document ever exists in this page.
   */
  const openCredential = async (objectPath: string) => {
    const result = (await utils.storage.createSignedDownloadUrl.fetch({ bucket: "instructor-credentials", objectPath })) as
      { ok: boolean; data?: { signedUrl: string }; error?: string };
    if (result.ok && result.data?.signedUrl) window.open(result.data.signedUrl, "_blank", "noopener,noreferrer");
    else setOutcome({ ok: false, text: result.error ?? t("adminInstructors.documentUnavailable") });
  };

  const back = (
    <button type="button" onClick={() => setLocation("/admin/instructors")} className="ni-btn ni-btn--outline text-sm">
      <ArrowLeft size={14} aria-hidden="true" className="rtl:-scale-x-100" />
      {t("adminUI.back")}
    </button>
  );

  return (
    <AdminShell
      activeKey="instructors"
      eyebrow={t("adminDesk.nav.instructors")}
      title={detail?.profile.displayName ?? detail?.instructor.slug ?? t("adminInstructors.detailTitle")}
      copy={t("adminInstructors.detailCopy")}
      actions={back}
    >
      {state !== "ready" || !detail ? (
        <ResultState
          state={state === "ready" ? "error" : state}
          message={resultError(query as never)}
          onRetry={() => query.refetch()}
          retrying={query.isFetching}
        />
      ) : (
        <div className="space-y-6">
          <Outcome outcome={outcome} />

          <AdminPanel
            title={t("adminInstructors.decision")}
            description={t("adminInstructors.decisionCopy")}
            actions={
              <>
                <RowAction onClick={() => decideProfile("approved")} tone="primary" disabled={decide.isPending}>{t("adminInstructors.approve")}</RowAction>
                <RowAction onClick={() => decideProfile("request_changes")} disabled={decide.isPending}>{t("adminInstructors.requestChanges")}</RowAction>
                <RowAction onClick={() => decideProfile("rejected")} tone="danger" disabled={decide.isPending}>{t("adminInstructors.reject")}</RowAction>
              </>
            }
          >
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={detail.instructor.verificationStatus} label={statusLabel(t, detail.instructor.verificationStatus)} />
              <StatusBadge status={detail.instructor.publicProfileStatus} label={statusLabel(t, detail.instructor.publicProfileStatus)} />
              <StatusBadge status={detail.profile.accountStatus} label={statusLabel(t, detail.profile.accountStatus)} />
            </div>
          </AdminPanel>

          {/* Approving makes the profile live, so what is in it is shown before the button, not
              behind a visit to the public page. Same score the teacher sees, same field list. */}
          <AdminPanel title={t("adminInstructors.completion")} description={t("adminInstructors.completionCopy")}>
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-display text-3xl ni-t-ink tabular-nums">{formatNumber(detail.completion.percent)}%</span>
              <span className="text-sm ni-t-muted">
                {t("adminInstructors.filledCount", {
                  done: formatNumber(detail.completion.fields.filter((field) => field.done).length),
                  total: formatNumber(detail.completion.fields.length),
                })}
              </span>
            </div>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[var(--ni-sage-line)]">
              <div className="h-full rounded-full bg-[var(--ni-moss)]" style={{ width: `${detail.completion.percent}%` }} />
            </div>

            <p className="mt-4 text-sm font-semibold ni-t-ink">
              {detail.completion.missingRequired.length === 0
                ? t("adminInstructors.allRequiredDone")
                : `${t("adminInstructors.missingRequired")}: ${detail.completion.missingRequired.map((key) => COMPLETION_LABEL_KEYS[key] ? t(COMPLETION_LABEL_KEYS[key]) : key).join(" · ")}`}
            </p>

            <ul className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {detail.completion.fields.map((field) => (
                <li key={field.key} className="flex items-center gap-2 text-sm">
                  <span aria-hidden="true" className={field.done ? "ni-t-moss" : "ni-t-muted-soft"}>{field.done ? "✓" : "—"}</span>
                  <span className={field.done ? "ni-t-ink" : "ni-t-muted"}>
                    {COMPLETION_LABEL_KEYS[field.key] ? t(COMPLETION_LABEL_KEYS[field.key]) : field.key}
                  </span>
                </li>
              ))}
            </ul>
          </AdminPanel>

          <div className="grid gap-6 lg:grid-cols-2">
            <AdminPanel title={t("adminInstructors.profile")}>
              <DefinitionList
                items={[
                  { label: t("adminInstructors.fullName"), value: detail.profile.fullName ?? t("adminUI.none") },
                  { label: t("adminInstructors.slug"), value: <span className="ltr-embed">{detail.instructor.slug}</span> },
                  { label: t("adminInstructors.location"), value: [detail.profile.city, detail.profile.country].filter(Boolean).join(", ") || t("adminUI.none") },
                  { label: t("adminInstructors.timezone"), value: <span className="ltr-embed">{detail.profile.timezone ?? t("adminUI.none")}</span> },
                  { label: t("adminInstructors.languages"), value: detail.instructor.languages.join(", ") || t("adminUI.none") },
                  { label: t("adminInstructors.levels"), value: detail.instructor.teachingLevels.join(", ") || t("adminUI.none") },
                  { label: t("adminInstructors.subjects"), value: detail.instructor.subjects.join(", ") || t("adminUI.none") },
                  { label: t("adminInstructors.experience"), value: detail.instructor.yearsExperience === null ? t("adminUI.none") : <span className="ltr-embed">{formatNumber(detail.instructor.yearsExperience)}</span> },
                  { label: t("adminInstructors.sect"), value: detail.instructor.sect ?? t("adminUI.none") },
                  { label: t("adminInstructors.ijazahLabel"), value: detail.instructor.hasIjazah ? t("adminUI.yes") : t("adminUI.no") },
                  { label: t("adminInstructors.training"), value: statusLabel(t, detail.instructor.trainingStatus) },
                  { label: t("adminInstructors.test"), value: statusLabel(t, detail.instructor.testStatus) },
                  { label: t("adminInstructors.onboarding"), value: detail.profile.onboardingCompleted ? t("adminUI.yes") : t("adminUI.no") },
                  { label: t("adminInstructors.joined"), value: <span className="ltr-embed">{formatDate(detail.profile.joinedAt, { dateStyle: "medium" })}</span> },
                ]}
              />
              {detail.instructor.teachingApproach && (
                <>
                  <hr className="ni-rule my-4" />
                  <p className="ni-label">{t("adminInstructors.approach")}</p>
                  <p className="mt-1.5 whitespace-pre-line text-sm leading-6 ni-t-muted">{detail.instructor.teachingApproach}</p>
                </>
              )}
            </AdminPanel>

            <div className="space-y-6">
              <AdminPanel title={t("adminInstructors.credentials")} description={t("adminInstructors.credentialsCopy")}>
                {detail.credentials.length === 0 ? (
                  <ResultState state="empty" message={t("adminInstructors.noCredentials")} />
                ) : (
                  <ul className="space-y-2.5">
                    {detail.credentials.map((credential) => (
                      <li key={credential.id} className="rounded-[9px] border border-[var(--ni-sage-line)] bg-[var(--ni-field)] p-3.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-2">
                            <FileText size={15} aria-hidden="true" className="shrink-0 ni-t-gold" />
                            <span className="min-w-0 text-sm ni-t-ink ltr-embed">{credential.mimeType}</span>
                            <span className="ni-label ltr-embed">{formatNumber(Math.round(credential.sizeBytes / 1024))} KB</span>
                          </span>
                          <StatusBadge status={credential.reviewStatus} label={statusLabel(t, credential.reviewStatus)} />
                        </div>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          <RowAction onClick={() => openCredential(credential.objectPath)}>
                            <ExternalLink size={12} aria-hidden="true" className="me-1 inline" />
                            {t("adminInstructors.openDocument")}
                          </RowAction>
                          <RowAction onClick={() => decideCredential(credential.id, "approved")} tone="primary" disabled={reviewCredential.isPending}>{t("adminInstructors.approve")}</RowAction>
                          <RowAction onClick={() => decideCredential(credential.id, "rejected")} tone="danger" disabled={reviewCredential.isPending}>{t("adminInstructors.reject")}</RowAction>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </AdminPanel>

              <AdminPanel title={t("adminInstructors.requirements")} description={t("adminInstructors.requirementsCopy")}>
                {detail.responses.length === 0 ? (
                  <ResultState state="empty" message={t("adminInstructors.noResponses")} />
                ) : (
                  <ul className="space-y-2">
                    {detail.responses.map((response) => (
                      <li key={response.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--ni-sage)] pb-2 last:border-b-0">
                        <span className="min-w-0 text-sm ni-t-ink">{response.requirementSubject ?? t("adminUI.none")}</span>
                        <span className="flex items-center gap-2">
                          <StatusBadge status={response.status} label={statusLabel(t, response.status)} />
                          <span className="text-xs ni-t-muted-soft ltr-embed">{formatDate(response.createdAt, { dateStyle: "short" })}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </AdminPanel>
            </div>
          </div>

          <AdminPanel title={t("adminInstructors.history")} description={t("adminInstructors.historyCopy")}>
            {detail.history.length === 0 ? (
              <ResultState state="empty" message={t("adminInstructors.noHistory")} />
            ) : (
              <ol className="space-y-0">
                {detail.history.map((entry) => (
                  <li key={entry.id} className="flex gap-3 border-b border-[var(--ni-sage)] py-3.5 last:border-b-0">
                    <BadgeCheck size={15} aria-hidden="true" className="mt-0.5 shrink-0 ni-t-gold" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold ni-t-ink ltr-embed">{entry.action}</p>
                      <p className="mt-1 text-xs leading-5 ni-t-muted">
                        {entry.actorName ?? t("adminUI.system")}
                        {entry.from && entry.to && <> · <span className="ltr-embed">{statusLabel(t, entry.from)} → {statusLabel(t, entry.to)}</span></>}
                      </p>
                      {entry.note && <p className="mt-1.5 rounded-[7px] bg-[var(--ni-sage-soft)] px-2.5 py-2 text-xs leading-5 ni-t-muted">{entry.note}</p>}
                      <p className="mt-1 text-[11px] ni-t-muted-soft ltr-embed">{formatDate(entry.createdAt, { dateStyle: "medium", timeStyle: "short" })}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </AdminPanel>
        </div>
      )}

      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} busy={decide.isPending || reviewCredential.isPending} />
    </AdminShell>
  );
}
