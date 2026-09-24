/**
 * The frontend deployment, and the two ways it was quietly wrong.
 *
 * The production URL served JavaScript source. Not a leak — the *server bundle*, being handed out
 * as a static asset, because one build writes two different things into one directory:
 *
 *   vite build                       ->  dist/public/   index.html and the assets
 *   esbuild server/_core/index.ts    ->  dist/index.js  Express and tRPC, bundled
 *
 * There is no `index.html` at the top of `dist/`, and there is an `index.js`. A host pointed at
 * `dist` therefore finds nothing to serve at `/` and serves the one file it can see.
 *
 * So two things are asserted here. The output directory has to be the one holding the page, and
 * the build command has to be the frontend's alone — if the esbuild step ran on Vercel, the file
 * that caused this would be sitting there again whatever the output directory said.
 *
 * The third assertion is about the rewrite, and it is the subtle one: an SPA fallback that also
 * catches `/api/` answers the tRPC client with HTTP 200 and an HTML body. A 404 is a miss; HTML
 * that parses as success is a lie, and a worse failure to debug.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")) as {
  framework?: string;
  buildCommand?: string;
  outputDirectory?: string;
  rewrites?: { source: string; destination: string }[];
};
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  scripts: Record<string, string>;
};
const viteConfig = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");
const env = readFileSync(new URL("../client/src/lib/supabase-browser-env.ts", import.meta.url), "utf8");
const client = readFileSync(new URL("../client/src/lib/supabase-client.ts", import.meta.url), "utf8");

describe("the root URL serves the page, not the server bundle", () => {
  it("points the output at the directory that actually holds index.html", () => {
    expect(vercel.outputDirectory).toBe("dist/public");
    // Which is where vite is configured to write it, so the two cannot drift apart silently.
    expect(viteConfig).toContain('outDir: path.resolve(import.meta.dirname, "dist/public")');
  });

  it("builds the frontend only, so the server bundle is never produced there", () => {
    expect(vercel.buildCommand).toBe("vite build");
    expect(vercel.buildCommand).not.toContain("esbuild");
    // `pnpm build` still builds both, for the host that wants the server.
    expect(packageJson.scripts.build).toContain("vite build");
    expect(packageJson.scripts.build).toContain("esbuild server/_core/index.ts");
  });

  it("leaves the backend in the repository rather than deleting it", () => {
    expect(packageJson.scripts.start).toContain("node dist/index.js");
    expect(packageJson.scripts.dev).toContain("server/_core/index.ts");
  });
});

describe("the SPA rewrite", () => {
  it("falls back to index.html so browser routes resolve", () => {
    expect(vercel.rewrites).toHaveLength(1);
    expect(vercel.rewrites?.[0].destination).toBe("/index.html");
  });

  it("excludes /api/, so a missing backend is a 404 and not an HTML 200", () => {
    const { source } = vercel.rewrites![0];
    expect(source).toBe("/((?!api/).*)");
    // The pattern is the guard, so it is exercised rather than merely read.
    const matches = (path: string) => new RegExp(`^${source}$`).test(path);
    expect(matches("/login")).toBe(true);
    expect(matches("/dashboard/learner")).toBe(true);
    expect(matches("/")).toBe(true);
    expect(matches("/api/trpc/scheduling.sessionRecord")).toBe(false);
  });
});

describe("the browser gets the two public values and nothing else", () => {
  it("accepts either name for the key Supabase renamed", () => {
    // anon -> publishable. One value, two names; a deployment set up under the old one worked
    // nowhere, and the symptom was every sign-in refusing with nothing to suggest a variable name.
    expect(env).toContain('read(env, "VITE_SUPABASE_PUBLISHABLE_KEY") || read(env, "VITE_SUPABASE_ANON_KEY")');
    expect(client).toContain("const publishableKey = supabasePublishableKeyFrom();");
    expect(client).toContain("const url = supabaseUrlFrom();");
  });

  it("reads no server-only variable in the browser", () => {
    /*
     * Vite inlines every `VITE_*` value into files anybody can read. These four are not public and
     * must never acquire a `VITE_` name, so the module that reads the browser's environment is
     * held to reading exactly two.
     */
    for (const secret of ["SERVICE_ROLE", "SUPABASE_DB_URL", "GEMINI", "ADMIN_EMAIL"]) {
      expect(env, `browser env must not mention ${secret}`).not.toContain(secret);
    }
    const mentioned = [...new Set(env.match(/VITE_[A-Z_]+/g) ?? [])].sort();
    expect(mentioned).toEqual(["VITE_SUPABASE_ANON_KEY", "VITE_SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_URL"]);
  });
});
