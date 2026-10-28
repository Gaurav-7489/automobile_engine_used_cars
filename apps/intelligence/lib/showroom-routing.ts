/** Public showroom routes only. Authentication and private APIs stay in this app. */
export function showroomRewrites(value: string | undefined) {
  if (!value) return [];
  const origin = new URL(value);
  if (origin.origin !== value || origin.username || origin.password ||
      !(origin.protocol === "https:" || (origin.protocol === "http:" && origin.hostname === "127.0.0.1"))) {
    throw new Error("SHOWROOM_ORIGIN must be an HTTPS origin (or local 127.0.0.1 for development).");
  }
  const pages = ["/", "/inventory", "/discover", "/saved", "/compare", "/contact", "/dealer", "/download", "/privacy", "/terms", "/vehicles/:slug", "/robots.txt", "/sitemap.xml", "/opengraph-image"];
  const apis = ["/api/vehicles", "/api/vehicles/:slug", "/api/leads", "/api/discover/:path*", "/api/downloads/:path*"];
  return [
    ...pages.map(source => ({ source, destination: `${value}${source}` })),
    ...apis.map(source => ({ source, destination: `${value}${source}` })),
    { source: "/api/showroom/events", destination: `${value}/api/events` },
    // Independent Next builds must never share /_next chunks.
    { source: "/showroom-assets/_next/:path*", destination: `${value}/_next/:path*` },
  ];
}
