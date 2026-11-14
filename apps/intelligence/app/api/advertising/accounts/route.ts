import { json, problem, readJson } from "@/lib/api";
import { adAccountStatus, canManageAds, chooseAccount, disconnect, isAdProvider } from "@/lib/server/ad-accounts";
import { disconnectWhatsApp, platformStatus } from "@/lib/server/connections";
import { getPrincipal } from "@/lib/server/auth";
import { sameOrigin } from "@/lib/server/csrf";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET() {
  const current = await getPrincipal();
  if (!current) return problem(401, "unauthenticated", "Sign in to continue.");
  if (!can(current.principal.role, "campaign.view")) return problem(403, "forbidden", "Your role cannot view advertising.");
  try {
    return json({ accounts: await adAccountStatus(current.principal), platforms: await platformStatus(current.principal), canManage: canManageAds(current.principal) });
  } catch (error) {
    // Most often a database that has not had the advertising migrations applied (0021, 0022).
    console.error(JSON.stringify({ event: "ad_accounts_unavailable", message: error instanceof Error ? error.message.slice(0, 200) : "unknown" }));
    return problem(503, "unavailable", "Connected accounts are not available right now.");
  }
}

/** Switch the ad account in use, or disconnect a provider (its stored tokens are deleted). */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return problem(403, "forbidden", "Request origin is not allowed.");
  const current = await getPrincipal();
  if (!current) return problem(401, "unauthenticated", "Sign in to continue.");
  if (!canManageAds(current.principal)) return problem(403, "forbidden", "Only an owner or manager can change advertising accounts.");
  const body = await readJson<{ provider?: unknown; action?: unknown; accountId?: unknown }>(request);
  if (body?.provider === "whatsapp" && body.action === "disconnect") return (await disconnectWhatsApp(current.principal)) ? json({ ok: true, platforms: await platformStatus(current.principal) }) : problem(404, "not_found", "WhatsApp is not connected.");
  if (!body || !isAdProvider(body.provider)) return problem(422, "invalid", "Choose Google or Facebook.");
  const done = body.action === "disconnect" ? await disconnect(current.principal, body.provider)
    : body.action === "choose" && typeof body.accountId === "string" ? await chooseAccount(current.principal, body.provider, body.accountId.slice(0, 40)) : null;
  if (done === null) return problem(422, "invalid", "Unknown action.");
  return done ? json({ ok: true, accounts: await adAccountStatus(current.principal) }) : problem(404, "not_found", "That account is not connected.");
}
