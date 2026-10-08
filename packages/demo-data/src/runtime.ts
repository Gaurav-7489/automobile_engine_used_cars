import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  rmSync,
} from "node:fs";
import {
  basename,
  dirname,
  resolve,
} from "node:path";
import type {
  AutomationRule,
  AutomationRun,
  Lead,
  LeadActivity,
  JourneyEvent,
  Task,
  Vehicle,
  Appointment,
  Sale,
  InventoryChange,
  StockCost,
  StockCostChange,
} from "@vandlabs/contracts";

function repositoryRoot() {
  const cwd = process.cwd();
  return basename(dirname(cwd)) === "apps" ? resolve(cwd, "../..") : cwd;
}

function runtimePath(filename = "leads.json") {
  const configuredLeadPath = process.env.VANDLABS_DEMO_RUNTIME_PATH;
  if (configuredLeadPath) {
    return filename === "leads.json"
      ? configuredLeadPath
      : resolve(dirname(configuredLeadPath), filename);
  }
  return resolve(repositoryRoot(), ".demo-runtime", filename);
}

// One atomically replaced document is shared by all local demo processes.
// A short-lived directory lock rejects concurrent writers instead of losing updates.
type State = Record<string, unknown[]>;
function readState(): State {
  const file = runtimePath("state.json");
  if (!existsSync(file)) return {};
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid demo state.");
  return parsed as State;
}
function legacy<T>(file: string): T[] {
  if (!existsSync(file)) return [];
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(parsed)) throw new Error("Invalid demo records.");
  return parsed as T[];
}
function readArray<T>(file: string): T[] {
  return (readState()[basename(file)] as T[] | undefined) ?? legacy<T>(file);
}
export function demoTransaction<T>(action: (state: State) => T): T {
  const file = runtimePath("state.json");
  const lock = file + ".lock";
  mkdirSync(dirname(file), { recursive: true });
  mkdirSync(lock); // fail closed if another process owns the write lock
  const temp = file + ".tmp";
  try {
    const state = readState();
    for (const name of ["leads.json", "tasks.json", "lead-activity.json", "journey-events.json", "automation-rules.json", "automation-runs.json", "vehicles.json", "appointments.json", "sales.json", "inventory-history.json", "stock-costs.json", "stock-cost-history.json"]) {
      state[name] ??= legacy(runtimePath(name));
    }
    const result = action(state);
    writeFileSync(temp, JSON.stringify(state, null, 2), "utf8");
    renameSync(temp, file);
    return result;
  } finally {
    rmSync(temp, { force: true });
    rmSync(lock, { recursive: true, force: true });
  }
}
function persistArray<T>(file: string, items: T[]) {
  try { demoTransaction(state => { state[basename(file)] = items; }); return true; }
  catch { return false; }
}
function upsert<T extends {id:string}>(filename:string, item:T) {
  try {
    demoTransaction(state => { const current = state[filename] as T[]; state[filename] = [item, ...current.filter(x => x.id !== item.id)]; });
    return true;
  } catch { return false; }
}
function append<T>(filename:string, items:T[]) {
  try { demoTransaction(state => { state[filename] = [...items, ...state[filename]]; }); return true; }
  catch { return false; }
}

export function readRuntimeLeads(): Lead[] {
  return readArray<Lead>(runtimePath());
}

export function mergeRuntimeLeads(seededLeads: Lead[]): Lead[] {
  const runtimeLeads = readRuntimeLeads();
  const runtimeIds = new Set(runtimeLeads.map((lead) => lead.id));
  return [
    ...runtimeLeads,
    ...seededLeads.filter((lead) => !runtimeIds.has(lead.id)),
  ];
}

export function persistRuntimeLead(lead: Lead) { return upsert("leads.json", lead); }

export function readRuntimeLeadActivities(leadId?: string): LeadActivity[] {
  const activities = readArray<LeadActivity>(runtimePath("lead-activity.json"));
  return leadId
    ? activities.filter((activity) => activity.leadId === leadId)
    : activities;
}

export function persistRuntimeLeadActivities(activities: LeadActivity[]) { return append("lead-activity.json", activities); }

export function readRuntimeTasks(): Task[] {
  return readArray<Task>(runtimePath("tasks.json"));
}

export function mergeRuntimeTasks(seededTasks: Task[]): Task[] {
  const runtimeTasks = readRuntimeTasks();
  const runtimeIds = new Set(runtimeTasks.map((task) => task.id));
  return [
    ...runtimeTasks,
    ...seededTasks.filter((task) => !runtimeIds.has(task.id)),
  ];
}

export function persistRuntimeTask(task: Task) { return upsert("tasks.json", task); }

export function readRuntimeJourneyEvents(): JourneyEvent[] {
  return readArray<JourneyEvent>(runtimePath("journey-events.json"));
}

export function persistRuntimeJourneyEvent(event: JourneyEvent) { return append("journey-events.json", [event]); }

export function readRuntimeAutomationRules(): AutomationRule[] {
  return readArray<AutomationRule>(runtimePath("automation-rules.json"));
}

export function persistRuntimeAutomationRule(rule: AutomationRule) { return upsert("automation-rules.json", rule); }

export function readRuntimeAutomationRuns(): AutomationRun[] {
  return readArray<AutomationRun>(runtimePath("automation-runs.json"));
}

export function persistRuntimeAutomationRun(run: AutomationRun) { return append("automation-runs.json", [run]); }

export function clearRuntimeLeads() {
  const file = runtimePath();
  return persistArray(file, []);
}

export function mergeRuntimeVehicles(seeded: Vehicle[]): Vehicle[] {
  const items = readArray<Vehicle>(runtimePath("vehicles.json"));
  return [...items, ...seeded.filter(v => !items.some(i => i.id === v.id))];
}
export function mergeRuntimeAppointments(seeded: Appointment[]): Appointment[] {
  const items = readArray<Appointment>(runtimePath("appointments.json"));
  return [...items, ...seeded.filter(v => !items.some(i => i.id === v.id))];
}
export function readRuntimeSales() { return readArray<Sale>(runtimePath("sales.json")); }
export function readRuntimeInventoryHistory() { return readArray<InventoryChange>(runtimePath("inventory-history.json")); }

export function readRuntimeStockCosts() {return readArray<StockCost>(runtimePath("stock-costs.json"));}
export function readRuntimeStockCostHistory() {return readArray<StockCostChange>(runtimePath("stock-cost-history.json"));}
