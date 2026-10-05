import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/auth-e2e",
  use: { baseURL: "http://127.0.0.1:3001/command" },
  webServer: [
    { command: "pnpm --filter @vandlabs/command-center start", url: "http://127.0.0.1:3001/command",
      reuseExistingServer: false, env: { AUTH_MODE: "cognito", DATA_MODE: "demo" } },
    { command: "pnpm --filter @vandlabs/platform start", url: "http://127.0.0.1:3002/platform",
      reuseExistingServer: false, env: { AUTH_MODE: "cognito", DATA_MODE: "demo" } },
  ],
});
