import { defineConfig, devices } from "@playwright/test";

const host = "127.0.0.1";
const publicURL = `http://${host}:3000`;
const commandURL = `http://${host}:3001/command`;
const platformURL = `http://${host}:3002/platform`;

export default defineConfig({
  testDir: "./tests/e2e",
  use: {
    baseURL: publicURL,
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: "pnpm --filter @vandlabs/web start",
      url: publicURL,
      reuseExistingServer: false,
      env: { AUTH_MODE: "demo", DATA_MODE: "demo" },
    },
    {
      command: "pnpm --filter @vandlabs/command-center start",
      url: commandURL,
      reuseExistingServer: false,
      env: { AUTH_MODE: "demo", DATA_MODE: "demo" },
    },
    {
      command: "pnpm --filter @vandlabs/platform start",
      url: platformURL,
      reuseExistingServer: false,
      env: { AUTH_MODE: "demo", DATA_MODE: "demo" },
    },
  ],
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"] } },
  ],
});
