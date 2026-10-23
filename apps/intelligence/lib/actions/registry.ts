import type { WorkspaceState } from "../state";
import type { Actor, Fail, Result } from "./common";
import { fail } from "./common";
import * as alerts from "./alerts";
import * as campaigns from "./campaigns";
import * as capital from "./capital";
import * as inventory from "./inventory";
import * as leads from "./leads";
import * as market from "./market";
import * as pricing from "./pricing";
import * as settings from "./settings";
import type { Command } from "./recorder";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Entry = { run: (state: WorkspaceState, actor: Actor, args: any[]) => Result<any>; reauth?: number };

const pick = <T extends object>(source: unknown, keys: readonly string[]): Partial<T> => {
  const out: Record<string, unknown> = {};
  if (source && typeof source === "object") for (const key of keys) if (key in (source as object)) out[key] = (source as Record<string, unknown>)[key];
  return out as Partial<T>;
};

const POLICY_KEYS = ["distinctApprover", "reviewThresholdDays", "ageingDays", "staleFeedHours", "leadResponseMinutes", "evidenceExpiryDays", "priceFloorPercent"] as const;
const VEHICLE_PATCH_KEYS = ["variant", "km", "owners", "documents", "costs", "branchId"] as const;
const CAMPAIGN_PATCH_KEYS = ["name", "objective", "region", "radiusKm", "startDate", "endDate", "channels", "totalCap30d", "dailyCap", "headline", "body", "creativeApproved", "clickWindowDays", "viewWindowDays", "note", "step"] as const;

const bare = (fn: (state: WorkspaceState, ...a: any[]) => any): Entry["run"] => (state, _actor, args) => {
  const out = fn(state, ...args);
  return out && typeof out === "object" && "ok" in out ? out : { ok: true, state: out };
};
const withActor = (fn: (state: WorkspaceState, actor: Actor, ...a: any[]) => Result<any>): Entry["run"] => (state, actor, args) => fn(state, actor, ...args);

/**
 * The only operations the browser may request. Arguments are untrusted: patches are reduced to the fields
 * the interface legitimately edits, and re-authentication is decided by the server, never by the caller.
 */
