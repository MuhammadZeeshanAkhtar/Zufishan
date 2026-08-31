# Noor Ilm Language Learning AI Tutor

## Implementation handoff

The Noor Ilm Language Learning AI Tutor foundation is implemented as an **LMS-only, language-practice feature**. It preserves the Quiet Geometry visual system, uses the existing Supabase bearer identity boundary, keeps provider credentials server-side, and clearly labels instructor/admin aggregate surfaces as setup-needed where the approved policy is not yet connected.

The feature does not provide Fatwas, religious rulings, authoritative Quran or Hadith answers, general assistance, official assessment, teacher impersonation, medical/legal/financial advice, or private-record retrieval. Requests for religious rulings and unrelated or unsafe requests are redirected before a provider call. Prompt-injection attempts seeking private instructions, secrets, or unrelated learner data are refused.

## Database migration

Applied through the verified server-side PostgreSQL `pg` path using `SUPABASE_DB_URL`:

`supabase/migrations/0005_ai_tutor_language_learning.sql`

The migration is idempotent for its own objects and contains no `DROP TABLE`, `DELETE`, or `TRUNCATE` statements. It created six AI Tutor tables, all in `public`, with foreign keys to the existing `profiles`, `courses`, and `lessons` tables:

| Table | Purpose | Ownership boundary |
|---|---|---|
| `ai_tutor_preferences` | Learner language, level, goals, topics, correction style, consent, difficulty, and session length | One row per learner; learner full access, admin read |
| `ai_tutor_conversations` | Private practice sessions and explicit per-conversation instructor-sharing flag | Learner owner; admin read; instructor read only for explicitly shared course context |
| `ai_tutor_messages` | Learner and AI messages, policy metadata, model version, and timestamps | Learner reads own conversation; learner writes learner messages; server-only service-role write for generated AI replies |
| `ai_tutor_progress` | Aggregate practice signals by learner, language, and practice mode | Learner full access; admin read |
| `ai_tutor_saved_items` | Learner-owned vocabulary and explanations | Learner full access only |
| `ai_tutor_reports` | Learner reports for unsafe, incorrect, out-of-scope, privacy, or other issues | Learner reports own conversations; moderator read/update |

The migration added indexes for recent learner conversations, course-linked conversations, message chronology, progress recency, saved vocabulary, and report status/date. Primary-key, uniqueness, foreign-key, check, and consent-related constraints were catalog-verified after application. PostgreSQL RLS is enabled on all six tables, with **17 feature-specific policies** in addition to the previously established LMS policy set.

## Server and provider boundary

`server/ai-tutor.ts` contains the versioned policy `language-learning-v1`, supported languages, modes, levels, goals, correction styles, prompt construction, request classification, context minimization, maximum message length of 4,000 characters, and a maximum of 20 learner turns per conversation. Only approved learner-selected context fields can be passed: bounded course title, lesson title, and vocabulary terms.

The provider call is server-only through the existing `invokeLLM` helper. The selected default model is `gpt-5-mini`, confirmed available in the live built-in catalog. An optional `AI_TUTOR_MODEL` override is read server-side only. If the provider, service-role persistence, or Supabase boundary is unavailable, the server returns a setup/unavailable state and does not display a fabricated reply.

The server first verifies the conversation and preferences through the bearer-token Supabase client and RLS. It inserts the learner message through that same user-scoped client. Only after that verification does the server use the server-only service-role helper to persist the generated AI message. Raw learner or AI content is not logged to ordinary server logs.

## tRPC procedures

The `aiTutor` namespace is registered in `server/routers.ts` behind `supabaseOnlyProcedure`:

`preferences`, `savePreferences`, `conversations`, `createConversation`, `conversation`, `messages`, `send`, `progress`, `saveItem`, `savedItems`, `report`, and `deleteHistory`.

The procedure inputs are validated with Zod. Browser code never imports server modules or service-role helpers; browser-safe constants and types live in `shared/ai-tutor.ts`.

## Routes and UI status

