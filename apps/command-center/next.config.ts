import type { NextConfig } from "next";
import { securityHeaders } from "../web/lib/security-headers";

const nextConfig: NextConfig = { poweredByHeader: false, async headers() { return [{source:"/:path*",headers:securityHeaders}]; }, basePath: "/command" };

export default nextConfig;
