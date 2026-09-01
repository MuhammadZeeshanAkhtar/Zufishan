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
    include: ["server/**/*.test.ts", "server/**/*.spec.ts"],
  },
});
