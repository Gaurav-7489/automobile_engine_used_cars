"use client";

/**
 * In-memory cache of page data for this browser tab: a page opened again shows its last data at once while a fresh copy loads
 * (stale-while-revalidate), identical requests in flight are shared, and hovering a navigation link warms the data that page used
 * last time. Lives only in memory, holds only what this signed-in person already loaded, and is cleared at sign-in and sign-out.
 */
type Entry = { data: unknown; at: number };
const MAX_ENTRIES = 80;
const entries = new Map<string, Entry>();
const inflight = new Map<string, Promise<Response>>();
const urlsByPath = new Map<string, Set<string>>();

export function cached<T>(url: string): { data: T; at: number } | undefined {
  const entry = entries.get(url);
  return entry ? { data: entry.data as T, at: entry.at } : undefined;
}

export function store(url: string, data: unknown): void {
  entries.delete(url);
  entries.set(url, { data, at: Date.now() });
  while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value!);
}

/** One network request per URL at a time; callers each get their own copy of the response. */
export function request(url: string): Promise<Response> {
  let pending = inflight.get(url);
  if (!pending) {
    pending = fetch(url, { cache: "no-store", credentials: "same-origin" }).finally(() => inflight.delete(url));
    inflight.set(url, pending);
  }
  return pending.then((response) => response.clone());
}

/** Remembers which data a page asked for, so the next visit can be warmed before the click lands. */
export function remember(path: string, url: string): void {
  let urls = urlsByPath.get(path);
  if (!urls) urlsByPath.set(path, (urls = new Set()));
  urls.delete(url);
  urls.add(url);
  while (urls.size > 6) urls.delete(urls.values().next().value!);
}

/** Refreshes the data a page used last time, unless it is only seconds old. */
export function warm(path: string, freshForMs = 15_000): void {
  for (const url of urlsByPath.get(path) ?? []) {
    const entry = entries.get(url);
    if (entry && Date.now() - entry.at < freshForMs) continue;
    request(url).then(async (response) => { if (response.ok) store(url, await response.json()); }).catch(() => undefined);
  }
}

export function clearRemoteCache(): void {
  entries.clear();
  inflight.clear();
  urlsByPath.clear();
}
