/**
 * Audit logs, system status and admin settings.
 *
 * Three pages that are all, in different ways, about not lying:
 *
 *  - **Audit logs** are read-only and there is no control to change that. The
 *    table has a SELECT policy for admins and no write policy at all, so the API
 *    role cannot insert, update or delete a row. The page says so, and offers no
 *    edit or delete affordance to disappoint.
 *  - **System status** shows environment variable *names* and whether they are
 *    set. No key, token or URL reaches this screen. `not_implemented` is kept
 *    distinct from `setup_needed` because pointing an operator at variables
 *    nothing reads would send them somewhere that cannot work.
 *  - **Settings** offers only what this architecture actually supports: the
 *    reader's own display and notification preferences, and a read-only view of
 *    platform settings, which RLS reserves for a super administrator. Nothing
 *    financial, nothing provider-related, no invented controls.
 */
import { useEffect, useState } from "react";
import { Bell, KeyRound, Palette, ScrollText, ShieldCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLocale } from "../contexts/LocaleContextState";
import AdminShell from "./AdminShell";
import ResultState from "./ResultState";
import ThemeToggle from "./ThemeToggle";
import { LocaleSelector } from "./LocaleSelector";
import { AdminPanel, AdminTable, FilterBar, Outcome, Pager, StatusBadge, statusLabel } from "./AdminUI";
import { resultError } from "../lib/result-state";
import { objectData, pagedMeta, pagedRows, pagedState } from "../lib/admin-paged";
import { useOnlineStatus } from "../lib/use-online-status";
import type { TranslationKey } from "@/i18n/catalog";

const PAGE = 25;

/* --------------------------------------------------------------- audit logs */

type AuditRow = {
  id: string; action: string; entityType: string; entityId: string | null;
  actorId: string | null; actorName: string | null;
  from: string | null; to: string | null; note: string | null;
  details: Array<{ key: string; value: string }>; createdAt: string;
};
type AuditPage = { rows: AuditRow[]; total: number; limit: number; offset: number; actions: string[]; entityTypes: string[] };