| Route | Access | Status |
|---|---|---|
| `/dashboard/learner/ai-tutor` | Authenticated learner | Implemented setup and consent/preferences form with persistence boundary and setup/error states |
| `/dashboard/learner/ai-tutor/practice` | Authenticated learner | Implemented practice-mode selection and conversation creation |
| `/dashboard/learner/ai-tutor/conversation/:conversationId` | Authenticated learner | Implemented private chat, safe plain-text rendering, provider/unavailable/scope/limit states, and delete-history confirmation |
| `/dashboard/learner/ai-tutor/progress` | Authenticated learner | Implemented progress summary and per-mode signals; saved-word count is connected to a future list UI boundary |
| `/dashboard/instructor/ai-tutor` | Authenticated instructor | Implemented explicit setup-needed aggregate view; no private learner data is displayed |
| `/dashboard/instructor/ai-tutor/learner/:learnerId` | Authenticated instructor | Implemented authorized placeholder view; aggregate consent policy is not yet connected |
| `/admin/ai-tutor` | Admin-protected | Implemented explicit setup-needed moderation/provider/usage operations view; no private conversation content is displayed |

The shared learner, instructor, and admin navigation models include AI Tutor links. The route guards remain separate: learner/instructor routes use the existing role guard, and the admin route uses the existing admin/super-admin guard.

## Validation evidence

The final validation run completed successfully:

| Check | Result |
|---|---|
| TypeScript (`pnpm check`) | Passed |
| Vitest (`pnpm test`) | **82 tests passed across 17 files** |
| Production build (`pnpm build`) | Passed |
| Client bundle secret scan | Passed; no service-role key, database URL, or built-in API key identifiers found in `dist/public` |
| Live built-in LLM catalog check | Passed; 10 available models reported, including `gpt-5-mini` |
| AI Tutor PostgreSQL migration | Applied successfully through server-side `pg` path |
| AI Tutor PostgreSQL catalog verification | Six tables, foreign keys, indexes, constraints, RLS, and 17 feature policies inspected read-only |
| Desktop route smoke | Seven AI Tutor/protected routes reached the existing login guard without render failure |
| Mobile/RTL route smoke | Five AI Tutor/protected routes checked at 375×812 with `?rtl=1`; signed-out guard rendered correctly |

A previous preview issue caused by importing `server/ai-tutor.ts` into browser code was fixed by moving constants/types to `shared/ai-tutor.ts`. Subsequent TypeScript, build, and screenshots passed. Historical `process is not defined` lines may remain in the browser log from the earlier failed preview; they were not reproduced after the fix.

## Remaining work before production

The following items are intentionally not claimed complete:

1. Separate staging learner, instructor, moderator, admin, and super-admin identities have not yet been supplied, so signed cross-user and cross-role CRUD/RLS tests for the new tables remain pending.
2. The provider call has not been executed against a real learner conversation in an end-to-end integration test. A provider test harness or controlled staging conversation is required.
3. Instructor aggregate analytics and the instructor learner-detail view need an approved consent-aware server procedure before displaying real learner signals.
4. Admin moderation queue, model/usage controls, retention configuration, and operational analytics need their least-privilege procedures and audit events connected.
5. Progress counters need a production update path after successful practice sessions; the current schema and read procedure are ready, but the generated-reply flow does not yet increment all progress measures.
6. Saved vocabulary needs a learner-facing list/remove interface. The server list procedure and RLS boundary exist.
7. Voice, speech-to-text, pronunciation scoring, streaming, email notifications, Realtime updates, and classroom integration remain provider/setup-needed and are not part of this completed foundation.
8. Human assistive-technology certification remains a pre-launch gate, consistent with the existing LMS readiness report.

## Suggested staging test matrix

Create separate staging identities and verify with bearer tokens: learner A can read/write only learner A preferences, conversations, messages, progress, saved items, and reports; learner B cannot enumerate or delete learner A data; an instructor cannot read a conversation unless the learner explicitly shares it and the instructor owns the related course; moderators can read/update reports but cannot read arbitrary private conversations; admins can read approved operational data but cannot self-escalate roles through AI Tutor procedures; anonymous PostgREST access returns no private rows and cannot insert records.
