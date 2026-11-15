import { defineConfig, devices } from "@playwright/test";

/** Runs against an already-running production build of apps/intelligence on a local PostgreSQL (see docs/PERFORMANCE_BASELINE_AND_RESULTS.md). These specs sign in with seeded password accounts, so start the server with LEGACY_PASSWORD_LOGIN=enabled (they use /login?legacy=1). */
export default defineConfig({
  testDir: "./tests/local-stack", workers: 1, outputDir: "local-stack-results",
  use: { baseURL: process.env.LOCAL_STACK_ORIGIN ?? "http://127.0.0.1:3003", trace: "retain-on-failure" },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }],
});
