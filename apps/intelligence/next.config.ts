import type { NextConfig } from "next";
import { showroomRewrites } from "./lib/showroom-routing";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async rewrites() {
    return { beforeFiles: showroomRewrites(process.env.SHOWROOM_ORIGIN), afterFiles: [], fallback: [] };
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
