/**
 * User management — the account list and one account's record.
 *
 * What is deliberately absent matters as much as what is here: there is no
 * control that grants, changes or removes a role. No procedure on the server
 * would accept one, so the desk does not pretend otherwise — the page says so
 * plainly instead of hiding a disabled button.
 *
 * No email address, token or session appears anywhere on these screens. An
 * account is identified by its display name and its id, which is what support
 * work actually needs.
 *
 * The one write is suspend/reactivate. It requires a typed reason, refuses the
 * operator's own account and any other privileged account, and is audited.
 */
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, ShieldCheck, UserCog } from "lucide-react";
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
import { PRIVILEGED_ROLES, type AccountRoleKey } from "@shared/account-roles";
import type { TranslationKey } from "../i18n/catalog";

type Row = {
  id: string; displayName: string | null; fullName: string | null; country: string | null;
  roles: string[]; effectiveRole: AccountRoleKey; accountStatus: string; onboardingCompleted: boolean;
  preferredLocale: string | null; joinedAt: string;
};

const ROLE_FILTERS = ["all", "learner", "instructor", "admin", "staff", "unassigned"] as const;
const STATUS_FILTERS = ["all", "active", "pending", "suspended", "deleted"] as const;
const PAGE = 25;

/** The two roles a member of the public can hold. Never shown on a privileged account. */
const PUBLIC_ROLE_NAMES = ["learner", "instructor"];

/** Filter labels, named the same way the badges are so a filter matches what it returns. */
const FILTER_LABEL: Partial<Record<(typeof ROLE_FILTERS)[number], TranslationKey>> = {
  admin: "adminUsers.roleAdmin",
  staff: "adminUsers.roleStaff",
  instructor: "adminUsers.roleInstructor",
  learner: "adminUsers.roleLearner",
  unassigned: "adminUsers.roleNotAssigned",
};

/** The account's one role, named. Bucket keys are shared with the server, so these cannot drift. */
const ROLE_LABEL: Record<AccountRoleKey, TranslationKey> = {
  admins: "adminUsers.roleAdmin",
  staff: "adminUsers.roleStaff",
  instructors: "adminUsers.roleInstructor",
  learners: "adminUsers.roleLearner",
  unassigned: "adminUsers.roleNotAssigned",
};

/**
 * What the account IS, then anything else it holds.
 *
 * The leading badge is the effective role the server resolved — the same value
 * the overview counted and the list sorted by — so an account cannot be labelled
 * one thing here and counted as another there. The administrator reads
 * "Administrator", never "Learner", however many historical rows sit beneath it.
 *
 * Remaining rows are shown after it, quietly, because a stale `learner` row on an
 * administrator is exactly the kind of record an operator should be able to see.
 */
function RoleChips({ roles, effectiveRole }: { roles: string[]; effectiveRole: AccountRoleKey }) {
  const { t } = useLocale();
  const privileged = effectiveRole === "admins" || effectiveRole === "staff";
  // A missing role is a data problem worth seeing, not an empty cell. It is
  // never rendered as "Learner" — guessing that is the bug this desk exposed.
  //
  // The leading badge stands for the top role only when there is one the ladder
  // recognises. An account holding nothing but an unrecognised role reads "Role
  // not assigned" AND still shows that role beside it, rather than having the
  // one piece of evidence about it quietly dropped.
  const named = roles.length > 0 && effectiveRole !== "unassigned" ? roles[0] : null;
  // A privileged account shows its privileged role and nothing else.
  //
  // The administrator holds a stale `learner` row from the pre-0023 signup
  // trigger, and rendering it beside "Administrator" made the desk read as though
  // the board account were also a learner — the very confusion this screen exists
  // to end. What an operator is entitled to see here is what the account IS;
  // leftover rows are a data-hygiene matter for the audit, not an identity.
  const secondary = privileged
    ? roles.filter((role) => role !== named && !PUBLIC_ROLE_NAMES.includes(role))
    : roles.filter((role) => role !== named);
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <StatusBadge
        status={effectiveRole === "unassigned" ? "pending" : effectiveRole}
        tone={effectiveRole === "unassigned" ? "negative" : privileged ? "waiting" : "neutral"}
        label={t(ROLE_LABEL[effectiveRole])}
      />
      {secondary.map((role) => (
        <StatusBadge key={role} status={role} tone="neutral" label={statusLabel(t, role)} />
      ))}
    </span>
  );
}

