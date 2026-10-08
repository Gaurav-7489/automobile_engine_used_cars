import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const demoRuntimePath = join(mkdtempSync(join(tmpdir(), "vandlabs-e2e-")), "leads.json");
const host = "127.0.0.1";
const publicURL = `http://${host}:3000`;
const commandURL = `http://${host}:3001/command`;
const platformURL = `http://${host}:3002/platform`;

export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1, // Shared local reference adapter; each invocation uses a fresh runtime.
  use: {
    baseURL: publicURL,
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: "pnpm --filter @vandlabs/web start",
      url: publicURL,
      reuseExistingServer: false,
      env: { AUTH_MODE: "demo", DATA_MODE: "demo", VANDLABS_DEMO_RUNTIME_PATH: demoRuntimePath },
    },
    {
      command: "pnpm --filter @vandlabs/command-center start",
      url: commandURL,
      reuseExistingServer: false,
      env: { AUTH_MODE: "demo", DATA_MODE: "demo", VANDLABS_DEMO_RUNTIME_PATH: demoRuntimePath },
    },
    {
      command: "pnpm --filter @vandlabs/platform start",
      url: platformURL,
      reuseExistingServer: false,
      env: { AUTH_MODE: "demo", DATA_MODE: "demo", VANDLABS_DEMO_RUNTIME_PATH: demoRuntimePath },
    },
  ],
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"] } },
  ],
});
