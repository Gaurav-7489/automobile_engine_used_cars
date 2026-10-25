import type { NextConfig } from "next";
import { BASE_PATH } from "./lib/base-path";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // One product address: the gateway serves this app under /intelligence next to the website, /command and /platform.
  basePath: BASE_PATH,
  // The shared data package is TypeScript source in this monorepo.
  transpilePackages: ["@vandlabs/data", "@vandlabs/contracts", "@vandlabs/design-system"],
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
          { key: "Content-Security-Policy", value: "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
