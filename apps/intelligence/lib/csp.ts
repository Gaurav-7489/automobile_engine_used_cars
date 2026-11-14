/**
 * Content Security Policy for pages. Every page response gets a fresh nonce: only scripts carrying it (the theme script and
 * Next.js's own scripts, which Next tags automatically) may run, and scripts they load are trusted through 'strict-dynamic'.
 * Inline scripts injected by an attacker have no nonce and are blocked. Style attributes (React `style={{}}`) stay allowed;
 * <style> elements need the nonce.
 */
export const IMAGE_SOURCES = "'self' data: blob: https://images.unsplash.com https://*.public.blob.vercel-storage.com";

/** Pages that the in-app Showroom preview frames; every other page refuses to be framed. */
export function isFrameablePath(pathname: string): boolean {
  return pathname === "/showroom" || pathname.startsWith("/showroom/") || pathname.startsWith("/l/");
}

export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function pageCsp(nonce: string, options: { frameable?: boolean; dev?: boolean } = {}): string {
  const dev = options.dev ?? process.env.NODE_ENV !== "production";
  return [
    "default-src 'self'",
    // 'self' is a fallback for browsers without 'strict-dynamic'; dev needs eval for React's debugging tools.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    `img-src ${IMAGE_SOURCES}`,
    "font-src 'self' data:",
    `connect-src 'self'${dev ? " ws:" : ""}`,
    "frame-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${options.frameable ? "'self'" : "'none'"}`,
    // No upgrade-insecure-requests: Strict-Transport-Security already forces HTTPS in production, and the directive breaks
    // local production builds served over http.
  ].join("; ");
}

/** API responses and other non-page files render nothing, so they may load nothing and may never be framed. */
export const API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
