import type { Vehicle } from "./domain";
import { checkCopy } from "./actions/campaigns";

/**
 * Social post kit: ready-to-post images and captions for one vehicle. Everything here is built from the stock record's own
 * facts (year, fuel, transmission, kilometres, owners, asking price, branch city), so the post makes no claim the record cannot
 * back. Captions still pass through the same blocked-claim check as campaign copy, because the dealer can add a line.
 */

export type PostFormatId = "square" | "portrait" | "story" | "landscape";
export type PostFormat = { id: PostFormatId; label: string; width: number; height: number; use: string; carousel: boolean };

export const POST_FORMATS: PostFormat[] = [
  { id: "square", label: "Square 1:1", width: 1080, height: 1080, use: "Instagram and Facebook feed, carousel", carousel: true },
  { id: "portrait", label: "Portrait 4:5", width: 1080, height: 1350, use: "Instagram feed (largest in feed), carousel", carousel: true },
  { id: "story", label: "Story 9:16", width: 1080, height: 1920, use: "Instagram, Facebook and WhatsApp Status, Reels cover", carousel: true },
  { id: "landscape", label: "Link 1.91:1", width: 1200, height: 628, use: "Facebook, LinkedIn and X link posts, OLX/website banner", carousel: false },
];

export type Platform = "instagram" | "facebook" | "whatsapp" | "linkedin" | "x";
export const PLATFORMS: { id: Platform; label: string; limit: number }[] = [
  { id: "instagram", label: "Instagram", limit: 2200 },
  { id: "facebook", label: "Facebook", limit: 63206 },
  { id: "whatsapp", label: "WhatsApp", limit: 65536 },
  { id: "linkedin", label: "LinkedIn", limit: 3000 },
  { id: "x", label: "X", limit: 280 },
];

/** X counts every link as 23 characters, whatever its length. */
export const X_LINK_LENGTH = 23;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The public path of a published vehicle's listing page. Sample workspaces (no real tenant) point to the sample showroom. */
export function listingPath(tenantId: string, vehicleId: string): string {
  return UUID.test(tenantId) ? `/l/${tenantId.toLowerCase()}/${encodeURIComponent(vehicleId.toLowerCase())}` : "/showroom/inventory";
}

/** Full listing link with UTM tags, so leads from each platform are attributed to the campaign. */
export function listingLink(origin: string, tenantId: string, vehicleId: string, platform: Platform, campaignUtm?: string): string {
  const params = new URLSearchParams({ utm_source: platform, utm_medium: "social" });
  if (campaignUtm) params.set("utm_campaign", campaignUtm);
  return `${origin.replace(/\/$/, "")}${listingPath(tenantId, vehicleId)}?${params.toString()}`;
}

/** Indian price format for posts: ₹7.45 Lakh, ₹1.20 Crore, or ₹85,000. Asking prices are held in paise. */
export function postPrice(paise: number | null): string {
  if (paise === null || !Number.isFinite(paise) || paise <= 0) return "Price on request";
  const rupees = paise / 100;
  if (rupees >= 1e7) return `₹${(rupees / 1e7).toFixed(2)} Crore`;
  if (rupees >= 1e5) return `₹${(rupees / 1e5).toFixed(2)} Lakh`;
  return `₹${Math.round(rupees).toLocaleString("en-IN")}`;
}

export const ordinalOwner = (n: number): string => {
  const v = Math.max(1, Math.round(n));
  const suffix = v % 100 >= 11 && v % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][v % 10] ?? "th");
  return `${v}${suffix} owner`;
};

export const vehicleTitle = (v: Pick<Vehicle, "year" | "make" | "model" | "variant">): string => [v.year, v.make, v.model, v.variant].filter(Boolean).join(" ");

/** The facts shown on images and in captions, each from the stock record. */
export function postFacts(v: Vehicle, city: string): { label: string; value: string }[] {
  return [
    { label: "Year", value: String(v.year) },
    { label: "Kilometres", value: `${v.km.toLocaleString("en-IN")} km` },
    { label: "Fuel", value: v.fuel },
    { label: "Transmission", value: v.transmission },
    { label: "Ownership", value: ordinalOwner(v.owners) },
    ...(city ? [{ label: "Location", value: city }] : []),
  ];
}

const tag = (s: string) => s.replace(/[^A-Za-z0-9]/g, "");

export function hashtags(v: Pick<Vehicle, "make" | "model" | "fuel">, city: string, max = 10): string[] {
  const out = ["UsedCars", "PreOwnedCars", "CarsForSale", tag(v.make), tag(v.make) + tag(v.model), tag(v.model), city ? `${tag(city)}Cars` : "", city ? `UsedCars${tag(city)}` : "", `${tag(v.fuel)}Cars`, "SecondHandCars"];
  return [...new Set(out.filter((t) => t.length > 1))].slice(0, max).map((t) => `#${t}`);
}

