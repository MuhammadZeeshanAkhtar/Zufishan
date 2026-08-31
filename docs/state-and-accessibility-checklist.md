# Noor Ilm state and accessibility verification

## State coverage matrix

The final pass reviewed the reusable experience boundaries and their visible states. Every connected service still has an explicit demo/setup label instead of implying that an unavailable provider is live.

| State | Verified treatment | Relevant surfaces |
|---|---|---|
| Loading | Route guards show a checking-session state; data experiences use local service results without blocking the whole shell | Dashboard, classroom, admin |
| Empty / not enough data | Empty cards explain why no connected records are present and do not invent totals, reviews, or analytics | Reviews, reports, analytics, support |
| Error / validation | Forms render inline error text with `role="alert"`; invalid sensitive actions are rejected before the boundary call | Auth, onboarding, requirements, reviews, reports, admin |
| Forbidden / not found | Role guards redirect or render protected-administration denial; unknown routes fall through to the not-found view | Dashboard, classroom, admin, wildcard routes |
| Demo / setup-needed | Copy explicitly names demo mode, unavailable persistence, provider, Storage, realtime, email, payment, and payout boundaries | All connected-feature placeholders |
| Offline / provider unavailable | Classroom, realtime, Storage, email, payment, and payout surfaces communicate that setup/provider connectivity is required; no fake success is shown | Classroom, messages, notifications, finance |
| Payment / payout required | Ledger, wallet, earnings, and withdrawal flows remain restricted/setup states and never collect bank credentials | Learner and instructor finance; admin finance |
| Coming soon | Placeholder actions explain the next connected service rather than silently doing nothing | Support, analytics, assignments, certificates, integrations |

Production connected clients must add network retry, offline caching, and provider-specific error codes at the server boundary; the demo release intentionally stops before claiming those integrations.

## Accessibility and RTL pass

The reviewed UI retains semantic headings, visible focus rings, labeled form fields, keyboard-reachable buttons and links, inline validation announcements, and reduced-motion CSS behavior. The viewport permits user zoom. Images have meaningful alt text when informative and empty alt text when decorative. Tables and status chips use readable labels rather than color alone. The admin shell does not force LTR, so the app-level `?rtl=1` preview direction is inherited by admin, classroom, and dashboard layouts.

Manual evidence includes desktop and mobile previews at 320, 375, 768, 1024, 1280, and 1440 pixels, with explicit RTL preview checks on classroom, reviews, and admin routes. The remaining production gate is a human keyboard-only, screen-reader, color-contrast, and reduced-motion pass in the target browser/assistive-technology matrix; this cannot be truthfully simulated by Vitest or screenshots alone.
