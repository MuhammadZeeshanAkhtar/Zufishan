# Noor Ilm permissions and operations guide

## Role model

Public signup creates only `learner` or `instructor` accounts. `moderator`, `admin`, `advisory_board`, and `super_admin` are assigned through a protected administrative process; public signup cannot claim them. The demo client keeps seeded operational identities reserved and renders admin surfaces as protected states when no assigned session is available.

| Capability | Learner | Instructor | Moderator | Admin | Super-admin |
|---|---:|---:|---:|---:|---:|
| Browse public courses/instructors | Yes | Yes | Yes | Yes | Yes |
| Manage own learner data | Yes | No | No | Restricted | Restricted |
| Manage own instructor profile/courses | No | Yes | No | Restricted | Restricted |
| Access own classroom session | Participant only | Participant only | No | No | No |
| Message conversation member | Member only | Member only | Case-scoped | Case-scoped | Case-scoped |
| Submit eligible review | Completed learner event | No | No | No | No |
| Moderate reviews/reports | No | No | Yes | Yes | Yes |
| View private aggregate analytics | No | No | Case-scoped | Yes | Yes |
| Adjust session ledger | No | No | No | No | Yes |
| Configure finance settings | No | No | No | No | Yes |
| Operate withdrawals | No | Own request only | No | Finance-scoped | Yes |
| Manage platform settings | No | No | No | Restricted | Yes |
| View append-only audit history | No | No | Case-scoped | Yes | Yes |
| Assign privileged roles | No | No | No | Restricted | Yes |

## Sensitive-action rules

Every sensitive action requires an authenticated actor, an allowed permission, a target identifier, a reason, and a confirmation state. Session adjustments require both prior and proposed values. Withdrawal operations require a provider reference or an explicit setup-needed state; the demo UI never collects bank credentials. The application should use idempotency keys and provider webhook verification for real financial mutations.

Role changes must be written as audit events and must prevent self-escalation. Moderation actions must capture the case, target, decision, reason, actor, and timestamp. Audit rows are append-only: clients and ordinary procedures must not update or delete them. Support and message reports expose only the fields needed for the assigned queue.

## Server enforcement checklist

Client route guards are UX boundaries only. The connected implementation must repeat every check in server procedures and Postgres RLS: verify the session, resolve the actor, check role and permission, scope the target by ownership or membership, validate the input, write the mutation, append an audit event, and return a redacted result. Denied requests should return a generic forbidden response without revealing whether another user or private record exists.
