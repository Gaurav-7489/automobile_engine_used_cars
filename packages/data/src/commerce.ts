import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { demoTransaction } from "@vandlabs/demo-data/runtime";
import { commercePlans, planEntitlements, requireCapability, type AuthenticatedPrincipal, type CommerceState, type ApiScope, type BusinessKey } from "@vandlabs/contracts";
import { explainAcquisition, type DealerAiBinding } from "./dealer-ai";
import { dataMode } from "./config";
import { marketReport } from "./market";
import { providerSync, sourceSyncSummary } from "./provider-sync";
import { databasePool, tenantTransaction, type SqlPool } from "./postgres";
import { assertFeature, assertPlanFits, countUsage, takeAiRequest, type TenantUsage } from "./entitlements";
import { CommerceError, acquisitionInput, recommend, eligibleVehicles, fuelPrices, sourceInput, future, plan, text, object, allowedSource, ingestBatch, queryVehicles, sourceCoverage } from "./commerce-rules";
export { CommerceError } from "./commerce-rules";
export type { DealerAiBinding } from "./dealer-ai";
export type CommerceRepository = { transact<T>(tenantId: string, action: (state: CommerceState) => T): Promise<T>; read?<T>(tenantId: string, action: (state: CommerceState) => T): Promise<T> };
const emptyState = (): CommerceState => ({ subscription: null, sources: [], vehicles: [], fuel: [], keys: [], usage: {}, audit: [] });
export function postgresCommerceRepository(pool: SqlPool): CommerceRepository {
  return {
    // Pure reads never create the row or bump its version.
    read: (tenantId, action) => tenantTransaction(pool, tenantId, async client => {
      const row = (await client.query("SELECT payload FROM dealer_commerce WHERE tenant_id=$1", [tenantId])).rows[0];
      return action(structuredClone((row?.payload as CommerceState | undefined) ?? emptyState()));
    }),
    transact: (tenantId, action) => tenantTransaction(pool, tenantId, async client => {
    await client.query("INSERT INTO dealer_commerce(tenant_id,payload) VALUES($1,$2) ON CONFLICT(tenant_id) DO NOTHING", [tenantId, emptyState()]);
    const row = (await client.query("SELECT payload FROM dealer_commerce WHERE tenant_id=$1 FOR UPDATE", [tenantId])).rows[0];
    if (!row) throw new CommerceError(403, "Tenant unavailable.");
    const state = row.payload as CommerceState;
    const result = action(state);
    await client.query("UPDATE dealer_commerce SET payload=$2,version=version+1,updated_at=now() WHERE tenant_id=$1", [tenantId, state]);
    return result;
  }) };
}
function demoState(): CommerceState {
  const state = emptyState(), now = new Date(), expiresAt = new Date(now.getTime() + 7 * 86400000).toISOString();
  state.subscription = { plan: "growth", status: "active", expiresAt, reference: "Local demonstration; no payment", updatedAt: now.toISOString() };
  state.sources = [{ id: "demo", name: "Fictional dealer sourcing examples", kind: "demo", agreement: "Demonstration data only; no live provider", dealerUse: true, redistribute: true, enabled: true, expiresAt }];
  const examples = [
    ["swift", "Maruti", "Swift", 2021, "Kochi", "Kerala", 9.9312, 76.2673, 400000, 20000, 5000, 465000, 485000, 82],
    ["i20", "Hyundai", "i20", 2020, "Kochi", "Kerala", 9.9312, 76.2673, 450000, 25000, 5000, 520000, 545000, 76],
    ["baleno", "Maruti", "Baleno", 2021, "Bengaluru", "Karnataka", 12.9716, 77.5946, 480000, 20000, 5000, 550000, 575000, 85],
    ["creta", "Hyundai", "Creta", 2020, "Kochi", "Kerala", 9.9312, 76.2673, 850000, 35000, 5000, 960000, 995000, 88],
  ];
  state.vehicles = examples.map(([id, make, model, year, city, region, latitude, longitude, purchase, preparation, fees, low, high, demand]) => ({ id: `demo:${id}`, sourceId: "demo", sourceRecordId: String(id), make: String(make), model: String(model), year: Number(year), city: String(city), state: String(region), latitude: Number(latitude), longitude: Number(longitude), purchasePrice: Number(purchase), preparationCost: Number(preparation), transferFees: Number(fees), resaleLow: Number(low), resaleHigh: Number(high), demandScore: Number(demand), odometerKm: 45000, fuel: "petrol", transmission: "manual", mileageKmpl: 18, evidence: "Fictional values for functional testing", observedAt: now.toISOString(), expiresAt, available: true }));
  // Fictional asking-price observations (clearly labelled by the source) so the radar can be exercised end to end.
  const asks: [string, string, string, number, string, string, number, number, number, number][] = [
    ["a1", "Maruti", "Swift", 2021, "Kochi", "Kerala", 9.9312, 76.2673, 492000, 1], ["a2", "Maruti", "Swift", 2021, "Kochi", "Kerala", 9.9312, 76.2673, 508000, 2],
    ["a3", "Maruti", "Swift", 2021, "Kochi", "Kerala", 9.9312, 76.2673, 481000, 3], ["a4", "Maruti", "Swift", 2021, "Bengaluru", "Karnataka", 12.9716, 77.5946, 529000, 1],
    ["a5", "Maruti", "Swift", 2021, "Bengaluru", "Karnataka", 12.9716, 77.5946, 541000, 2], ["a6", "Maruti", "Swift", 2021, "Chennai", "Tamil Nadu", 13.0827, 80.2707, 498000, 4],
    ["a7", "Maruti", "Swift", 2021, "Chennai", "Tamil Nadu", 13.0827, 80.2707, 512000, 5], ["a8", "Maruti", "Swift", 2021, "Bengaluru", "Karnataka", 12.9716, 77.5946, 523000, 6],
  ].map(([id, make, model, year, city, region, lat, lng, amount, age]) => [id, make, model, year, city, region, lat, lng, amount, age] as [string, string, string, number, string, string, number, number, number, number]);
  state.vehicles.push(...asks.map(([id, make, model, year, city, region, latitude, longitude, amount, age]) => ({ id: `demo:ask-${id}`, sourceId: "demo", sourceRecordId: `ask-${id}`, make, model, year, city, state: region, latitude, longitude, purchasePrice: amount, preparationCost: 0, transferFees: 0, resaleLow: null, resaleHigh: null, demandScore: null, odometerKm: 38000 + age * 1500, fuel: "petrol" as const, transmission: "manual" as const, mileageKmpl: null, evidence: "Fictional asking-price observation for demonstration", observedAt: new Date(now.getTime() - age * 86400000).toISOString(), expiresAt, available: true, askingPrice: { amount, currency: "INR" as const, observedAt: new Date(now.getTime() - age * 86400000).toISOString() } })));
  state.fuel = [{ id: "demo:kochi:petrol", sourceId: "demo", city: "Kochi", fuel: "petrol", pricePerLitre: 105, observedAt: now.toISOString(), expiresAt }];
  return state;
}
export function localCommerceRepository(): CommerceRepository {
  if (process.env.AUTH_MODE !== "demo" || dataMode() !== "demo") throw new CommerceError(503, "Explicit local demo mode is required.");
  return { async read(tenantId, action) {
    if ((process.env.VERCEL === "1" || process.env.HOSTING_PROVIDER === "cloudflare")) return action(demoState());
    return this.transact(tenantId, action);
  }, async transact(tenantId, action) {
    return demoTransaction(document => {
      const entries = (document["dealer-commerce.json"] ??= []) as { tenantId: string; state: CommerceState }[];
      let entry = entries.find(e => e.tenantId === tenantId);
      if (!entry) { entry = { tenantId, state: demoState() }; entries.push(entry); }
      return action(entry.state);
    });
  } };
}
export async function commerceRepository(): Promise<CommerceRepository> {
  return dataMode() !== "demo" ? postgresCommerceRepository(await databasePool()) : localCommerceRepository();
}
const digest = (token: string) => createHash("sha256").update(token).digest("hex");
function audit(state: CommerceState, actor: string, action: string, subject: string, now: Date) {
  state.audit.unshift({ actor, action, subject, at: now.toISOString() }); state.audit = state.audit.slice(0, 500);
}
function active(state: CommerceState, now: Date) {
  const subscription = state.subscription;
  if (!subscription || subscription.status !== "active" || Date.parse(subscription.expiresAt) <= now.getTime()) throw new CommerceError(402, "An active dealership subscription is required.");
  return commercePlans[subscription.plan];
}
function meter(state: CommerceState, actor: string, now: Date) {
  const limits = active(state, now), month = now.toISOString().slice(0, 7), minute = now.toISOString().slice(0, 16);
  // Keys share the tenant allowance: creating more keys does not multiply quota.
  const monthly = `month:${month}`, minuteKey = `minute:${minute}`;
  const aiMonthly = `ai:${month}`;
  state.usage = Object.fromEntries(Object.entries(state.usage).filter(([key]) => key === monthly || key === minuteKey || key === aiMonthly));
  if ((state.usage[monthly] ?? 0) >= limits.monthlyRequests) throw new CommerceError(429, "Monthly request quota exhausted.");
  if ((state.usage[minuteKey] ?? 0) >= limits.perMinute) throw new CommerceError(429, "Tenant request rate exceeded.", 60 - now.getUTCSeconds());
  state.usage[monthly] = (state.usage[monthly] ?? 0) + 1;
  state.usage[minuteKey] = (state.usage[minuteKey] ?? 0) + 1;
  audit(state, actor, "api.request", "metered", now);
  return { monthlyUsed: state.usage[monthly], monthlyLimit: limits.monthlyRequests };
}
function scopes(value: unknown): ApiScope[] {
  if (!Array.isArray(value) || !value.length || value.length > 4 || !value.every(v => ["vehicles:read", "recommendations:read", "fuel:read", "sourcing:write"].includes(v))) throw new CommerceError(400, "Select valid API scopes.");
  return [...new Set(value)] as ApiScope[];
}
function keyContext(token: string): { tenantId: string; id: string } {
  const match = /^vand_([A-Za-z0-9_-]{1,150})\.([a-f0-9-]{36})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) throw new CommerceError(401, "Invalid API key.");
  const tenantId = Buffer.from(match[1], "base64url").toString("utf8");
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(tenantId)) throw new CommerceError(401, "Invalid API key.");
  return { tenantId, id: match[2] };
}
function verifyKey(state: CommerceState, token: string, id: string, scope: ApiScope, now: Date) {
  const key = state.keys.find(k => k.id === id);
  if (!key || key.revokedAt || Date.parse(key.expiresAt) <= now.getTime() || !timingSafeEqual(Buffer.from(key.digest, "hex"), Buffer.from(digest(token), "hex"))) throw new CommerceError(401, "Invalid or expired API key.");
  if (!key.scopes.includes(scope)) throw new CommerceError(403, "API key does not include this scope.");
  key.lastUsedAt = now.toISOString(); return key;
}
export function commerceService(repository: CommerceRepository, clock: () => Date = () => new Date(), tenantUsage?: (tenantId: string) => Promise<TenantUsage>) {
  function manage(p: AuthenticatedPrincipal) { requireCapability(p, "commerce:manage"); }
  function platform(p: AuthenticatedPrincipal, tenantId: string) {
    requireCapability(p, "platform:admin");
    if (!p.platformTenantIds?.includes(tenantId)) throw new CommerceError(403, "Platform tenant scope mismatch.");
  }
  return {
    async summary(p: AuthenticatedPrincipal) {
      requireCapability(p, "inventory:read");
      const read = repository.read?.bind(repository) ?? repository.transact.bind(repository);
      return read(p.tenantId, state => ({ readOnly: dataMode() === "demo" && (process.env.VERCEL === "1" || process.env.HOSTING_PROVIDER === "cloudflare"), subscription: state.subscription, plans: commercePlans, entitlements: planEntitlements, demo: state.sources.some(s => s.kind === "demo"), sources: state.sources.map(s => ({ ...s, usable: allowedSource(s, false, clock()), apiUsable: allowedSource(s, true, clock()), sync: sourceSyncSummary(state, s.id, clock()), coverage: sourceCoverage(state, s.id, clock()) })), vehicleCount: eligibleVehicles(state, false, clock()).length, apiVehicleCount: eligibleVehicles(state, true, clock()).length, keys: p.capabilities.includes("commerce:manage") ? state.keys.map(key => ({ id:key.id, name:key.name, prefix:key.prefix, scopes:key.scopes, sourceId:key.sourceId, expiresAt:key.expiresAt, revokedAt:key.revokedAt, createdAt:key.createdAt, lastUsedAt:key.lastUsedAt })) : [], usage: state.usage, canManage: p.capabilities.includes("commerce:manage") }));
    },
    async marketIntelligence(p: AuthenticatedPrincipal, value: unknown) {
      requireCapability(p, "inventory:read"); requireCapability(p, "analytics:read");
      const input = object(value), now = clock();
      const read = repository.read?.bind(repository) ?? repository.transact.bind(repository);
      return read(p.tenantId, state => { active(state, now); assertFeature(state.subscription, "market_intelligence", now); return marketReport(state, input, now); });
    },
    /** The caller's own subscription and metered usage, for plan meters. Read-only. */
    async planStatus(p: AuthenticatedPrincipal) {
      requireCapability(p, "inventory:read");
      const read = repository.read?.bind(repository) ?? repository.transact.bind(repository);
      return read(p.tenantId, state => ({ subscription: state.subscription, usage: { ...state.usage } }));
    },
    /** Subscription, usage and sync state for every tenant in the administrator's explicit scope. */
    async platformSlices(p: AuthenticatedPrincipal) {
      requireCapability(p, "platform:admin");
      const read = repository.read?.bind(repository) ?? repository.transact.bind(repository);
      // Sequential on purpose: serverless pools are capped at a couple of connections, and each read is a short tenant transaction.
      const slices = new Map<string, Pick<CommerceState, "subscription" | "usage" | "sources" | "sourceSync">>();
      for (const id of p.platformTenantIds ?? []) slices.set(id, await read(id, state => ({ subscription: state.subscription, usage: state.usage, sources: state.sources, sourceSync: state.sourceSync })));
      return slices;
    },
    async provision(p: AuthenticatedPrincipal, tenantId: string, value: unknown) {
      platform(p, tenantId); const b = object(value), now = clock();
      const subscription = { plan: plan(b.plan), status: b.status, expiresAt: future(b.expiresAt, now), reference: text(b.reference, 250), updatedAt: now.toISOString() };
      if (!["active", "suspended", "cancelled"].includes(String(subscription.status))) throw new CommerceError(400, "Invalid status.");
      // Moving a live tenant to a smaller plan must not strand staff, locations or stock above the new limits.
      if (subscription.status === "active" && tenantUsage) assertPlanFits(subscription.plan, await tenantUsage(tenantId));
      return repository.transact(tenantId, state => { state.subscription = { ...subscription, status: subscription.status as "active" | "suspended" | "cancelled" }; audit(state, p.userId, "subscription.provision", subscription.reference, now); return state.subscription; });
    },
    async previewPlan(p: AuthenticatedPrincipal, value: unknown) {
      manage(p);
      if (process.env.AUTH_MODE !== "demo" || dataMode() !== "demo") throw new CommerceError(403, "Demo plan switching is disabled.");
      const selected = plan(object(value).plan), now = clock();
      return repository.transact(p.tenantId, state => { state.subscription = { plan: selected, status: "active", expiresAt: new Date(now.getTime() + 7 * 86400000).toISOString(), reference: "Local demo plan selection; no payment", updatedAt: now.toISOString() }; audit(state, p.userId, "subscription.demo", selected, now); return state.subscription; });
    },
    async createKey(p: AuthenticatedPrincipal, value: unknown) {
      manage(p); const b = object(value), now = clock(), name = text(b.name, 80), grantedScopes = scopes(b.scopes), expiresAt = future(b.expiresAt, now);
      if (Date.parse(expiresAt) > now.getTime() + 366 * 86400000) throw new CommerceError(400, "Key lifetime cannot exceed one year.");
      return repository.transact(p.tenantId, state => {
        const limits = active(state, now);
        if (state.keys.filter(k => !k.revokedAt && Date.parse(k.expiresAt) > now.getTime()).length >= limits.maxKeys || state.keys.length >= 200) throw new CommerceError(409, "API key limit reached. Revoke an unused key or contact support.");
        const sourceId = grantedScopes.includes("sourcing:write") ? text(b.sourceId, 64) : undefined;
        if (sourceId && !allowedSource(state.sources.find(source => source.id === sourceId), false, now)) throw new CommerceError(403, "Select an approved, active source for supplier ingestion.");
        const id = randomUUID(), token = `vand_${Buffer.from(p.tenantId).toString("base64url")}.${id}.${randomBytes(32).toString("base64url")}`;
        const key: BusinessKey = { id, name, prefix: `vand_…${id.slice(0, 8)}`, digest: digest(token), scopes: grantedScopes, sourceId, expiresAt, revokedAt: null, createdAt: now.toISOString(), lastUsedAt: null };
        state.keys.push(key); audit(state, p.userId, "key.create", id, now);
        return { key: { id, name, prefix: key.prefix, scopes: grantedScopes, sourceId, expiresAt }, token };
      });
    },
    async revokeKey(p: AuthenticatedPrincipal, id: string) {
      manage(p); return repository.transact(p.tenantId, state => {
        const key = state.keys.find(k => k.id === id); if (!key) throw new CommerceError(404, "Key not found.");
        key.revokedAt = clock().toISOString(); audit(state, p.userId, "key.revoke", id, clock()); return { id, revokedAt: key.revokedAt };
      });
    },
    async approveSource(p: AuthenticatedPrincipal, tenantId: string, value: unknown) {
      platform(p, tenantId); const source = sourceInput(value, clock());
      if (source.kind === "demo" && dataMode() !== "demo") throw new CommerceError(400, "Demo sources cannot be enabled in production.");
      return repository.transact(tenantId, state => {
        if (!state.sources.some(s => s.id === source.id) && state.sources.length >= 50) throw new CommerceError(409, "Source limit reached.");
        state.sources = [source, ...state.sources.filter(s => s.id !== source.id)]; audit(state, p.userId, "source.approve", source.id, clock()); return source;
      });
    },
    async ingest(p: AuthenticatedPrincipal, sourceId: string, value: unknown) {
      manage(p); const b = object(value), now = clock();
      return repository.transact(p.tenantId, state => {
        const result = ingestBatch(state, sourceId, b, now);
        audit(state, p.userId, "source.ingest", sourceId, now); return result;
      });
    },
    async dealerRecommendations(p: AuthenticatedPrincipal, value: unknown, aiBinding?: DealerAiBinding) {
      requireCapability(p, "inventory:read"); requireCapability(p, "capital:read"); const input = acquisitionInput(value);
      const result = await repository.transact(p.tenantId, state => { active(state, clock()); const report = recommend(state, input, state.subscription!.plan, false, clock()); const usage = meter(state, p.userId, clock()); const processingAllowed = report.options.slice(0, 3).every(option => option.cars.every(car => state.sources.find(source => source.id === car.sourceId)?.aiProcessing === true));
        // The AI commentary is optional; the deterministic report is always returned. One request is charged
        // only when commentary will actually be attempted, and an exhausted allowance skips the call.
        const aiConfigured = Boolean((aiBinding || process.env.DEALER_AI_URL) && process.env.DEALER_AI_SERVICE_TOKEN);
        const wantsAi = aiConfigured && processingAllowed && report.options.length > 0;
        const aiQuotaExceeded = wantsAi && !takeAiRequest(state.usage, state.subscription, clock());
        return { report, usage, processingAllowed, aiQuotaExceeded }; });
      if (result.aiQuotaExceeded) return { ...result.report, ai: { status: "quota_exceeded" as const }, usage: result.usage };
      return { ...await explainAcquisition(result.report, result.processingAllowed, aiBinding), usage: result.usage };
    },
    async business(token: string, scope: ApiScope, value: unknown) {
      const context = keyContext(token), now = clock();
      const input = object(value);
      if (scope === "recommendations:read") acquisitionInput(input);
      return repository.transact(context.tenantId, state => {
        const key = verifyKey(state, token, context.id, scope, now); active(state, now);
        let result: unknown;
        if (scope === "sourcing:write") {
          if (!key.sourceId || input.sourceId !== key.sourceId) throw new CommerceError(403, "This supplier key is restricted to its approved source.");
          result = ingestBatch(state, key.sourceId, input, now);
          audit(state, key.id, "source.ingest", key.sourceId, now);
        }
        else if (scope === "recommendations:read") result = recommend(state, acquisitionInput(input), state.subscription!.plan, true, now);
        else if (scope === "fuel:read") { const city = input.city === undefined ? "" : text(input.city); result = fuelPrices(state, true, now).filter(f => !city || f.city.toLowerCase() === city.toLowerCase()); }
        else {
          result = queryVehicles(state, input, now);
        }
        const usage = meter(state, key.id, now); return { data: result, usage, version: "v1", generatedAt: now.toISOString(), demo: state.sources.some(s => s.kind === "demo") };
      });
    },
  };
}
export async function dealerCommerce() {
  const repository = await commerceRepository();
  const usage = dataMode() === "demo" ? undefined : async (tenantId: string) => { const pool = await databasePool(); return tenantTransaction(pool, tenantId, client => countUsage(client, tenantId)); };
  return commerceService(repository, () => new Date(), usage);
}
export async function syncLicensedFeed(p: AuthenticatedPrincipal, sourceId: string) {
  requireCapability(p, "commerce:manage");
  return providerSync(await commerceRepository())(p, sourceId);
}
