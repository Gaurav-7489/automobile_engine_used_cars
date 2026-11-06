import { problem, rateLimited } from "@/lib/api";
import { hit } from "@/lib/rate-limit";
import { getPrincipal } from "@/lib/server/auth";
import { photoHostAllowed } from "@/lib/server/photo-hosts";

export const dynamic = "force-dynamic";

const MAX_BYTES = 12 * 1024 * 1024;

/**
 * Serves a vehicle photo from the same origin so the Social post studio can draw it on a canvas and export the result.
 * Signed-in members only, https only, allowlisted photo hosts only, images only.
 */
export async function GET(request: Request) {
  const current = await getPrincipal();
  if (!current) return problem(401, "unauthenticated", "Sign in to continue.");
  const limit = hit(`post-photo:${current.principal.userId}`, 300, 60_000);
  if (!limit.allowed) return rateLimited("Too many photo requests. Wait a moment.", limit.retryAfter);
  const raw = new URL(request.url).searchParams.get("src") ?? "";
  let src: URL;
  try { src = new URL(raw); } catch { return problem(422, "invalid", "Send a photo address."); }
  if (src.protocol !== "https:" || src.username || src.password || src.port || !photoHostAllowed(src.hostname)) return problem(403, "forbidden", "That photo address is not allowed.");
  const upstream = await fetch(src, { redirect: "error", cache: "force-cache" }).catch(() => null);
  if (!upstream || !upstream.ok) return problem(502, "unavailable", "The photo could not be loaded.");
  const type = upstream.headers.get("content-type") ?? "";
  if (!/^image\/(jpeg|png|webp|avif|gif)$/i.test(type.split(";")[0].trim())) return problem(415, "unsupported", "That address is not an image.");
  const length = Number(upstream.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) return problem(413, "too_large", "That photo is too large.");
  const body = await upstream.arrayBuffer();
  if (body.byteLength > MAX_BYTES) return problem(413, "too_large", "That photo is too large.");
  return new Response(body, { headers: { "content-type": type, "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff" } });
}
