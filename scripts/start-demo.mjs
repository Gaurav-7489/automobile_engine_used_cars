// Local-only reference demo launcher. Never expose demo-auth staff apps publicly.
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { createServer } from "node:net";

const ports = [3000, 3001, 3002];
const checkOnly = process.argv.includes("--check");

async function checkPort(port) {
  return await new Promise((resolve) => {
    const server = createServer();
    server.once("error", (error) => resolve({ port, free: false, reason: error.code ?? error.message }));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve({ port, free: true }));
    });
  });
}

if (Number(process.versions.node.split(".")[0]) < 22) {
  console.error("Demo requires Node.js 22 or later.");
  process.exit(1);
}

const checks = await Promise.all(ports.map(checkPort));
const blocked = checks.filter((item) => !item.free);
if (blocked.length) {
  console.error("Automobile Engine cannot start; these local ports are unavailable:");
  for (const item of blocked) console.error(`  ${item.port}: ${item.reason}`);
  console.error("Stop the old dev server or the process using these ports, then retry pnpm demo.");
  console.error("macOS/Linux: lsof -nP -iTCP:3000 -iTCP:3002 -sTCP:LISTEN");
  process.exit(1);
}
if (checkOnly) {
  console.log("Demo preflight passed: Node.js and ports 3000, 3001, 3002 are ready.");
  process.exit(0);
}

const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const environment = { ...process.env, AUTH_MODE: "demo", DATA_MODE: "demo",
  VANDLABS_DEMO_RUNTIME_PATH: resolve(process.cwd(), ".demo-runtime", "leads.json") };
delete environment.TENANT_CONFIG_JSON; // Always use the matching reference identity/configuration.
console.log("Starting local demonstration data. Website :3000 · Command Center :3001/command · Platform :3002/platform");
const child = spawn(command, ["dev"], {
  stdio: "inherit",
  env: environment,
  detached: process.platform !== "win32",
  shell: process.platform === "win32",
});
child.once("error", (error) => {
  console.error("Unable to start pnpm dev:", error.message);
  process.exitCode = 1;
});
child.once("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});

let stopping = false;
function stop(signal) {
  if (stopping || !child.pid) return;
  stopping = true;
  if (process.platform === "win32") child.kill(signal);
  else { try { process.kill(-child.pid, signal); } catch { /* Child already exited. */ } }
}
process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
const endpoints = ["http://127.0.0.1:3000", "http://127.0.0.1:3001/command", "http://127.0.0.1:3002/platform"];
let checking = false;
const readiness = setInterval(async () => {
  if (checking || stopping) return;
  checking = true;
  try {
    const responses = await Promise.all(endpoints.map(url => fetch(url, { signal: AbortSignal.timeout(5000) })));
    if (responses.every(response => response.ok)) {
      clearInterval(readiness);
      console.log("Demo ready. All three applications responded successfully.");
      for (const url of endpoints) console.log(url);
    }
  } catch { /* Next.js is still compiling. */ } finally { checking = false; }
}, 2000);
child.once("exit", () => clearInterval(readiness));
child.once("error", () => clearInterval(readiness));
