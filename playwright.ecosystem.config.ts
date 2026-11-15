import { defineConfig, devices } from "@playwright/test";

/**
 * Cross-product journey: Intelligence + a VLuce website, both production builds on a local PostgreSQL. Starts nothing itself;
 * see tests/ecosystem/README.md for the stack it expects (ports 3003, 3100-3102, mock CRM on 3200).
 */
export default defineConfig({
  testDir: "./tests/ecosystem",
  workers: 1,
  timeout: 120_000,
  outputDir: "ecosystem-results",
  use: { baseURL: process.env.INTEL_ORIGIN ?? "http://127.0.0.1:3003", trace: "off" },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }],
});
