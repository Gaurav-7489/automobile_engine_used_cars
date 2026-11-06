/** Photo hosts the post studio may read: the vehicle photo store, plus any extra hosts named in PHOTO_HOSTS (comma separated). */
export function photoHostAllowed(host: string): boolean {
  const h = host.toLowerCase();
  if (h.endsWith(".public.blob.vercel-storage.com")) return true;
  const extra = (process.env.PHOTO_HOSTS ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  return extra.includes(h);
}
