import { unstable_cache } from "next/cache";

export const releaseRepository = "Gaurav-7489/automobile_engine_used_cars";
export type DesktopPlatform = "windows" | "mac";
export interface DesktopAsset { name: string; url: string; size: number; sha256: string | null }
export interface DesktopRelease { tag: string; commit: string; url: string; publishedAt: string; development: true; assets: Partial<Record<DesktopPlatform, DesktopAsset>> }

export function parseDesktopRelease(input: unknown): DesktopRelease | null {
  if (!input || typeof input !== "object") return null;
  const item = input as Record<string, unknown>;
  if (item.draft !== false || item.prerelease !== true || typeof item.tag_name !== "string" ||
    !/^desktop-[a-f0-9]{12}$/.test(item.tag_name) || typeof item.target_commitish !== "string" ||
    !/^[a-f0-9]{40}$/.test(item.target_commitish) || !item.target_commitish.startsWith(item.tag_name.slice(8)) ||
    typeof item.published_at !== "string" || !Number.isFinite(Date.parse(item.published_at)) || !Array.isArray(item.assets)) return null;
  const prefix = `https://github.com/${releaseRepository}/releases/download/${item.tag_name}/`;
  const assets: DesktopRelease["assets"] = {};
  for (const platform of ["windows", "mac"] as const) {
    const name = platform === "windows" ? "Automobile-Engine-Windows-x64.exe" : "Automobile-Engine-macOS-universal.dmg";
    const raw = item.assets.find((value: unknown) => value && typeof value === "object" && (value as Record<string, unknown>).name === name);
    if (!raw || typeof raw !== "object") continue;
    const asset = raw as Record<string, unknown>;
    if (asset.browser_download_url !== prefix + name || typeof asset.size !== "number" || asset.size <= 0 || !Number.isSafeInteger(asset.size) || asset.state !== "uploaded") continue;
    assets[platform] = { name, url: prefix + name, size: asset.size, sha256: typeof asset.digest === "string" && /^sha256:[a-f0-9]{64}$/.test(asset.digest) ? asset.digest.slice(7) : null };
  }
  // Both installers must exist before a release appears in the product.
  if (!assets.windows || !assets.mac) return null;
  return { tag: item.tag_name, commit: item.target_commitish, url: `https://github.com/${releaseRepository}/releases/tag/${item.tag_name}`, publishedAt: item.published_at, development: true, assets };
}

export const getDesktopRelease = unstable_cache(async (): Promise<DesktopRelease | null> => {
  try {
    const response = await fetch(`https://api.github.com/repos/${releaseRepository}/releases?per_page=30`, {
      headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
      signal: AbortSignal.timeout(5000), cache: "no-store",
    });
    if (!response.ok) return null;
    const items: unknown = await response.json();
    if (!Array.isArray(items)) return null;
    return items.map(parseDesktopRelease).filter((item): item is DesktopRelease => item !== null)
      .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))[0] ?? null;
  } catch { return null; }
}, ["desktop-release-v1"], { revalidate: 300 });
