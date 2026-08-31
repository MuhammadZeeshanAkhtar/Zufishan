import { getSession, type ClassSession } from "./scheduling-data";

export type ClassroomRole = "learner" | "instructor";
export type ClassroomStatus = "scheduled" | "waiting_room" | "live" | "completed" | "cancelled" | "no_show" | "expired";
export type ConnectionStatus = "connected" | "connecting" | "disconnected" | "setup_needed";
export type MediaPermissionStatus = "not_requested" | "granted" | "denied" | "unavailable";
export type AttendanceStatus = "not_joined" | "present" | "left_early" | "no_show" | "technical_issue";
export type RecordingStatus = "not_recorded" | "recording_pending" | "processing" | "ready" | "failed" | "review_required" | "restricted" | "not_configured";

export type ClassroomParticipant = {
  userId: string;
  displayName: string;
  role: ClassroomRole;
  joinedAt: string | null;
  leftAt: string | null;
  attendanceStatus: AttendanceStatus;
};

export type ClassroomSession = {
  id: string;
  learnerId: string;
  instructorId: string;
  learnerName: string;
  instructorName: string;
  subject: string;
  title: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  learnerTimezone: string;
  instructorTimezone: string;
  status: ClassroomStatus;
  sessionDurationSeconds: number | null;
  liveProvider: string | null;
  externalSessionId: string | null;
  recordingStatus: RecordingStatus;
  startedAt: string | null;
  endedAt: string | null;
  demo: boolean;
};

export type ProviderBoundary = {
  configured: boolean;
  provider: "livekit" | "agora" | null;
  connectionStatus: ConnectionStatus;
  message: string;
};

export type MediaPermissionState = {
  camera: MediaPermissionStatus;
  microphone: MediaPermissionStatus;
  explanation: string;
};

export type ClassroomResource = {
  id: string;
  sessionId: string;
  uploadedBy: string;
  originalFilename: string;
  fileType: string;
  storagePath: string | null;
  visibility: "private" | "participants";
  createdAt: string;
  downloadAllowed: boolean;
};

export type ClassroomMessage = {
  id: string;
  sessionId: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
  read: boolean;
};

export type WhiteboardTool = "pen" | "highlighter" | "eraser" | "text";
export type WhiteboardStroke = { id: string; tool: Exclude<WhiteboardTool, "text">; color: string; size: number; points: Array<{ x: number; y: number }>; };
export type WhiteboardState = { sessionId: string; pageNumber: number; strokes: WhiteboardStroke[]; updatedBy: string | null; updatedAt: string | null; realtimeConfigured: false; };
export type WhiteboardChange = { type: "stroke_added" | "stroke_removed" | "cleared" | "page_changed"; stroke?: WhiteboardStroke; pageNumber?: number; };

export type QuranSelection = { surahNumber: number; juzNumber: number; ayahStart: number; ayahEnd: number; };
export type QuranContentState = { available: false; message: string; selection: QuranSelection; };
export type QaidaContentState = { available: false; message: string; lessonNumber: number; pageNumber: number; };

export type ClassroomArchiveItem = { sessionId: string; title: string; recordingStatus: RecordingStatus; storagePath: string | null; restricted: boolean; };
export type ClassroomWindowState = "too_early" | "ready" | "cancelled" | "completed" | "no_show" | "expired";

export const reservedDemoClassroomEmails = ["learner@noorilm.demo", "instructor@noorilm.demo"] as const;

export function isReservedDemoClassroomEmail(email: string) {
  return reservedDemoClassroomEmails.includes(email.toLowerCase() as (typeof reservedDemoClassroomEmails)[number]);
}

export function resolveDemoActorId(email: string, role: ClassroomRole) {
  if (email === "learner@noorilm.demo" && role === "learner") return "learner-demo";
  if (email === "instructor@noorilm.demo" && role === "instructor") return "instructor-demo";
  return null;
}

