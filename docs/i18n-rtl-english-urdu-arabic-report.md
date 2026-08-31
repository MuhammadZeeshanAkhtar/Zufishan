# Noor Ilm English–Urdu–Arabic i18n and RTL Handoff

## Scope

This iteration extends the existing Noor Ilm LMS and Language Learning AI Tutor with a typed English (`en`), Urdu (`ur`), and Arabic (`ar`) locale foundation. No unrelated LMS modules were added, and the existing Supabase Auth, RLS, Storage, and AI Tutor safety boundaries were preserved.

## Implemented

The client now has a typed translation catalogue, stable translation keys, terminology glossary, interpolation support, English fallback behavior, locale-aware date/number/currency formatters, local persistence, a cookie hint, and document `lang`/`dir` updates. Urdu and Arabic use RTL direction; English uses LTR. The shared selector is wired into the public header and authenticated dashboard mobile header. The existing `?lang=en|ur|ar` preview path remains supported, and the explicit RTL preview query remains available.

Launch-critical public surfaces now use locale keys for the public header, homepage hero, readiness label, hero card, study sections, final homepage CTA, footer navigation, authentication headings, labels, placeholders, action buttons, account links, and Supabase/demo status notice. The AI Tutor already uses translated setup, progress, boundary, and provider-state content and now exposes response and explanation language preferences in its server contract.

Authenticated locale selection attempts to update `profiles.preferred_locale` through the browser-safe Supabase publishable client only when a signed-in user is available. Signed-out and demo users remain local-only. The additive migration is `supabase/migrations/0006_preferred_locale.sql`; AI Tutor language preference columns are in `supabase/migrations/0007_ai_tutor_response_languages.sql`.

## Validation

`pnpm check` passed after the latest changes. The full Vitest suite passed: 18 test files and 87 tests. The production build passed, with the existing non-blocking Vite warning that the main client chunk is larger than 500 kB. The browser bundle secret scan passed and found no service-role key, database URL, service-role token, or embedded PostgreSQL credential. Representative desktop and 375px mobile screenshots were captured for English, Urdu, and Arabic homepage/authentication surfaces. RTL layout direction and translated auth status messaging were visually confirmed on Urdu and Arabic mobile screens.

## Remaining work

This is not a claim of complete site-wide translation. Several public informational pages, onboarding forms, course catalogue controls, course details, help/contact pages, dashboard detail views, classroom controls, admin surfaces, static image alt text, and some footer/body copy still contain hard-coded English. User-generated course, instructor, and learner content should remain untranslated unless a product translation policy is defined. SEO metadata is only partially localized and requires route-by-route verification.

The profile locale synchronization path is implemented but has not been proven with a real signed staging identity in this iteration. A signed cross-user/cross-role RLS test remains pending, as do native-speaker linguistic review, assistive-technology certification, and comprehensive keyboard/focus checks in all three locales.

## Recommended next sequence

1. Complete the remaining static catalogue and route metadata keys, then migrate public informational pages and authenticated shells in route groups.
2. Add signed staging tests for profile locale persistence and confirm that one user cannot update another profile.
3. Review Urdu and Arabic terminology with native speakers, including glossary consistency, numerals, pluralization, and mixed-script technical labels.
4. Run full mobile/tablet/desktop screenshots for every public, learner, instructor, admin, classroom, and AI Tutor route in all three locales before the multilingual checkpoint.


## Latest iteration update

The actual `/requirements` route is mounted from `RequirementsExperience.tsx`, not the older public requirements component. Its listing, detail actions, learner form, instructor-response surface, shared navigation, privacy notice, consent copy, demo states, and response language are now connected to the English, Urdu, and Arabic catalogue. The shared stylesheet also includes opt-in logical-direction helpers for inline icon spacing, directional icon mirroring, and start/end alignment.

The current automated suite remains green at 87 tests. Full site-wide migration of every authenticated dashboard, classroom, admin, and operational surface is still a separate remaining tranche; no claim of complete catalogue coverage is made here. Human review of Urdu and Arabic terminology remains required before production launch.
