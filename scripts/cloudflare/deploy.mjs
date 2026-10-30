import { spawn } from "node:child_process";
import { preflight, workerSecrets } from "./preflight.mjs";

/** Deploys the one Intelligence Worker. Secrets go through `wrangler secret bulk`, never into the config file. */
const config = "apps/intelligence/wrangler.jsonc";
const run = (command, args, input) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { env: process.env, stdio: [input ? "pipe" : "inherit", "inherit", "inherit"] });
  if (input) child.stdin.end(input);
  child.on("error", reject);
  child.on("exit", code => code === 0 ? resolve() : reject(new Error(`${command} ${args[0]} failed (${code})`)));
});

const check = await preflight(process.env);
if (!check.ready) { console.error(JSON.stringify(check, null, 2)); throw new Error("Preflight failed: fix the missing settings first."); }
await run("pnpm", ["--filter", "@vandlabs/intelligence", "cf:build"]);
await run("pnpm", ["exec", "wrangler", "deploy", "--config", config, "--var", `APP_ORIGIN:${process.env.APP_ORIGIN}`]);
await run("pnpm", ["exec", "wrangler", "secret", "bulk", "--config", config], JSON.stringify(Object.fromEntries(workerSecrets.map(key => [key, process.env[key]]))));
