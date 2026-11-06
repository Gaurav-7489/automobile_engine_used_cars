import type { NextConfig } from "next";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Build facts shown in the admin console: product version, build time and the automated test inventory (suites and test
 * counts read from the repository at build time). Nothing secret.
 */
function buildFacts() {
  const root = join(process.cwd(), "..", "..");
  let version = "unknown";
  try { version = readFileSync(join(root, "VERSION"), "utf8").trim(); } catch { /* keep unknown */ }
  const suites: { name: string; files: number; tests: number }[] = [];
  const testsDir = join(root, "tests");
  if (existsSync(testsDir)) {
    for (const dir of readdirSync(testsDir, { withFileTypes: true })) {
      if (!dir.isDirectory()) continue;
      const files = readdirSync(join(testsDir, dir.name)).filter((f) => /\.(test|spec)\.ts$/.test(f));
      const tests = files.reduce((n, f) => n + (readFileSync(join(testsDir, dir.name, f), "utf8").match(/^\s*test\(/gm) ?? []).length, 0);
      if (files.length) suites.push({ name: dir.name, files: files.length, tests });
    }
  }
  return { APP_VERSION: version, BUILD_TIME: new Date().toISOString(), TEST_MANIFEST: JSON.stringify(suites) };
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  env: buildFacts(),
  // Keep visited and prefetched pages in the client router cache, so moving between workspace pages does not wait for the server.
  // Page data itself is fetched by the page (lib/remote-cache), so a cached page shell never shows stale records.
  experimental: { staleTimes: { dynamic: 300, static: 600 } },
  // Short names for the destinations the platform's navigation groups differently.
  async redirects() {
    return [
      { source: "/app", destination: "/app/overview", permanent: false },
      { source: "/app/finance", destination: "/app/capital", permanent: false },
      { source: "/app/sales", destination: "/app/capital", permanent: false },
      { source: "/app/staff", destination: "/app/settings/team", permanent: false },
    ];
  },
  // The shared data package is TypeScript source in this monorepo.
  transpilePackages: ["@vandlabs/data", "@vandlabs/contracts", "@vandlabs/demo-data"],
  serverExternalPackages: ["pg", "@aws-sdk/client-secrets-manager"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "Content-Security-Policy", value: "default-src 'self'; img-src 'self' data: blob: https://images.unsplash.com https://*.public.blob.vercel-storage.com; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" },
        ],
      },
      // Public showroom pages may be shown inside this app (the in-app Showroom preview), and only by this site.
      ...["/l/:path*", "/showroom", "/showroom/:path*"].map((source) => ({
        source,
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "default-src 'self'; img-src 'self' data: blob: https://images.unsplash.com https://*.public.blob.vercel-storage.com; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'" },
        ],
      })),
    ];
  },
};

export default nextConfig;
