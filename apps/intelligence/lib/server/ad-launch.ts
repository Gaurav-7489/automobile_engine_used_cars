import type { Campaign, Vehicle } from "../domain";
import { googleAdsBase, googleAdsHeaders, metaBase, type AdAccess } from "./ad-accounts";

/**
 * Creates, pauses and resumes real campaigns on Google Ads and Meta from an approved VandLabs campaign.
 *
 * Money: VandLabs budgets are in paise. The platform's daily budget is the channel's 30-day budget spread over 30 days, never
 * more than the campaign's daily limit, and the campaign always carries the approved end date, so spend stops on its own.
 * Nothing here reports "live" unless the platform returned the ids of what it created.
 *
 * These requests follow the providers' published REST interfaces. They have not been run against live ad accounts from this
 * codebase: the first real launch for each provider should be watched in that provider's own ads manager.
 */
export type LaunchInput = { campaign: Campaign; vehicle: Vehicle; landingUrl: string; city: string; dealer: string };
export type PlatformIds = NonNullable<Campaign["platform"]>;
export type LaunchResult<T> = { ok: true; ids: T } | { ok: false; message: string };

const cut = (text: string, max: number) => (text.length <= max ? text : text.slice(0, max).replace(/\s+\S*$/, "").trim() || text.slice(0, max));
const channelBudget = (c: Campaign, id: "search" | "meta") => c.channels.find((ch) => ch.id === id && ch.enabled)?.budget ?? 0;
/** Paise per day for one channel. */
export const dailyPaise = (c: Campaign, id: "search" | "meta") => Math.max(100, Math.min(Math.round(channelBudget(c, id) / 30), c.dailyCap));

const providerError = (body: unknown, fallback: string): string => {
  const e = (body as { error?: { message?: unknown; error_user_msg?: unknown } } | undefined)?.error;
  const text = typeof e?.error_user_msg === "string" ? e.error_user_msg : typeof e?.message === "string" ? e.message : "";
  return text ? `${fallback} (${cut(text, 240)})` : fallback;
};

async function call(url: string, init: RequestInit): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const response = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(20_000) });
  return { ok: response.ok, status: response.status, body: (await response.json().catch(() => ({}))) as Record<string, unknown> };
}

/* Google Ads: one Search campaign ------------------------------------------------ */

export function googleSearchAd(input: LaunchInput): { headlines: string[]; descriptions: string[]; keywords: string[] } {
  const v = input.vehicle;
  const name = `${v.make} ${v.model}`;
  const headlines = [...new Set([cut(input.campaign.headline, 30), cut(`${v.year} ${name}`, 30), cut(`Used ${name} in ${input.city}`, 30), cut(input.dealer, 30), cut(`${v.fuel} ${v.transmission}`, 30)].filter((h) => h.length >= 3))].slice(0, 5);
  const descriptions = [...new Set([cut(input.campaign.body, 90), cut(`${v.year} ${name}, ${v.km.toLocaleString("en-IN")} km. See photos and price, then enquire.`, 90)])];
  const keywords = [...new Set([`used ${name}`, `${name} ${input.city}`, `second hand ${name}`, `${v.year} ${name}`].map((k) => k.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim()))];
  return { headlines, descriptions, keywords };
}

