import type { WorkspaceState } from "../state";
import type { Actor } from "./common";

export type Command = { name: string; args: unknown[] };

let sink: Command[] | null = null;

/** Runs fn and returns every command-capable action it called, in order, with the arguments after (state, actor). */
export function recordCommands<T>(fn: () => T): { value: T; commands: Command[] } {
  const previous = sink;
  const mine: Command[] = [];
  sink = mine;
  try {
    return { value: fn(), commands: mine };
  } finally {
    sink = previous;
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function record<F extends (state: WorkspaceState, actor: Actor, ...rest: any[]) => any>(name: string, fn: F): F {
  return ((state: WorkspaceState, actor: Actor, ...rest: unknown[]) => {
    sink?.push({ name, args: rest });
    return fn(state, actor, ...rest);
  }) as F;
}

export function recordBare<F extends (state: WorkspaceState, ...rest: any[]) => any>(name: string, fn: F): F {
  return ((state: WorkspaceState, ...rest: unknown[]) => {
    sink?.push({ name, args: rest });
    return fn(state, ...rest);
  }) as F;
}
