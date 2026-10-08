// Portable, explicit reference-mode launcher. Never use on a public staff origin.
import { spawn } from "node:child_process";

const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const child = spawn(command, ["dev"], {
  stdio: "inherit",
  env: { ...process.env, AUTH_MODE: "demo", DATA_MODE: "demo" },
  shell: process.platform === "win32",
});
child.on("error", (error) => {
  console.error("Unable to start pnpm dev:", error.message);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  if (signal) {
    process.exitCode = 1;
  } else {
    process.exitCode = code ?? 1;
  }
});
