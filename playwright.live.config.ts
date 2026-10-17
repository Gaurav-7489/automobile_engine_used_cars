import { defineConfig } from "@playwright/test";

// Read-only acceptance against a deployed gateway. No local servers, no writes.
// LIVE_BASE_URL: deployed gateway origin, e.g. https://vandlabs-staging-gateway.vandlabs-automobile.workers.dev
// Optional: LIVE_COMMAND_STATE / LIVE_PLATFORM_STATE storageState files saved after a real MFA login,
// LIVE_TENANT_ID to assert tenant scope, LIVE_DEALER_AI_URL to probe the public AI edge.
const base = process.env.LIVE_BASE_URL;
if (!base || new URL(base).protocol !== "https:" || new URL(base).pathname !== "/") throw new Error("Set LIVE_BASE_URL to the deployed HTTPS gateway origin without a path.");

export default defineConfig({
  testDir: "./tests/live",
  outputDir: "./live-test-results",
  workers: 1, // Command Center and Platform share one origin and cookie names; keep sessions serial and separate.
  retries: 0,
  // Traces would capture live session cookies; keep them off.
  use: { baseURL: new URL(base).origin, trace: "off", screenshot: "off", video: "off" },
});
