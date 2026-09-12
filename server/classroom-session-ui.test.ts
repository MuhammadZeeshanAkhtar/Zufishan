import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ui = readFileSync(new URL("../client/src/components/ClassroomSessionExperience.tsx", import.meta.url), "utf8");
/** The file without its opening doc comment, which names the fixtures it replaced. */
const uiCode = ui.slice(ui.indexOf("*/") + 2);
const scheduling = readFileSync(new URL("../client/src/components/SchedulingExperience.tsx", import.meta.url), "utf8");
const server = readFileSync(new URL("./class-session-lifecycle.ts", import.meta.url), "utf8");
const routers = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const guard = readFileSync(new URL("../supabase/migrations/0018_session_stage_is_the_instructors.sql", import.meta.url), "utf8");
const rls = readFileSync(new URL("../supabase/migrations/0002_auth_and_rls.sql", import.meta.url), "utf8");
const catalog = readFileSync(new URL("../client/src/i18n/catalog.ts", import.meta.url), "utf8");

describe("the classroom reads the real session record", () => {
  it("calls every class-session procedure, and no fixture", () => {
    for (const proc of ["session", "sessionAttendance", "sessions", "setSessionStatus", "recordAttendance", "openSession"]) {
      expect(ui, `${proc} must be called`).toContain(`trpc.scheduling.${proc}`);
    }
    // The fixtures the old screen ran on, including a hardcoded session id.
    expect(uiCode).not.toMatch(/getClassroomSession|resolveDemoActorId|canAccessClassroom/);
    expect(uiCode).not.toContain("session-101");
  });

  it("registers the two reads that had no server-side path before", () => {
    expect(routers).toContain("session: supabaseOnlyProcedure.input(z.object({ sessionId: z.string().uuid() })).query(({ ctx, input }) => getOwnSession(ctx.supabaseIdentity, input)),");
    expect(routers).toContain("sessionAttendance: supabaseOnlyProcedure.input(z.object({ sessionId: z.string().uuid() })).query(({ ctx, input }) => listSessionAttendance(ctx.supabaseIdentity, input)),");
  });

  it("routes the gate and the desk at the connected screens", () => {
    expect(app).toContain('const ClassroomGate = lazy(() => import("./components/ClassroomSessionExperience")');
    expect(app).toContain('const ClassroomDashboard = lazy(() => import("./components/ClassroomSessionExperience")');
  });

  it("takes the stage from the record rather than from the URL", () => {
    // Three routes used to assert waiting-room / classroom / ended from the path itself.
    expect(app).not.toContain('<ClassroomGate sessionId={params.sessionId} state="ended"/>');
    expect(app).not.toContain('state="waiting-room"/>}</Route>');
    expect(ui).toContain("const status = session?.status ?? \"\";");
  });
});

describe("a booking is not a session", () => {
  it("no longer links a booking id into the classroom route", () => {
    expect(scheduling).not.toContain("/classroom/${booking.id}/waiting-room");
    expect(scheduling).toContain("<OpenClassroomAction bookingId={booking.id} status={booking.status} />");
  });

  it("opens through the idempotent procedure and routes to the id it returns", () => {
    expect(ui).toContain("const result = await open.mutateAsync({ bookingId });");
    expect(ui).toContain("setLocation(`/classroom/${(result.data as { sessionId: string }).sessionId}`);");
    // Idempotency is what stops two people opening two half-attended sessions for one meeting.
    expect(server).toContain("Idempotent on purpose: both parties opening the classroom at once must not produce two");
  });

  it("offers the action only on a confirmed booking", () => {
    expect(ui).toContain('if (status !== "confirmed") return null;');
  });
});

describe("who may do what", () => {
  it("lets the database decide access rather than checking in the browser", () => {
    expect(rls).toContain("create policy class_sessions_participant_or_moderator on public.class_sessions for select using (learner_id = auth.uid() or instructor_id = auth.uid() or public.is_moderator_user());");
    expect(server).toContain('if (!data) return { ok: false, error: "This session is not available to your account.", code: "NOT_FOUND" };');
  });

  it("offers stage controls to the instructor only, mirroring the server rule", () => {
    expect(ui).toContain("{isInstructor && !CLOSED.includes(session.status) && (");
    expect(server).toContain('return { ok: false, error: "Only the instructor can move a session through its stages.", code: "FORBIDDEN" };');
  });

  it("closes the learner's route to advancing their own session at the database", () => {
    expect(guard).toContain("if new.status is distinct from old.status then");
    expect(guard).toContain("if auth.uid() is distinct from new.instructor_id then");
    expect(guard).toContain("create trigger class_sessions_status_guard");
    expect(guard.toLowerCase()).not.toMatch(/\b(drop table|delete from|truncate|drop policy)\b/);
    // Why it matters beyond tidiness: a completed session is what makes a review eligible.
    expect(rls).toContain("s.status = 'completed'");
  });

  it("records only the caller's own attendance, on their own client", () => {
    expect(rls).toContain("create policy class_attendance_own_write on public.class_attendance for insert with check (user_id = auth.uid()");
    expect(server).toContain('.eq("user_id", identity.id);');
    expect(ui).toContain('record.mutateAsync({ sessionId, action: joined ? "leave" : "join" })');
  });

  it("labels the other party by role, without reading anyone's profile", () => {
    expect(server).toContain('.from("class_attendance").select("id,session_id,user_id,joined_at,left_at,status")');
    expect(server).not.toMatch(/class_attendance[\s\S]{0,300}profiles/);
    expect(ui).toContain('t(isInstructor ? "classroom.theLearner" : "classroom.theInstructor")');
  });
});