const attendanceStore = new Map<string, ClassroomParticipant[]>();
const startStore = new Map<string, string>();
const endStore = new Map<string, string>();
const boardStore = new Map<string, WhiteboardState>();
const boardHistory = new Map<string, WhiteboardState[]>();
const boardFuture = new Map<string, WhiteboardState[]>();

function mapSessionStatus(status: ClassSession["status"]): ClassroomStatus {
  if (status === "waiting_room" || status === "live" || status === "completed" || status === "cancelled" || status === "no_show") return status;
  return "scheduled";
}

export function getClassroomSession(sessionId: string): ClassroomSession | null {
  const session = getSession(sessionId);
  if (!session) return null;
  return {
    id: session.id,
    learnerId: session.learnerId,
    instructorId: session.instructorId,
    learnerName: session.learnerName,
    instructorName: session.instructorName,
    subject: session.subject,
    title: session.title,
    scheduledStartAt: session.scheduledStartAt,
    scheduledEndAt: session.scheduledEndAt,
    learnerTimezone: session.learnerTimezone,
    instructorTimezone: session.instructorTimezone,
    status: mapSessionStatus(session.status),
    sessionDurationSeconds: null,
    liveProvider: session.liveProvider,
    externalSessionId: session.externalSessionId,
    recordingStatus: session.recordingStatus === "not_configured" ? "not_configured" : "not_recorded",
    startedAt: startStore.get(sessionId) || null,
    endedAt: endStore.get(sessionId) || null,
    demo: session.demo,
  };
}

export function getClassroomParticipants(session: ClassroomSession): ClassroomParticipant[] {
  return attendanceStore.get(session.id) || [
    { userId: session.learnerId, displayName: session.learnerName, role: "learner", joinedAt: null, leftAt: null, attendanceStatus: "not_joined" },
    { userId: session.instructorId, displayName: session.instructorName, role: "instructor", joinedAt: null, leftAt: null, attendanceStatus: "not_joined" },
  ];
}

export function canAccessClassroom(session: ClassroomSession, userId: string, role: ClassroomRole) {
  return role === "learner" ? session.learnerId === userId : session.instructorId === userId;
}

export function canEndClassroom(session: ClassroomSession, userId: string, role: ClassroomRole) {
  return role === "instructor" && session.instructorId === userId && ["waiting_room", "live"].includes(session.status);
}

export function getClassroomWindowState(session: ClassroomSession, now = new Date()): ClassroomWindowState {
  if (session.status === "cancelled") return "cancelled";
  if (session.status === "completed") return "completed";
  if (session.status === "no_show") return "no_show";
  if (session.status === "expired") return "expired";
  return now < new Date(session.scheduledStartAt) ? "too_early" : "ready";
}

export function getProviderBoundary(): ProviderBoundary {
  return { configured: false, provider: null, connectionStatus: "setup_needed", message: "Live classroom integration required. No approved video provider is connected." };
}

export function getMediaPermissionState(): MediaPermissionState {
  return { camera: "not_requested", microphone: "not_requested", explanation: "Camera and microphone permissions will be requested only after an approved provider and participant consent are available." };
}

export function getConnectionStatus(): ConnectionStatus {
  return "setup_needed";
}

export function createClassroomSession(sessionId: string) {
  const session = getClassroomSession(sessionId);
  return session ? { ok: true as const, session, message: "Session boundary ready; provider connection is still required." } : { ok: false as const, error: "Session not found." };
}

export function joinClassroomSession(sessionId: string, userId: string, role: ClassroomRole) {
  const session = getClassroomSession(sessionId);
  if (!session) return { ok: false as const, error: "Session not found." };
  if (!canAccessClassroom(session, userId, role)) return { ok: false as const, error: "Only assigned session participants may join this classroom." };
  return { ok: false as const, error: "Live classroom integration required before a participant can join." };
}

export function leaveClassroomSession(sessionId: string, userId: string) {
  const session = getClassroomSession(sessionId);
  if (!session) return { ok: false as const, error: "Session not found." };
  const allowed = [session.learnerId, session.instructorId].includes(userId);
  return allowed ? { ok: false as const, error: "Live classroom integration required; no participant state was changed." } : { ok: false as const, error: "Only assigned session participants may leave this classroom." };
}