export default function AdminUsersExperience() {
  const { t, formatNumber, formatDate } = useLocale();
  const online = useOnlineStatus();
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [offset, setOffset] = useState(0);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string } | null>(null);

  const debounced = useDebounced(search);
  const query = trpc.admin.users.useQuery(
    { search: debounced || undefined, role: role as never, status: status as never, limit: PAGE, offset },
    { retry: false },
  );
  const setAccountStatus = trpc.admin.setAccountStatus.useMutation();

  const state = pagedState<Row>(query as never, online);
  const rows = pagedRows<Row>(query as never);
  const meta = pagedMeta<Row>(query as never);

  const ask = (row: Row, next: "active" | "suspended") => {
    setConfirm({
      title: t(next === "suspended" ? "adminUsers.confirmSuspend" : "adminUsers.confirmReactivate"),
      body: t("adminUsers.confirmBody", { name: row.displayName ?? row.id.slice(0, 8) }),
      confirmLabel: t(next === "suspended" ? "adminUsers.suspend" : "adminUsers.reactivate"),
      requireReason: true,
      destructive: next === "suspended",
      onConfirm: async (reason) => {
        const result = (await setAccountStatus.mutateAsync({ userId: row.id, status: next, reason })) as { ok: boolean; error?: string };
        setOutcome({ ok: result.ok, text: result.ok ? t("adminUsers.saved") : result.error ?? t("common.error") });
        setConfirm(null);
        query.refetch();
      },
    });
  };

  return (
    <AdminShell activeKey="users" eyebrow={t("adminDesk.nav.users")} title={t("adminUsers.title")} copy={t("adminUsers.copy")}>
      <div className="space-y-6">
        <div className="rounded-[9px] border border-[var(--ni-sage-line)] bg-[var(--ni-sage-soft)] px-4 py-3 text-sm leading-6 ni-t-muted">
          <ShieldCheck size={15} aria-hidden="true" className="me-2 inline ni-t-moss" />
          {t("adminUsers.noRoleChanges")}
        </div>

        <AdminPanel>
          <FilterBar
            search={{ value: search, placeholder: t("adminUsers.searchPlaceholder"), onChange: (value) => { setSearch(value); setOffset(0); } }}
            filters={[
              {
                id: "user-role", label: t("adminUI.filterRole"), value: role,
                options: ROLE_FILTERS.map((value) => ({ value, label: FILTER_LABEL[value] ? t(FILTER_LABEL[value]!) : statusLabel(t, value) })),
                onChange: (value) => { setRole(value); setOffset(0); },
              },
              {
                id: "user-status", label: t("adminUI.filterStatus"), value: status,
                options: STATUS_FILTERS.map((value) => ({ value, label: statusLabel(t, value) })),
                onChange: (value) => { setStatus(value); setOffset(0); },
              },
            ]}
            resultLabel={state === "ready" ? t("adminUI.resultCount", { count: formatNumber(meta.total) }) : undefined}
          />

          <Outcome outcome={outcome} />

          <div className="mt-5">
            {state !== "ready" ? (
              <ResultState
                state={state}
                message={state === "empty" ? t("adminUsers.empty") : resultError(query as never)}
                onRetry={() => query.refetch()}
                retrying={query.isFetching}
              />
            ) : (
              <>
                <AdminTable<Row>
                  caption={t("adminUsers.tableCaption")}
                  rows={rows}
                  rowKey={(row) => row.id}
                  columns={[
                    {
                      key: "name", header: t("adminUsers.colName"), primary: true,
                      cell: (row) => (
                        <span className="block min-w-0">
                          <Link href={`/admin/users/${row.id}`} className="font-semibold ni-link outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--ni-moss)]">
                            {row.displayName ?? t("adminUsers.unnamed")}
                          </Link>
                          <span className="mt-0.5 block text-xs ni-t-muted-soft ltr-embed">{row.id.slice(0, 8)}…</span>
                        </span>
                      ),
                    },
                    { key: "roles", header: t("adminUsers.colRoles"), cell: (row) => <RoleChips roles={row.roles} effectiveRole={row.effectiveRole} /> },
                    { key: "status", header: t("adminUI.filterStatus"), cell: (row) => <StatusBadge status={row.accountStatus} label={statusLabel(t, row.accountStatus)} /> },
                    {
                      key: "onboarding", header: t("adminUsers.colOnboarding"),
                      cell: (row) => (
                        <StatusBadge
                          status={row.onboardingCompleted ? "completed" : "pending"}
                          label={row.onboardingCompleted ? t("adminUsers.onboardingDone") : t("adminUsers.onboardingOpen")}
                        />
                      ),
                    },
                    { key: "country", header: t("adminUsers.colCountry"), cell: (row) => <span className="text-sm ni-t-muted">{row.country ?? t("adminUI.none")}</span> },
                    {
                      key: "joined", header: t("adminUsers.colJoined"), align: "end",
                      cell: (row) => <span className="whitespace-nowrap text-xs ni-t-muted ltr-embed">{formatDate(row.joinedAt, { dateStyle: "medium" })}</span>,
                    },
                  ]}
                  actions={(row) => {
                    // Privileged accounts are not suspendable from a screen, so no
                    // control is offered rather than one that will be refused.
                    if (row.roles.some((held) => PRIVILEGED_ROLES.includes(held))) return <span className="ni-label">{t("adminUsers.protected")}</span>;
                    return row.accountStatus === "suspended" ? (
                      <RowAction onClick={() => ask(row, "active")} tone="primary" disabled={setAccountStatus.isPending}>{t("adminUsers.reactivate")}</RowAction>
                    ) : (
                      <RowAction onClick={() => ask(row, "suspended")} tone="danger" disabled={setAccountStatus.isPending}>{t("adminUsers.suspend")}</RowAction>
                    );
                  }}
                />
                <Pager total={meta.total} limit={meta.limit} offset={meta.offset} onOffset={setOffset} />
              </>
            )}
          </div>
        </AdminPanel>
      </div>

      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} busy={setAccountStatus.isPending} />
    </AdminShell>
  );
}

