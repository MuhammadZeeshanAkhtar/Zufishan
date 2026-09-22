import { COOKIE_NAME } from "@shared/const";
import { claimRequestedPublicRole, checkSignupEligibility, resolveLoginContext, PUBLIC_ROLES, LOGIN_CONTEXTS } from "./role-identity";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, supabaseOnlyProcedure } from "./_core/trpc";
import { z } from "zod";
import {
  ARTICLE_ACTIONS, ARTICLE_FILTERS, ARTICLE_SORTS, articleInput,
  deleteBlogArticle, getBlogArticle, getPublishedArticle, listBlogArticles,
  listPublishedArticleFacets, listPublishedArticles, saveBlogArticle, setBlogArticleStatus,
} from "./blog";
import { publishOwnCourse, unpublishOwnCourse, createCourse, createCredential, createInstructorMedia, deleteOwnCredential, deleteOwnInstructorMedia, listOwnInstructorMedia, setOwnInstructorMediaVisibility, createEnrolment, createHifzPlan, createHifzReview, createRequirement, createRequirementResponse, createCourseLesson, createCourseModule, deleteCourseLesson, deleteCourseModule, getLearnerWorkspace, getOwnCourseStructure, getOwnCoreProfiles, getPublicPublishedCourse, getPublicPublishedCourseById, getPublicPublishedLessonMetadata, getPublicPublishedRequirement, listPublicPublishedRequirements, listPublishedRequirements, listPublicPublishedCourses, listCourseFilterFacets, updateOwnRequirementGoal, updateOwnRequirementResponseStatus, setRequirementResponseDecision, listCourseLessons, listCourseModules, listHifzPlans, submitOwnCourseForReview, updateCourseLesson, updateCourseModule, updateOwnCourse, listHifzReviews, listOwnAvailability, listOwnCredentials, listOwnCourses, listOwnEnrolments, listOwnProgress, listOwnRequirements, listOwnRequirementResponses, updateOwnInstructorProfile, updateOwnLocale, updateOwnProfile, updateOwnLearnerProfile, upsertLessonProgress, listOwnConversations, listConversationMessages, createConversationMessage, createAdvancedHifzPlan, updateAdvancedHifzPlan, listAdvancedHifzPlans, createHifzRecord, listOwnHifzRecords, updateOwnDraftHifzRecord, submitHifzRecordForReview, listAssignedLearnerHifzRecords, listAssignedHifzReviews, reviewHifzRecord, calculateHifzProgress, createHifzReminder, listHifzReminders } from "./supabase-core";
import { createSignedDownloadUrl, deletePrivateObject, requestUploadPermission, PRIVATE_BUCKETS, type PrivateBucket } from "./supabase-storage";
import { listInstructorsForReview, setInstructorVerification, VERIFICATION_STATUSES } from "./instructor-verification";
import { listCoursesForReview, setCourseReviewDecision, COURSE_REVIEW_DECISIONS } from "./course-review";
import { startConversation } from "./conversation-start";
import { getMessagingEligibility } from "./connection-eligibility";
import { listConversationSummaries, markConversationRead, countUnread } from "./messaging";
import { rescheduleBooking, cancelBooking, completeBooking, BOOKING_OUTCOMES } from "./booking-lifecycle";
import { openSessionForBooking, setSessionStatus, recordOwnAttendance, listOwnSessions, getOwnSession, listSessionAttendance, requestJoinGrant, readSessionRecordingStatus, SESSION_STATUSES } from "./class-session-lifecycle";
import { classroomProviderStatus } from "./classroom-provider";
import { getCheckoutQuote, startCheckout, listOwnTransactions, getPaymentsSetup, getPublicPaymentAvailability } from "./payments";
import { createReview, listOwnReviews, listReviewsAboutMe, listInstructorReviews } from "./reviews";
import { claimAdminRole, adminBootstrapStatus } from "./admin-bootstrap";
import { listDiscoverableLearners, getDiscoverableLearner, getOwnDiscoverability, setOwnDiscoverability } from "./learner-discovery";
import { describeHumanVerification } from "./human-verification";
import { getAdminOverview } from "./admin-overview";
import { listInstructors, getInstructorDetail, decideInstructor, reviewCredential, INSTRUCTOR_FILTERS, INSTRUCTOR_DECISIONS, CREDENTIAL_DECISIONS } from "./admin-instructors";
import { listCourses, getCourseDetail, decideCourse, COURSE_FILTERS, COURSE_ACTIONS } from "./admin-courses";
import { listUsers, getUserDetail, setAccountStatus, USER_ROLE_FILTERS, USER_STATUS_FILTERS, SETTABLE_ACCOUNT_STATUSES } from "./admin-users";
import { listReviews, decideReview, listReports, resolveReport, listCases, decideCase, getContentInventory, REVIEW_FILTERS, REVIEW_ACTIONS, REPORT_KINDS, REPORT_OUTCOMES, CASE_STATUSES } from "./admin-moderation";
import { listSupportRecords, getSupportSummary, SUPPORT_SCOPES } from "./admin-support";
import { listAuditLogs, getSystemStatus, getAdminSettings } from "./admin-records";
import { getOwnEligibility, issueOwnCertificate, listOwnCertificates, verifyByCode, setCoursePassMark } from "./certificates";
import { listCourseQuizzes, createQuiz, submitQuizAttempt, listOwnQuizAttempts, listCourseSubmissions, listCourseAssignments, createAssignment, submitAssignment, gradeSubmission } from "./assessments";
import { listOwnNotifications, countOwnUnread, markNotificationsRead, getOwnPreferences, updateOwnPreferences } from "./notifications";
import { getSupabaseHealth } from "./supabase-connection";
import { getProductionConfigReport } from "./production-config";
import { acceptTrialRequest, cancelTrialOrBooking, confirmProposedTime, createAvailabilityInterval, createTrialRequest, declineTrialRequest, deleteAvailabilityInterval, getAvailableSlots, getOwnTrialRequest, getPublicInstructorBySlug, getPublicInstructorMedia, getPublicInstructorSchedule, listPublicInstructors, listInstructorFilterFacets, listBookings, listClassSessions, listInstructorAvailability, listLearnerTutors, listSchedulingNotifications, listTrialRequests, proposeNewTrialTime, updateAvailabilityInterval } from "./scheduling";
import { listWeeklyEarnings, listWithdrawalRequests } from "./tutor-earnings";
import { listOwnQualifications, listPublicQualifications, replaceQualifications } from "./instructor-qualifications";
import { COURSE_VERIFICATION_STATUSES, setCourseVerification } from "./review-queue";
import { CONTACT_ROLES, listContactMessages, submitContactMessage } from "./contact-messages";
import { listDeskBookings, listReceivedInvites, listSentInvites } from "./invite-desk";
import { AI_TUTOR_CORRECTION_STYLES, AI_TUTOR_GOALS, AI_TUTOR_LEVELS, AI_TUTOR_MODES, deleteTutorHistory, getTutorConversation, getTutorPreferences, listTutorConversations, listTutorMessages, listTutorProgress, listTutorSavedItems, reportTutorConversation, saveTutorItem, sendTutorMessage, createTutorConversation, upsertTutorPreferences } from "./ai-tutor";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  supabase: router({
    health: publicProcedure.query(() => getSupabaseHealth()),
    /* The contact form's one write. Public on purpose: a visitor who cannot sign in is exactly the
       person most likely to need to write, and the insert policy is what permits it. */
    submitContactMessage: publicProcedure
      .input(z.object({
        name: z.string().min(1).max(120),
        email: z.string().min(3).max(200),
        role: z.enum(CONTACT_ROLES),
        subject: z.string().min(1).max(160),
        body: z.string().min(1).max(4000),
        humanToken: z.string().max(4000).optional(),
      }))
      .mutation(({ ctx, input }) => submitContactMessage(input, ctx.supabaseIdentity ?? null)),
    productionConfig: publicProcedure.query(() => getProductionConfigReport()),
  }),
  supabaseCore: router({
    publicCourseById: publicProcedure.input(z.object({ courseId: z.string().uuid() })).query(({ input }) => getPublicPublishedCourseById(input.courseId)),
    publicLessonMetadata: publicProcedure.input(z.object({ slug: z.string().min(1).max(160), lessonId: z.string().uuid() })).query(({ input }) => getPublicPublishedLessonMetadata(input.slug, input.lessonId)),
    profiles: supabaseOnlyProcedure.query(({ ctx }) => getOwnCoreProfiles(ctx.supabaseIdentity)),
    claimPublicRole: supabaseOnlyProcedure.mutation(({ ctx }) => claimRequestedPublicRole(ctx.supabaseIdentity)),
    // Find Students. The instructor role is re-checked server-side, and the rows
    // come back under the caller's own session so RLS policy 0025 is the gate.
    discoverableLearners: supabaseOnlyProcedure
      .input(z.object({
        subjects: z.array(z.string().max(60)).max(12).optional(),
        level: z.string().max(60).optional(),
        language: z.string().max(60).optional(),
        // The column's own check constraint allows only these two, so anything
        // else would match no row; rejecting it here says so plainly instead.
        gender: z.enum(["male", "female"]).optional(),
        country: z.string().max(80).optional(),
        timezone: z.string().max(80).optional(),
        query: z.string().max(120).optional(),
        limit: z.number().int().min(1).max(48).optional(),
        offset: z.number().int().min(0).optional(),
        // Verified server-side against the provider's secret. Bounded so a
        // malformed value cannot be used to push a large body through.
        humanToken: z.string().max(4096).optional(),
      }).optional())
      .query(({ ctx, input }) => listDiscoverableLearners(ctx.supabaseIdentity, input ?? {})),
    // Which human-verification provider is configured, if any. Returns the public
    // site key and the NAMES of any missing variables — never a secret.
    humanVerification: supabaseOnlyProcedure.query(() => ({ ok: true as const, data: describeHumanVerification() })),
    // One published learner, for the detail view behind a card. Repeats every
    // guard the list applies, because a URL can be typed directly.
    discoverableLearner: supabaseOnlyProcedure
      .input(z.object({ learnerId: z.string().uuid(), humanToken: z.string().max(4096).optional() }))
      .query(({ ctx, input }) => getDiscoverableLearner(ctx.supabaseIdentity, input)),
    // The learner's own switch. No admin approval is involved in either direction.
    ownDiscoverability: supabaseOnlyProcedure.query(({ ctx }) => getOwnDiscoverability(ctx.supabaseIdentity)),
    setOwnDiscoverability: supabaseOnlyProcedure
      .input(z.object({ discoverable: z.boolean() }))
      .mutation(({ ctx, input }) => setOwnDiscoverability(ctx.supabaseIdentity, input)),
    // Answers before an account exists, so it takes the address as input. It is
    // the only pre-auth surface that distinguishes registered addresses, and it
    // grants nothing — the role still comes from the trigger and the claim above.
    signupEligibility: publicProcedure
      .input(z.object({ email: z.string().email().max(320), role: z.enum(PUBLIC_ROLES) }))
      .mutation(({ input }) => checkSignupEligibility(input)),
    // Reconciles the selected card with the roles the VERIFIED account holds and
    // returns the destination. The card can only be refused, never obeyed.
    loginContext: supabaseOnlyProcedure
      .input(z.object({ context: z.enum(LOGIN_CONTEXTS) }))
      .mutation(({ ctx, input }) => resolveLoginContext(ctx.supabaseIdentity, input)),
    // Grants `admin` only when the VERIFIED account's email matches ADMIN_EMAIL,
    // which is read server-side. Safe to call on every sign-in: it is an upsert,
    // and it refuses identically for everyone else so it cannot be used to probe
    // for the configured address.
    claimAdminRole: supabaseOnlyProcedure.mutation(({ ctx }) => claimAdminRole(ctx.supabaseIdentity)),
    // Boolean only — never the configured address.
    adminBootstrapConfigured: supabaseOnlyProcedure.query(() => ({ ok: true as const, data: adminBootstrapStatus() })),
    updateLearnerProfile: supabaseOnlyProcedure.input(z.object({
      fullName: z.string().min(1).max(160),
      displayName: z.string().min(1).max(120),
      learningSubjects: z.array(z.string().max(80)).max(12),
      country: z.string().max(80).optional(),
      city: z.string().max(120).optional(),
      timezone: z.string().max(80).optional(),
      supportedLanguages: z.array(z.string().max(80)).max(12).optional(),
      preferredLanguage: z.string().max(40).optional(),
      preferredLocale: z.enum(["en", "ur", "ar"]).optional(),
      bio: z.string().max(2000).optional(),
      gender: z.enum(["male", "female"]).optional(),
      profileVisibility: z.enum(["public", "private"]).optional(),
      completeOnboarding: z.boolean().optional(),
      learningLevel: z.string().max(80).optional(),
      learningGoal: z.string().max(2000).optional(),
      preferredClassFormat: z.string().max(120).optional(),
      preferredDaysTimes: z.string().max(400).optional(),
      budgetRange: z.string().max(120).optional(),
    })).mutation(({ ctx, input }) => updateOwnLearnerProfile(ctx.supabaseIdentity, input)),
    updateProfile: supabaseOnlyProcedure.input(z.object({ fullName: z.string().min(1).max(160), displayName: z.string().min(1).max(120), preferredLanguage: z.string().min(2).max(40), preferredLocale: z.enum(["en", "ur", "ar"]).optional() })).mutation(({ ctx, input }) => updateOwnProfile(ctx.supabaseIdentity, input)),
    updateLocale: supabaseOnlyProcedure.input(z.object({ preferredLocale: z.enum(["en", "ur", "ar"]) })).mutation(({ ctx, input }) => updateOwnLocale(ctx.supabaseIdentity, input.preferredLocale)),
    updateInstructorProfile: supabaseOnlyProcedure.input(z.object({ publicDisplayName: z.string().min(1).max(160), publicSlug: z.string().regex(/^[a-z0-9-]+$/).max(120), subjects: z.array(z.string().min(1).max(120)).max(20), levels: z.array(z.string().min(1).max(80)).max(12), teachingLanguages: z.array(z.string().min(1).max(80)).max(12), yearsExperience: z.number().int().min(0).max(100).optional(), teachingApproach: z.string().max(10000).optional(), hourlyRateMinor: z.number().int().nonnegative().optional(), currency: z.string().length(3).optional(), availabilitySummary: z.string().max(1000).optional(), profileVisibility: z.enum(["public", "private"]), preferredLanguage: z.string().min(2).max(80), fullName: z.string().max(160).optional(), country: z.string().max(80).optional(), city: z.string().max(120).optional(), timezone: z.string().max(80).optional(), bio: z.string().max(2000).optional(), gender: z.enum(["male", "female"]).optional(), sect: z.enum(["Sunni", "Shia", "Other", "Prefer not to say"]).optional(), fiqh: z.enum(["Hanafi", "Shafii", "Maliki", "Hanbali", "Other", "Prefer not to say"]).optional(), hasIjazah: z.boolean().optional() })).mutation(({ ctx, input }) => updateOwnInstructorProfile(ctx.supabaseIdentity, input)),
    availability: supabaseOnlyProcedure.query(({ ctx }) => listOwnAvailability(ctx.supabaseIdentity)),
    requirements: supabaseOnlyProcedure.query(({ ctx }) => listOwnRequirements(ctx.supabaseIdentity)),
    publishedRequirements: supabaseOnlyProcedure.query(({ ctx }) => listPublishedRequirements(ctx.supabaseIdentity)),
    createRequirement: supabaseOnlyProcedure.input(z.object({ subject: z.string().min(1).max(120), level: z.string().min(1).max(80), goal: z.string().min(1).max(5000), preferredLanguage: z.string().min(1).max(80), timezone: z.string().min(1).max(80), availability: z.string().min(1).max(500), budgetMinor: z.number().int().nonnegative().optional(), currency: z.string().length(3).optional() })).mutation(({ ctx, input }) => createRequirement(ctx.supabaseIdentity, input)),
    updateRequirementGoal: supabaseOnlyProcedure.input(z.object({ requirementId: z.string().uuid(), goal: z.string().trim().min(1).max(5000) })).mutation(({ ctx, input }) => updateOwnRequirementGoal(ctx.supabaseIdentity, input)),
    requirementResponses: supabaseOnlyProcedure.input(z.object({ requirementId: z.string().uuid() })).query(({ ctx, input }) => listOwnRequirementResponses(ctx.supabaseIdentity, input.requirementId)),
    respondToRequirement: supabaseOnlyProcedure.input(z.object({ requirementId: z.string().uuid(), message: z.string().trim().min(1).max(5000) })).mutation(({ ctx, input }) => createRequirementResponse(ctx.supabaseIdentity, input)),
    updateRequirementResponseStatus: supabaseOnlyProcedure.input(z.object({ responseId: z.string().uuid(), status: z.enum(["pending", "shortlisted", "accepted", "rejected", "withdrawn"]) })).mutation(({ ctx, input }) => updateOwnRequirementResponseStatus(ctx.supabaseIdentity, input)),
    // The learner's side of the same row: shortlist, accept or reject a response to their own
    // requirement. Withdrawing stays the instructor's, above.
    decideOnRequirementResponse: supabaseOnlyProcedure.input(z.object({ responseId: z.string().uuid(), status: z.enum(["shortlisted", "accepted", "rejected"]) })).mutation(({ ctx, input }) => setRequirementResponseDecision(ctx.supabaseIdentity, input)),
    courses: supabaseOnlyProcedure.query(({ ctx }) => listOwnCourses(ctx.supabaseIdentity)),
    credentials: supabaseOnlyProcedure.query(({ ctx }) => listOwnCredentials(ctx.supabaseIdentity)),
    createCredential: supabaseOnlyProcedure.input(z.object({ objectPath: z.string().min(1).max(500), mimeType: z.string().min(1).max(100), sizeBytes: z.number().int().positive() })).mutation(({ ctx, input }) => createCredential(ctx.supabaseIdentity, input)),
    deleteCredential: supabaseOnlyProcedure.input(z.object({ credentialId: z.string().uuid() })).mutation(({ ctx, input }) => deleteOwnCredential(ctx.supabaseIdentity, input.credentialId)),
    instructorMedia: supabaseOnlyProcedure.query(({ ctx }) => listOwnInstructorMedia(ctx.supabaseIdentity)),
    createInstructorMedia: supabaseOnlyProcedure.input(z.object({ objectPath: z.string().min(1).max(500), mimeType: z.string().min(1).max(100), sizeBytes: z.number().int().positive(), visibility: z.enum(["public", "private"]) })).mutation(({ ctx, input }) => createInstructorMedia(ctx.supabaseIdentity, input)),
    setInstructorMediaVisibility: supabaseOnlyProcedure.input(z.object({ mediaId: z.string().uuid(), visibility: z.enum(["public", "private"]) })).mutation(({ ctx, input }) => setOwnInstructorMediaVisibility(ctx.supabaseIdentity, input)),
    deleteInstructorMedia: supabaseOnlyProcedure.input(z.object({ mediaId: z.string().uuid() })).mutation(({ ctx, input }) => deleteOwnInstructorMedia(ctx.supabaseIdentity, input.mediaId)),
    createCourse: supabaseOnlyProcedure.input(z.object({ slug: z.string().regex(/^[a-z0-9-]+$/).max(120), title: z.string().min(1).max(180), description: z.string().min(1).max(10000), subject: z.string().min(1).max(120), level: z.string().min(1).max(80), language: z.string().min(1).max(80) })).mutation(({ ctx, input }) => createCourse(ctx.supabaseIdentity, input)),
    updateCourse: supabaseOnlyProcedure.input(z.object({ courseId: z.string().uuid(), slug: z.string().regex(/^[a-z0-9-]+$/).max(120), title: z.string().min(1).max(180), description: z.string().min(1).max(10000), subject: z.string().min(1).max(120), level: z.string().min(1).max(80), language: z.string().min(1).max(80) })).mutation(({ ctx, input }) => updateOwnCourse(ctx.supabaseIdentity, input.courseId, input)),
    submitCourseForReview: supabaseOnlyProcedure.input(z.object({ courseId: z.string().uuid() })).mutation(({ ctx, input }) => submitOwnCourseForReview(ctx.supabaseIdentity, input.courseId)),
    /* Publishing is the author's again (0035); the reviewer is notified and decides the mark. */
    publishCourse: supabaseOnlyProcedure.input(z.object({ courseId: z.string().uuid() })).mutation(({ ctx, input }) => publishOwnCourse(ctx.supabaseIdentity, input.courseId)),
    unpublishCourse: supabaseOnlyProcedure.input(z.object({ courseId: z.string().uuid() })).mutation(({ ctx, input }) => unpublishOwnCourse(ctx.supabaseIdentity, input.courseId)),
    createModule: supabaseOnlyProcedure.input(z.object({ courseId: z.string().uuid(), title: z.string().trim().min(1).max(180), description: z.string().max(10000).optional(), sortOrder: z.number().int().min(0) })).mutation(({ ctx, input }) => createCourseModule(ctx.supabaseIdentity, input)),
    updateModule: supabaseOnlyProcedure.input(z.object({ moduleId: z.string().uuid(), title: z.string().trim().min(1).max(180), description: z.string().max(10000).optional(), sortOrder: z.number().int().min(0).optional() })).mutation(({ ctx, input }) => updateCourseModule(ctx.supabaseIdentity, input)),
    deleteModule: supabaseOnlyProcedure.input(z.object({ moduleId: z.string().uuid() })).mutation(({ ctx, input }) => deleteCourseModule(ctx.supabaseIdentity, input.moduleId)),
    createLesson: supabaseOnlyProcedure.input(z.object({ moduleId: z.string().uuid(), title: z.string().trim().min(1).max(180), description: z.string().max(10000).optional(), durationSeconds: z.number().int().nonnegative().optional(), transcript: z.string().max(50000).optional(), mediaPath: z.string().max(500).optional(), sortOrder: z.number().int().min(0), isPreview: z.boolean().optional() })).mutation(({ ctx, input }) => createCourseLesson(ctx.supabaseIdentity, input)),
    updateLesson: supabaseOnlyProcedure.input(z.object({ lessonId: z.string().uuid(), title: z.string().trim().min(1).max(180), description: z.string().max(10000).optional(), durationSeconds: z.number().int().nonnegative().optional(), transcript: z.string().max(50000).optional(), mediaPath: z.string().max(500).optional(), sortOrder: z.number().int().min(0).optional(), isPreview: z.boolean().optional() })).mutation(({ ctx, input }) => updateCourseLesson(ctx.supabaseIdentity, input)),
    deleteLesson: supabaseOnlyProcedure.input(z.object({ lessonId: z.string().uuid() })).mutation(({ ctx, input }) => deleteCourseLesson(ctx.supabaseIdentity, input.lessonId)),
    modules: supabaseOnlyProcedure.input(z.object({ courseId: z.string().uuid() })).query(({ ctx, input }) => listCourseModules(ctx.supabaseIdentity, input.courseId)),
    structure: supabaseOnlyProcedure.input(z.object({ courseId: z.string().uuid() })).query(({ ctx, input }) => getOwnCourseStructure(ctx.supabaseIdentity, input.courseId)),
    lessons: supabaseOnlyProcedure.input(z.object({ moduleId: z.string().uuid() })).query(({ ctx, input }) => listCourseLessons(ctx.supabaseIdentity, input.moduleId)),
    enrolments: supabaseOnlyProcedure.query(({ ctx }) => listOwnEnrolments(ctx.supabaseIdentity)),
    createEnrolment: supabaseOnlyProcedure.input(z.object({ courseId: z.string().uuid() })).mutation(({ ctx, input }) => createEnrolment(ctx.supabaseIdentity, input.courseId)),
    progress: supabaseOnlyProcedure.query(({ ctx }) => listOwnProgress(ctx.supabaseIdentity)),
    learnerWorkspace: supabaseOnlyProcedure.query(({ ctx }) => getLearnerWorkspace(ctx.supabaseIdentity)),
    conversations: supabaseOnlyProcedure.query(({ ctx }) => listOwnConversations(ctx.supabaseIdentity)),
    messages: supabaseOnlyProcedure.input(z.object({ conversationId: z.string().uuid() })).query(({ ctx, input }) => listConversationMessages(ctx.supabaseIdentity, input.conversationId)),
    conversationSummaries: supabaseOnlyProcedure.query(({ ctx }) => listConversationSummaries(ctx.supabaseIdentity)),
    unreadCount: supabaseOnlyProcedure.query(({ ctx }) => countUnread(ctx.supabaseIdentity)),
    markConversationRead: supabaseOnlyProcedure
      .input(z.object({ conversationId: z.string().uuid() }))
      .mutation(({ ctx, input }) => markConversationRead(ctx.supabaseIdentity, input)),
    // Whether a thread may be opened with this account, and if not, whether a
    // request is already waiting. Decided by the same check that authorises
    // the write, so the button and the write cannot disagree.
    messagingEligibility: supabaseOnlyProcedure
      .input(z.object({ counterpartId: z.string().uuid() }))
      .query(({ ctx, input }) => getMessagingEligibility(ctx.supabaseIdentity, input)),
    startConversation: supabaseOnlyProcedure
      .input(z.object({ counterpartId: z.string().uuid(), subject: z.string().max(200).optional() }))
      .mutation(({ ctx, input }) => startConversation(ctx.supabaseIdentity, input)),
    createMessage: supabaseOnlyProcedure.input(z.object({ conversationId: z.string().uuid(), body: z.string().min(1).max(12000), attachmentPath: z.string().max(500).optional() })).mutation(({ ctx, input }) => createConversationMessage(ctx.supabaseIdentity, input)),
    hifzPlans: supabaseOnlyProcedure.query(({ ctx }) => listHifzPlans(ctx.supabaseIdentity)),
    createHifzPlan: supabaseOnlyProcedure.input(z.object({ title: z.string().min(1).max(160), dailyTargetAyahs: z.number().int().min(1).max(100) })).mutation(({ ctx, input }) => createHifzPlan(ctx.supabaseIdentity, input)),
    hifzReviews: supabaseOnlyProcedure.input(z.object({ planId: z.string().uuid() })).query(({ ctx, input }) => listHifzReviews(ctx.supabaseIdentity, input.planId)),
    createHifzReview: supabaseOnlyProcedure.input(z.object({ planId: z.string().uuid(), reviewType: z.enum(["sabaq", "sabqi", "manzil"]), surahNumber: z.number().int().min(1).max(114), ayahFrom: z.number().int().min(1), ayahTo: z.number().int().min(1), quality: z.number().int().min(1).max(5), notes: z.string().max(5000).optional() })).mutation(({ ctx, input }) => createHifzReview(ctx.supabaseIdentity, input)),
    updateProgress: supabaseOnlyProcedure.input(z.object({ lessonId: z.string().uuid(), completed: z.boolean(), progressPercent: z.number().min(0).max(100) })).mutation(({ ctx, input }) => upsertLessonProgress(ctx.supabaseIdentity, input)),
    createAdvancedHifzPlan: supabaseOnlyProcedure.input(z.object({ title: z.string().trim().min(1).max(160), startDate: z.string().optional(), targetDate: z.string().optional(), currentReference: z.object({ surah: z.number().int().min(1).max(114).optional(), ayahFrom: z.number().int().min(1).optional(), ayahTo: z.number().int().min(1).optional(), juz: z.number().int().min(1).max(30).optional() }).optional(), dailyTarget: z.object({ ayahs: z.number().int().min(1).max(100) }).optional(), weeklyTarget: z.object({ ayahs: z.number().int().min(1).max(700).optional(), sessions: z.number().int().min(1).max(14).optional() }).optional(), preferredDays: z.array(z.string().min(1).max(12)).max(7).optional(), reminderTime: z.string().max(20).optional(), timezone: z.string().min(1).max(80).optional(), instructorId: z.string().uuid().optional() })).mutation(({ ctx, input }) => createAdvancedHifzPlan(ctx.supabaseIdentity, input)),
    updateAdvancedHifzPlan: supabaseOnlyProcedure.input(z.object({ planId: z.string().uuid(), title: z.string().trim().min(1).max(160).optional(), startDate: z.string().optional(), targetDate: z.string().optional(), currentReference: z.object({ surah: z.number().int().min(1).max(114).optional(), ayahFrom: z.number().int().min(1).optional(), ayahTo: z.number().int().min(1).optional(), juz: z.number().int().min(1).max(30).optional() }).optional(), dailyTarget: z.object({ ayahs: z.number().int().min(1).max(100) }).optional(), weeklyTarget: z.object({ ayahs: z.number().int().min(1).max(700).optional(), sessions: z.number().int().min(1).max(14).optional() }).optional(), preferredDays: z.array(z.string().min(1).max(12)).max(7).optional(), reminderTime: z.string().max(20).optional(), timezone: z.string().min(1).max(80).optional(), instructorId: z.string().uuid().nullable().optional(), status: z.enum(["active", "paused", "completed", "archived"]).optional() })).mutation(({ ctx, input: { planId, ...input } }) => updateAdvancedHifzPlan(ctx.supabaseIdentity, planId, input)),
    advancedHifzPlans: supabaseOnlyProcedure.query(({ ctx }) => listAdvancedHifzPlans(ctx.supabaseIdentity)),
    createHifzRecord: supabaseOnlyProcedure.input(z.object({ planId: z.string().uuid(), recordDate: z.string(), reference: z.object({ surah: z.number().int().min(1).max(114).optional(), ayahFrom: z.number().int().min(1).optional(), ayahTo: z.number().int().min(1).optional(), juz: z.number().int().min(1).max(30).optional() }), sessionType: z.enum(["new_memorisation", "revision", "assessment"]), sectionType: z.enum(["sabaq", "sabqi", "manzil"]), status: z.enum(["planned", "practiced", "needs_revision", "paused"]).optional(), selfRating: z.number().int().min(1).max(5).optional(), mistakeCount: z.number().int().min(0).optional(), practiceMinutes: z.number().int().min(0).max(1440).optional(), learnerNote: z.string().max(10000).optional() })).mutation(({ ctx, input }) => createHifzRecord(ctx.supabaseIdentity, input)),
    updateOwnDraftHifzRecord: supabaseOnlyProcedure.input(z.object({ recordId: z.string().uuid(), recordDate: z.string().optional(), reference: z.object({ surah: z.number().int().min(1).max(114).optional(), ayahFrom: z.number().int().min(1).optional(), ayahTo: z.number().int().min(1).optional(), juz: z.number().int().min(1).max(30).optional() }).optional(), sessionType: z.enum(["new_memorisation", "revision", "assessment"]).optional(), sectionType: z.enum(["sabaq", "sabqi", "manzil"]).optional(), status: z.enum(["planned", "practiced", "needs_revision", "paused"]).optional(), selfRating: z.number().int().min(1).max(5).optional(), mistakeCount: z.number().int().min(0).optional(), practiceMinutes: z.number().int().min(0).max(1440).optional(), learnerNote: z.string().max(10000).optional() })).mutation(({ ctx, input: { recordId, ...input } }) => updateOwnDraftHifzRecord(ctx.supabaseIdentity, recordId, input)),
    hifzRecords: supabaseOnlyProcedure.input(z.object({ planId: z.string().uuid() })).query(({ ctx, input }) => listOwnHifzRecords(ctx.supabaseIdentity, input.planId)),
    submitHifzRecordForReview: supabaseOnlyProcedure.input(z.object({ recordId: z.string().uuid() })).mutation(({ ctx, input }) => submitHifzRecordForReview(ctx.supabaseIdentity, input.recordId)),
    assignedHifzRecords: supabaseOnlyProcedure.input(z.object({ learnerId: z.string().uuid().optional() }).optional()).query(({ ctx, input }) => listAssignedLearnerHifzRecords(ctx.supabaseIdentity, input?.learnerId)),
    assignedHifzReviews: supabaseOnlyProcedure.input(z.object({ learnerId: z.string().uuid().optional() }).optional()).query(({ ctx, input }) => listAssignedHifzReviews(ctx.supabaseIdentity, input?.learnerId)),
    reviewHifzRecord: supabaseOnlyProcedure.input(z.object({ reviewId: z.string().uuid(), status: z.enum(["reviewed", "needs_revision", "approved"]), qualityRating: z.number().int().min(1).max(5).optional(), mistakeCategories: z.array(z.string().min(1).max(80)).max(20).optional(), feedbackNote: z.string().max(10000).optional(), revisionRecommendation: z.string().max(5000).optional(), nextSabaqSuggestion: z.string().max(5000).optional() })).mutation(({ ctx, input }) => reviewHifzRecord(ctx.supabaseIdentity, input)),
    hifzProgress: supabaseOnlyProcedure.input(z.object({ planId: z.string().uuid() })).query(({ ctx, input }) => calculateHifzProgress(ctx.supabaseIdentity, input.planId)),
    createHifzReminder: supabaseOnlyProcedure.input(z.object({ planId: z.string().uuid(), reminderType: z.enum(["daily_sabaq", "sabqi_revision", "manzil_revision", "pending_review", "needs_revision", "weekly_progress"]), scheduledFor: z.string(), timezone: z.string().min(1).max(80), idempotencyKey: z.string().trim().min(1).max(180) })).mutation(({ ctx, input }) => createHifzReminder(ctx.supabaseIdentity, input)),
    hifzReminders: supabaseOnlyProcedure.query(({ ctx }) => listHifzReminders(ctx.supabaseIdentity)),
  }),

  aiTutor: router({
    preferences: supabaseOnlyProcedure.query(({ ctx }) => getTutorPreferences(ctx.supabaseIdentity)),
    savePreferences: supabaseOnlyProcedure.input(z.object({ targetLanguage: z.string().min(2).max(80), nativeLanguage: z.string().min(2).max(80), responseLanguage: z.enum(["en", "ur", "ar"]).default("en"), explanationLanguage: z.enum(["en", "ur", "ar"]).default("en"), level: z.enum(AI_TUTOR_LEVELS), goals: z.array(z.enum(AI_TUTOR_GOALS)).max(8), correctionStyle: z.enum(AI_TUTOR_CORRECTION_STYLES), topics: z.array(z.string().min(1).max(80)).max(12), sessionLengthMinutes: z.number().int().min(5).max(90), difficulty: z.enum(["gentle", "adaptive", "challenging"]), consentVersion: z.string().min(1).max(40), enabled: z.boolean(), instructorSharingEnabled: z.boolean() })).mutation(({ ctx, input }) => upsertTutorPreferences(ctx.supabaseIdentity, input)),
    conversations: supabaseOnlyProcedure.query(({ ctx }) => listTutorConversations(ctx.supabaseIdentity)),
    createConversation: supabaseOnlyProcedure.input(z.object({ targetLanguage: z.string().min(2).max(80), practiceMode: z.enum(AI_TUTOR_MODES), title: z.string().max(160).optional(), courseId: z.string().uuid().optional(), lessonId: z.string().uuid().optional() })).mutation(({ ctx, input }) => createTutorConversation(ctx.supabaseIdentity, input)),
    conversation: supabaseOnlyProcedure.input(z.object({ conversationId: z.string().uuid() })).query(({ ctx, input }) => getTutorConversation(ctx.supabaseIdentity, input.conversationId)),
    messages: supabaseOnlyProcedure.input(z.object({ conversationId: z.string().uuid() })).query(({ ctx, input }) => listTutorMessages(ctx.supabaseIdentity, input.conversationId)),
    send: supabaseOnlyProcedure.input(z.object({ conversationId: z.string().uuid(), content: z.string().min(1).max(5000), context: z.object({ courseTitle: z.string().max(160).optional(), lessonTitle: z.string().max(160).optional(), vocabulary: z.array(z.string().max(100)).max(30).optional() }).optional() })).mutation(({ ctx, input }) => sendTutorMessage(ctx.supabaseIdentity, input)),
    progress: supabaseOnlyProcedure.query(({ ctx }) => listTutorProgress(ctx.supabaseIdentity)),
    saveItem: supabaseOnlyProcedure.input(z.object({ language: z.string().min(2).max(80), term: z.string().min(1).max(240), explanation: z.string().min(1).max(2000), example: z.string().max(2000).optional(), sourceConversationId: z.string().uuid().optional() })).mutation(({ ctx, input }) => saveTutorItem(ctx.supabaseIdentity, input)),
    savedItems: supabaseOnlyProcedure.query(({ ctx }) => listTutorSavedItems(ctx.supabaseIdentity)),
    report: supabaseOnlyProcedure.input(z.object({ conversationId: z.string().uuid(), reason: z.enum(["unsafe", "incorrect", "out_of_scope", "privacy", "other"]), description: z.string().max(4000).optional() })).mutation(({ ctx, input }) => reportTutorConversation(ctx.supabaseIdentity, input)),
    deleteHistory: supabaseOnlyProcedure.mutation(({ ctx }) => deleteTutorHistory(ctx.supabaseIdentity)),
  }),

  // Read-only, and only what a price list needs: is there a provider, and what can it charge in.
  // No vendor name and no configuration detail leave here; `paymentsSetup` keeps those behind auth.
  pricingPublic: router({
    paymentAvailability: publicProcedure.query(() => getPublicPaymentAvailability()),
  }),

  schedulingPublic: router({
    instructorBySlug: publicProcedure.input(z.object({ slug: z.string().min(1).max(120) })).query(({ input }) => getPublicInstructorBySlug(input.slug)),
    instructorSchedule: publicProcedure.input(z.object({ slug: z.string().min(1).max(120), startDate: z.string().date(), endDate: z.string().date(), learnerTimezone: z.string().min(1).max(80), durationMinutes: z.number().int().min(15).max(180).optional() })).query(({ input }) => getPublicInstructorSchedule(input.slug, input)),
    instructorQualifications: publicProcedure.input(z.object({ instructorId: z.string().uuid() })).query(({ input }) => listPublicQualifications(input.instructorId)),
    instructorMedia: publicProcedure.input(z.object({ slug: z.string().min(1).max(120) })).query(({ input }) => getPublicInstructorMedia(input.slug)),
    instructors: publicProcedure.input(z.object({
      query: z.string().max(120).optional(),
      subjects: z.array(z.string().max(80)).max(12).optional(),
      languages: z.array(z.string().max(80)).max(12).optional(),
      levels: z.array(z.string().max(80)).max(12).optional(),
      minRateMinor: z.number().int().min(0).optional(),
      maxRateMinor: z.number().int().min(0).optional(),
      minYearsExperience: z.number().int().min(0).max(80).optional(),
      currency: z.string().length(3).optional(),
      gender: z.enum(["male", "female"]).optional(),
      country: z.string().max(80).optional(),
      timezone: z.string().max(80).optional(),
      sect: z.enum(["Sunni", "Shia", "Other", "Prefer not to say"]).optional(),
      hasIjazah: z.boolean().optional(),
      // Only the thresholds the sidebar offers, so an arbitrary float cannot be probed.
      minRating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(4.5)]).optional(),
      sort: z.enum(["relevance", "rate_asc", "rate_desc", "experience_desc"]).optional(),
      limit: z.number().int().min(1).max(48).optional(),
      offset: z.number().int().min(0).optional(),
    }).optional()).query(({ input }) => listPublicInstructors(input ?? {})),
    instructorFacets: publicProcedure.query(() => listInstructorFilterFacets()),
    instructorReviews: publicProcedure.input(z.object({ instructorId: z.string().uuid() })).query(({ input }) => listInstructorReviews(input.instructorId)),
    // Takes the printed random code only — never a row id — and returns the minimal record.
    verifyCertificate: publicProcedure.input(z.object({ code: z.string().trim().min(8).max(40) })).query(({ input }) => verifyByCode({ code: input.code })),
    publishedRequirements: publicProcedure.query(() => listPublicPublishedRequirements()),
    publishedRequirementById: publicProcedure.input(z.object({ id: z.string().uuid() })).query(({ input }) => getPublicPublishedRequirement(input.id)),
    publishedCourses: publicProcedure.input(z.object({
      query: z.string().max(120).optional(),
      subjects: z.array(z.string().max(80)).max(12).optional(),
      levels: z.array(z.string().max(80)).max(12).optional(),
      languages: z.array(z.string().max(80)).max(12).optional(),
      sort: z.enum(["newest", "title_asc"]).optional(),
      limit: z.number().int().min(1).max(48).optional(),
      offset: z.number().int().min(0).optional(),
    }).optional()).query(({ input }) => listPublicPublishedCourses(input ?? {})),
    courseFacets: publicProcedure.query(() => listCourseFilterFacets()),

    // ---- blog. Published rows only; the table's one RLS policy enforces it. ----
    blogArticles: publicProcedure
      .input(z.object({ search: z.string().max(120).optional(), category: z.string().max(80).optional(), subject: z.string().max(80).optional(), limit: z.number().int().min(1).max(50).optional(), offset: z.number().int().min(0).optional() }).optional())
      .query(({ input }) => listPublishedArticles(input ?? {})),
    blogArticle: publicProcedure
      .input(z.object({ slug: z.string().min(1).max(160) }))
      .query(({ input }) => getPublishedArticle(input)),
    blogFacets: publicProcedure.query(() => listPublishedArticleFacets()),
    courseBySlug: publicProcedure.input(z.object({ slug: z.string().min(1).max(160) })).query(({ input }) => getPublicPublishedCourse(input.slug)),
  }),

  scheduling: router({
    availability: supabaseOnlyProcedure.query(({ ctx }) => listInstructorAvailability(ctx.supabaseIdentity)),
    learnerTrials: supabaseOnlyProcedure.query(({ ctx }) => listTrialRequests(ctx.supabaseIdentity, "learner")),
    // Read-only, learner-only: the teacher list their own dashboard shows. Not called by the
    // instructor or admin desks.
    learnerTutors: supabaseOnlyProcedure.query(({ ctx }) => listLearnerTutors(ctx.supabaseIdentity)),
    /* The two invite desks, and the bookings beside them. Reads only: each resolves the other
       person's name, which `trial_requests` and `bookings` carry only as an id. */
    receivedInvites: supabaseOnlyProcedure.query(({ ctx }) => listReceivedInvites(ctx.supabaseIdentity)),
    sentInvites: supabaseOnlyProcedure.query(({ ctx }) => listSentInvites(ctx.supabaseIdentity)),
    deskBookings: supabaseOnlyProcedure.input(z.object({ role: z.enum(["learner", "instructor"]) })).query(({ ctx, input }) => listDeskBookings(ctx.supabaseIdentity, input.role)),
    /* The teacher's own Billing and Withdrawal Requests, replacing two fixture-backed screens.
       Both are reads, both scoped by the caller's own token. */
    weeklyEarnings: supabaseOnlyProcedure.input(z.object({ weekStartIso: z.string().optional() })).query(({ ctx, input }) => listWeeklyEarnings(ctx.supabaseIdentity, input.weekStartIso)),
    withdrawalRequests: supabaseOnlyProcedure.query(({ ctx }) => listWithdrawalRequests(ctx.supabaseIdentity)),
    /* Employment history, certifications and ijazah: three repeatable lists on the profile editor.
       The editor sends one whole list at a time and that kind is replaced. */
    qualifications: supabaseOnlyProcedure.query(({ ctx }) => listOwnQualifications(ctx.supabaseIdentity)),
    saveQualifications: supabaseOnlyProcedure
      .input(z.object({
        kind: z.enum(["employment", "certification", "ijazah"]),
        entries: z.array(z.object({
          title: z.string().max(160),
          organisation: z.string().max(160).optional().nullable(),
          period: z.string().max(80).optional().nullable(),
          detail: z.string().max(600).optional().nullable(),
        })).max(20),
      }))
      .mutation(({ ctx, input }) => replaceQualifications(ctx.supabaseIdentity, input)),
    trialDetail: supabaseOnlyProcedure.input(z.object({ requestId: z.string().uuid() })).query(({ ctx, input }) => getOwnTrialRequest(ctx.supabaseIdentity, input.requestId)),
    instructorTrials: supabaseOnlyProcedure.query(({ ctx }) => listTrialRequests(ctx.supabaseIdentity, "instructor")),
    createAvailability: supabaseOnlyProcedure.input(z.object({ weekday: z.number().int().min(0).max(6), startLocal: z.string().regex(/^\d{2}:\d{2}$/), endLocal: z.string().regex(/^\d{2}:\d{2}$/), timezone: z.string().min(1).max(80), active: z.boolean().optional(), bufferMinutes: z.number().int().min(0).max(1440).optional(), minimumNoticeMinutes: z.number().int().min(0).max(10080).optional(), availableOn: z.string().date().optional(), exceptionType: z.enum(["weekly", "date_exception", "break"]).optional(), isBreak: z.boolean().optional(), courseId: z.string().uuid().optional() })).mutation(({ ctx, input }) => createAvailabilityInterval(ctx.supabaseIdentity, input)),
    updateAvailability: supabaseOnlyProcedure.input(z.object({ id: z.string().uuid(), weekday: z.number().int().min(0).max(6).optional(), startLocal: z.string().regex(/^\d{2}:\d{2}$/).optional(), endLocal: z.string().regex(/^\d{2}:\d{2}$/).optional(), timezone: z.string().min(1).max(80).optional(), active: z.boolean().optional(), bufferMinutes: z.number().int().min(0).max(1440).optional(), minimumNoticeMinutes: z.number().int().min(0).max(10080).optional(), availableOn: z.string().date().nullable().optional(), exceptionType: z.enum(["weekly", "date_exception", "break"]).optional(), isBreak: z.boolean().optional(), courseId: z.string().uuid().nullable().optional() })).mutation(({ ctx, input }) => { const { id, ...changes } = input; return updateAvailabilityInterval(ctx.supabaseIdentity, id, changes); }),
    deleteAvailability: supabaseOnlyProcedure.input(z.object({ id: z.string().uuid() })).mutation(({ ctx, input }) => deleteAvailabilityInterval(ctx.supabaseIdentity, input.id)),
    availableSlots: supabaseOnlyProcedure.input(z.object({ instructorId: z.string().uuid(), startDate: z.string().date(), endDate: z.string().date(), learnerTimezone: z.string().min(1).max(80), durationMinutes: z.number().int().min(15).max(180).optional() })).query(({ ctx, input }) => getAvailableSlots(ctx.supabaseIdentity, input)),
    createTrial: supabaseOnlyProcedure.input(z.object({ instructorId: z.string().uuid(), courseId: z.string().uuid().optional(), requirementId: z.string().uuid().optional(), subject: z.string().min(1).max(120), learnerTimezone: z.string().min(1).max(80), instructorTimezone: z.string().min(1).max(80), requestedStartAt: z.string().datetime({ offset: true }), requestedEndAt: z.string().datetime({ offset: true }), learnerMessage: z.string().min(1).max(5000), idempotencyKey: z.string().min(8).max(160), learnerLocale: z.enum(["en", "ur", "ar"]).optional() })).mutation(({ ctx, input }) => createTrialRequest(ctx.supabaseIdentity, input)),
    acceptTrial: supabaseOnlyProcedure.input(z.object({ requestId: z.string().uuid() })).mutation(({ ctx, input }) => acceptTrialRequest(ctx.supabaseIdentity, input.requestId)),
    declineTrial: supabaseOnlyProcedure.input(z.object({ requestId: z.string().uuid(), reason: z.string().min(1).max(1000) })).mutation(({ ctx, input }) => declineTrialRequest(ctx.supabaseIdentity, input.requestId, input.reason)),
    proposeTime: supabaseOnlyProcedure.input(z.object({ requestId: z.string().uuid(), startAt: z.string().datetime({ offset: true }), endAt: z.string().datetime({ offset: true }), instructorTimezone: z.string().min(1).max(80) })).mutation(({ ctx, input }) => proposeNewTrialTime(ctx.supabaseIdentity, input.requestId, input)),
    confirmTime: supabaseOnlyProcedure.input(z.object({ requestId: z.string().uuid() })).mutation(({ ctx, input }) => confirmProposedTime(ctx.supabaseIdentity, input.requestId)),
    cancel: supabaseOnlyProcedure.input(z.object({ id: z.string().uuid(), reason: z.string().min(1).max(1000) })).mutation(({ ctx, input }) => cancelTrialOrBooking(ctx.supabaseIdentity, input.id, input.reason)),
    sessions: supabaseOnlyProcedure.query(({ ctx }) => listOwnSessions(ctx.supabaseIdentity)),
    session: supabaseOnlyProcedure.input(z.object({ sessionId: z.string().uuid() })).query(({ ctx, input }) => getOwnSession(ctx.supabaseIdentity, input)),
    sessionAttendance: supabaseOnlyProcedure.input(z.object({ sessionId: z.string().uuid() })).query(({ ctx, input }) => listSessionAttendance(ctx.supabaseIdentity, input)),
    // Provider status is answered by the server, not assumed by the browser: a client-side
    // constant would keep saying "not configured" after a provider was actually connected.
    classroomProvider: supabaseOnlyProcedure.query(() => ({ ok: true as const, data: classroomProviderStatus() })),
    classroomJoin: supabaseOnlyProcedure.input(z.object({ sessionId: z.string().uuid() })).mutation(({ ctx, input }) => requestJoinGrant(ctx.supabaseIdentity, input)),
    sessionRecording: supabaseOnlyProcedure.input(z.object({ sessionId: z.string().uuid() })).query(({ ctx, input }) => readSessionRecordingStatus(ctx.supabaseIdentity, input)),
    myReviews: supabaseOnlyProcedure.query(({ ctx }) => listOwnReviews(ctx.supabaseIdentity)),
    // Certificates. Eligibility is decided server-side from the caller's own rows; issuance goes
    // through the service role because certificates_admin_write blocks every other write.
    certificateEligibility: supabaseOnlyProcedure.input(z.object({ courseId: z.string().uuid() })).query(({ ctx, input }) => getOwnEligibility(ctx.supabaseIdentity, input)),
    myCertificates: supabaseOnlyProcedure.query(({ ctx }) => listOwnCertificates(ctx.supabaseIdentity)),
    // Payments. Every financial row is written by the service role after this server decides;
    // session_ledger and payment_references have no insert or update policy at all.
    paymentsSetup: supabaseOnlyProcedure.query(() => getPaymentsSetup()),
    checkoutQuote: supabaseOnlyProcedure.input(z.object({ bookingId: z.string().uuid() })).query(({ ctx, input }) => getCheckoutQuote(ctx.supabaseIdentity, input)),
    startCheckout: supabaseOnlyProcedure.input(z.object({ bookingId: z.string().uuid() })).mutation(({ ctx, input }) => startCheckout(ctx.supabaseIdentity, input)),
    myTransactions: supabaseOnlyProcedure.query(({ ctx }) => listOwnTransactions(ctx.supabaseIdentity)),
    issueCertificate: supabaseOnlyProcedure.input(z.object({ courseId: z.string().uuid() })).mutation(({ ctx, input }) => issueOwnCertificate(ctx.supabaseIdentity, input)),
    setCoursePassMark: supabaseOnlyProcedure.input(z.object({ courseId: z.string().uuid(), passMark: z.number().int().min(0).max(100).nullable() })).mutation(({ ctx, input }) => setCoursePassMark(ctx.supabaseIdentity, input)),
    reviewsAboutMe: supabaseOnlyProcedure.query(({ ctx }) => listReviewsAboutMe(ctx.supabaseIdentity)),
    // Named `inbox` here because `scheduling.notifications` already exists and returns only the
    // scheduling subset; this one reads the whole table for the caller.
    inbox: supabaseOnlyProcedure.query(({ ctx }) => listOwnNotifications(ctx.supabaseIdentity)),
    unreadNotifications: supabaseOnlyProcedure.query(({ ctx }) => countOwnUnread(ctx.supabaseIdentity)),
    markNotificationsRead: supabaseOnlyProcedure
      .input(z.object({
        notificationId: z.string().uuid().optional(),
        /* Clearing by the thing opened, because that is what a person actually opens. */
        relatedEntityType: z.string().max(60).optional(),
        relatedEntityId: z.string().uuid().optional(),
      }))
      .mutation(({ ctx, input }) => markNotificationsRead(ctx.supabaseIdentity, input)),
    notificationPreferences: supabaseOnlyProcedure.query(({ ctx }) => getOwnPreferences(ctx.supabaseIdentity)),
    updateNotificationPreferences: supabaseOnlyProcedure
      .input(z.object({ emailEnabled: z.boolean().optional(), classRemindersEnabled: z.boolean().optional(), messageNotificationsEnabled: z.boolean().optional(), courseUpdatesEnabled: z.boolean().optional() }))
      .mutation(({ ctx, input }) => updateOwnPreferences(ctx.supabaseIdentity, input)),
    courseQuizzes: supabaseOnlyProcedure.input(z.object({ courseId: z.string().uuid() })).query(({ ctx, input }) => listCourseQuizzes(ctx.supabaseIdentity, input.courseId)),
    createQuiz: supabaseOnlyProcedure
      .input(z.object({ courseId: z.string().uuid(), title: z.string().trim().min(1).max(180), questions: z.array(z.object({ id: z.string().min(1).max(80), prompt: z.string().max(2000).optional(), answer: z.string().max(500).optional() })).min(1).max(100) }))
      .mutation(({ ctx, input }) => createQuiz(ctx.supabaseIdentity, input)),
    submitQuizAttempt: supabaseOnlyProcedure
      .input(z.object({ quizId: z.string().uuid(), answers: z.record(z.string(), z.unknown()) }))
      .mutation(({ ctx, input }) => submitQuizAttempt(ctx.supabaseIdentity, input)),
    myQuizAttempts: supabaseOnlyProcedure.input(z.object({ quizId: z.string().uuid().optional() })).query(({ ctx, input }) => listOwnQuizAttempts(ctx.supabaseIdentity, input)),
    courseSubmissions: supabaseOnlyProcedure.input(z.object({ courseId: z.string().uuid() })).query(({ ctx, input }) => listCourseSubmissions(ctx.supabaseIdentity, input)),
    courseAssignments: supabaseOnlyProcedure.input(z.object({ courseId: z.string().uuid() })).query(({ ctx, input }) => listCourseAssignments(ctx.supabaseIdentity, input.courseId)),
    createAssignment: supabaseOnlyProcedure
      .input(z.object({ courseId: z.string().uuid(), title: z.string().trim().min(1).max(180), instructions: z.string().max(10000).optional(), dueOffsetDays: z.number().int().min(0).max(365).optional() }))
      .mutation(({ ctx, input }) => createAssignment(ctx.supabaseIdentity, input)),
    submitAssignment: supabaseOnlyProcedure
      .input(z.object({ assignmentId: z.string().uuid(), body: z.string().max(20000).optional(), objectPath: z.string().max(500).optional() }))
      .mutation(({ ctx, input }) => submitAssignment(ctx.supabaseIdentity, input)),
    gradeSubmission: supabaseOnlyProcedure
      .input(z.object({ submissionId: z.string().uuid(), score: z.number().min(0).max(100), status: z.enum(["graded", "returned"]).optional() }))
      .mutation(({ ctx, input }) => gradeSubmission(ctx.supabaseIdentity, input)),
    createReview: supabaseOnlyProcedure
      .input(z.object({ sessionId: z.string().uuid(), rating: z.number().int().min(1).max(5), body: z.string().trim().min(1).max(5000) }))
      .mutation(({ ctx, input }) => createReview(ctx.supabaseIdentity, input)),
    openSession: supabaseOnlyProcedure
      .input(z.object({ bookingId: z.string().uuid() }))
      .mutation(({ ctx, input }) => openSessionForBooking(ctx.supabaseIdentity, input)),
    setSessionStatus: supabaseOnlyProcedure
      .input(z.object({ sessionId: z.string().uuid(), status: z.enum(SESSION_STATUSES) }))
      .mutation(({ ctx, input }) => setSessionStatus(ctx.supabaseIdentity, input)),
    recordAttendance: supabaseOnlyProcedure
      .input(z.object({ sessionId: z.string().uuid(), action: z.enum(["join", "leave"]) }))
      .mutation(({ ctx, input }) => recordOwnAttendance(ctx.supabaseIdentity, input)),
    rescheduleBooking: supabaseOnlyProcedure
      .input(z.object({ bookingId: z.string().uuid(), startAt: z.string().min(1), endAt: z.string().min(1), reason: z.string().max(1000).optional() }))
      .mutation(({ ctx, input }) => rescheduleBooking(ctx.supabaseIdentity, input)),
    cancelBooking: supabaseOnlyProcedure
      .input(z.object({ bookingId: z.string().uuid(), reason: z.string().trim().min(1).max(1000) }))
      .mutation(({ ctx, input }) => cancelBooking(ctx.supabaseIdentity, input)),
    completeBooking: supabaseOnlyProcedure
      .input(z.object({ bookingId: z.string().uuid(), outcome: z.enum(BOOKING_OUTCOMES) }))
      .mutation(({ ctx, input }) => completeBooking(ctx.supabaseIdentity, input)),
    learnerBookings: supabaseOnlyProcedure.query(({ ctx }) => listBookings(ctx.supabaseIdentity, "learner")),
    learnerSessions: supabaseOnlyProcedure.query(({ ctx }) => listClassSessions(ctx.supabaseIdentity, "learner")),
    instructorSessions: supabaseOnlyProcedure.query(({ ctx }) => listClassSessions(ctx.supabaseIdentity, "instructor")),
    instructorBookings: supabaseOnlyProcedure.query(({ ctx }) => listBookings(ctx.supabaseIdentity, "instructor")),
    notifications: supabaseOnlyProcedure.query(({ ctx }) => listSchedulingNotifications(ctx.supabaseIdentity)),
  }),

  storage: router({
    requestUploadPermission: supabaseOnlyProcedure.input(z.object({ bucket: z.enum([PRIVATE_BUCKETS.credentials, PRIVATE_BUCKETS.instructorMedia, PRIVATE_BUCKETS.courseMedia, PRIVATE_BUCKETS.classroomResources]), filename: z.string().min(1).max(255), mimeType: z.string().min(1).max(100), sizeBytes: z.number().int().positive(), courseId: z.string().uuid().optional(), sessionId: z.string().uuid().optional() })).mutation(({ ctx, input }) => requestUploadPermission(ctx.supabaseIdentity, input as { bucket: PrivateBucket; filename: string; mimeType: string; sizeBytes: number; courseId?: string; sessionId?: string })),
    createSignedDownloadUrl: supabaseOnlyProcedure.input(z.object({ bucket: z.enum([PRIVATE_BUCKETS.credentials, PRIVATE_BUCKETS.instructorMedia, PRIVATE_BUCKETS.courseMedia, PRIVATE_BUCKETS.classroomResources]), objectPath: z.string().min(1).max(500), expiresInSeconds: z.number().int().min(60).max(900).optional() })).query(({ ctx, input }) => createSignedDownloadUrl(ctx.supabaseIdentity, input as { bucket: PrivateBucket; objectPath: string; expiresInSeconds?: number })),
    deletePrivateObject: supabaseOnlyProcedure.input(z.object({ bucket: z.enum([PRIVATE_BUCKETS.credentials, PRIVATE_BUCKETS.instructorMedia, PRIVATE_BUCKETS.courseMedia, PRIVATE_BUCKETS.classroomResources]), objectPath: z.string().min(1).max(500) })).mutation(({ ctx, input }) => deletePrivateObject(ctx.supabaseIdentity, input as { bucket: PrivateBucket; objectPath: string })),
  }),

  // The operations desk. Every procedure re-verifies the administrator role against
  // `user_roles` on the server before it reads anything; the namespace itself grants
  // nothing, and a learner or instructor reaching one gets the same FORBIDDEN envelope
  // the database would give them.
  admin: router({
    overview: supabaseOnlyProcedure.query(({ ctx }) => getAdminOverview(ctx.supabaseIdentity)),

    // ---- instructor verification ----
    instructors: supabaseOnlyProcedure
      .input(z.object({ search: z.string().max(120).optional(), status: z.enum(INSTRUCTOR_FILTERS).optional(), limit: z.number().int().min(1).max(50).optional(), offset: z.number().int().min(0).optional() }).optional())
      .query(({ ctx, input }) => listInstructors(ctx.supabaseIdentity, input ?? {})),
    instructor: supabaseOnlyProcedure
      .input(z.object({ instructorId: z.string().uuid() }))
      .query(({ ctx, input }) => getInstructorDetail(ctx.supabaseIdentity, input)),
    decideInstructor: supabaseOnlyProcedure
      .input(z.object({ instructorId: z.string().uuid(), decision: z.enum(INSTRUCTOR_DECISIONS), note: z.string().max(2000).optional() }))
      .mutation(({ ctx, input }) => decideInstructor(ctx.supabaseIdentity, input)),
    reviewCredential: supabaseOnlyProcedure
      .input(z.object({ credentialId: z.string().uuid(), status: z.enum(CREDENTIAL_DECISIONS), note: z.string().max(2000).optional() }))
      .mutation(({ ctx, input }) => reviewCredential(ctx.supabaseIdentity, input)),
    /* A course carries its own mark rather than inheriting its teacher's. The procedure checks the
       caller's role for a readable refusal; the 0035 trigger is what actually enforces it. */
    /* Reading them is a reviewer's alone; the procedure checks the role and the policy enforces it. */
    contactMessages: supabaseOnlyProcedure
      .input(z.object({ status: z.string().max(20).optional(), limit: z.number().int().min(1).max(100).optional(), offset: z.number().int().min(0).optional() }).optional())
      .query(({ ctx, input }) => listContactMessages(ctx.supabaseIdentity, input ?? {})),
    verifyCourse: supabaseOnlyProcedure
      .input(z.object({ courseId: z.string().uuid(), status: z.enum(COURSE_VERIFICATION_STATUSES) }))
      .mutation(({ ctx, input }) => setCourseVerification(ctx.supabaseIdentity, input)),

    // ---- blog management. Every one of these calls requireAdmin internally. ----
    blogArticles: supabaseOnlyProcedure
      .input(z.object({ search: z.string().max(120).optional(), status: z.enum(ARTICLE_FILTERS).optional(), category: z.string().max(80).optional(), subject: z.string().max(80).optional(), sort: z.enum(ARTICLE_SORTS).optional(), limit: z.number().int().min(1).max(50).optional(), offset: z.number().int().min(0).optional() }).optional())
      .query(({ ctx, input }) => listBlogArticles(ctx.supabaseIdentity, input ?? {})),
    blogArticle: supabaseOnlyProcedure
      .input(z.object({ id: z.string().uuid() }))
      .query(({ ctx, input }) => getBlogArticle(ctx.supabaseIdentity, input)),
    saveBlogArticle: supabaseOnlyProcedure
      .input(articleInput)
      .mutation(({ ctx, input }) => saveBlogArticle(ctx.supabaseIdentity, input)),
    setBlogArticleStatus: supabaseOnlyProcedure
      .input(z.object({ id: z.string().uuid(), action: z.enum(ARTICLE_ACTIONS) }))
      .mutation(({ ctx, input }) => setBlogArticleStatus(ctx.supabaseIdentity, input)),
    deleteBlogArticle: supabaseOnlyProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(({ ctx, input }) => deleteBlogArticle(ctx.supabaseIdentity, input)),

    // ---- course management ----
    courses: supabaseOnlyProcedure
      .input(z.object({ search: z.string().max(120).optional(), status: z.enum(COURSE_FILTERS).optional(), limit: z.number().int().min(1).max(50).optional(), offset: z.number().int().min(0).optional() }).optional())
      .query(({ ctx, input }) => listCourses(ctx.supabaseIdentity, input ?? {})),
    course: supabaseOnlyProcedure
      .input(z.object({ courseId: z.string().uuid() }))
      .query(({ ctx, input }) => getCourseDetail(ctx.supabaseIdentity, input)),
    decideCourse: supabaseOnlyProcedure
      .input(z.object({ courseId: z.string().uuid(), action: z.enum(COURSE_ACTIONS), note: z.string().max(2000).optional() }))
      .mutation(({ ctx, input }) => decideCourse(ctx.supabaseIdentity, input)),

    // ---- user management. No procedure here writes user_roles, by design. ----
    users: supabaseOnlyProcedure
      .input(z.object({ search: z.string().max(120).optional(), role: z.enum(USER_ROLE_FILTERS).optional(), status: z.enum(USER_STATUS_FILTERS).optional(), limit: z.number().int().min(1).max(50).optional(), offset: z.number().int().min(0).optional() }).optional())
      .query(({ ctx, input }) => listUsers(ctx.supabaseIdentity, input ?? {})),
    user: supabaseOnlyProcedure
      .input(z.object({ userId: z.string().uuid() }))
      .query(({ ctx, input }) => getUserDetail(ctx.supabaseIdentity, input)),
    setAccountStatus: supabaseOnlyProcedure
      .input(z.object({ userId: z.string().uuid(), status: z.enum(SETTABLE_ACCOUNT_STATUSES), reason: z.string().min(1).max(2000) }))
      .mutation(({ ctx, input }) => setAccountStatus(ctx.supabaseIdentity, input)),

    // ---- content and review moderation ----
    reviews: supabaseOnlyProcedure
      .input(z.object({ search: z.string().max(120).optional(), status: z.enum(REVIEW_FILTERS).optional(), limit: z.number().int().min(1).max(50).optional(), offset: z.number().int().min(0).optional() }).optional())
      .query(({ ctx, input }) => listReviews(ctx.supabaseIdentity, input ?? {})),
    decideReview: supabaseOnlyProcedure
      .input(z.object({ reviewId: z.string().uuid(), action: z.enum(REVIEW_ACTIONS), note: z.string().max(2000).optional() }))
      .mutation(({ ctx, input }) => decideReview(ctx.supabaseIdentity, input)),
    reports: supabaseOnlyProcedure
      .input(z.object({ kind: z.enum([...REPORT_KINDS, "all"] as const).optional(), status: z.string().max(40).optional(), limit: z.number().int().min(1).max(50).optional(), offset: z.number().int().min(0).optional() }).optional())
      .query(({ ctx, input }) => listReports(ctx.supabaseIdentity, input ?? {})),
    resolveReport: supabaseOnlyProcedure
      .input(z.object({ reportId: z.string().uuid(), kind: z.enum(REPORT_KINDS), outcome: z.enum(REPORT_OUTCOMES), note: z.string().max(2000).optional() }))
      .mutation(({ ctx, input }) => resolveReport(ctx.supabaseIdentity, input)),
    cases: supabaseOnlyProcedure
      .input(z.object({ status: z.enum([...CASE_STATUSES, "all"] as const).optional(), limit: z.number().int().min(1).max(50).optional(), offset: z.number().int().min(0).optional() }).optional())
      .query(({ ctx, input }) => listCases(ctx.supabaseIdentity, input ?? {})),
    decideCase: supabaseOnlyProcedure
      .input(z.object({ caseId: z.string().uuid(), status: z.enum(CASE_STATUSES), reason: z.string().min(1).max(2000) }))
      .mutation(({ ctx, input }) => decideCase(ctx.supabaseIdentity, input)),
    contentInventory: supabaseOnlyProcedure.query(({ ctx }) => getContentInventory(ctx.supabaseIdentity)),

    // ---- booking and support review. Read-only: no admin override exists. ----
    support: supabaseOnlyProcedure
      .input(z.object({ scope: z.enum(SUPPORT_SCOPES).optional(), status: z.string().max(40).optional(), limit: z.number().int().min(1).max(50).optional(), offset: z.number().int().min(0).optional() }).optional())
      .query(({ ctx, input }) => listSupportRecords(ctx.supabaseIdentity, input ?? {})),
    supportSummary: supabaseOnlyProcedure.query(({ ctx }) => getSupportSummary(ctx.supabaseIdentity)),

    // ---- records. audit_logs has no write policy, so there is no mutation here. ----
    auditLogs: supabaseOnlyProcedure
      .input(z.object({ action: z.string().max(80).optional(), entityType: z.string().max(80).optional(), actorId: z.string().uuid().optional(), since: z.string().max(40).optional(), until: z.string().max(40).optional(), limit: z.number().int().min(1).max(50).optional(), offset: z.number().int().min(0).optional() }).optional())
      .query(({ ctx, input }) => listAuditLogs(ctx.supabaseIdentity, input ?? {})),
    systemStatus: supabaseOnlyProcedure.query(({ ctx }) => getSystemStatus(ctx.supabaseIdentity)),
    settings: supabaseOnlyProcedure.query(({ ctx }) => getAdminSettings(ctx.supabaseIdentity)),
  }),
  // Reviewed decisions. Every procedure re-checks the caller role server-side; the router
  // namespace is organisational only and grants nothing on its own.
  adminReview: router({
    instructorQueue: supabaseOnlyProcedure.query(({ ctx }) => listInstructorsForReview(ctx.supabaseIdentity)),
    courseQueue: supabaseOnlyProcedure.query(({ ctx }) => listCoursesForReview(ctx.supabaseIdentity)),
    setCourseDecision: supabaseOnlyProcedure
      .input(z.object({ courseId: z.string().uuid(), decision: z.enum(COURSE_REVIEW_DECISIONS), note: z.string().max(2000).optional() }))
      .mutation(({ ctx, input }) => setCourseReviewDecision(ctx.supabaseIdentity, input)),
    setInstructorVerification: supabaseOnlyProcedure
      .input(z.object({ instructorId: z.string().uuid(), status: z.enum(VERIFICATION_STATUSES), note: z.string().max(2000).optional() }))
      .mutation(({ ctx, input }) => setInstructorVerification(ctx.supabaseIdentity, input)),
  }),
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // TODO: add feature routers here, e.g.
  // todo: router({
  //   list: protectedProcedure.query(({ ctx }) =>
  //     db.getUserTodos(ctx.user.id)
  //   ),
  // }),
});

export type AppRouter = typeof appRouter;
