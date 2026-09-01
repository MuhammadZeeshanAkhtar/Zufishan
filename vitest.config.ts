import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    // Several suites make real network calls (Supabase pooler, Gemini). The 5s default
    // aborts healthy requests under parallel load and reports them as failures.
    testTimeout: 20_000,
    // Several suites open real connections: the Supabase session pooler has a connection cap and
    // Gemini rate-limits. Running every file at once made healthy requests time out and report as
    // failures, so file-level concurrency is capped rather than the assertions being loosened.
    // Capping threads was not enough; these suites are run one file at a time so a healthy
    // pooler or provider call is never aborted by contention from a sibling file.
    fileParallelism: false,
    include: ["server/**/*.test.ts", "server/**/*.spec.ts"],
  },
});