/* -------------------------------------------------------------- detail page */

type Detail = {
  id: string; displayName: string | null; fullName: string | null; country: string | null; city: string | null;
  timezone: string | null; preferredLocale: string | null; accountStatus: string; profileVisibility: string;
  onboardingCompleted: boolean; joinedAt: string; roles: string[]; effectiveRole: AccountRoleKey;
  learner: { profileStatus: string; subjects: string[]; level: string | null } | null;
  instructor: { slug: string; verificationStatus: string; publicProfileStatus: string; subjects: string[] } | null;
  activity: { enrolments: number; bookings: number; reviewsWritten: number; requirements: number };
  history: Array<{ id: string; action: string; from: string | null; to: string | null; note: string | null; createdAt: string }>;
};

export function AdminUserDetailExperience({ userId }: { userId: string }) {
  const { t, formatNumber, formatDate } = useLocale();
  const online = useOnlineStatus();
  const [, setLocation] = useLocation();
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string } | null>(null);

  const query = trpc.admin.user.useQuery({ userId }, { retry: false });
  const setAccountStatus = trpc.admin.setAccountStatus.useMutation();

  const state = pagedState<never>(query as never, online);
  const detail = objectData<Detail>(query as never);
  const isProtected = Boolean(detail?.roles.some((role) => PRIVILEGED_ROLES.includes(role)));

  const ask = (next: "active" | "suspended") => {
    if (!detail) return;
    setConfirm({
      title: t(next === "suspended" ? "adminUsers.confirmSuspend" : "adminUsers.confirmReactivate"),
      body: t("adminUsers.confirmBody", { name: detail.displayName ?? detail.id.slice(0, 8) }),
      confirmLabel: t(next === "suspended" ? "adminUsers.suspend" : "adminUsers.reactivate"),
      requireReason: true,
      destructive: next === "suspended",
      onConfirm: async (reason) => {
        const result = (await setAccountStatus.mutateAsync({ userId, status: next, reason })) as { ok: boolean; error?: string };
        setOutcome({ ok: result.ok, text: result.ok ? t("adminUsers.saved") : result.error ?? t("common.error") });
        setConfirm(null);
        query.refetch();
      },
    });
  };

  const back = (
    <button type="button" onClick={() => setLocation("/admin/users")} className="ni-btn ni-btn--outline text-sm">
      <ArrowLeft size={14} aria-hidden="true" className="rtl:-scale-x-100" />
      {t("adminUI.back")}
    </button>
  );

  return (
    <AdminShell
      activeKey="users"
      eyebrow={t("adminDesk.nav.users")}
      title={detail?.displayName ?? t("adminUsers.detailTitle")}
      copy={t("adminUsers.detailCopy")}
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
            title={t("adminUsers.account")}
            description={isProtected ? t("adminUsers.protectedCopy") : t("adminUsers.accountCopy")}
            actions={
              isProtected ? undefined : detail.accountStatus === "suspended" ? (
                <RowAction onClick={() => ask("active")} tone="primary" disabled={setAccountStatus.isPending}>{t("adminUsers.reactivate")}</RowAction>
              ) : (
                <RowAction onClick={() => ask("suspended")} tone="danger" disabled={setAccountStatus.isPending}>{t("adminUsers.suspend")}</RowAction>
              )
            }
          >
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={detail.accountStatus} label={statusLabel(t, detail.accountStatus)} />
              <RoleChips roles={detail.roles} effectiveRole={detail.effectiveRole} />
            </div>
            <hr className="ni-rule my-4" />
            <DefinitionList
              items={[
                { label: t("adminUsers.fullName"), value: detail.fullName ?? t("adminUI.none") },
                { label: t("adminUsers.identifier"), value: <span className="ltr-embed">{detail.id}</span> },
                { label: t("adminUsers.colCountry"), value: [detail.city, detail.country].filter(Boolean).join(", ") || t("adminUI.none") },
                { label: t("adminUsers.timezone"), value: <span className="ltr-embed">{detail.timezone ?? t("adminUI.none")}</span> },
                { label: t("adminUsers.locale"), value: <span className="ltr-embed">{detail.preferredLocale ?? t("adminUI.none")}</span> },
                { label: t("adminUsers.visibility"), value: statusLabel(t, detail.profileVisibility) },
                { label: t("adminUsers.colOnboarding"), value: detail.onboardingCompleted ? t("adminUsers.onboardingDone") : t("adminUsers.onboardingOpen") },
                { label: t("adminUsers.colJoined"), value: <span className="ltr-embed">{formatDate(detail.joinedAt, { dateStyle: "medium" })}</span> },
              ]}
            />
          </AdminPanel>

          <div className="grid gap-6 lg:grid-cols-2">
            <AdminPanel title={t("adminUsers.activity")} description={t("adminUsers.activityCopy")}>
              <DefinitionList
                items={[
                  { label: t("adminUsers.enrolments"), value: <span className="ltr-embed">{formatNumber(detail.activity.enrolments)}</span> },
                  { label: t("adminUsers.bookings"), value: <span className="ltr-embed">{formatNumber(detail.activity.bookings)}</span> },
                  { label: t("adminUsers.reviewsWritten"), value: <span className="ltr-embed">{formatNumber(detail.activity.reviewsWritten)}</span> },
                  { label: t("adminUsers.requirements"), value: <span className="ltr-embed">{formatNumber(detail.activity.requirements)}</span> },
                ]}
              />
            </AdminPanel>

            <AdminPanel title={t("adminUsers.profiles")} description={t("adminUsers.profilesCopy")}>
              {!detail.learner && !detail.instructor ? (
                <ResultState state="empty" message={t("adminUsers.noProfiles")} />
              ) : (
                <div className="space-y-4">
                  {detail.learner && (
                    <div>
                      <p className="ni-label">{t("adminUsers.learnerProfile")}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <StatusBadge status={detail.learner.profileStatus} label={statusLabel(t, detail.learner.profileStatus)} />
                        <span className="text-sm ni-t-muted">{detail.learner.subjects.join(", ") || t("adminUI.none")}</span>
                      </div>
                    </div>
                  )}
                  {detail.instructor && (
                    <div>
                      <p className="ni-label">{t("adminUsers.instructorProfile")}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <StatusBadge status={detail.instructor.verificationStatus} label={statusLabel(t, detail.instructor.verificationStatus)} />
                        <StatusBadge status={detail.instructor.publicProfileStatus} label={statusLabel(t, detail.instructor.publicProfileStatus)} />
                        <Link href={`/admin/instructors/${detail.id}`} className="text-sm ni-link hover:underline">{t("adminUsers.openInstructor")}</Link>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </AdminPanel>
          </div>

          <AdminPanel title={t("adminUsers.history")} description={t("adminUsers.historyCopy")}>
            {detail.history.length === 0 ? (
              <ResultState state="empty" message={t("adminUsers.noHistory")} />
            ) : (
              <ol className="space-y-0">
                {detail.history.map((entry) => (
                  <li key={entry.id} className="flex gap-3 border-b border-[var(--ni-sage)] py-3.5 last:border-b-0">
                    <UserCog size={15} aria-hidden="true" className="mt-0.5 shrink-0 ni-t-gold" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold ni-t-ink ltr-embed">{entry.action}</p>
                      {entry.from && entry.to && (
                        <p className="mt-1 text-xs ni-t-muted ltr-embed">{statusLabel(t, entry.from)} → {statusLabel(t, entry.to)}</p>
                      )}
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

      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} busy={setAccountStatus.isPending} />
    </AdminShell>
  );
}
