# Noor Ilm — deployment

## What this project actually is

**Not a static site.** `pnpm build` produces two artifacts, and both are needed:

- `dist/public` — the built React app
- `dist/index.js` — a bundled Express server that serves the tRPC API **and** `dist/public`

The server is a long-lived Node process. That single fact decides the hosting.

## Why "Vercel for everything" does not fit as-is

Vercel hosts static output and serverless functions. This server is neither:

- `server/_core/index.ts` boots an Express app and listens on a port. Serverless functions
  do not listen; they are invoked.
- It mounts Vite as middleware in development and `serveStatic` in production — a
  file-serving responsibility Vercel's CDN would normally own.
- tRPC is mounted as one Express route. Reaching it from Vercel means an adapter in
  `api/[[...trpc]].ts`, which is a real port, not a config change.

It can be done, but it is a migration, not a deploy. Do not start it by pushing to Vercel
and hoping.

## Recommended: one Node host (simplest, no code change)

Deploy the repository as a single Node web service. Free tiers that fit: **Render**,
**Railway**, **Fly.io**.

| Setting | Value |
|---|---|
| Build command | `pnpm install && pnpm build` |
| Start command | `pnpm start` |
| Node version | 20 or newer |
| Health check path | `/` |
| Port | `process.env.PORT`, honoured — verified at `server/_core/index.ts:54` |

Supabase stays exactly as it is: hosted Postgres, Auth and Storage. Nothing moves.

## Alternative: split hosting (only if Vercel is required)

- **Vercel** serves `dist/public` — build `pnpm build`, output directory `dist/public`,
  plus an SPA rewrite so client routes resolve:

  ```json
  { "rewrites": [{ "source": "/((?!api/).*)", "destination": "/index.html" }] }
  ```

- **The API stays on a Node host** (as above), and the client is pointed at it.
- This adds cross-origin requests, so the server needs an explicit CORS allow-list of the
  Vercel origin, and Supabase Auth needs the Vercel origin in its redirect list.

Choose this only if Vercel is a hard requirement. The single-host option has fewer moving
parts and no CORS surface.

## Environment variables — names only

Set these in the host's dashboard. **Never commit values.** `.env` is git-ignored and
`.env.example` carries names with empty values.

Server-side (secret — must never reach the browser):

```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_DB_URL
GEMINI_API_KEY
GEMINI_MODEL
ADMIN_EMAIL
```

Client-side (`VITE_` prefixed — these ARE shipped to the browser, so only publishable
values belong here):

```
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

Also present and non-secret: `SUPABASE_PUBLISHABLE_KEY`.

## Before first production login

1. **Supabase → Authentication → URL Configuration**: add the production origin to *Site
   URL* and *Redirect URLs*, including `https://<domain>/auth/callback`.
2. **Google OAuth** is code-complete but has **no provider credentials configured**.
   Until a Client ID and Secret are added to Supabase → Authentication → Providers →
   Google, and the production callback is registered in the Google Cloud console, Google
   sign-in will not work in production. Password login is unaffected.
3. Apply the 30 migrations in `supabase/migrations/` in order against the production
   project.

## Not yet connected (do not promise these in production)

These are unconfigured today and will present their setup-needed state rather than fail:

- Google OAuth provider credentials
- CAPTCHA provider (`CAPTCHA_PROVIDER`, `CAPTCHA_SITE_KEY`, `CAPTCHA_SECRET_KEY`)
- Live Classroom video provider
- Payment and payout providers
- Outbound email / contact delivery

## Security note carried forward

The Supabase service-role key and the Gemini key were printed to a log earlier in this
project's history. **Rotate both** before the first public deployment.
