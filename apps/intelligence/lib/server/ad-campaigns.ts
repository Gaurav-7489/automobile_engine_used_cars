import type { Campaign, Vehicle } from "../domain";
import { listingPath } from "../social-post";
import { adAccess, type AdProvider } from "./ad-accounts";
import { launchGoogle, launchMeta, setGoogleStatus, setMetaStatus, type LaunchInput, type PlatformIds } from "./ad-launch";
import { tenantTx } from "./db";
import type { Principal } from "./identity";
import { runCommands } from "./workspace";

/**
 * Publish, pause and resume against the real ad platforms. The workspace command runs first, so every rule that already
 * applies (role, approval, preflight, available stock, end date) still decides whether anything may happen. Only then are
 * the platforms called, and the campaign becomes Active or Paused only from what they confirmed.
 */
export type LaunchAction = "publish" | "pause" | "resume";
export type LaunchOutcome = { ok: true; status: Campaign["status"]; message: string } | { ok: false; status: number; message: string };

const COMMAND: Record<LaunchAction, string> = { publish: "publishCampaign", pause: "pauseCampaign", resume: "resumeCampaign" };
const PROVIDER_OF = { search: "google", meta: "meta" } as const;
const NAME: Record<AdProvider, string> = { google: "Google Ads", meta: "Facebook and Instagram" };

async function readCampaign(principal: Principal, id: string): Promise<{ campaign: Campaign; vehicle: Vehicle | null; city: string; dealer: string } | null> {
  return tenantTx(principal.tenantId, async (c) => {
    const campaign = (await c.query("SELECT payload FROM intelligence_documents WHERE tenant_id = $1 AND collection = 'campaigns' AND id = $2", [principal.tenantId, id])).rows[0]?.payload as Campaign | undefined;
    if (!campaign) return null;
    const v = (await c.query("SELECT data, branch_id FROM intelligence_vehicle_index WHERE tenant_id = $1 AND stock_id = $2", [principal.tenantId, campaign.vehicleId])).rows[0] as { data: Vehicle; branch_id: string } | undefined;
    const city = v ? String((await c.query("SELECT city FROM locations WHERE tenant_id = $1 AND id = $2", [principal.tenantId, v.branch_id])).rows[0]?.city ?? "") : "";
    const dealer = String((await c.query("SELECT name FROM organizations WHERE tenant_id = $1 ORDER BY created_at LIMIT 1", [principal.tenantId])).rows[0]?.name ?? "");
    return { campaign, vehicle: v?.data ?? null, city, dealer };
  });
}

async function finish(principal: Principal, id: string, patch: (c: Campaign) => Campaign): Promise<Campaign | null> {
  return tenantTx(principal.tenantId, async (c) => {
    const row = (await c.query("SELECT payload FROM intelligence_documents WHERE tenant_id = $1 AND collection = 'campaigns' AND id = $2 FOR UPDATE", [principal.tenantId, id])).rows[0]?.payload as Campaign | undefined;
    if (!row) return null;
    const next = patch(row);
    await c.query("UPDATE intelligence_documents SET payload = $3, version = version + 1, updated_at = now() WHERE tenant_id = $1 AND collection = 'campaigns' AND id = $2", [principal.tenantId, id, next]);
    return next;
  });
}

export async function launchAction(principal: Principal, campaignId: string, action: LaunchAction, origin: string, reauthenticated: boolean): Promise<LaunchOutcome> {
  const before = await readCampaign(principal, campaignId);
  if (!before) return { ok: false, status: 404, message: "Campaign not found." };
  const channels = before.campaign.channels.filter((ch) => ch.enabled && (ch.id === "search" || ch.id === "meta")).map((ch) => PROVIDER_OF[ch.id as "search" | "meta"]);
  if (!channels.length) return { ok: false, status: 422, message: "Choose Google Search or Facebook and Instagram for this campaign first." };
  const accesses = new Map<AdProvider, NonNullable<Awaited<ReturnType<typeof adAccess>>>>();
  for (const p of channels) {
    const access = await adAccess(principal.tenantId, p);
    if (!access) return { ok: false, status: 409, message: `${NAME[p]} is not connected, or its access has expired. Connect it again at the top of Advertising.` };
    accesses.set(p, access);
  }

  const command = await runCommands(principal, [{ name: COMMAND[action], args: [campaignId] }], reauthenticated);
  if (!command.ok) return { ok: false, status: command.status, message: command.message };

  const stamp = () => new Date().toISOString();
  const { campaign, vehicle } = before;
  const errors: string[] = [];
  const ids: PlatformIds = { ...(campaign.platform ?? {}) };

  if (action === "publish") {
    if (!vehicle) return { ok: false, status: 409, message: "The car for this campaign is no longer in stock." };
    const input: LaunchInput = { campaign, vehicle, city: before.city || "India", dealer: before.dealer, landingUrl: `${origin}${listingPath(principal.tenantId, vehicle.id)}?utm_source=ads&utm_medium=paid&utm_campaign=${encodeURIComponent(campaign.utm)}` };
    for (const [p, access] of accesses) {
      try {
        const r = p === "google" ? await launchGoogle(access, input) : await launchMeta(access, input);
        if (r.ok) (ids as Record<string, unknown>)[p] = r.ids; else errors.push(`${NAME[p]}: ${r.message}`);
      } catch (error) {
        errors.push(`${NAME[p]}: could not be reached.`);
        console.error(JSON.stringify({ event: "ad_launch_failure", provider: p, message: error instanceof Error ? error.message : "unknown" }));
      }
    }
    // All or nothing: if one platform refused, the campaign returns to Approved so it can be fixed and published again, and the other platform is paused so the dealership is never half-advertising by surprise.
    if (errors.length) {
      if (ids.google && accesses.get("google")) await setGoogleStatus(accesses.get("google")!, ids.google, true).catch(() => undefined);
      if (ids.meta && accesses.get("meta")) await setMetaStatus(accesses.get("meta")!, ids.meta, true).catch(() => undefined);
    }
  } else {
    const paused = action === "pause";
    for (const [p, access] of accesses) {
      const known = p === "google" ? ids.google : ids.meta;
      if (!known) { errors.push(`${NAME[p]}: this campaign was never created there.`); continue; }
      try {
        const r = p === "google" ? await setGoogleStatus(access, ids.google!, paused) : await setMetaStatus(access, ids.meta!, paused);
        if (!r.ok) errors.push(`${NAME[p]}: ${r.message}`);
      } catch {
        errors.push(`${NAME[p]}: could not be reached.`);
      }
    }
  }

  const ok = errors.length === 0;
  const status: Campaign["status"] = action === "publish" ? (ok ? "Active" : "Approved") : action === "pause" ? (ok ? "Paused" : "Active") : ok ? "Active" : "Paused";
  const note = ok
    ? action === "publish" ? `Live on ${[...accesses.keys()].map((p) => NAME[p]).join(" and ")}` : action === "pause" ? "Paused on every platform" : "Running again on every platform"
    : `Not done. ${errors.join(" ")}`;
  const saved = await finish(principal, campaignId, (c) => ({ ...c, status, platformAck: "acknowledged", platform: ids, history: [...c.history, { at: stamp(), actor: "Platform", action: note }] }));
  if (!saved) return { ok: false, status: 404, message: "Campaign not found." };
  return ok ? { ok: true, status, message: note } : { ok: false, status: 502, message: note };
}
