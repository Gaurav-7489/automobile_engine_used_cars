// Local-only reference demo launcher. Never expose demo-auth staff apps publicly.
import { spawn } from "node:child_process";
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
const child = spawn(command, ["dev"], {
  stdio: "inherit",
  env: { ...process.env, AUTH_MODE: "demo", DATA_MODE: "demo" },
  shell: process.platform === "win32",
});
child.once("error", (error) => {
  console.error("Unable to start pnpm dev:", error.message);
  process.exitCode = 1;
});
child.once("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
