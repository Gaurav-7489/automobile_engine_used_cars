import { headers } from "next/headers";
import { buildCockpit, planMeters } from "@vandlabs/data/cockpit";
import { dealerCommerce } from "@vandlabs/data/commerce";
import { commandData } from "./data";
import { resolvePrincipal } from "./auth";

/**
 * One server-side read for every cockpit screen: the role-filtered snapshot the caller may see,
 * plus their plan meters. The cockpit engine only counts what is present, so a role that was
 * never given capital or CRM data gets `null`, not zero.
 */
export async function cockpitData(now = new Date()) {
  const request = new Request(process.env.APP_ORIGIN || "http://localhost:3001", { headers: await headers() });
  const [data, principal] = await Promise.all([commandData(), resolvePrincipal(request)]);
  let plan;
  try {
    const status = await (await dealerCommerce()).planStatus(principal);
    plan = planMeters(status.subscription, status.usage, data.vehicles.filter(v => v.availabilityStatus !== "sold").length, now);
  } catch (error) {
    // Plan meters are informative; an unavailable commerce store must not take the cockpit down.
    console.error(JSON.stringify({ event: "cockpit_plan_unavailable", reason: error instanceof Error ? error.name : "unknown" }));
  }
  const access = { capital: principal.capabilities.includes("capital:read"), leads: principal.capabilities.includes("lead:read") };
  return { data, cockpit: buildCockpit(data, access, now, plan), access, canResolve: principal.capabilities.includes("task:write") && access.leads };
}
