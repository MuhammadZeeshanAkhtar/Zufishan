# Scheduling runtime validation — 2026-08-27

After the scheduling persistence and UI changes, strict TypeScript, focused scheduling tests, the full Vitest suite, and the production build passed. Protected learner schedule and instructor availability route smoke checks redirected to login without rendering private records.

Post-change log review found no application server errors, failed scheduling requests, Supabase key names, database URLs, service-role secret names, or provider tokens. Analytics requests returned HTTP 200; analytics cache tokens were not retained or reported here.

The production build emitted the existing non-blocking large-main-chunk warning. Live classroom, payments, email, push, and Realtime remain provider setup-needed; signed identity RLS/Storage matrix tests remain blocked until owner-created staging identities exist.
