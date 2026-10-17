import type { AcquisitionReport } from "@vandlabs/contracts";
/** A Cloudflare service binding to the Dealer AI Worker (env.DEALER_AI). */
export type DealerAiBinding = { fetch(request: Request): Promise<Response> };
export const dealerAiUserAgent = "VandLabs-CommandCenter/1.0 (+dealer-ai)";
// workerd rejects redirect "error", so redirects use "manual" and any 3xx is treated as unavailable.
// Requests through a service binding never reach the public edge, so bot and browser-integrity
// rules (Cloudflare error 1010) cannot block them. DEALER_AI_URL remains for non-Cloudflare hosts.
export async function explainAcquisition(report: AcquisitionReport, processingAllowed = false, binding?: DealerAiBinding): Promise<AcquisitionReport> {
  const endpoint = process.env.DEALER_AI_URL, token = process.env.DEALER_AI_SERVICE_TOKEN;
  if ((!binding && !endpoint) || !token) return { ...report, ai: { status: "not_configured" } };
  if (!processingAllowed) return { ...report, ai: { status: "restricted" } };
  if (!report.options.length) return { ...report, ai: { status: "unavailable" } };
  try {
    const url = binding ? new URL("https://dealer-ai.internal/explain") : new URL(endpoint!);
    if (url.protocol !== "https:") throw new Error("Invalid AI configuration");
    const init: RequestInit = { method: "POST", headers: { "content-type": "application/json", accept: "application/json", "user-agent": dealerAiUserAgent, authorization: `Bearer ${token}` }, body: JSON.stringify({ demo: report.demo, notices: report.notices, options: report.options.slice(0, 3).map(o => ({ cars: o.cars.map(c => ({ model: `${c.year} ${c.make} ${c.model}`, city: c.city, distanceKm: c.distanceKm })), landedCost: o.landedCost, marginLow: o.marginLow, marginHigh: o.marginHigh, remaining: o.remaining, demandScore: o.demandScore, explanation: o.explanation })) }), redirect: "manual", signal: AbortSignal.timeout(12000), cache: "no-store" };
    const response = binding ? await binding.fetch(new Request(url, init)) : await fetch(url, init);
    if (!response.ok || !response.body) {
      // Status and edge ray id only: enough to tell a 401 token mismatch from an edge 403/1010.
      console.warn("Dealer AI unavailable", { status: response.status, transport: binding ? "binding" : "url", ray: response.headers.get("cf-ray") });
      return { ...report, ai: { status: "unavailable" } };
    }
    const { objectBody } = await import("./http");
    const result = await objectBody(new Request("https://ai.internal", { method: "POST", body: response.body, duplex: "half" } as RequestInit));
    if (typeof result.text !== "string" || result.text.length > 1500 || typeof result.model !== "string") throw new Error("Invalid AI output");
    return { ...report, ai: { status: "available", text: result.text, model: result.model } };
  } catch (error) {
    // Error class only: messages could echo request details.
    console.warn("Dealer AI unavailable", { error: error instanceof Error ? error.name : "unknown", transport: binding ? "binding" : "url" });
    return { ...report, ai: { status: "unavailable" } };
  }
}
