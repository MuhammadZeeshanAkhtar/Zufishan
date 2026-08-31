# Scheduling route smoke checks — 2026-08-27

Both protected scheduling routes were opened without an authenticated browser session and redirected safely to the login boundary without rendering private records or changing data.

| Route | Observed result |
|---|---|
| `/dashboard/learner/schedule` | Redirected to `/login?returnTo=%2Fdashboard%2Flearner%2Fschedule`. |
| `/dashboard/instructor/availability` | Redirected to `/login?returnTo=%2Fdashboard%2Finstructor%2Favailability`. |

The login boundary displayed the configured Supabase Auth message and no server keys, database URLs, private scheduling records, or demo scheduling rows.
