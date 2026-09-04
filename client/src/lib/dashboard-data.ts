export type DashboardStatus = "demo" | "empty" | "placeholder";
export type DashboardMetric = { label: string; value: string; detail: string; status: DashboardStatus };
export type LearnerDashboardData = { displayName: string; metrics: DashboardMetric[]; activeCourses: { title: string; instructor: string; progress: number; nextLesson: string }[]; recommendedInstructors: { name: string; subject: string; timezone: string; verification: string }[]; requirements: { subject: string; status: string; responses: string }[]; messages: string[]; notifications: string[]; schedule: string[] };
export type InstructorDashboardData = { displayName: string; verificationStatus: string; trainingStatus: string; testStatus: string; metrics: DashboardMetric[]; recommendedLearners: { subject: string; level: string; timezone: string; goal: string }[]; invites: string[]; bookings: string[]; students: string[]; courses: { label: string; value: string }[]; availability: string; messages: string[] };
const demoBoundary = "Safe demo state — no private records are connected.";
export function getLearnerDashboardData(displayName = "Learner"): LearnerDashboardData { return { displayName, metrics: [{ label: "Active courses", value: "0", detail: "No real enrolments", status: "empty" }, { label: "Saved tutors", value: "0", detail: "Save after a connected session", status: "empty" }, { label: "Open requirements", value: "0", detail: demoBoundary, status: "empty" }], activeCourses: [], recommendedInstructors: [], requirements: [], messages: [], notifications: [], schedule: [] }; }
export function getInstructorDashboardData(displayName = "Instructor"): InstructorDashboardData { return { displayName, verificationStatus: "Verification process", trainingStatus: "Training not started", testStatus: "Test access placeholder", metrics: [{ label: "Learner invites", value: "0", detail: demoBoundary, status: "empty" }, { label: "Upcoming bookings", value: "0", detail: "No real bookings", status: "empty" }, { label: "Current students", value: "0", detail: "Relationships appear after permissioned matching", status: "empty" }], recommendedLearners: [], invites: [], bookings: [], students: [], courses: [{ label: "Drafts", value: "0" }, { label: "Under review", value: "0" }, { label: "Published", value: "0" }], availability: "No availability saved", messages: [] }; }
export const getLearnerCourses = () => [];
export const getRecommendedInstructors = () => [];
export const getRecommendedLearners = () => [];
export const getInstructorInvites = () => [];
export const getBookings = () => [];
export const getTrainingStatus = () => ({ training: "not_started", test: "not_started" });
export const getInstructorStudents = () => [];
export const getSessionLedger = () => [];
export const getNotifications = () => [];
export const getConversations = () => [];
