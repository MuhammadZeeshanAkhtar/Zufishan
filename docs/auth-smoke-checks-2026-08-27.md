# Auth smoke checks — 2026-08-27

The unauthenticated learner route `/dashboard/learner` redirected to `/login?returnTo=%2Fdashboard%2Flearner`. The login page rendered the Supabase Auth boundary, email/password controls, safe return context, and no private learner data.

The unauthenticated admin route `/admin/overview` redirected to `/login?returnTo=%2Fadmin%2Foverview`. The login page rendered the same public Auth boundary and no privileged admin content.

No credentials were entered, no identities were created, and no data was changed. Both checks confirm safe unauthenticated routing in the running preview.
