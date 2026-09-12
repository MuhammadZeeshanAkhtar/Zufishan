# Noor Ilm — architecture map

One npm project, three source trees, one build. This document exists because the
obvious tidy-up — moving `client/` to `frontend/` and `server/` to `backend/` — would
break the build today, and the reasons are worth writing down rather than rediscovering.

## Layout

```
noor-ilm-lms/
├─ client/            Vite + React 19 + TypeScript (the browser app)
│  ├─ src/
│  └─ public/         static assets served as-is
├─ server/            Express + tRPC (the API, and the static host in production)
│  └─ _core/index.ts  the single entrypoint
├─ shared/            types and rules used by BOTH sides
├─ supabase/
│  └─ migrations/     30 SQL migrations, applied in order
├─ scripts/           one-off migration appliers and verifiers
├─ dist/              build output (git-ignored)
│  ├─ index.js        the bundled server
│  └─ public/         the built client
├─ package.json       ONE package. No workspaces.
├─ tsconfig.json      ONE config covering client + server + shared
└─ vite.config.ts     root: client/, outDir: dist/public
```

## How it runs

| | command | what happens |
|---|---|---|
| Development | `NODE_ENV=development npx tsx watch server/_core/index.ts` | Express boots and mounts Vite as middleware, so one process serves the API and the app with HMR on `:3000` |
| Build | `pnpm build` | `vite build` → `dist/public`, then `esbuild` bundles the server → `dist/index.js` |
| Production | `pnpm start` | `node dist/index.js` — Express serves the tRPC API **and** `dist/public` |

> `pnpm dev` fails on Windows: npm runs the script through `cmd.exe`, which cannot parse
> the inline `NODE_ENV=development`. Use the `npx tsx watch` form above.

## Why `frontend/` + `backend/` is not a safe move today

Four couplings tie the trees together. Each is fixable, but not incidentally:

1. **The test suite reads client source from the server tree.** 48 of the 91 files in
   `server/*.test.ts` assert against real component source via
   `new URL("../client/src/components/…", import.meta.url)`. This is deliberate — it is
   how the project pins UI guarantees — but every one of those paths breaks on a move.

2. **One `tsconfig.json` spans all three trees.** `include` covers `client/src`,
   `server` and `shared`; `paths` maps `@/*` → `./client/src/*` and `@shared/*` →
   `./shared/*`. A split needs per-tree configs plus project references, or the aliases
   resolve from the wrong root.

3. **The server is the production web host.** `server/_core/vite.ts` mounts Vite in
   development and `serveStatic(dist/public)` in production. The server therefore has a
   hard path dependency on the client's build output; they are not independent artifacts.

4. **`shared/` is imported by both sides** (9 server files plus the client). Under a
   split it becomes a third package needing a workspace, or a duplicated copy — and a
   duplicated copy is exactly how the two sides drift.

**Recommendation: keep the current structure.** It is a conventional single-package
full-stack layout, and the separation the move is reaching for already exists at the
directory level.

## If the split is still wanted — a staged migration

Do it in this order, verifying `pnpm check && pnpm build && pnpm test` after each step:

1. Adopt pnpm workspaces: `packages/shared`, `packages/frontend`, `packages/backend`,
   with a root `package.json` declaring them.
2. Move `shared/` first, publish it as `@noor-ilm/shared`, and switch both sides to the
   package name instead of relative paths.
3. Split `tsconfig.json` into three, wired with project references.
4. Move the client. Update `vite.config.ts` root/outDir and the `@/` alias.
5. **Rewrite the 48 test path references** — this is the real work, and the step that
   should decide whether the whole migration is worth doing.
6. Move the server last, and decide there whether it still serves the client or whether
   the client moves to a static host (see `DEPLOYMENT.md`).

Budget this as its own task. Half-moved trees are worse than either end state.
