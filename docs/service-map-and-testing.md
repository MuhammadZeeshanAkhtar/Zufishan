# Noor Ilm service map, testing, and deployment checklist

## Service map

| Capability | Current client boundary | Future connected boundary | Private data rule |
|---|---|---|---|
| Auth and profiles | `AuthContext`, `auth-models` | Supabase Auth, profiles, role claims | Never trust client role alone |
| Courses and progress | `course-management-data` | Courses, modules, lessons, enrolments, progress RPCs | Owner/member/published scope |
| Classroom | `classroom-data`, `ClassroomExperience` | LiveKit/session provider, Realtime, Storage | Participant membership and consent |
| Messaging | `relationship-ops-data`, `RelationshipOpsExperience` | Conversations/messages RPCs and Realtime | Conversation membership only |
| Reviews/reports | `relationship-ops-data` | Completed-event eligibility, moderation queues | Published consent and case scope |
| Finance | `relationship-ops-data`, `admin-ops-data` | Payment/payout provider, ledger webhooks | Finance/admin permissions only |
| Administration | `admin-ops-data`, `AdminExperience` | Protected tRPC procedures and RLS | Least privilege, audit every mutation |
| Storage | Existing S3 helper boundary | Private Supabase Storage or managed S3 | Signed URL after authorization |
| Notifications | Typed setup-needed states | Email/push provider and preferences | User preference and delivery audit |
| Analytics | Aggregate demo states | Redacted event pipeline and dashboards | No private row-level exposure |

## Test commands

Run `pnpm check` for TypeScript, `pnpm test` for the Vitest boundary suite, and `pnpm build` for the production bundle. The current baseline is 57 passing tests across 10 files. The tests focus on pure service boundaries and do not replace browser, database, provider, or assistive-technology testing.

Before release, add staging tests for Supabase RLS using separate learner, instructor, moderator, finance, admin, and super-admin identities. Verify that every private query returns the same safe denial shape for missing and unauthorized records. Test signed URL expiry, webhook replay, duplicate review prevention, session adjustment audit events, withdrawal idempotency, and notification preference enforcement.

## Deployment checklist

| Gate | Required evidence | Current state |
|---|---|---|
| Build | `pnpm build` | Pass |
| Type safety | `pnpm check` | Pass |
| Unit boundaries | `pnpm test` | Pass: 57 tests |
| Public routes | Desktop/mobile/RTL screenshots | Reviewed |
| Protected routes | Signed-out safe gates | Reviewed |
| Production secrets | Managed environment values | External providers pending |
| Database | Migration, backup, RLS tests | Not connected |
| Storage | Private buckets and signed URLs | Not connected |
| Realtime/video | Provider token and room tests | Not connected |
| Payments/payouts | Signature and reconciliation tests | Not connected |
| Notifications | Email/push delivery tests | Not connected |
| Performance | Lighthouse/field measurements | Not measured; bundle warning documented |
| Accessibility | Keyboard/screen reader/contrast audit | Manual follow-up required |
| Monitoring | Redacted logs, error alerts, rollback | Platform follow-up required |

## Mobile contract notes

The client service boundaries use serializable IDs, status values, ISO-friendly display conversions, integer minor-unit money fields, and explicit setup/error states so future React Native or Expo clients can consume the same contracts. A mobile client should not reuse web-only routing or localStorage; it should provide secure session storage, native navigation, upload APIs, push notification permissions, and offline-safe draft persistence.

## Stop conditions

Do not enable real money, private media, live classroom, or production messaging until server authorization, RLS, provider verification, retention policy, monitoring, and rollback evidence exist. Do not treat a passing client test or screenshot as proof of database security.
