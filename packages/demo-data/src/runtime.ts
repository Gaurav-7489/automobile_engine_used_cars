import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
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

function readArray<T>(file: string): T[] {
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function persistArray<T>(file: string, items: T[]) {
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(items, null, 2), "utf8");
    return true;
  } catch {
    return false;
  }
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

export function persistRuntimeLead(lead: Lead) {
  const file = runtimePath();
  const current = readRuntimeLeads().filter((item) => item.id !== lead.id);
  return persistArray(file, [lead, ...current]);
}

export function readRuntimeLeadActivities(leadId?: string): LeadActivity[] {
  const activities = readArray<LeadActivity>(runtimePath("lead-activity.json"));
  return leadId
    ? activities.filter((activity) => activity.leadId === leadId)
    : activities;
}

export function persistRuntimeLeadActivities(activities: LeadActivity[]) {
  const file = runtimePath("lead-activity.json");
  const current = readRuntimeLeadActivities();
  return persistArray(file, [...activities, ...current]);
}

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

export function persistRuntimeTask(task: Task) {
  const file = runtimePath("tasks.json");
  const current = readRuntimeTasks().filter((item) => item.id !== task.id);
  return persistArray(file, [task, ...current]);
}

export function readRuntimeJourneyEvents(): JourneyEvent[] {
  return readArray<JourneyEvent>(runtimePath("journey-events.json"));
}

export function persistRuntimeJourneyEvent(event: JourneyEvent) {
  return persistArray(runtimePath("journey-events.json"), [event, ...readRuntimeJourneyEvents()]);
}

export function readRuntimeJourneyEvents(): JourneyEvent[] {
  return readArray<JourneyEvent>(runtimePath("journey-events.json"));
}

export function persistRuntimeJourneyEvent(event: JourneyEvent) {
  const file = runtimePath("journey-events.json");
  return persistArray(file, [event, ...readRuntimeJourneyEvents()]);
}

export function readRuntimeAutomationRules(): AutomationRule[] {
  return readArray<AutomationRule>(runtimePath("automation-rules.json"));
}

export function persistRuntimeAutomationRule(rule: AutomationRule) {
  const file = runtimePath("automation-rules.json");
  const current = readRuntimeAutomationRules().filter((item) => item.id !== rule.id);
  return persistArray(file, [rule, ...current]);
}

export function readRuntimeAutomationRuns(): AutomationRun[] {
  return readArray<AutomationRun>(runtimePath("automation-runs.json"));
}

export function persistRuntimeAutomationRun(run: AutomationRun) {
  const file = runtimePath("automation-runs.json");
  return persistArray(file, [run, ...readRuntimeAutomationRuns()]);
}

export function clearRuntimeLeads() {
  const file = runtimePath();
  return persistArray(file, []);
}
