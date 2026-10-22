import type { AcquisitionReview, Listing, SavedSearch, Scenario } from "../domain";
import { scenarioTotals } from "../finance";
import { valuationForListing } from "../valuation";
import { now } from "../clock";
import type { WorkspaceState } from "../state";
import { type Actor, type Result, fail, guard, nextId, ok, trim, withAudit } from "./common";

/** Watch toggles are personal and reversible, so the UI may apply them optimistically. Deduplicated by ID. */
export function toggleWatch(state: WorkspaceState, listingId: string): WorkspaceState {
  const watching = state.watchlist.includes(listingId);
  return { ...state, watchlist: watching ? state.watchlist.filter((id) => id !== listingId) : [...state.watchlist, listingId] };
}

/** Name the search and optional alert cadence; matching queries are deduplicated. */
export function saveSearch(state: WorkspaceState, actor: Actor, name: string, query: string, cadence: SavedSearch["cadence"]): Result<{ search: SavedSearch; deduplicated: boolean }> {
  if (!trim(name)) return fail(422, "invalid", "Name this search.", { fields: { name: "Enter a name for the saved search." } });
  const existing = state.savedSearches.find((s) => s.query === query);
  if (existing) {
    const updated = { ...existing, name: trim(name), cadence };
    return ok({ ...state, savedSearches: state.savedSearches.map((s) => (s.id === existing.id ? updated : s)) }, { search: updated, deduplicated: true });
  }
  const search: SavedSearch = { id: nextId("ss", state.savedSearches.map((s) => s.id), 2), name: trim(name), query, cadence, createdAt: now() };
  return ok(withAudit({ ...state, savedSearches: [search, ...state.savedSearches] }, actor, "search.saved", search.id, search.name), { search, deduplicated: false });
}

export function renameSearch(state: WorkspaceState, id: string, name: string, cadence: SavedSearch["cadence"]): Result {
  if (!trim(name)) return fail(422, "invalid", "Name this search.", { fields: { name: "Enter a name for the saved search." } });
  return ok({ ...state, savedSearches: state.savedSearches.map((s) => (s.id === id ? { ...s, name: trim(name), cadence } : s)) });
}

export function deleteSearch(state: WorkspaceState, id: string): Result {
  return ok({ ...state, savedSearches: state.savedSearches.filter((s) => s.id !== id) });
}

/** Contact source is entitlement-gated and logs the intent. It does not claim a successful contact. */
export function logContactIntent(state: WorkspaceState, actor: Actor, listingId: string): Result {
  const denied = guard(actor, "acquisition.review");
  if (denied) return denied;
  return ok(withAudit({ ...state, contactIntents: [...state.contactIntents, { listingId, at: now(), by: actor.name }] }, actor, "listing.contact_intent", listingId, "Intent logged; contact outcome not recorded"));
}

export type ScenarioInput = { listingId: string; offer: number; transport: number; inspection: number; refurbishment: number; fees: number; holdingSelling: number; targetResale: number };

export function saveScenario(state: WorkspaceState, actor: Actor, input: ScenarioInput): Result<{ scenario: Scenario }> {
  const denied = guard(actor, "acquisition.review");
  if (denied) return denied;
  const fields: Record<string, string> = {};
  for (const key of ["offer", "targetResale"] as const) if (!(input[key] > 0)) fields[key] = "Enter an amount greater than zero.";
  for (const key of ["transport", "inspection", "refurbishment", "fees", "holdingSelling"] as const) if (input[key] < 0 || !Number.isFinite(input[key])) fields[key] = "Enter zero or a positive amount.";
  if (Object.keys(fields).length) return fail(422, "invalid", "Fix the highlighted assumptions to save the scenario.", { fields });
  const prior = state.scenarios.filter((s) => s.listingId === input.listingId);
  const scenario: Scenario = { ...input, id: nextId("SC", state.scenarios.map((s) => s.id), 1), savedAt: now(), by: actor.name, version: prior.length + 1 };
  // Scenarios are prospective. They never enter the inventory ledger or posted totals.
  return ok(withAudit({ ...state, scenarios: [scenario, ...state.scenarios] }, actor, "scenario.saved", scenario.id, `${input.listingId} v${scenario.version}`), { scenario });
}

/** An acquisition review needs a target offer, cost scenario, evidence snapshot and rationale. It creates a draft request only: it never purchases or reserves the vehicle. */
export function createAcquisitionReview(state: WorkspaceState, actor: Actor, listing: Listing, input: ScenarioInput, rationale: string): Result<{ review: AcquisitionReview }> {
  const denied = guard(actor, "acquisition.review");
  if (denied) return denied;
  const fields: Record<string, string> = {};
  if (!(input.offer > 0)) fields.offer = "Enter a target offer.";
  if (!(input.targetResale > 0)) fields.targetResale = "Enter a target resale price for the scenario.";
  if (!trim(rationale)) fields.rationale = "Add the rationale for this acquisition review.";
  const valuation = valuationForListing(listing);
  if (Object.keys(fields).length) return fail(422, "invalid", "Complete the target offer, scenario and rationale to create the review.", { fields });
  const saved = saveScenario(state, actor, input);
  if (!saved.ok) return saved;
  const review: AcquisitionReview = {
    id: nextId("AR", state.reviews.map((r) => r.id), 1), listingId: listing.id, targetOffer: input.offer, scenario: saved.scenario, evidenceAt: valuation.observedAt, evidenceN: valuation.n, evidenceTier: valuation.tier,
    rationale: trim(rationale), status: "Draft", createdBy: actor.name, createdAt: now(),
  };
  return ok(withAudit({ ...saved.state, reviews: [review, ...saved.state.reviews] }, actor, "acquisition_review.created", review.id, `${listing.id}: draft only; no purchase or reservation`), { review });
}

export const totalsOf = (input: ScenarioInput) => scenarioTotals({ offer: input.offer, transport: input.transport, inspection: input.inspection, refurbishment: input.refurbishment, fees: input.fees, holdingSelling: input.holdingSelling, targetResale: input.targetResale });
