-- Noor Ilm i18n: canonical interface locale preference.
-- Additive only; existing ownership, RLS, and Storage policies are unchanged.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_locale text NOT NULL DEFAULT 'en';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_preferred_locale_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_preferred_locale_check CHECK (preferred_locale IN ('en', 'ur', 'ar'));

COMMENT ON COLUMN public.profiles.preferred_locale IS 'Noor Ilm interface locale: en, ur, or ar.';
