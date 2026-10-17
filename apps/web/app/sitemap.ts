import type { MetadataRoute } from "next";
import { tenantConfig } from "../lib/config";
import { dealershipService } from "../lib/services";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const vehicles = await dealershipService.inventory();
  const base = tenantConfig.seo.canonicalBase.replace(/\/$/, "");
  const staticRoutes = ["", "/discover", "/inventory", "/compare", "/contact", "/download", "/privacy", "/terms"];

  return [
    ...staticRoutes.map((path) => ({
      url: base + path,
      changeFrequency: path === "/inventory" || path === "/discover" ? ("daily" as const) : ("weekly" as const),
      priority: path === "" ? 1 : 0.8,
    })),
    ...vehicles.map((vehicle) => ({
      url: base + "/vehicles/" + vehicle.slug,
      lastModified: new Date(vehicle.updatedAt),
      changeFrequency: "daily" as const,
      priority: 0.9,
    })),
  ];
}
