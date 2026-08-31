export type Locale = "en" | "ur" | "ar";

export const AI_TUTOR_LANGUAGES = ["Arabic", "English", "Urdu", "French", "Turkish", "Spanish"] as const;
export const AI_TUTOR_MODES = ["conversation", "vocabulary", "grammar", "reading", "writing", "translation", "pronunciation", "lesson"] as const;
export const AI_TUTOR_LEVELS = ["beginner", "elementary", "intermediate", "upper_intermediate", "advanced"] as const;
export const AI_TUTOR_GOALS = ["conversation", "vocabulary", "grammar", "reading", "writing", "pronunciation", "exam_preparation", "course_support"] as const;
export const AI_TUTOR_CORRECTION_STYLES = ["gentle", "standard", "detailed"] as const;
export type TutorMode = (typeof AI_TUTOR_MODES)[number];
