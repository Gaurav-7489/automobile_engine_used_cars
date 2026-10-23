import { createHash } from "node:crypto";

/** Deterministic UUID (name-based, v5-style) so an Intelligence task id always maps to the same row. */
export function uuidFrom(namespace: string, name: string): string {
  const h = createHash("sha1").update(namespace + "\u0000" + name).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const hex = h.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function slugify(text: string): string {
  return text.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90) || "vehicle";
}

export const toRupees = (paise: number): number => Math.round(paise) / 100;
export const toPaise = (rupees: number): number => Math.round(rupees * 100);
export const istDate = (iso: string): string => new Date(new Date(iso).getTime() + 330 * 60_000).toISOString().slice(0, 10);
export const fromIstDate = (date: string, hour = 10): string => new Date(new Date(`${date}T${String(hour).padStart(2, "0")}:00:00Z`).getTime() - 330 * 60_000).toISOString();
