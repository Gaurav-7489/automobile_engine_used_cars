import { getCloudflareContext } from "@opennextjs/cloudflare";
import { makesMentioned } from "@vandlabs/data/discovery";
import type { DiscoveryPage } from "./discovery";

export type DiscoverySummary = { source: "ai"; text: string; model: string } | { source: "disabled" | "not_configured" | "rules" | "unavailable" };
type Binding = { fetch(request: Request): Promise<Response> };
export const discoveryAiAgent = "VandLabs-Discovery/1.0 (+discovery-ai)";

/** Model text may only rephrase what the cards already show: no numbers, links or cars we didn't send. */
export function groundedSummary(text: unknown, cars: { year: number; make: string; model: string }[]): string | null {
  if (typeof text !== "string") return null;
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean || clean.length > 600 || /https?:|www\.|[<>]|\]\(|guarantee|promise|certified|accident[- ]free/i.test(clean)) return null;
  const allowed = new Set(cars.map(car => car.make));
  if (makesMentioned(clean).some(make => !allowed.has(make))) return null;
  const names = cars.flatMap(car => [`${car.year} ${car.make} ${car.model}`, `${car.make} ${car.model}`, car.model, String(car.year)]).sort((a, b) => b.length - a.length);
  let rest = clean; for (const name of names) rest = rest.split(name).join(" ");
  return /\d/.test(rest) ? null : clean;
}

/** Optional commentary on deterministic results. Failure never affects the results themselves. */
export async function discoverySummary(page: DiscoveryPage, editorial: boolean): Promise<DiscoverySummary> {
  if (process.env.DISCOVERY_AI_ENABLED !== "true") return { source: "disabled" };
  const token = process.env.DISCOVERY_AI_SERVICE_TOKEN, endpoint = process.env.DISCOVERY_AI_URL;
  let binding: Binding | undefined;
  if (process.env.HOSTING_PROVIDER === "cloudflare") {
    try { binding = ((await getCloudflareContext({ async: true })).env as unknown as { DISCOVERY_AI?: Binding }).DISCOVERY_AI; } catch { binding = undefined; }
  }
  if ((!binding && !endpoint) || !token) return { source: "not_configured" };
  if (!page.results.length) return { source: "rules" };
  const shown = page.results.slice(0, 3).map(match => match.card);
  const payload = {
    query: page.turns.slice(-4), understood: page.chips.map(chip => chip.label).slice(0, 12), demo: editorial,
    notes: page.notices.filter(notice => notice.kind === "unsupported").map(notice => notice.text).slice(0, 3),
    cars: page.results.slice(0, 3).map((match, index) => ({ ref: String.fromCharCode(65 + index), name: `${match.card.year} ${match.card.make} ${match.card.model}`, matches: match.requirements.slice(0, 6), strengths: match.strengths.slice(0, 3), checks: match.caveats.slice(0, 2) })),
  };
  try {
    const url = binding ? new URL("https://dealer-ai.internal/discover") : new URL(endpoint!);
    if (url.protocol !== "https:") throw new Error("Invalid AI configuration");
    const init: RequestInit = { method: "POST", headers: { "content-type": "application/json", accept: "application/json", "user-agent": discoveryAiAgent, authorization: `Bearer ${token}` }, body: JSON.stringify(payload), redirect: "manual", signal: AbortSignal.timeout(6000), cache: "no-store" };
    const response = binding ? await binding.fetch(new Request(url, init)) : await fetch(url, init);
    if (!response.ok) { console.warn("Discovery AI unavailable", { status: response.status, transport: binding ? "binding" : "url", ray: response.headers.get("cf-ray") }); return { source: "unavailable" }; }
    const result = await response.json() as { text?: unknown; model?: unknown };
    const text = groundedSummary(result.text, shown);
    if (!text || typeof result.model !== "string" || result.model.length > 100) { console.warn("Discovery AI output rejected", { transport: binding ? "binding" : "url" }); return { source: "rules" }; }
    return { source: "ai", text, model: result.model };
  } catch (error) {
    console.warn("Discovery AI unavailable", { error: error instanceof Error ? error.name : "unknown", transport: binding ? "binding" : "url" });
    return { source: "unavailable" };
  }
}
