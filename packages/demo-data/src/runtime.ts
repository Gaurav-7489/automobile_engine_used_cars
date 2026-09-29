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
import type { Lead } from "@vandlabs/contracts";

function repositoryRoot() {
  const cwd = process.cwd();
  return basename(dirname(cwd)) === "apps" ? resolve(cwd, "../..") : cwd;
}

function runtimePath() {
  return (
    process.env.VANDLABS_DEMO_RUNTIME_PATH ||
    resolve(repositoryRoot(), ".demo-runtime", "leads.json")
  );
}

export function readRuntimeLeads(): Lead[] {
  const file = runtimePath();
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
    return Array.isArray(parsed) ? (parsed as Lead[]) : [];
  } catch {
    return [];
  }
}

export function persistRuntimeLead(lead: Lead) {
  const file = runtimePath();
  try {
    mkdirSync(dirname(file), { recursive: true });
    const current = readRuntimeLeads().filter((item) => item.id !== lead.id);
    writeFileSync(file, JSON.stringify([lead, ...current], null, 2), "utf8");
    return true;
  } catch {
    return false;
  }
}

export function clearRuntimeLeads() {
  const file = runtimePath();
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, "[]\n", "utf8");
    return true;
  } catch {
    return false;
  }
}
