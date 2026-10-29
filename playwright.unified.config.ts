import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/unified",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3003", trace: "retain-on-failure" },
  webServer: [
    { command: "pnpm --filter @vandlabs/intelligence start", url: "http://127.0.0.1:3003/login" },
  ],
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"] } },
  ],
});
