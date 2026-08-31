-- Noor Ilm i18n: AI Tutor response and explanation languages.
-- Additive only; existing AI Tutor ownership, RLS, and Storage policies are unchanged.
ALTER TABLE public.ai_tutor_preferences
  ADD COLUMN IF NOT EXISTS response_language text NOT NULL DEFAULT 'en';

ALTER TABLE public.ai_tutor_preferences
  ADD COLUMN IF NOT EXISTS explanation_language text NOT NULL DEFAULT 'en';

ALTER TABLE public.ai_tutor_preferences
  DROP CONSTRAINT IF EXISTS ai_tutor_preferences_response_language_check;
ALTER TABLE public.ai_tutor_preferences
  ADD CONSTRAINT ai_tutor_preferences_response_language_check CHECK (response_language IN ('en', 'ur', 'ar'));

ALTER TABLE public.ai_tutor_preferences
  DROP CONSTRAINT IF EXISTS ai_tutor_preferences_explanation_language_check;
ALTER TABLE public.ai_tutor_preferences
  ADD CONSTRAINT ai_tutor_preferences_explanation_language_check CHECK (explanation_language IN ('en', 'ur', 'ar'));
