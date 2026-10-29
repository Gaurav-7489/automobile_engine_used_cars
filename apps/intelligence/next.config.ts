import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
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
  transpilePackages: ["@vandlabs/data", "@vandlabs/contracts"],
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
    ];
  },
};

export default nextConfig;