export function AdminAuditLogsExperience() {
  const { t, formatNumber, formatDate } = useLocale();
  const online = useOnlineStatus();
  const [action, setAction] = useState("all");
  const [entityType, setEntityType] = useState("all");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [offset, setOffset] = useState(0);

  const query = trpc.admin.auditLogs.useQuery(
    {
      action: action === "all" ? undefined : action,
      entityType: entityType === "all" ? undefined : entityType,
      // A date input gives a plain date; the server compares against timestamps,
      // so the range is widened to cover the whole day the reader selected.
      since: since ? `${since}T00:00:00.000Z` : undefined,
      until: until ? `${until}T23:59:59.999Z` : undefined,
      limit: PAGE,
      offset,
    },
    { retry: false },
  );

  const state = pagedState<AuditRow>(query as never, online);
  const rows = pagedRows<AuditRow>(query as never);
  const meta = pagedMeta<AuditRow>(query as never);
  const page = objectData<AuditPage>(query as never);

  const dateField = (id: string, label: string, value: string, onChange: (value: string) => void) => (
    <div className="min-w-[9.5rem]">
      <label htmlFor={id} className="ni-label block">{label}</label>
      <input
        id={id}
        type="date"
        value={value}
        onChange={(event) => { onChange(event.target.value); setOffset(0); }}
        className="mt-1.5 w-full rounded-[7px] border border-[var(--ni-sage-line)] bg-[var(--ni-field)] px-3 py-2.5 text-sm ni-t-ink outline-none focus:border-[var(--ni-moss)] focus:ring-2 focus:ring-[var(--ni-sage-mid)]"
      />
    </div>
  );

  return (
    <AdminShell activeKey="auditLogs" eyebrow={t("adminDesk.nav.auditLogs")} title={t("adminAudit.title")} copy={t("adminAudit.copy")}>
      <div className="space-y-6">
        <div className="rounded-[9px] border border-[var(--ni-sage-line)] bg-[var(--ni-sage-soft)] px-4 py-3 text-sm leading-6 ni-t-muted">
          <ShieldCheck size={15} aria-hidden="true" className="me-2 inline ni-t-moss" />
          {t("adminAudit.immutableNote")}
        </div>

        <AdminPanel>
          <div className="flex flex-wrap items-end gap-3">
            <FilterBar
              filters={[
                {
                  id: "audit-action", label: t("adminAudit.filterAction"), value: action,
                  options: [{ value: "all", label: statusLabel(t, "all") }, ...(page?.actions ?? []).map((value) => ({ value, label: value }))],
                  onChange: (value) => { setAction(value); setOffset(0); },
                },
                {
                  id: "audit-entity", label: t("adminAudit.filterEntity"), value: entityType,
                  options: [{ value: "all", label: statusLabel(t, "all") }, ...(page?.entityTypes ?? []).map((value) => ({ value, label: value }))],
                  onChange: (value) => { setEntityType(value); setOffset(0); },
                },
              ]}
            />
            {dateField("audit-since", t("adminAudit.from"), since, setSince)}
            {dateField("audit-until", t("adminAudit.to"), until, setUntil)}
            {state === "ready" && <p className="ms-auto pb-2.5 text-xs ni-t-muted" aria-live="polite">{t("adminUI.resultCount", { count: formatNumber(meta.total) })}</p>}
          </div>

          <div className="mt-5">
            {state !== "ready" ? (
              <ResultState
                state={state}
                message={state === "empty" ? t("adminAudit.empty") : resultError(query as never)}
                onRetry={() => query.refetch()}
                retrying={query.isFetching}
              />
            ) : (
              <>
                <AdminTable<AuditRow>
                  caption={t("adminAudit.tableCaption")}
                  rows={rows}
                  rowKey={(row) => row.id}
                  columns={[
                    {
                      key: "action", header: t("adminAudit.colAction"), primary: true,
                      cell: (row) => (
                        <span className="block min-w-0">
                          <span className="flex items-center gap-2 font-semibold ni-t-ink">
                            <ScrollText size={14} aria-hidden="true" className="shrink-0 ni-t-gold" />
                            <span className="ltr-embed">{row.action}</span>
                          </span>
                          {row.note && <span className="mt-1 block max-w-[36ch] text-xs leading-5 ni-t-muted">{row.note}</span>}
                        </span>
                      ),
                    },
                    { key: "actor", header: t("adminAudit.colActor"), cell: (row) => <span className="text-sm ni-t-muted">{row.actorName ?? t("adminUI.system")}</span> },
                    {
                      key: "target", header: t("adminAudit.colTarget"),
                      cell: (row) => (
                        <span className="text-sm ni-t-muted ltr-embed">
                          {row.entityType}{row.entityId ? ` · ${row.entityId.slice(0, 8)}…` : ""}
                        </span>
                      ),
                    },
                    {
                      key: "change", header: t("adminAudit.colChange"),
                      cell: (row) =>
                        row.from && row.to ? (
                          <span className="text-sm ni-t-ink ltr-embed">{statusLabel(t, row.from)} → {statusLabel(t, row.to)}</span>
                        ) : row.details.length > 0 ? (
                          <span className="text-xs ni-t-muted ltr-embed">{row.details.map((detail) => `${detail.key}: ${detail.value}`).join(" · ")}</span>
                        ) : (
                          <span className="ni-label">{t("adminUI.none")}</span>
                        ),
                    },
                    {
                      key: "when", header: t("adminAudit.colWhen"), align: "end",
                      cell: (row) => <span className="whitespace-nowrap text-xs ni-t-muted ltr-embed">{formatDate(row.createdAt, { dateStyle: "medium", timeStyle: "short" })}</span>,
                    },
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

/* ------------------------------------------------------------ system status */

type Integration = {
  key: string; state: "ready" | "setup_needed" | "not_implemented";
  requiredEnv: string[]; missing: string[]; reason: string | null;
};
type SystemStatus = {
  mode: "production" | "development";
  fixturesEnabled: boolean;
  integrations: Integration[];
  adminBootstrapConfigured: boolean;
  blockers: string[];
};

export function AdminSystemStatusExperience() {
  const { t } = useLocale();
  const online = useOnlineStatus();
  const query = trpc.admin.systemStatus.useQuery(undefined, { retry: false });
  const state = pagedState<never>(query as never, online);
  const status = objectData<SystemStatus>(query as never);

  return (
    <AdminShell activeKey="systemStatus" eyebrow={t("adminDesk.nav.systemStatus")} title={t("adminSystem.title")} copy={t("adminSystem.copy")}>
      {state !== "ready" || !status ? (
        <ResultState
          state={state === "ready" ? "error" : state}
          message={resultError(query as never)}
          onRetry={() => query.refetch()}
          retrying={query.isFetching}
        />
      ) : (
        <div className="space-y-6">
          <div className="rounded-[9px] border border-[var(--ni-sage-line)] bg-[var(--ni-sage-soft)] px-4 py-3 text-sm leading-6 ni-t-muted">
            <KeyRound size={15} aria-hidden="true" className="me-2 inline ni-t-moss" />
            {t("adminSystem.namesOnlyNote")}
          </div>

          <AdminPanel title={t("adminSystem.environment")}>
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={status.mode === "production" ? "active" : "draft"} label={t(status.mode === "production" ? "adminSystem.modeProduction" : "adminSystem.modeDevelopment")} />
              <StatusBadge
                status={status.fixturesEnabled ? "waiting" : "active"}
                tone={status.fixturesEnabled ? "waiting" : "positive"}
                label={t(status.fixturesEnabled ? "adminSystem.fixturesOn" : "adminSystem.fixturesOff")}
              />
              <StatusBadge
                status={status.adminBootstrapConfigured ? "ready" : "setup_needed"}
                label={t(status.adminBootstrapConfigured ? "adminSystem.bootstrapConfigured" : "adminSystem.bootstrapMissing")}
              />
            </div>
          </AdminPanel>

          <AdminPanel title={t("adminSystem.integrations")} description={t("adminSystem.integrationsCopy")}>
            <ul className="space-y-0">
              {status.integrations.map((integration) => (
                <li key={integration.key} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-[var(--ni-sage)] py-3.5 last:border-b-0">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold ni-t-ink">{t(`adminSystem.integration.${integration.key}` as TranslationKey)}</p>
                    {integration.state === "not_implemented" ? (
                      <p className="mt-1 text-xs leading-5 ni-t-muted-soft">{t("adminSystem.noBoundary")}</p>
                    ) : integration.missing.length > 0 ? (
                      <p className="mt-1 text-[11px] leading-4 ni-t-muted-soft ltr-embed">
                        {t("adminSystem.missing")}: {integration.missing.join(", ")}
                      </p>
                    ) : integration.requiredEnv.length > 0 ? (
                      <p className="mt-1 text-[11px] leading-4 ni-t-muted-soft ltr-embed">
                        {t("adminSystem.reads")}: {integration.requiredEnv.join(", ")}
                      </p>
                    ) : null}
                  </div>
                  <StatusBadge
                    status={integration.state}
                    label={t(
                      integration.state === "ready" ? "adminSystem.stateReady"
                        : integration.state === "setup_needed" ? "adminSystem.stateSetup"
                        : "adminSystem.stateNotImplemented",
                    )}
                  />
                </li>
              ))}
            </ul>
          </AdminPanel>

          {status.blockers.length > 0 && (
            <AdminPanel title={t("adminSystem.blockers")} description={t("adminSystem.blockersCopy")}>
              <ul className="flex flex-wrap gap-2">
                {status.blockers.map((blocker) => (
                  <li key={blocker}>
                    <StatusBadge status="setup_needed" label={t(`adminSystem.integration.${blocker}` as TranslationKey)} />
                  </li>
                ))}
              </ul>
            </AdminPanel>
          )}
        </div>
      )}
    </AdminShell>
  );
}

/* ---------------------------------------------------------------- settings */

type Preferences = {
  email_enabled?: boolean; class_reminders_enabled?: boolean;
  message_notifications_enabled?: boolean; course_updates_enabled?: boolean;
};
type PlatformSettings = {
  canWritePlatformSettings: boolean;
  settings: Array<{ key: string; value: string; redacted: boolean; updatedByName: string | null; updatedAt: string }>;
};

const TOGGLES: Array<{ field: keyof Preferences; input: "emailEnabled" | "classRemindersEnabled" | "messageNotificationsEnabled" | "courseUpdatesEnabled"; labelKey: TranslationKey }> = [
  { field: "email_enabled", input: "emailEnabled", labelKey: "adminSettings.emailEnabled" },
  { field: "class_reminders_enabled", input: "classRemindersEnabled", labelKey: "adminSettings.classReminders" },
  { field: "message_notifications_enabled", input: "messageNotificationsEnabled", labelKey: "adminSettings.messageNotifications" },
  { field: "course_updates_enabled", input: "courseUpdatesEnabled", labelKey: "adminSettings.courseUpdates" },
];

export function AdminSettingsExperience() {
  const { t, formatDate } = useLocale();
  const online = useOnlineStatus();
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string } | null>(null);
  const [local, setLocal] = useState<Preferences | null>(null);

  const preferencesQuery = trpc.scheduling.notificationPreferences.useQuery(undefined, { retry: false });
  const settingsQuery = trpc.admin.settings.useQuery(undefined, { retry: false });
  const update = trpc.scheduling.updateNotificationPreferences.useMutation();

  const preferencesState = pagedState<never>(preferencesQuery as never, online);
  const settingsState = pagedState<never>(settingsQuery as never, online);
  const server = objectData<Preferences>(preferencesQuery as never);
  const platform = objectData<PlatformSettings>(settingsQuery as never);

  // The switches render from server state until the reader changes one, at which
  // point the local copy leads and is reconciled on the next successful save.
  useEffect(() => { if (server) setLocal(server); }, [server]);

  const toggle = async (field: keyof Preferences, input: string, next: boolean) => {
    setLocal((current) => ({ ...(current ?? {}), [field]: next }));
    const result = (await update.mutateAsync({ [input]: next } as never)) as { ok: boolean; error?: string };
    setOutcome({ ok: result.ok, text: result.ok ? t("adminSettings.saved") : result.error ?? t("common.error") });
    if (!result.ok) setLocal(server ?? null);
    else preferencesQuery.refetch();
  };

  return (
    <AdminShell activeKey="settings" eyebrow={t("adminDesk.nav.settings")} title={t("adminSettings.title")} copy={t("adminSettings.copy")}>
      <div className="space-y-6">
        <Outcome outcome={outcome} />

        <div className="grid gap-6 lg:grid-cols-2">
          <AdminPanel title={t("adminSettings.appearance")} description={t("adminSettings.appearanceCopy")}>
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-sm font-semibold ni-t-ink">
                  <Palette size={15} aria-hidden="true" className="ni-t-gold" />
                  {t("adminSettings.theme")}
                </span>
                <ThemeToggle />
              </div>
              <hr className="ni-rule" />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm font-semibold ni-t-ink">{t("adminSettings.language")}</span>
                <LocaleSelector />
              </div>
              <p className="text-xs leading-5 ni-t-muted-soft">{t("adminSettings.appearanceNote")}</p>
            </div>
          </AdminPanel>

          <AdminPanel title={t("adminSettings.notifications")} description={t("adminSettings.notificationsCopy")}>
            {preferencesState !== "ready" ? (
              <ResultState
                state={preferencesState}
                message={resultError(preferencesQuery as never)}
                onRetry={() => preferencesQuery.refetch()}
                retrying={preferencesQuery.isFetching}
              />
            ) : (
              <ul className="space-y-0">
                {TOGGLES.map((item) => {
                  const checked = Boolean(local?.[item.field] ?? true);
                  return (
                    <li key={item.field} className="flex items-center justify-between gap-3 border-b border-[var(--ni-sage)] py-3 last:border-b-0">
                      <label htmlFor={`pref-${item.input}`} className="flex min-w-0 items-center gap-2 text-sm ni-t-ink">
                        <Bell size={14} aria-hidden="true" className="shrink-0 ni-t-muted-soft" />
                        {t(item.labelKey)}
                      </label>
                      <input
                        id={`pref-${item.input}`}
                        type="checkbox"
                        checked={checked}
                        disabled={update.isPending}
                        onChange={(event) => toggle(item.field, item.input, event.target.checked)}
                        className="h-4 w-4 shrink-0 accent-[var(--ni-moss)]"
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </AdminPanel>
        </div>

        <AdminPanel title={t("adminSettings.platform")} description={t("adminSettings.platformCopy")}>
          {settingsState !== "ready" || !platform ? (
            <ResultState
              state={settingsState === "ready" ? "error" : settingsState}
              message={resultError(settingsQuery as never)}
              onRetry={() => settingsQuery.refetch()}
              retrying={settingsQuery.isFetching}
            />
          ) : (
            <>
              <p className="mb-4 text-sm leading-6 ni-t-muted">
                {t(platform.canWritePlatformSettings ? "adminSettings.superAdminCanWrite" : "adminSettings.readOnlyForAdmin")}
              </p>
              {platform.settings.length === 0 ? (
                <ResultState state="empty" message={t("adminSettings.noPlatformSettings")} />
              ) : (
                <AdminTable<PlatformSettings["settings"][number]>
                  caption={t("adminSettings.platformCaption")}
                  rows={platform.settings}
                  rowKey={(row) => row.key}
                  columns={[
                    { key: "key", header: t("adminSettings.colKey"), primary: true, cell: (row) => <span className="font-semibold ni-t-ink ltr-embed">{row.key}</span> },
                    {
                      key: "value", header: t("adminSettings.colValue"),
                      cell: (row) => row.redacted
                        ? <StatusBadge status="hidden" label={t("adminSettings.redacted")} />
                        : <span className="text-sm ni-t-muted ltr-embed">{row.value}</span>,
                    },
                    { key: "by", header: t("adminSettings.colUpdatedBy"), cell: (row) => <span className="text-sm ni-t-muted">{row.updatedByName ?? t("adminUI.system")}</span> },
                    { key: "at", header: t("adminUI.updated"), align: "end", cell: (row) => <span className="whitespace-nowrap text-xs ni-t-muted ltr-embed">{formatDate(row.updatedAt, { dateStyle: "medium" })}</span> },
                  ]}
                />
              )}
            </>
          )}
        </AdminPanel>
      </div>
    </AdminShell>
  );
}
