import { json, problem, rateLimited, readJson } from "@/lib/api";
import { clientKey, hitShared } from "@/lib/rate-limit";
import { launchAction, type LaunchAction } from "@/lib/server/ad-campaigns";
import { getPrincipal, hasRecentReauth } from "@/lib/server/auth";
import { sameOrigin } from "@/lib/server/csrf";
import { appOrigin } from "@/lib/server/google-oauth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Publish, pause or resume an approved campaign on Google Ads and Facebook/Instagram. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return problem(403, "forbidden", "Request origin is not allowed.");
  const current = await getPrincipal();
  if (!current) return problem(401, "unauthenticated", "Sign in to continue.");
  if (!(await hitShared(`ad-launch:${current.principal.userId}:${clientKey(request)}`, 20, 10 * 60_000)).allowed) return rateLimited("Too many requests. Wait a few minutes.", 120);
  const body = await readJson<{ campaignId?: unknown; action?: unknown }>(request);
  const action = body?.action;
  if (typeof body?.campaignId !== "string" || body.campaignId.length > 40 || !(action === "publish" || action === "pause" || action === "resume")) return problem(422, "invalid", "Choose a campaign and an action.");
  try {
    const outcome = await launchAction(current.principal, body.campaignId, action as LaunchAction, appOrigin(request), await hasRecentReauth(current.principal.userId));
    return outcome.ok ? json(outcome) : problem(outcome.status, "failed", outcome.message);
  } catch (error) {
    console.error(JSON.stringify({ event: "ad_launch_route_failure", message: error instanceof Error ? error.message : "unknown" }));
    return problem(500, "failed", "The campaign could not be updated. Try again.");
  }
}