export async function launchGoogle(access: AdAccess, input: LaunchInput): Promise<LaunchResult<NonNullable<PlatformIds["google"]>>> {
  const customer = access.accountId;
  const headers = googleAdsHeaders(access.token);
  const ad = googleSearchAd(input);
  if (ad.headlines.length < 3 || ad.descriptions.length < 2) return { ok: false, message: "Google needs at least three short headlines and two descriptions. Add more ad text and try again." };
  // The city is resolved to Google's own location id; without a match the campaign targets India rather than guessing.
  const geo = await call(`${googleAdsBase()}/geoTargetConstants:suggest`, { method: "POST", headers, body: JSON.stringify({ locale: "en", countryCode: "IN", locationNames: { names: [input.city] } }) });
  const suggestion = (geo.body.geoTargetConstantSuggestions as { geoTargetConstant?: { resourceName?: string } }[] | undefined)?.[0]?.geoTargetConstant?.resourceName;
  const location = typeof suggestion === "string" ? suggestion : "geoTargetConstants/2356";
  const temp = (kind: string, n: number) => `customers/${customer}/${kind}/-${n}`;
  const c = input.campaign;
  const operations = [
    { campaignBudgetOperation: { create: { resourceName: temp("campaignBudgets", 1), name: `VandLabs ${c.id} ${Date.now()}`, amountMicros: String(dailyPaise(c, "search") * 10_000), deliveryMethod: "STANDARD", explicitlyShared: false } } },
    { campaignOperation: { create: {
      resourceName: temp("campaigns", 2), name: `VandLabs ${c.id} ${cut(c.name, 60)}`, status: "ENABLED", advertisingChannelType: "SEARCH", campaignBudget: temp("campaignBudgets", 1),
      manualCpc: {}, networkSettings: { targetGoogleSearch: true, targetSearchNetwork: false, targetContentNetwork: false, targetPartnerSearchNetwork: false },
      startDate: c.startDate, endDate: c.endDate, containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
    } } },
    { campaignCriterionOperation: { create: { campaign: temp("campaigns", 2), location: { geoTargetConstant: location } } } },
    { adGroupOperation: { create: { resourceName: temp("adGroups", 3), name: `${c.id} ${input.vehicle.id}`, campaign: temp("campaigns", 2), status: "ENABLED", type: "SEARCH_STANDARD", cpcBidMicros: "10000000" } } },
    ...ad.keywords.map((text) => ({ adGroupCriterionOperation: { create: { adGroup: temp("adGroups", 3), status: "ENABLED", keyword: { text, matchType: "PHRASE" } } } })),
    { adGroupAdOperation: { create: { adGroup: temp("adGroups", 3), status: "ENABLED", ad: { finalUrls: [input.landingUrl], responsiveSearchAd: { headlines: ad.headlines.map((text) => ({ text })), descriptions: ad.descriptions.map((text) => ({ text })) } } } } },
  ];
  // One atomic request: if any part is rejected, nothing is created and nothing can spend.
  const out = await call(`${googleAdsBase()}/customers/${customer}/googleAds:mutate`, { method: "POST", headers, body: JSON.stringify({ mutateOperations: operations }) });
  const responses = (out.body.mutateOperationResponses ?? []) as Record<string, { resourceName?: string }>[];
  const budget = responses[0]?.campaignBudgetResult?.resourceName;
  const campaign = responses[1]?.campaignResult?.resourceName;
  if (!out.ok || !budget || !campaign) return { ok: false, message: providerError(out.body, "Google Ads did not create the campaign.") };
  return { ok: true, ids: { campaign, budget } };
}

export async function setGoogleStatus(access: AdAccess, ids: NonNullable<PlatformIds["google"]>, paused: boolean): Promise<LaunchResult<null>> {
  const out = await call(`${googleAdsBase()}/customers/${access.accountId}/campaigns:mutate`, { method: "POST", headers: googleAdsHeaders(access.token), body: JSON.stringify({ operations: [{ update: { resourceName: ids.campaign, status: paused ? "PAUSED" : "ENABLED" }, updateMask: "status" }] }) });
  return out.ok ? { ok: true, ids: null } : { ok: false, message: providerError(out.body, `Google Ads did not ${paused ? "pause" : "resume"} the campaign.`) };
}

/* Meta: one campaign, one ad set, one link ad on Facebook and Instagram ------------- */

const metaPost = (access: AdAccess, path: string, fields: Record<string, unknown>) => call(`${metaBase()}/${path}`, {
  method: "POST", headers: { authorization: `Bearer ${access.token}`, "content-type": "application/json" },
  body: JSON.stringify(Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined && v !== null))),
});

