/**
 * Automobile Intelligence is served under one product address alongside the website, Command Center and
 * Platform, so every route lives under this prefix. Next's Link, router and redirect() add it automatically;
 * hand-built URLs (fetch, plain anchors, copied links, route-handler redirects) must use withBase().
 */
export const BASE_PATH = "/intelligence";

export const withBase = (path: string): string => (path.startsWith("/") && !path.startsWith("//") ? BASE_PATH + path : path);
