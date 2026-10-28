import type { MetadataRoute } from "next";
import { tenantConfig } from "../lib/config";
export default function robots(): MetadataRoute.Robots {
  const base=tenantConfig.seo.canonicalBase.replace(/\/$/, "");
  return {rules:{userAgent:"*",allow:"/",disallow:["/api/","/app/","/admin","/login","/join/","/onboarding","/command","/platform"]},sitemap:base+"/sitemap.xml",host:base};
}
