import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const action = readFileSync(new URL("../client/src/components/MessageAction.tsx", import.meta.url), "utf8");
const scheduling = readFileSync(new URL("../client/src/components/SchedulingExperience.tsx", import.meta.url), "utf8");
const instructors = readFileSync(new URL("../client/src/components/InstructorManagement.tsx", import.meta.url), "utf8");
const messaging = readFileSync(new URL("../client/src/components/MessagingExperience.tsx", import.meta.url), "utf8");
const start = readFileSync(new URL("./conversation-start.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const catalog = readFileSync(new URL("../client/src/i18n/catalog.ts", import.meta.url), "utf8");

describe("the action reaches the real procedure", () => {
  it("calls startConversation and fakes nothing", () => {
    expect(action).toContain("trpc.supabaseCore.startConversation.useMutation()");
    expect(action).not.toMatch(/setTimeout\(.*ok: true|mockResolved|fakeConversation/);
  });

  it("routes to a conversation route that actually exists, for both roles", () => {
    expect(action).toContain("setLocation(`/dashboard/${role}/messages/${result.data.conversationId}`);");
    expect(app).toContain('<Route path="/dashboard/learner/messages/:conversationId">');
    expect(app).toContain('<Route path="/dashboard/instructor/messages/:conversationId">');
  });
});

describe("a duplicate conversation is impossible, not merely unlikely", () => {
  it("navigates on success without branching on whether the thread was new", () => {
    // The server reuses an existing two-party thread, so `created` is information, not a decision.
    // Branching on it here is what would produce a second thread for the same pair.
    expect(action).toContain("if (result.ok && result.data) {");
    expect(action).not.toMatch(/if\s*\(\s*result\.data\.created/);
  });

  it("keeps the server-side reuse and relationship gate that make that true", () => {
    expect(start).toContain("const existing = await findExistingThread(admin, me, other);");
    expect(start).toContain("if (existing) return { ok: true, data: { conversationId: existing, created: false } };");
    expect(start).toContain("if (!(await relationshipExists(admin, me, other)))");
    // Only a thread that is exactly these two may be reused, so a group thread is never a DM.
    expect(start).toContain("if (set.size === 2 && set.has(a) && set.has(b)) return id;");
  });
});

describe("refusal, failure and loading stay distinct", () => {
  it("shows a FORBIDDEN refusal as an explanation rather than an error", () => {
    expect(action).toContain('if (result.code === "FORBIDDEN") {');
    expect(action).toContain("setRefused(result.error || t(\"messaging.notConnected\"));");
    // Announced politely as a status. The element grew from a <p> to a <div> so the
    // refusal can carry the next step beside the explanation; the role is the point.
    expect(action).toMatch(/<div role="status"/);
    expect(action).not.toMatch(/role="alert"[^>]*>\s*\{refused\}/);
  });

  it("shows a real failure as an alert, with retry", () => {
    expect(action).toContain('<p role="alert"');
    expect(action).toContain('{t("common.retry")}');
    expect(action).toContain("setFailed(result.error || t(\"messaging.startFailed\"));");
  });

  it("marks the pending state for assistive technology, not only visually", () => {
    expect(action).toContain("aria-busy={start.isPending}");
    expect(action).toContain("disabled={start.isPending}");
    expect(action).toContain("animate-spin");
  });

  it("treats signing in as a precondition instead of letting the call fail on auth", () => {
    expect(action).toContain("if (!currentSession) {");
    expect(action).toContain('{t("messaging.signInToMessage")}');
  });
});

describe("it is mounted where a relationship exists", () => {
  it("appears on every booking card, naming the other party from the viewer's side", () => {
    expect(scheduling).toContain('<MessageAction counterpartId={instructor ? booking.learner_id : booking.instructor_id} viewerRole={instructor ? "instructor" : "learner"} subject={booking.subject} className="mt-3"/>');
  });

  it("appears on the trial request detail for both roles", () => {
    expect(scheduling).toContain("counterpartId: instructor ? row.learner_id : row.instructor_id,");
    expect(scheduling).toContain('<MessageAction counterpartId={request.counterpartId} viewerRole={instructor ? "instructor" : "learner"} subject={request.subject} tone="standard"/>');
  });

  it("replaces the dead placeholder on the public tutor profile", () => {
    expect(instructors).toContain('<MessageAction counterpartId={profile.user_id} tone="standard"/>');
    // A public profile is shared ground, so the viewer's role comes from the session; hardcoding
    // "learner" would route an instructor into a learner-only route.
    expect(action).toContain('const role = viewerRole ?? (currentSession?.role === "instructor" ? "instructor" : "learner");');
    // The disabled "setup needed" button was the stand-in this task exists to remove.
    expect(instructors).not.toContain('{t("messaging.setupNeeded")}</button>');
  });
});

describe("the inbox it leads to keeps its own states", () => {
  it("still separates failure from emptiness and shows unread counts", () => {
    expect(messaging).toContain("const state = resultState(conversations as never, online);");
    expect(messaging).toContain('t("messaging.noThreads")');
    expect(messaging).toContain("{row.unread > 0 && (");
    expect(messaging).toContain('t("messaging.unreadCount", { count: row.unread })');
  });
});

describe("translation and direction", () => {
  it("translates every new string in all three locales", () => {
    for (const key of ["messaging.messageInstructor", "messaging.messageLearner", "messaging.opening", "messaging.signInToMessage", "messaging.notConnected", "messaging.startFailed"]) {
      expect(catalog.match(new RegExp(`"${key.replace(".", "\\.")}":`, "g"))?.length, `${key} needs en/ur/ar`).toBe(3);
    }
  });

  it("uses no physical-direction spacing that would break in RTL", () => {
    expect(action).not.toMatch(/\b(ml|mr|pl|pr)-\d/);
  });
});
