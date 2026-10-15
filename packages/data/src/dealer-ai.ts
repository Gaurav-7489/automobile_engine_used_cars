import type { AcquisitionReport } from "@vandlabs/contracts";
export async function explainAcquisition(report: AcquisitionReport, processingAllowed = false): Promise<AcquisitionReport> {
  const endpoint = process.env.DEALER_AI_URL, token = process.env.DEALER_AI_SERVICE_TOKEN;
  if (!endpoint || !token) return { ...report, ai: { status: "not_configured" } };
  if (!processingAllowed) return { ...report, ai: { status: "restricted" } };
  if (!report.options.length) return { ...report, ai: { status: "unavailable" } };
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:") throw new Error("Invalid AI configuration");
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ demo: report.demo, notices: report.notices, options: report.options.slice(0, 3).map(o => ({ cars: o.cars.map(c => ({ model: `${c.year} ${c.make} ${c.model}`, city: c.city, distanceKm: c.distanceKm })), landedCost: o.landedCost, marginLow: o.marginLow, marginHigh: o.marginHigh, remaining: o.remaining, demandScore: o.demandScore, explanation: o.explanation })) }), redirect: "error", signal: AbortSignal.timeout(12000), cache: "no-store" });
    if (!response.ok || !response.body) throw new Error("AI unavailable");
    const { objectBody } = await import("./http");
    const result = await objectBody(new Request("https://ai.internal", { method: "POST", body: response.body, duplex: "half" } as RequestInit));
    if (typeof result.text !== "string" || result.text.length > 1500 || typeof result.model !== "string") throw new Error("Invalid AI output");
    return { ...report, ai: { status: "available", text: result.text, model: result.model } };
  } catch { return { ...report, ai: { status: "unavailable" } }; }
}
