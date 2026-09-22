# Deploying Zufishan to Render

One web service runs the whole application. `vite build` writes the browser bundle to
`dist/public`, esbuild writes the Express + tRPC server to `dist/index.js`, and that server serves
the directory. There is no separate frontend to host — and a static host cannot run this, because
every tRPC call is served by the same process.

`render.yaml` in the repository root is the blueprint. Render reads it and creates the service.

## What only you can do

Three steps need your account and your secrets, so they are yours rather than anyone else's:

1. **Signing in to Render.** Nobody should sign in on your behalf.
2. **Entering the nine environment values.** They go into Render's own dashboard, which stores
   them encrypted. They are never written into this repository — `render.yaml` declares the
   *names* and marks every one `sync: false`, which is what makes Render prompt you for each.
3. **Adding the deployed domain to Supabase.** Until you do, Google sign-in and email confirmation
   links will bounce, because Supabase refuses to redirect to an address it does not know.

## Steps

### 1. Create the service

Open <https://render.com> → **New** → **Blueprint** → connect the GitHub account that owns this
repository → pick it → Render finds `render.yaml` and shows one web service named `zufishan`.

The repository is private, so Render will ask for permission to read it. Granting access to this
one repository is enough.

### 2. Enter the nine values

Render prompts for each in turn. Take them from your local `.env` — the names match exactly:

| Variable | What it is |
|---|---|
| `SUPABASE_URL` | The project's API URL, server side |
| `SUPABASE_PUBLISHABLE_KEY` | The anon/publishable key, server side |
| `SUPABASE_SERVICE_ROLE_KEY` | **Bypasses RLS.** Server only — never goes to a browser |
| `SUPABASE_DB_URL` | The Postgres connection string |
| `VITE_SUPABASE_URL` | Same API URL, inlined into the browser bundle |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Same publishable key, inlined into the browser bundle |
| `GEMINI_API_KEY` | The AI Tutor's provider key |
| `GEMINI_MODEL` | Which model the tutor asks for |
| `ADMIN_EMAIL` | Which account the first administrator role is granted to |

The two `VITE_` values are read **during the build**, not at runtime: Vite writes them into the
browser bundle. A deploy that adds them afterwards ships a client that cannot reach Supabase, and
the symptom is a site that loads and then fails every request. Enter them before the first build.

`NODE_ENV` is deliberately absent. `vite`, `esbuild` and `typescript` are devDependencies, and
`pnpm install` with `NODE_ENV=production` skips devDependencies — the build would fail on
`vite: not found`. The server sets its own production flag inside the `start` script.

### 3. Tell Supabase about the new address

Once Render gives you the URL (`https://zufishan.onrender.com`, or whatever name you chose), open
the Supabase dashboard → **Authentication** → **URL Configuration** and add it to **Redirect
URLs**, along with `https://<your-domain>/**` so the callback paths are covered. Set **Site URL**
to the same origin.

Without this, "Continue with Google" and every confirmation email will refuse to come back.

## What the free plan does

A free web service sleeps after about fifteen minutes with no traffic, and the next request waits
roughly fifty seconds while it wakes. That is fine for showing the site to somebody; it is not
fine for learners in a lesson. Render's paid Starter plan removes it.

## After the first deploy

`autoDeployTrigger: commit` is set, so every push to `main` deploys. Watch the first one in
Render's log view — the build takes a few minutes, and the line to look for at the end is
`Server listening on port <n>`.

If the service starts and is unreachable, the cause is almost always the port. This server binds
exactly the `PORT` Render assigns and exits with a non-zero code if it cannot, rather than quietly
choosing another one and reporting success — so a port problem shows up as a failed deploy rather
than a silent outage.

## Region

The blueprint says `frankfurt`, which is closer to Pakistan, the Gulf and the UK than Render's
Oregon default. The hop that matters most is the one between this server and Supabase, so if the
Supabase project lives elsewhere, change `region` in `render.yaml` to match it.
