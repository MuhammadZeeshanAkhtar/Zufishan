# Deploying the frontend to Vercel

`vercel.json` is JSON and cannot carry comments, so the reasoning lives here.

## Why the production URL was showing JavaScript source

`pnpm build` runs two different builds into one directory:

```
vite build                          →  dist/public/   (index.html, assets — the React app)
esbuild server/_core/index.ts …     →  dist/index.js  (the Express + tRPC server, bundled)
```

There is no `index.html` at the top of `dist/`. There is an `index.js`. So a Vercel project whose
Output Directory is `dist` finds no page to serve at `/` and serves the one file that is there —
the bundled server. That is the source code people were seeing: not a leak of anything secret, but
the server bundle being treated as a static asset.

Two things fix it, and both are now in `vercel.json`:

- **`outputDirectory: "dist/public"`** — the directory that actually holds `index.html`.
- **`buildCommand: "vite build"`** — the frontend build only. The esbuild step is skipped, so
  `dist/index.js` is never produced on Vercel and there is nothing for it to serve by mistake.

The `server/` directory is untouched and still builds locally with `pnpm build`; it is simply not
part of this deployment. `render.yaml` still deploys the whole application, server included, for
when the backend is wanted.

## The SPA rewrite, and the one path it must not swallow

```json
{ "source": "/((?!api/).*)", "destination": "/index.html" }
```

wouter routes in the browser, so `/login` and `/dashboard/learner` have no file on disk and must
fall back to `index.html`. The negative lookahead matters: without it, `/api/trpc/…` would also
receive `index.html`, and the tRPC client would get **HTTP 200 with an HTML body** instead of a
failure. A client that asked for JSON and was handed a page has to guess, and every query would
fail in a more confusing way than a plain 404. Excluding `/api/` lets the miss be a miss.

## Environment variables

Set these two, for **Production, Preview and Development**:

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | the Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | the publishable key — the dashboard used to call this the **anon key** |

`VITE_SUPABASE_ANON_KEY` is accepted as an alias for the second one (see
`client/src/lib/supabase-browser-env.ts`), so a project already configured under that name keeps
working; where both are set, the publishable name wins.

Vite inlines anything named `VITE_*` into files any visitor can read, so those are the only two
that belong here. **Do not add** `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `GEMINI_API_KEY`
or `ADMIN_EMAIL` to this project: they are server-only, the frontend never reads them, and adding
them under a `VITE_` name would publish them.

They are read **at build time**, not at run time. Changing one does nothing until the next deploy.

## What does not work without the backend, and why

Everything that talks to Supabase directly works: the browser holds the session, and RLS enforces
the boundaries. Everything that goes through `/api/trpc` returns 404, and each of those surfaces
shows its "That did not load" panel rather than breaking the page.

**Sign-up and sign-in are in the second group, deliberately.** Both call Supabase directly and
both then ask the server a question they refuse to proceed without:

- Sign-up asks whether the address is eligible for the role being requested, *before* creating the
  account. The server compares it against `ADMIN_EMAIL` and against who is already registered. It
  is what stops somebody signing up as an administrator.
- Sign-in authenticates against Supabase, then asks the server which dashboard this identity's
  roles actually permit. The selected card is sent only so the server can disagree with it.

Neither answer can be computed in the browser without moving a decision the server exists to make,
so neither is bypassed here. On a frontend-only deployment sign-up refuses with "We could not check
this email just now", and sign-in authenticates but stops with "We could not confirm your account
role" instead of routing anywhere.

Deploying the API alongside this is what fixes it — `render.yaml` already does exactly that, and
pointing the frontend at that origin, or adding a Vercel function that mounts the same tRPC router,
would restore both flows with every check still on the server.

## Verifying a build the way Vercel runs it

```
npx vite build
```

`dist/` should then contain `public/` and **no `index.js`**. Serving `dist/public` with the same
rewrite gives `/` and `/login` the React app, `/assets/*` the real files, and `/api/*` a 404.
