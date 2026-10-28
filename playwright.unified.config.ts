import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/unified",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3003", trace: "retain-on-failure" },
  webServer: [
    { command: "pnpm --filter @vandlabs/web start", url: "http://127.0.0.1:3000", env: { DATA_MODE: "demo", NEXT_PUBLIC_PREVIEW_READ_ONLY: "true" } },
    { command: "pnpm --filter @vandlabs/intelligence start", url: "http://127.0.0.1:3003/login", env: { SHOWROOM_ORIGIN: "http://127.0.0.1:3000" } },
  ],
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"] } },
  ],
});