export type CaptionInput = {
  vehicle: Vehicle;
  platform: Platform;
  link: string;
  city: string;
  dealer: string;
  phone?: string;
  headline?: string;
  /** Optional dealer line, checked for blocked claims. */
  extra?: string;
  tags?: boolean;
};

/** A caption for one platform. Instagram links are not clickable, so the caption also points to the link in bio. */
export function buildCaption(input: CaptionInput): string {
  const { vehicle: v, platform, link, city, dealer } = input;
  const title = vehicleTitle(v);
  const price = postPrice(v.asking);
  const phone = (input.phone ?? "").trim();
  const extra = (input.extra ?? "").trim();
  const head = (input.headline ?? "").trim();
  const tags = input.tags === false ? [] : hashtags(v, city);
  const specLine = `${v.year} · ${v.fuel} · ${v.transmission}`;
  const usage = `${v.km.toLocaleString("en-IN")} km · ${ordinalOwner(v.owners)}`;

  if (platform === "x") {
    const base = `${title} · ${price} · ${v.km.toLocaleString("en-IN")} km${city ? ` · ${city}` : ""}`;
    const tail = tags.slice(0, 2).join(" ");
    // Keep within 280 counting the link as 23.
    const budget = 280 - X_LINK_LENGTH - 2 - (tail ? tail.length + 1 : 0);
    const text = base.length > budget ? `${base.slice(0, budget - 1)}…` : base;
    return [text, link, tail].filter(Boolean).join("\n");
  }

  if (platform === "whatsapp") {
    return [
      head ? `*${head}*` : `*${title}*`,
      head ? title : "",
      "",
      `💰 *${price}*`,
      `📅 ${specLine}`,
      `🛣️ ${usage}`,
      city ? `📍 ${city}${dealer ? ` · ${dealer}` : ""}` : dealer ? `🏢 ${dealer}` : "",
      extra ? `\n${extra}` : "",
      "",
      `🔗 Photos and details: ${link}`,
      phone ? `📞 Call or WhatsApp: ${phone}` : "",
    ].filter((line, i, all) => line !== "" || (all[i - 1] ?? "") !== "").join("\n").trim();
  }

  if (platform === "linkedin") {
    return [
      head || `Now available: ${title}`,
      "",
      `${title}, ${price}.`,
      `${specLine}. ${usage}.${city ? ` Available at ${dealer ? `${dealer}, ` : ""}${city}.` : ""}`,
      extra ? `\n${extra}` : "",
      "",
      `Full specification and photos: ${link}`,
      phone ? `Enquiries: ${phone}` : "",
      tags.length ? `\n${tags.slice(0, 3).join(" ")}` : "",
    ].filter((line, i, all) => line !== "" || (all[i - 1] ?? "") !== "").join("\n").trim();
  }

  // Instagram and Facebook.
  const lines = [
    head ? `${head} ✨` : `Now available ✨ ${title}`,
    head ? title : "",
    "",
    `💰 ${price}`,
    `📅 ${specLine}`,
    `🛣️ ${usage}`,
    city ? `📍 ${city}${dealer ? ` · ${dealer}` : ""}` : "",
    extra ? `\n${extra}` : "",
    "",
    platform === "instagram" ? `🔗 Full details: link in bio · Ref ${v.id}` : `🔗 Photos and full details: ${link}`,
    platform === "instagram" ? link : "",
    phone ? `📞 Call or WhatsApp ${phone}` : "",
    tags.length ? `\n${(platform === "facebook" ? tags.slice(0, 5) : tags).join(" ")}` : "",
  ];
  return lines.filter((line, i, all) => line !== "" || (all[i - 1] ?? "") !== "").join("\n").trim();
}

/** Characters as the platform counts them (X counts links as 23). */
export function captionLength(text: string, platform: Platform): number {
  if (platform !== "x") return [...text].length;
  return [...text.replace(/https?:\/\/\S+/g, "x".repeat(X_LINK_LENGTH))].length;
}

/** Blocked claims in a caption, using the same rules as campaign copy. */
export function captionProblems(text: string): string[] {
  return checkCopy(text);
}

/** Share links that open each platform's composer with the link (and text where the platform accepts it). */
export function shareLinks(caption: string, link: string): { platform: Platform; label: string; href: string }[] {
  const e = encodeURIComponent;
  return [
    { platform: "whatsapp", label: "Send on WhatsApp", href: `https://wa.me/?text=${e(caption)}` },
    { platform: "facebook", label: "Share on Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${e(link)}` },
    { platform: "linkedin", label: "Share on LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${e(link)}` },
    { platform: "x", label: "Post on X", href: `https://twitter.com/intent/tweet?text=${e(caption.replace(link, "").trim())}&url=${e(link)}` },
  ];
}

/** A tel:/WhatsApp-safe phone (digits with an optional leading +), or null when it does not look like a phone number. */
export function normalisePhone(raw: string): string | null {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 13) return null;
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}
