import { COOKIE_NAME } from "@shared/const";
import { claimRequestedPublicRole } from "./supabase-auth";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, supabaseOnlyProcedure } from "./_core/trpc";
import { z } from "zod";
import { createCourse, createCredential, deleteOwnCredential, createEnrolment, createHifzPlan, createHifzReview, createRequirement, createRequirementResponse, createCourseLesson, createCourseModule, deleteCourseLesson, deleteCourseModule, getLearnerWorkspace, getOwnCourseStructure, getOwnCoreProfiles, getPublicPublishedCourse, getPublicPublishedCourseById, getPublicPublishedLessonMetadata, getPublicPublishedRequirement, listPublicPublishedRequirements, listPublishedRequirements, listPublicPublishedCourses, listCourseFilterFacets, updateOwnRequirementGoal, updateOwnRequirementResponseStatus, listCourseLessons, listCourseModules, listHifzPlans, submitOwnCourseForReview, updateCourseLesson, updateCourseModule, updateOwnCourse, listHifzReviews, listOwnAvailability, listOwnCredentials, listOwnCourses, listOwnEnrolments, listOwnProgress, listOwnRequirements, listOwnRequirementResponses, updateOwnInstructorProfile, updateOwnLocale, updateOwnProfile, updateOwnLearnerProfile, upsertLessonProgress, listOwnConversations, listConversationMessages, createConversationMessage, createAdvancedHifzPlan, updateAdvancedHifzPlan, listAdvancedHifzPlans, createHifzRecord, listOwnHifzRecords, updateOwnDraftHifzRecord, submitHifzRecordForReview, listAssignedLearnerHifzRecords, listAssignedHifzReviews, reviewHifzRecord, calculateHifzProgress, createHifzReminder, listHifzReminders } from "./supabase-core";
import { createSignedDownloadUrl, deletePrivateObject, requestUploadPermission, PRIVATE_BUCKETS, type PrivateBucket } from "./supabase-storage";
import { listInstructorsForReview, setInstructorVerification, VERIFICATION_STATUSES } from "./instructor-verification";
import { listCoursesForReview, setCourseReviewDecision, COURSE_REVIEW_DECISIONS } from "./course-review";
import { startConversation } from "./conversation-start";
import { rescheduleBooking, cancelBooking, completeBooking, BOOKING_OUTCOMES } from "./booking-lifecycle";
import { openSessionForBooking, setSessionStatus, recordOwnAttendance, listOwnSessions, SESSION_STATUSES } from "./class-session-lifecycle";
import { createReview, listOwnReviews, listInstructorReviews } from "./reviews";
import { listCourseQuizzes, createQuiz, submitQuizAttempt, listCourseAssignments, createAssignment, submitAssignment, gradeSubmission } from "./assessments";
import { getSupabaseHealth } from "./supabase-connection";
import { getProductionConfigReport } from "./production-config";
import { acceptTrialRequest, cancelTrialOrBooking, confirmProposedTime, createAvailabilityInterval, createTrialRequest, declineTrialRequest, deleteAvailabilityInterval, getAvailableSlots, getOwnTrialRequest, getPublicInstructorBySlug, listPublicInstructors, listInstructorFilterFacets, listBookings, listClassSessions, listInstructorAvailability, listSchedulingNotifications, listTrialRequests, proposeNewTrialTime, updateAvailabilityInterval } from "./scheduling";
import { AI_TUTOR_CORRECTION_STYLES, AI_TUTOR_GOALS, AI_TUTOR_LEVELS, AI_TUTOR_MODES, deleteTutorHistory, getTutorConversation, getTutorPreferences, listTutorConversations, listTutorMessages, listTutorProgress, listTutorSavedItems, reportTutorConversation, saveTutorItem, sendTutorMessage, createTutorConversation, upsertTutorPreferences } from "./ai-tutor";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  supabase: router({
    health: publicProcedure.query(() => getSupabaseHealth()),
    productionConfig: publicProcedure.query(() => getProductionConfigReport()),
  }),
  supabaseCore: router({
    publicCourseById: publicProcedure.input(z.object({ courseId: z.string().uuid() })).query(({ input }) => getPublicPublishedCourseById(input.courseId)),
    publicLessonMetadata: publicProcedure.input(z.object({ slug: z.string().min(1).max(160), lessonId: z.string().uuid() })).query(({ input }) => getPublicPublishedLessonMetadata(input.slug, input.lessonId)),
    profiles: supabaseOnlyProcedure.query(({ ctx }) => getOwnCoreProfiles(ctx.supabaseIdentity)),
    claimPublicRole: supabaseOnlyProcedure.mutation(({ ctx }) => claimRequestedPublicRole(ctx.supabaseIdentity)),
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
    updateInstructorProfile: supabaseOnlyProcedure.input(z.object({ publicDisplayName: z.string().min(1).max(160), publicSlug: z.string().regex(/^[a-z0-9-]+$/).max(120), subjects: z.array(z.string().min(1).max(120)).max(20), levels: z.array(z.string().min(1).max(80)).max(12), teachingLanguages: z.array(z.string().min(1).max(80)).max(12), yearsExperience: z.number().int().min(0).max(100).optional(), teachingApproach: z.string().max(10000).optional(), hourlyRateMinor: z.number().int().nonnegative().optional(), currency: z.string().length(3).optional(), availabilitySummary: z.string().max(1000).optional(), profileVisibility: z.enum(["public", "private"]), preferredLanguage: z.string().min(2).max(80), fullName: z.string().max(160).optional(), country: z.string().max(80).optional(), city: z.string().max(120).optional(), timezone: z.string().max(80).optional(), bio: z.string().max(2000).optional(), gender: z.enum(["male", "female"]).optional(), sect: z.enum(["Sunni", "Shia", "Other", "Prefer not to say"]).optional(), hasIjazah: z.boolean().optional() })).mutation(({ ctx, input }) => updateOwnInstructorProfile(ctx.supabaseIdentity, input)),
    availability: supabaseOnlyProcedure.query(({ ctx }) => listOwnAvailability(ctx.supabaseIdentity)),
    requirements: supabaseOnlyProcedure.query(({ ctx }) => listOwnRequirements(ctx.supabaseIdentity)),
    publishedRequirements: supabaseOnlyProcedure.query(({ ctx }) => listPublishedRequirements(ctx.supabaseIdentity)),
    createRequirement: supabaseOnlyProcedure.input(z.object({ subject: z.string().min(1).max(120), level: z.string().min(1).max(80), goal: z.string().min(1).max(5000), preferredLanguage: z.string().min(1).max(80), timezone: z.string().min(1).max(80), availability: z.string().min(1).max(500), budgetMinor: z.number().int().nonnegative().optional(), currency: z.string().length(3).optional() })).mutation(({ ctx, input }) => createRequirement(ctx.supabaseIdentity, input)),
    updateRequirementGoal: supabaseOnlyProcedure.input(z.object({ requirementId: z.string().uuid(), goal: z.string().trim().min(1).max(5000) })).mutation(({ ctx, input }) => updateOwnRequirementGoal(ctx.supabaseIdentity, input)),
    requirementResponses: supabaseOnlyProcedure.input(z.object({ requirementId: z.string().uuid() })).query(({ ctx, input }) => listOwnRequirementResponses(ctx.supabaseIdentity, input.requirementId)),
    respondToRequirement: supabaseOnlyProcedure.input(z.object({ requirementId: z.string().uuid(), message: z.string().trim().min(1).max(5000) })).mutation(({ ctx, input }) => createRequirementResponse(ctx.supabaseIdentity, input)),
    updateRequirementResponseStatus: supabaseOnlyProcedure.input(z.object({ responseId: z.string().uuid(), status: z.enum(["pending", "shortlisted", "accepted", "rejected", "withdrawn"]) })).mutation(({ ctx, input }) => updateOwnRequirementResponseStatus(ctx.supabaseIdentity, input)),
    courses: supabaseOnlyProcedure.query(({ ctx }) => listOwnCourses(ctx.supabaseIdentity)),
    credentials: supabaseOnlyProcedure.query(({ ctx }) => listOwnCredentials(ctx.supabaseIdentity)),
    createCredential: supabaseOnlyProcedure.input(z.object({ objectPath: z.string().min(1).max(500), mimeType: z.string().min(1).max(100), sizeBytes: z.number().int().positive() })).mutation(({ ctx, input }) => createCredential(ctx.supabaseIdentity, input)),
    deleteCredential: supabaseOnlyProcedure.input(z.object({ credentialId: z.string().uuid() })).mutation(({ ctx, input }) => deleteOwnCredential(ctx.supabaseIdentity, input.credentialId)),
    createCourse: supabaseOnlyProcedure.input(z.object({ slug: z.string().regex(/^[a-z0-9-]+$/).max(120), title: z.string().min(1).max(180), description: z.string().min(1).max(10000), subject: z.string().min(1).max(120), level: z.string().min(1).max(80), language: z.string().min(1).max(80) })).mutation(({ ctx, input }) => createCourse(ctx.supabaseIdentity, input)),
    updateCourse: supabaseOnlyProcedure.input(z.object({ courseId: z.string().uuid(), slug: z.string().regex(/^[a-z0-9-]+$/).max(120), title: z.string().min(1).max(180), description: z.string().min(1).max(10000), subject: z.string().min(1).max(120), level: z.string().min(1).max(80), language: z.string().min(1).max(80) })).mutation(({ ctx, input }) => updateOwnCourse(ctx.supabaseIdentity, input.courseId, input)),
    submitCourseForReview: supabaseOnlyProcedure.input(z.object({ courseId: z.string().uuid() })).mutation(({ ctx, input }) => submitOwnCourseForReview(ctx.supabaseIdentity, input.courseId)),
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

  schedulingPublic: router({
    instructorBySlug: publicProcedure.input(z.object({ slug: z.string().min(1).max(120) })).query(({ input }) => getPublicInstructorBySlug(input.slug)),
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
      sort: z.enum(["relevance", "rate_asc", "rate_desc", "experience_desc"]).optional(),
      limit: z.number().int().min(1).max(48).optional(),
      offset: z.number().int().min(0).optional(),
    }).optional()).query(({ input }) => listPublicInstructors(input ?? {})),
    instructorFacets: publicProcedure.query(() => listInstructorFilterFacets()),
    instructorReviews: publicProcedure.input(z.object({ instructorId: z.string().uuid() })).query(({ input }) => listInstructorReviews(input.instructorId)),
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
    courseBySlug: publicProcedure.input(z.object({ slug: z.string().min(1).max(160) })).query(({ input }) => getPublicPublishedCourse(input.slug)),
  }),

  scheduling: router({
    availability: supabaseOnlyProcedure.query(({ ctx }) => listInstructorAvailability(ctx.supabaseIdentity)),
    learnerTrials: supabaseOnlyProcedure.query(({ ctx }) => listTrialRequests(ctx.supabaseIdentity, "learner")),
    trialDetail: supabaseOnlyProcedure.input(z.object({ requestId: z.string().uuid() })).query(({ ctx, input }) => getOwnTrialRequest(ctx.supabaseIdentity, input.requestId)),
    instructorTrials: supabaseOnlyProcedure.query(({ ctx }) => listTrialRequests(ctx.supabaseIdentity, "instructor")),
    createAvailability: supabaseOnlyProcedure.input(z.object({ weekday: z.number().int().min(0).max(6), startLocal: z.string().regex(/^\\d{2}:\\d{2}$/), endLocal: z.string().regex(/^\\d{2}:\\d{2}$/), timezone: z.string().min(1).max(80), active: z.boolean().optional(), bufferMinutes: z.number().int().min(0).max(1440).optional(), minimumNoticeMinutes: z.number().int().min(0).max(10080).optional(), availableOn: z.string().date().optional(), exceptionType: z.enum(["weekly", "date_exception", "break"]).optional(), isBreak: z.boolean().optional(), courseId: z.string().uuid().optional() })).mutation(({ ctx, input }) => createAvailabilityInterval(ctx.supabaseIdentity, input)),
    updateAvailability: supabaseOnlyProcedure.input(z.object({ id: z.string().uuid(), weekday: z.number().int().min(0).max(6).optional(), startLocal: z.string().regex(/^\\d{2}:\\d{2}$/).optional(), endLocal: z.string().regex(/^\\d{2}:\\d{2}$/).optional(), timezone: z.string().min(1).max(80).optional(), active: z.boolean().optional(), bufferMinutes: z.number().int().min(0).max(1440).optional(), minimumNoticeMinutes: z.number().int().min(0).max(10080).optional(), availableOn: z.string().date().nullable().optional(), exceptionType: z.enum(["weekly", "date_exception", "break"]).optional(), isBreak: z.boolean().optional(), courseId: z.string().uuid().nullable().optional() })).mutation(({ ctx, input }) => { const { id, ...changes } = input; return updateAvailabilityInterval(ctx.supabaseIdentity, id, changes); }),
    deleteAvailability: supabaseOnlyProcedure.input(z.object({ id: z.string().uuid() })).mutation(({ ctx, input }) => deleteAvailabilityInterval(ctx.supabaseIdentity, input.id)),
    availableSlots: supabaseOnlyProcedure.input(z.object({ instructorId: z.string().uuid(), startDate: z.string().date(), endDate: z.string().date(), learnerTimezone: z.string().min(1).max(80), durationMinutes: z.number().int().min(15).max(180).optional() })).query(({ ctx, input }) => getAvailableSlots(ctx.supabaseIdentity, input)),
    createTrial: supabaseOnlyProcedure.input(z.object({ instructorId: z.string().uuid(), courseId: z.string().uuid().optional(), requirementId: z.string().uuid().optional(), subject: z.string().min(1).max(120), learnerTimezone: z.string().min(1).max(80), instructorTimezone: z.string().min(1).max(80), requestedStartAt: z.string().datetime({ offset: true }), requestedEndAt: z.string().datetime({ offset: true }), learnerMessage: z.string().min(1).max(5000), idempotencyKey: z.string().min(8).max(160), learnerLocale: z.enum(["en", "ur", "ar"]).optional() })).mutation(({ ctx, input }) => createTrialRequest(ctx.supabaseIdentity, input)),
    acceptTrial: supabaseOnlyProcedure.input(z.object({ requestId: z.string().uuid() })).mutation(({ ctx, input }) => acceptTrialRequest(ctx.supabaseIdentity, input.requestId)),
    declineTrial: supabaseOnlyProcedure.input(z.object({ requestId: z.string().uuid(), reason: z.string().min(1).max(1000) })).mutation(({ ctx, input }) => declineTrialRequest(ctx.supabaseIdentity, input.requestId, input.reason)),
    proposeTime: supabaseOnlyProcedure.input(z.object({ requestId: z.string().uuid(), startAt: z.string().datetime({ offset: true }), endAt: z.string().datetime({ offset: true }), instructorTimezone: z.string().min(1).max(80) })).mutation(({ ctx, input }) => proposeNewTrialTime(ctx.supabaseIdentity, input.requestId, input)),
    confirmTime: supabaseOnlyProcedure.input(z.object({ requestId: z.string().uuid() })).mutation(({ ctx, input }) => confirmProposedTime(ctx.supabaseIdentity, input.requestId)),
    cancel: supabaseOnlyProcedure.input(z.object({ id: z.string().uuid(), reason: z.string().min(1).max(1000) })).mutation(({ ctx, input }) => cancelTrialOrBooking(ctx.supabaseIdentity, input.id, input.reason)),
    sessions: supabaseOnlyProcedure.query(({ ctx }) => listOwnSessions(ctx.supabaseIdentity)),
    myReviews: supabaseOnlyProcedure.query(({ ctx }) => listOwnReviews(ctx.supabaseIdentity)),
    courseQuizzes: supabaseOnlyProcedure.input(z.object({ courseId: z.string().uuid() })).query(({ ctx, input }) => listCourseQuizzes(ctx.supabaseIdentity, input.courseId)),
    createQuiz: supabaseOnlyProcedure
      .input(z.object({ courseId: z.string().uuid(), title: z.string().trim().min(1).max(180), questions: z.array(z.object({ id: z.string().min(1).max(80), prompt: z.string().max(2000).optional(), answer: z.string().max(500).optional() })).min(1).max(100) }))
      .mutation(({ ctx, input }) => createQuiz(ctx.supabaseIdentity, input)),
    submitQuizAttempt: supabaseOnlyProcedure
      .input(z.object({ quizId: z.string().uuid(), answers: z.record(z.string(), z.unknown()) }))
      .mutation(({ ctx, input }) => submitQuizAttempt(ctx.supabaseIdentity, input)),
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
