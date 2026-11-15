import { defineConfig, devices } from "@playwright/test";

/**
 * Google-only sign-in surface against a running production build (no Google login happens here: requests to Google are
 * intercepted, so this proves the application side only). See tests/google-auth/README.md.
 */
export default defineConfig({
  testDir: "./tests/google-auth",
  workers: 1,
  outputDir: "google-auth-results",
  use: { baseURL: process.env.AUTH_ORIGIN ?? "http://127.0.0.1:3003", trace: "off" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