export function endClassroomSession(sessionId: string, userId: string, role: ClassroomRole) {
  const session = getClassroomSession(sessionId);
  if (!session) return { ok: false as const, error: "Session not found." };
  if (!canEndClassroom(session, userId, role)) return { ok: false as const, error: "Only the assigned instructor may end this session." };
  return { ok: false as const, error: "Session completion requires server validation and a connected classroom provider." };
}

export function markParticipantJoined(sessionId: string, userId: string) {
  const session = getClassroomSession(sessionId);
  if (!session || ![session.learnerId, session.instructorId].includes(userId)) return { ok: false as const, error: "Participant is not assigned to this session." };
  return { ok: false as const, error: "Attendance is recorded by the connected session service; demo state remains unchanged." };
}

export function startSession(sessionId: string, userId: string, role: ClassroomRole) {
  const session = getClassroomSession(sessionId);
  if (!session || !canEndClassroom(session, userId, role)) return { ok: false as const, error: "Only the assigned instructor may start this session." };
  return { ok: false as const, error: "Session start requires provider and server validation." };
}

export function endSession(sessionId: string, userId: string, role: ClassroomRole) {
  return endClassroomSession(sessionId, userId, role);
}

export function calculateSessionDuration(sessionId: string) {
  const startedAt = startStore.get(sessionId);
  const endedAt = endStore.get(sessionId);
  if (!startedAt || !endedAt) return null;
  return Math.max(0, Math.floor((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000));
}

export function recordAttendance(sessionId: string, userId: string, status: AttendanceStatus) {
  const session = getClassroomSession(sessionId);
  if (!session || ![session.learnerId, session.instructorId].includes(userId)) return { ok: false as const, error: "Participant is not assigned to this session." };
  return { ok: false as const, error: `Attendance status “${status}” requires protected server recording.` };
}

export function getQuranContentState(selection: QuranSelection): QuranContentState {
  return { available: false, message: "Approved Quran content connection required. No Quran text, translation, transliteration, tafsir, citation, or audio is fabricated in demo mode.", selection };
}

export function getQaidaContentState(lessonNumber = 1, pageNumber = 1): QaidaContentState {
  return { available: false, message: "Approved Noorani Qaida content connection required. No letters, exercises, or audio are invented in demo mode.", lessonNumber, pageNumber };
}

export function createBoard(sessionId: string): WhiteboardState {
  const current = boardStore.get(sessionId);
  if (current) return current;
  const state: WhiteboardState = { sessionId, pageNumber: 1, strokes: [], updatedBy: null, updatedAt: null, realtimeConfigured: false };
  boardStore.set(sessionId, state);
  boardHistory.set(sessionId, []);
  boardFuture.set(sessionId, []);
  return state;
}

function commitBoardState(sessionId: string, next: WhiteboardState) {
  const current = createBoard(sessionId);
  boardHistory.set(sessionId, [...(boardHistory.get(sessionId) || []), current]);
  boardFuture.set(sessionId, []);
  boardStore.set(sessionId, { ...next, realtimeConfigured: false, updatedAt: new Date().toISOString() });
  return boardStore.get(sessionId)!;
}

export function addBoardStroke(sessionId: string, stroke: WhiteboardStroke, updatedBy: string) {
  const current = createBoard(sessionId);
  return commitBoardState(sessionId, { ...current, strokes: [...current.strokes, stroke], updatedBy });
}

export function undoBoard(sessionId: string) {
  const current = createBoard(sessionId);
  const history = boardHistory.get(sessionId) || [];
  const previous = history.at(-1);
  if (!previous) return { ok: false as const, state: current, error: "Nothing to undo." };
  boardHistory.set(sessionId, history.slice(0, -1));
  boardFuture.set(sessionId, [...(boardFuture.get(sessionId) || []), current]);
  boardStore.set(sessionId, previous);
  return { ok: true as const, state: previous };
}

export function redoBoard(sessionId: string) {
  const current = createBoard(sessionId);
  const future = boardFuture.get(sessionId) || [];
  const next = future.at(-1);
  if (!next) return { ok: false as const, state: current, error: "Nothing to redo." };
  boardFuture.set(sessionId, future.slice(0, -1));
  boardHistory.set(sessionId, [...(boardHistory.get(sessionId) || []), current]);
  boardStore.set(sessionId, next);
  return { ok: true as const, state: next };
}

export function clearBoard(sessionId: string, updatedBy: string) {
  const current = createBoard(sessionId);
  return commitBoardState(sessionId, { ...current, strokes: [], updatedBy });
}

export function loadBoardState(sessionId: string) {
  return createBoard(sessionId);
}

export function saveBoardState(sessionId: string, state: WhiteboardState) {
  boardStore.set(sessionId, { ...state, realtimeConfigured: false, updatedAt: new Date().toISOString() });
  return { ok: false as const, error: "Realtime White Board connection required; this local demo state was not synchronised." };
}

export function broadcastBoardChange(sessionId: string, change: WhiteboardChange) {
  return { ok: false as const, sessionId, change, error: "Realtime White Board connection required; no participant received this change." };
}

export function prepareClassroomUpload(file?: { name: string; type: string; size: number }) {
  if (!file) return { ok: false as const, error: "Choose a file before preparing an upload." };
  const allowed = ["application/pdf", "image/png", "image/jpeg", "image/webp", "audio/mpeg", "audio/wav", "video/mp4"];
  if (!allowed.includes(file.type)) return { ok: false as const, error: "This file type is not allowed for classroom resources." };
  if (file.size > 25 * 1024 * 1024) return { ok: false as const, error: "Classroom resources must be 25 MB or smaller." };
  return { ok: false as const, error: "Private Storage is not connected; no file was uploaded." };
}

export function getClassroomResources(_sessionId: string): ClassroomResource[] {
  return [];
}

export function canReadClassroomResource(resource: ClassroomResource, userId: string, session: ClassroomSession) {
  return resource.visibility === "participants" && canAccessClassroom(session, userId, userId === session.learnerId ? "learner" : "instructor");
}

export function getClassroomMessages(_sessionId: string): ClassroomMessage[] {
  return [];
}

export function sendClassroomMessage(sessionId: string, senderId: string, body: string) {
  if (!body.trim()) return { ok: false as const, error: "Message cannot be empty." };
  return { ok: false as const, sessionId, senderId, error: "Authorised classroom chat is not connected; no message was sent." };
}

export function reportClassroomIssue(sessionId: string, reporterId: string, reason: string) {
  if (!reason.trim()) return { ok: false as const, error: "Choose a reason before reporting." };
  return { ok: false as const, sessionId, reporterId, error: "Private reporting boundary prepared in demo mode; no notification was sent." };
}

export function getArchiveItem(session: ClassroomSession): ClassroomArchiveItem {
  return { sessionId: session.id, title: session.title, recordingStatus: session.recordingStatus, storagePath: null, restricted: true };
}

export function getRecordingPolicyState() {
  return { consentRequired: true, providerConfigured: false, message: "Recording requires explicit consent, an approved provider, private Storage, and policy review. No recording exists in demo mode." };
}

export const classroomStatusCopy: Record<ClassroomStatus, { label: string; description: string }> = {
  scheduled: { label: "Scheduled", description: "The session is scheduled but not yet in its waiting-room window." },
  waiting_room: { label: "Waiting room", description: "The session boundary is open; the live provider still needs to be connected." },
  live: { label: "Live", description: "A connected provider must confirm this state; demo mode never claims live presence." },
  completed: { label: "Completed", description: "Completion requires a valid protected session record." },
  cancelled: { label: "Cancelled", description: "This session is no longer available." },
  no_show: { label: "No-show", description: "No-show status requires protected attendance review." },
  expired: { label: "Expired", description: "This classroom window has expired." },
};

export const classroomRouteGroups = {
  learner: ["classrooms", "archives"],
  instructor: ["classrooms", "classroom-demo", "archives"],
} as const;