export const COMMANDS: Record<string, Entry> = {
  acknowledge: { run: withActor(alerts.acknowledge) },
  assignAlerts: { run: withActor(alerts.assignAlerts) },
  snooze: { run: withActor(alerts.snooze) },
  resolve: { run: withActor(alerts.resolve) },
  updateRules: { run: (s, a, [patch]) => alerts.updateRules(s, a, pick(patch, POLICY_KEYS)) },
  createCampaign: { run: withActor(campaigns.createCampaign) },
  updateCampaign: { run: (s, a, [id, patch]) => campaigns.updateCampaign(s, a, id, pick(patch, CAMPAIGN_PATCH_KEYS)) },
  changeVehicle: { run: withActor(campaigns.changeVehicle) },
  submitCampaign: { run: withActor(campaigns.submitCampaign) },
  approveCampaign: { run: withActor(campaigns.approveCampaign) },
  publishCampaign: { run: withActor(campaigns.publishCampaign) },
  pauseCampaign: { run: withActor(campaigns.pauseCampaign) },
  resumeCampaign: { run: withActor(campaigns.resumeCampaign) },
  discardCampaign: { run: withActor(campaigns.discardCampaign) },
  proposeCorrection: { run: withActor(capital.proposeCorrection) },
  addVehicle: { run: withActor(inventory.addVehicle) },
  updateVehicle: { run: (s, a, [id, version, patch]) => inventory.updateVehicle(s, a, id, version, pick(patch, VEHICLE_PATCH_KEYS)) },
  transitionVehicle: { run: withActor(inventory.transitionVehicle) },
  importCommit: { run: withActor(inventory.importCommit) },
  bulkArchive: { run: withActor(inventory.bulkArchive) },
  bulkAssignBranch: { run: withActor(inventory.bulkAssignBranch) },
  publishVehicles: { run: withActor(inventory.publishVehicles) },
  addLead: { run: withActor(leads.addLead) },
  changeStage: { run: withActor(leads.changeStage) },
  logOutcome: { run: withActor(leads.logOutcome) },
  sendMessage: { run: withActor(leads.sendMessage) },
  retryMessage: { run: withActor(leads.retryMessage) },
  scheduleAppointment: { run: withActor(leads.scheduleAppointment) },
  cancelAppointment: { run: withActor(leads.cancelAppointment) },
  toggleTask: { run: withActor(leads.toggleTask) },
  assignLead: { run: withActor(leads.assignLead) },
  mergeLeads: { run: withActor(leads.mergeLeads) },
  toggleWatch: { run: bare(market.toggleWatch) },
  saveSearch: { run: withActor(market.saveSearch) },
  renameSearch: { run: bare(market.renameSearch) },
  deleteSearch: { run: bare(market.deleteSearch) },
  logContactIntent: { run: withActor(market.logContactIntent) },
  saveScenario: { run: withActor(market.saveScenario) },
  createPriceRequest: { run: withActor(pricing.createPriceRequest) },
  submitPriceRequest: { run: withActor(pricing.submitPriceRequest) },
  approvePriceRequest: { run: withActor(pricing.approvePriceRequest) },
  rejectPriceRequest: { run: withActor(pricing.rejectPriceRequest) },
  withdrawPriceRequest: { run: withActor(pricing.withdrawPriceRequest) },
  retryFailedChannels: { run: withActor(pricing.retryFailedChannels) },
  testConnection: { run: withActor(settings.testConnection) },
  connectIntegration: { run: withActor(settings.connectIntegration) },
  disconnectIntegration: { run: withActor(settings.disconnectIntegration) },
  inviteMember: { run: withActor(settings.inviteMember) },
  changeRole: { run: withActor(settings.changeRole), reauth: 2 },
  removeMember: { run: withActor(settings.removeMember) },
  saveBusiness: { run: withActor(settings.saveBusiness) },
  saveBranch: { run: withActor(settings.saveBranch) },
  setNotification: { run: withActor(settings.setNotification) },
  revokeApiKey: { run: withActor(settings.revokeApiKey), reauth: 1 },
  revokeSessions: { run: withActor(settings.revokeSessions) },
  setPolicy: { run: (s, a, [patch]) => settings.setPolicy(s, a, pick(patch, POLICY_KEYS)) },
};

export const MAX_COMMANDS = 10;

export function isCommandList(value: unknown): value is Command[] {
  return Array.isArray(value) && value.length > 0 && value.length <= MAX_COMMANDS
    && value.every((c) => c && typeof c === "object" && typeof (c as Command).name === "string" && Array.isArray((c as Command).args) && (c as Command).args.length <= 6);
}

/** Executes commands in order against the given state. Any failure stops the batch and nothing is applied. */
export function executeCommands(state: WorkspaceState, actor: Actor, commands: Command[], reauthenticated: boolean): { ok: true; state: WorkspaceState; results: Result<object>[] } | Fail {
  let current = state;
  const results: Result<object>[] = [];
  for (const command of commands) {
    const entry = Object.hasOwn(COMMANDS, command.name) ? COMMANDS[command.name] : undefined;
    if (!entry) return fail(422, "invalid", "That operation is not available.");
    const args = [...command.args];
    // The caller can never assert that it re-authenticated.
    if (entry.reauth !== undefined) args[entry.reauth] = reauthenticated;
    let result: Result<object>;
    try {
      result = entry.run(current, actor, args);
    } catch {
      return fail(422, "invalid", "The request could not be processed. Check the values and try again.");
    }
    if (!result.ok) return result;
    current = result.state;
    results.push(result);
  }
  return { ok: true, state: current, results };
}
