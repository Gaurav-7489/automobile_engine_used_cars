import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
if (process.env.HOSTING_PROVIDER === "cloudflare") initOpenNextCloudflareForDev();
import type { NextConfig } from "next";
import { securityHeaders } from "./lib/security-headers";
const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: { loader:"custom", loaderFile:"./lib/image-loader.ts", remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }], formats: ["image/avif", "image/webp"] },
  async headers() { return [{source:"/:path*",headers:securityHeaders}]; },
};
export default nextConfig;
