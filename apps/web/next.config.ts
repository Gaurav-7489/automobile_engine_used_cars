import type { NextConfig } from "next";
import { securityHeaders } from "./lib/security-headers";
const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: { remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }], formats: ["image/avif", "image/webp"] },
  async headers() { return [{source:"/:path*",headers:securityHeaders}]; },
};
export default nextConfig;
