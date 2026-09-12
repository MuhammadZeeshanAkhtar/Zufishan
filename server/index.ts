/**
 * Not the server. Kept only to stop anyone starting it by mistake.
 *
 * This file is a leftover from the original project scaffold (it still appears verbatim in
 * template.json). It serves static files and answers `app.get("*")` with index.html — which means
 * it replies to every API request with an HTML document instead of JSON, and to every API POST with
 * a 404 HTML error page, because it registers no POST handler and mounts no tRPC router.
 *
 * That failure is quiet and expensive. The app boots, pages render, forms fill in, and the first
 * request that actually needs the API fails with:
 *
 *   Unexpected token '<', "<!DOCTYPE ..." is not valid JSON
 *
 * which describes a JSON parser's disappointment and says nothing about the real problem: the API
 * was never mounted. The path here looks like the obvious entry point, so it is easy to start —
 * `tsx server/index.ts` reads as correct and is not.
 *
 * The real server is `server/_core/index.ts`. It mounts the tRPC router at /api/trpc, sets up Vite
 * in development, and serves the built client in production. It is what `pnpm dev`, `pnpm build`
 * and `pnpm start` all use; nothing references this file.
 *
 * Rather than delete it and have it reappear from the template, it now refuses to start and says
 * where to go. Failing immediately and loudly is the whole point: a server that runs and quietly
 * breaks every API call is worse than one that does not run.
 */
const CORRECT_ENTRY = "server/_core/index.ts";

console.error(
  [
    "",
    "  server/index.ts is not the application server, and will not start.",
    "",
    "  It serves static files only and answers every route with index.html, so API",
    "  requests come back as HTML and fail with:",
    "",
    `    Unexpected token '<', "<!DOCTYPE ..." is not valid JSON`,
    "",
    `  Start the real server instead — it mounts the API at /api/trpc:`,
    "",
    "    pnpm dev",
    `    # or directly:  NODE_ENV=development tsx watch ${CORRECT_ENTRY}`,
    "",
  ].join("\n"),
);

process.exit(1);