export async function launchMeta(access: AdAccess, input: LaunchInput): Promise<LaunchResult<NonNullable<PlatformIds["meta"]>>> {
  const account = access.accountId.startsWith("act_") ? access.accountId : `act_${access.accountId}`;
  const c = input.campaign;
  if (!access.details.pageId) return { ok: false, message: "No Facebook Page is linked. Reconnect Facebook and choose your dealership's Page." };
  const photo = input.vehicle.photos?.find((url) => url.startsWith("https://"));
  if (!photo) return { ok: false, message: "Facebook and Instagram ads need a photo. Add a photo to this car in Inventory first." };
  const instagram = access.details.instagramId ?? null;
  // Everything is created paused and switched on only after the ad itself exists, so a half-built campaign can never spend.
  const created: string[] = [];
  const fail = async (body: unknown, what: string): Promise<LaunchResult<never>> => {
    for (const id of created.reverse()) await call(`${metaBase()}/${id}`, { method: "DELETE", headers: { authorization: `Bearer ${access.token}` } }).catch(() => undefined);
    return { ok: false, message: providerError(body, `Facebook did not create the ${what}.`) };
  };
  const campaign = await metaPost(access, `${account}/campaigns`, { name: `VandLabs ${c.id} ${cut(c.name, 60)}`, objective: "OUTCOME_TRAFFIC", status: "PAUSED", special_ad_categories: [], is_adset_budget_sharing_enabled: false });
  if (!campaign.ok || typeof campaign.body.id !== "string") return fail(campaign.body, "campaign");
  created.push(campaign.body.id);
  const city = await call(`${metaBase()}/search?${new URLSearchParams({ type: "adgeolocation", location_types: '["city"]', country_code: "IN", q: input.city, limit: "1" })}`, { headers: { authorization: `Bearer ${access.token}` } });
  const cityKey = (city.body.data as { key?: string }[] | undefined)?.[0]?.key;
  const adset = await metaPost(access, `${account}/adsets`, {
    name: `${c.id} ${input.vehicle.id}`, campaign_id: campaign.body.id, status: "PAUSED", daily_budget: dailyPaise(c, "meta"), billing_event: "IMPRESSIONS", optimization_goal: "LINK_CLICKS", bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    start_time: `${c.startDate}T00:00:00+0530`, end_time: `${c.endDate}T23:59:00+0530`,
    targeting: {
      geo_locations: cityKey ? { cities: [{ key: cityKey, radius: Math.min(80, Math.max(17, c.radiusKm)), distance_unit: "kilometer" }] } : { countries: ["IN"] },
      publisher_platforms: instagram ? ["facebook", "instagram"] : ["facebook"],
      targeting_automation: { advantage_audience: 0 },
    },
  });
  if (!adset.ok || typeof adset.body.id !== "string") return fail(adset.body, "ad set");
  created.push(adset.body.id);
  const creative = await metaPost(access, `${account}/adcreatives`, {
    name: `${c.id} creative`,
    object_story_spec: { page_id: access.details.pageId, ...(instagram ? { instagram_user_id: instagram } : {}), link_data: { link: input.landingUrl, message: c.body, name: cut(c.headline, 60), picture: photo, call_to_action: { type: "LEARN_MORE", value: { link: input.landingUrl } } } },
  });
  if (!creative.ok || typeof creative.body.id !== "string") return fail(creative.body, "ad");
  const ad = await metaPost(access, `${account}/ads`, { name: `${c.id} ad`, adset_id: adset.body.id, creative: { creative_id: creative.body.id }, status: "ACTIVE" });
  if (!ad.ok || typeof ad.body.id !== "string") return fail(ad.body, "ad");
  const ids = { campaign: campaign.body.id, adset: adset.body.id, ad: ad.body.id };
  const live = await setMetaStatus(access, ids, false);
  if (!live.ok) return fail({ error: { message: live.message } }, "campaign");
  return { ok: true, ids };
}

export async function setMetaStatus(access: AdAccess, ids: NonNullable<PlatformIds["meta"]>, paused: boolean): Promise<LaunchResult<null>> {
  for (const id of [ids.campaign, ids.adset]) {
    const out = await metaPost(access, id, { status: paused ? "PAUSED" : "ACTIVE" });
    if (!out.ok) return { ok: false, message: providerError(out.body, `Facebook did not ${paused ? "pause" : "resume"} the campaign.`) };
  }
  return { ok: true, ids: null };
}