describe("no video provider is implied anywhere", () => {
  it("reads the provider state and says plainly there is no call", () => {
    // This used to pin the client-side constant `getClassroomProviderState()`, which always answered
    // "not configured" and would have kept doing so after a provider was connected. The state now
    // comes from the server, which is both truthful and a stronger guarantee.
    expect(ui).toContain("trpc.scheduling.classroomProvider.useQuery");
    expect(ui).toContain("if (!info || info.configured) return null;");
    expect(ui).toContain('t("classroom.providerNotConnected")');
    expect(ui).toContain('t("classroom.noVideoCopy")');
  });

  it("integrates nothing: no provider SDK, token, or media capture", () => {
    expect(uiCode).not.toMatch(/getUserMedia|RTCPeerConnection|jitsi|twilio|agora|zoom|daily\.co/i);
  });

  it("reports recording status from the record rather than claiming one exists", () => {
    expect(ui).toContain('t("classroom.recordingStatus", { status: session.recording_status })');
    expect(server).toContain("stays 'not_configured' rather than pretending a recording exists");
  });

  it("still lets a session run without a provider", () => {
    // Join is gated on the stage, not on the provider.
    expect(ui).toContain('const joinable = status === "waiting_room" || status === "live";');
  });
});

describe("every state is distinct", () => {
  it("derives state through the shared helper on both screens", () => {
    expect(ui.match(/resultState\(/g)?.length).toBe(2);
  });

  it("reports 'not yours' as a refusal, never a silent redirect", () => {
    expect(ui).toContain('const shown: Exclude<State, "ready"> = state === "empty" ? "forbidden" : state === "ready" ? "error" : state;');
    // The old gate pushed unauthorised visitors away with no explanation at all.
    expect(ui).not.toMatch(/setLocation\(`\/dashboard\/\$\{[^}]*\}\/classrooms`\)/);
  });

  it("offers retry and shows a pending state on every write", () => {
    expect(ui.match(/\{t\("common\.retry"\)\}/g)?.length).toBe(2);
    // Attendance join/leave, stage advance, and open-from-booking.
    // Attendance join/leave, stage advance, open-from-booking, and joining the provider call.
    expect(ui.match(/animate-spin/g)?.length).toBe(4);
    expect(ui.match(/aria-busy/g)?.length).toBe(4);
  });

  it("explains why joining is unavailable instead of hiding the control silently", () => {
    expect(ui).toContain('t("classroom.notOpenToJoin")');
  });

  it("treats a signed-out visitor as forbidden on both screens", () => {
    expect(ui.match(/if \(!signedIn\) \{/g)?.length).toBe(2);
  });
});

describe("translation and direction", () => {
  it("translates every stage, type and control in all three locales", () => {
    const keys = [
      "classroom.title", "classroom.deskTitle", "classroom.attendance", "classroom.join", "classroom.leave",
      "classroom.stage", "classroom.providerNotConnected", "classroom.noSessions", "classroom.open",
      "classroom.status.scheduled", "classroom.status.waiting_room", "classroom.status.live",
      "classroom.status.completed", "classroom.status.cancelled", "classroom.status.no_show",
      "classroom.advanceTo.waiting_room", "classroom.advanceTo.live", "classroom.advanceTo.completed",
      "classroom.closed.completed", "classroom.closed.cancelled", "classroom.closed.no_show",
      "classroom.type.trial", "classroom.type.course",
    ];
    for (const key of keys) {
      expect(catalog.match(new RegExp(`"${key.replace(/\./g, "\\.")}":`, "g"))?.length, `${key} needs en/ur/ar`).toBe(3);
    }
  });

  it("covers every status the schema allows, so no stage renders as a raw key", () => {
    for (const status of ["scheduled", "waiting_room", "live", "completed", "cancelled", "no_show"]) {
      expect(catalog).toContain(`"classroom.status.${status}":`);
    }
  });

  it("uses logical spacing, mirrors directional icons, and isolates times", () => {
    expect(ui).not.toMatch(/\b(ml|mr|pl|pr)-\d/);
    expect(ui).toContain('className="rtl:rotate-180"');
    expect(ui.match(/icon-directional/g)?.length).toBe(2);
    expect(ui.match(/ltr-embed/g)?.length).toBe(2);
  });
});
