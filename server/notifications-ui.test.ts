import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ui = readFileSync(new URL("../client/src/components/NotificationsExperience.tsx", import.meta.url), "utf8");
const bell = readFileSync(new URL("../client/src/components/NotificationBell.tsx", import.meta.url), "utf8");
const scheduling = readFileSync(new URL("../client/src/components/SchedulingExperience.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const server = readFileSync(new URL("./notifications.ts", import.meta.url), "utf8");
const routers = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const rls = readFileSync(new URL("../supabase/migrations/0002_auth_and_rls.sql", import.meta.url), "utf8");
const catalog = readFileSync(new URL("../client/src/i18n/catalog.ts", import.meta.url), "utf8");

describe("the scheduling-only query is gone", () => {
  it("reads the whole inbox on both the page and the bell", () => {
    expect(ui).toContain("trpc.scheduling.inbox.useQuery");
    expect(bell).toContain("trpc.scheduling.inbox.useQuery");
    expect(ui).not.toContain("trpc.scheduling.notifications.useQuery");
    expect(bell).not.toContain("trpc.scheduling.notifications.useQuery");
  });

  it("leaves no fixture-era page behind, and no failure-as-empty coalesce", () => {
    expect(scheduling).not.toContain("export function NotificationsPage");
    // The specific bug: `persisted ?? []` turned a failed load into "nothing authorised".
    expect(scheduling).not.toContain("const notes = persisted ?? [];");
    expect(app).toContain('import("./components/NotificationsExperience").then(m => ({ default: m.NotificationsPage }))');
  });

  it("routes preferences for both roles, before the dashboard catch-all", () => {
    for (const role of ["learner", "instructor"]) {
      expect(app).toContain(`<Route path="/dashboard/${role}/notifications/preferences">`);
      expect(app.indexOf(`/dashboard/${role}/notifications/preferences`)).toBeLessThan(app.indexOf(`<Route path="/dashboard/${role}/:rest*">`));
    }
  });
});

describe("unread is real, and the badge does not lie", () => {
  it("counts unread from its own query rather than from an unopened list", () => {
    // The badge used to count rows in a query gated on `enabled: open`, so it read 0 until opened.
    expect(bell).toContain("const unreadQuery = trpc.scheduling.unreadNotifications.useQuery(undefined, { retry: false });");
    expect(bell).not.toContain("const unread = rows.filter((row) => !row.read_at).length;");
    expect(routers).toContain("unreadNotifications: supabaseOnlyProcedure.query(({ ctx }) => countOwnUnread(ctx.supabaseIdentity)),");
  });

  it("marks one and marks all, then refetches instead of guessing", () => {
    expect(ui).toContain("trpc.scheduling.markNotificationsRead.useMutation()");
    expect(ui).toContain("await markRead.mutateAsync(notificationId ? { notificationId } : {});");
    expect(ui).toContain("await Promise.all([query.refetch(), unreadQuery.refetch()]);");
  });

  it("only ever stamps read_at on rows where it is still null", () => {
    expect(server).toContain('.update({ read_at: new Date().toISOString() }).is("read_at", null)');
  });

  it("carries the unread state in text, not by weight and colour alone", () => {
    expect(ui).toContain('<span className="sr-only"> — {t("notifications.unreadLabel")}</span>');
  });
});

describe("a reader can only reach their own notifications and preferences", () => {
  it("reads and writes on the caller's own client, never the admin one", () => {
    for (const fn of ["listOwnNotifications", "countOwnUnread", "markNotificationsRead", "getOwnPreferences", "updateOwnPreferences"]) {
      const body = server.slice(server.indexOf(`export async function ${fn}`), server.indexOf("\n}", server.indexOf(`export async function ${fn}`)));
      expect(body, `${fn} must use the caller's client`).toContain("getSupabaseUserClient(identity.accessToken)");
      expect(body, `${fn} must not bypass RLS`).not.toContain("getSupabaseAdminClient");
    }
  });

  it("rests on policies that scope every statement to the caller", () => {
    expect(rls).toContain("create policy notifications_own on public.notifications for select using (user_id = auth.uid());");
    expect(rls).toContain("create policy notifications_own_update on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());");
    expect(rls).toContain("create policy notification_preferences_own on public.notification_preferences for all using (user_id = auth.uid()) with check (user_id = auth.uid());");
  });

  it("has no insert policy, so a notification cannot be forged by anyone", () => {
    expect(rls).not.toMatch(/create policy \w+ on public\.notifications for insert/);
    // Raising one is the system's job, done through the admin client after the server decides.
    expect(server).toContain("const admin = getSupabaseAdminClient();");
  });

  it("scopes preference writes to the caller's own row", () => {
    expect(server).toContain("const patch: Record<string, unknown> = { user_id: identity.id, updated_at: new Date().toISOString() };");
  });
});

describe("preferences are honest about what they do", () => {
  it("saves each switch through the real procedure and re-reads what was stored", () => {
    expect(ui).toContain("trpc.scheduling.updateNotificationPreferences.useMutation()");
    expect(ui).toContain("const result = await save.mutateAsync({ [field]: next } as never);");
    expect(ui).toContain("await query.refetch();");
  });

  it("says plainly that no email is sent, rather than implying a channel that works", () => {
    expect(ui).toContain("{!preferences.emailDelivery.configured && (");
    expect(ui).toContain('t("notifPrefs.emailNotConnected")');
    expect(server).toContain('const missing = ["NOTIFICATION_EMAIL_PROVIDER", "NOTIFICATION_EMAIL_FROM"].filter((key) => !env[key]?.trim());');
  });

  it("explains which notifications ignore preferences entirely", () => {
    expect(ui).toContain('t("notifPrefs.alwaysOnCopy")');
    // Anything absent from CATEGORY is an account or safety event and always delivers.
    expect(server).toContain("const category = CATEGORY[input.type];");
    expect(server).not.toMatch(/CATEGORY:[\s\S]{0,400}verification_decided/);
  });

  it("uses a real checkbox with a switch role, operable by keyboard", () => {
    expect(ui).toContain('type="checkbox"');
    expect(ui).toContain('role="switch"');
  });
});

describe("every state is distinct", () => {
  it("derives state through the shared helper on both screens", () => {
    expect(ui.match(/resultState\(/g)?.length).toBe(2);
    // Filtering to unread empties a list that loaded fine; the copy has to explain the filter.
    expect(ui).toContain('const state: State = base === "ready" && !rows.length ? "empty" : base;');
    expect(ui).toContain('t(unreadOnly ? "notifications.noneUnread" : "dashboard.noNotifications")');
  });

  it("offers retry on load and on a failed mark", () => {
    expect(ui.match(/onRetry=\{\(\) => query\.refetch\(\)\}/g)?.length).toBe(2);
    expect(ui).toContain('<button type="button" onClick={() => mark()} className="font-bold underline">{t("common.retry")}</button>');
  });

  it("treats a signed-out visitor as forbidden rather than letting the call fail", () => {
    expect(ui.match(/if \(!signedIn\) \{/g)?.length).toBe(2);
    expect(ui.match(/<ResultState state="forbidden"/g)?.length).toBe(2);
  });

  it("shows a pending state on every write", () => {
    expect(ui).toContain('aria-busy={busyId === "all"}');
    expect(ui).toContain("aria-busy={busy}");
    // Two spinners on the list (mark-all, mark-one); the preferences switch says "Saving…" instead,
    // because a switch that swaps to a spinner loses the state the reader is trying to read.
    expect(ui.match(/animate-spin/g)?.length).toBe(2);
    expect(ui).toContain('{busy ? t("notifPrefs.saving") : value ? t("notifPrefs.on") : t("notifPrefs.off")}');
  });
});

describe("translation and direction", () => {
  it("translates every new string in all three locales", () => {
    for (const key of ["notifications.title", "notifications.unreadOnly", "notifications.markRead", "notifications.markAllRead", "notifications.noneUnread", "notifPrefs.title", "notifPrefs.email", "notifPrefs.emailNotConnected", "notifPrefs.alwaysOnCopy"]) {
      expect(catalog.match(new RegExp(`"${key.replace(/\./g, "\\.")}":`, "g"))?.length, `${key} needs en/ur/ar`).toBe(3);
    }
  });

  it("uses logical spacing and mirrors the directional icon", () => {
    expect(ui).not.toMatch(/\b(ml|mr|pl|pr)-\d/);
    expect(ui).toContain('className="rtl:rotate-180"');
    // The unread marker sits on the inline start edge, so it mirrors in Arabic and Urdu.
    expect(ui).toContain("border-s-4 border-s-[var(--ni-moss)]");
  });

  it("isolates timestamps so they read correctly inside RTL text", () => {
    expect(ui).toContain('className="mt-2 text-[11px] ni-t-muted-soft ltr-embed"');
  });
});
