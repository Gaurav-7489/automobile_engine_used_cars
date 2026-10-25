// Local-only reference demo launcher. Never expose demo-auth staff apps publicly.
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { createServer } from "node:net";
import { GATEWAY_PORT, startGateway } from "./local-gateway.mjs";

const ports = [3000, 3001, 3002, 3003, GATEWAY_PORT];
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
  console.error(`macOS/Linux: lsof -nP -iTCP:3000 -iTCP:3001 -iTCP:3002 -iTCP:3003 -iTCP:${GATEWAY_PORT} -sTCP:LISTEN`);
  process.exit(1);
}
if (checkOnly) {
  console.log(`Demo preflight passed: Node.js and ports ${ports.join(", ")} are ready.`);
  process.exit(0);
}

const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const environment = { ...process.env, AUTH_MODE: "demo", DATA_MODE: "demo",
  VANDLABS_DEMO_RUNTIME_PATH: resolve(process.cwd(), ".demo-runtime", "leads.json") };
delete environment.TENANT_CONFIG_JSON; // Always use the matching reference identity/configuration.
const product = `http://127.0.0.1:${GATEWAY_PORT}`;
console.log(`Starting the VandLabs product at ${product} (website /, Intelligence /intelligence, Command Center /command, Platform /platform).`);
if (!process.env.DATABASE_URL) console.log("Note: Automobile Intelligence is database-backed. Without DATABASE_URL and SESSION_SECRET its sign-in page loads but sign-in is unavailable (see docs/INTELLIGENCE_PRODUCTION.md).");
const child = spawn(command, ["dev"], {
  stdio: "inherit",
  env: environment,
  detached: process.platform !== "win32",
  shell: process.platform === "win32",
});
const gateway = startGateway();
child.once("error", (error) => {
  console.error("Unable to start pnpm dev:", error.message);
  process.exitCode = 1;
});
child.once("exit", (code, signal) => {
  gateway.close();
  process.exitCode = code ?? (signal ? 1 : 0);
});

let stopping = false;
function stop(signal) {
  if (stopping || !child.pid) return;
  stopping = true;
  gateway.close();
  if (process.platform === "win32") child.kill(signal);
  else { try { process.kill(-child.pid, signal); } catch { /* Child already exited. */ } }
}
process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
const endpoints = [`${product}/`, `${product}/command`, `${product}/platform`, `${product}/intelligence/login`];
let checking = false;
const readiness = setInterval(async () => {
  if (checking || stopping) return;
  checking = true;
  try {
    const responses = await Promise.all(endpoints.map(url => fetch(url, { signal: AbortSignal.timeout(5000) })));
    if (responses.every(response => response.ok)) {
      clearInterval(readiness);
      console.log(`Demo ready. One product address: ${product}`);
      for (const url of endpoints) console.log(url);
    }
  } catch { /* Next.js is still compiling. */ } finally { checking = false; }
}, 2000);
child.once("exit", () => clearInterval(readiness));
child.once("error", () => clearInterval(readiness));
