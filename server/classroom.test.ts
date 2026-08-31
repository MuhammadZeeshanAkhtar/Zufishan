import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  addBoardStroke,
  canAccessClassroom,
  canEndClassroom,
  calculateSessionDuration,
  clearBoard,
  createBoard,
  getArchiveItem,
  getClassroomMessages,
  getClassroomResources,
  getClassroomSession,
  getClassroomWindowState,
  getConnectionStatus,
  getMediaPermissionState,
  getProviderBoundary,
  getQaidaContentState,
  getQuranContentState,
  getRecordingPolicyState,
  isReservedDemoClassroomEmail,
  joinClassroomSession,
  loadBoardState,
  markParticipantJoined,
  redoBoard,
  prepareClassroomUpload,
  recordAttendance,
  resolveDemoActorId,
  sendClassroomMessage,
  undoBoard,
} from "../client/src/lib/classroom-data";

describe("Browser Classroom boundaries", () => {
  it("resolves only the known demo participant identities", () => {
    expect(resolveDemoActorId("learner@noorilm.demo", "learner")).toBe("learner-demo");
    expect(resolveDemoActorId("instructor@noorilm.demo", "instructor")).toBe("instructor-demo");
    expect(resolveDemoActorId("other@example.com", "learner")).toBeNull();
    expect(resolveDemoActorId("learner@noorilm.demo", "instructor")).toBeNull();
    expect(isReservedDemoClassroomEmail("Learner@NoorIlm.demo")).toBe(true);
    expect(isReservedDemoClassroomEmail("other@example.com")).toBe(false);
  });

  it("only permits assigned learner or instructor identities", () => {
    const session = getClassroomSession("session-101");
    expect(session).not.toBeNull();
    expect(canAccessClassroom(session!, "learner-demo", "learner")).toBe(true);
    expect(canAccessClassroom(session!, "instructor-demo", "instructor")).toBe(true);
    expect(canAccessClassroom(session!, "unrelated-user", "learner")).toBe(false);
    expect(canEndClassroom(session!, "learner-demo", "learner")).toBe(false);
    expect(canEndClassroom(session!, "instructor-demo", "instructor")).toBe(true);
  });

  it("returns setup-needed provider and media states without claiming live presence", () => {
    expect(getProviderBoundary()).toMatchObject({ configured: false, connectionStatus: "setup_needed", provider: null });
    expect(getConnectionStatus()).toBe("setup_needed");
    expect(getMediaPermissionState()).toMatchObject({ camera: "not_requested", microphone: "not_requested" });
  });

  it("blocks unauthorised or unconfigured joins", () => {
    expect(joinClassroomSession("session-101", "unrelated-user", "learner")).toMatchObject({ ok: false });
    expect(joinClassroomSession("session-101", "learner-demo", "learner")).toMatchObject({ ok: false, error: expect.stringContaining("integration required") });
  });

  it("does not invent Quran or Noorani Qaida content", () => {
    const quran = getQuranContentState({ surahNumber: 1, juzNumber: 1, ayahStart: 1, ayahEnd: 7 });
    expect(quran.available).toBe(false);
    expect(quran.message).toContain("Approved Quran content connection required");
    const qaida = getQaidaContentState(1, 1);
    expect(qaida.available).toBe(false);
    expect(qaida.message).toContain("Approved Noorani Qaida content connection required");
  });

  it("covers too-early and terminal waiting-room states", () => {
    const session = getClassroomSession("session-101")!;
    expect(getClassroomWindowState({ ...session, scheduledStartAt: "2099-01-01T00:00:00Z" })).toBe("too_early");
    expect(getClassroomWindowState({ ...session, status: "cancelled" })).toBe("cancelled");
    expect(getClassroomWindowState({ ...session, status: "completed" })).toBe("completed");
    expect(getClassroomWindowState({ ...session, status: "no_show" })).toBe("no_show");
  });

  it("keeps White Board state local and supports undo, redo, and clear", () => {
    const initial = createBoard("board-test-session");
    expect(initial.realtimeConfigured).toBe(false);
    const stroke: import("../client/src/lib/classroom-data").WhiteboardStroke = { id: "stroke-1", tool: "pen", color: "#0e5a4f", size: 4, points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] };
    const drawn = addBoardStroke("board-test-session", stroke, "instructor-demo");
    expect(drawn.strokes).toHaveLength(1);
    expect(undoBoard("board-test-session").state.strokes).toHaveLength(0);
    expect(redoBoard("board-test-session").state.strokes).toHaveLength(1);
    expect(clearBoard("board-test-session", "instructor-demo").strokes).toHaveLength(0);
    expect(loadBoardState("board-test-session").strokes).toEqual([]);
  });

  it("validates classroom file types and refuses upload without private Storage", () => {
    expect(prepareClassroomUpload({ name: "bad.exe", type: "application/x-msdownload", size: 10 })).toMatchObject({ ok: false, error: expect.stringContaining("file type") });
    expect(prepareClassroomUpload({ name: "worksheet.pdf", type: "application/pdf", size: 10 })).toMatchObject({ ok: false, error: expect.stringContaining("Storage") });
    expect(getClassroomResources("session-101")).toEqual([]);
  });

  it("keeps chat private and unconnected", () => {
    expect(getClassroomMessages("session-101")).toEqual([]);
    expect(sendClassroomMessage("session-101", "learner-demo", "Assalamu alaikum")).toMatchObject({ ok: false, error: expect.stringContaining("chat") });
    expect(sendClassroomMessage("session-101", "learner-demo", "")).toMatchObject({ ok: false, error: "Message cannot be empty." });
  });

  it("does not let the client write attendance or fabricate duration", () => {
    expect(markParticipantJoined("session-101", "learner-demo")).toMatchObject({ ok: false, error: expect.stringContaining("connected session service") });
    expect(recordAttendance("session-101", "learner-demo", "present")).toMatchObject({ ok: false, error: expect.stringContaining("protected") });
    expect(calculateSessionDuration("session-101")).toBeNull();
  });

  it("keeps recordings restricted until provider, consent, and Storage are connected", () => {
    const session = getClassroomSession("session-101")!;
    expect(getArchiveItem(session)).toMatchObject({ restricted: true, storagePath: null, recordingStatus: "not_configured" });
    expect(getRecordingPolicyState()).toMatchObject({ consentRequired: true, providerConfigured: false });
  });

  it("keeps classroom setup labels typed and live-state claims honest", () => {
    const source = readFileSync(resolve(process.cwd(), "client/src/components/ClassroomExperience.tsx"), "utf8");
    expect(source).toContain('t("common.setupNeeded")');
    expect(source).toContain('t("classroom.providerCopy")');
    expect(source).toContain("No video stream claimed");
    expect(source).toContain("Provider connected");
    expect(source).toContain('eyebrow ?? t("classroom.classroomShell")');
    expect(source).toContain('backLabel ?? t("common.back")');
  });
});
