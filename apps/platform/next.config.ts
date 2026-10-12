import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
if (process.env.HOSTING_PROVIDER === "cloudflare") initOpenNextCloudflareForDev();
import type { NextConfig } from "next";
import { securityHeaders } from "../web/lib/security-headers";

const nextConfig: NextConfig = { experimental: { serverMinification: false }, poweredByHeader: false, async headers() { return [{source:"/:path*",headers:securityHeaders}]; }, basePath: "/platform" };

export default nextConfig;
