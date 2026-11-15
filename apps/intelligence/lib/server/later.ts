import { after } from "next/server";

/**
 * Runs `task` after the response inside a request. Outside a request (scripts, tests) it runs immediately, unless `outside: "skip"`,
 * for work a scheduled job catches up anyway. Never throws.
 */
export function later(task: () => Promise<unknown>, opts: { outside?: "run" | "skip" } = {}): void {
  const run = () => task().then(() => undefined, (error: unknown) => console.error(JSON.stringify({ event: "background_task_failure", message: error instanceof Error ? error.message : "unknown" })));
  try {
    after(run);
  } catch {
    if (opts.outside !== "skip") void run();
  }
}
