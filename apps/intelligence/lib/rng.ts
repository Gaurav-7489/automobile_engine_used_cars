/** Small deterministic PRNG so every render and every deploy produces the same illustrative fixtures. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

export function between(rng: () => number, low: number, high: number): number {
  return low + Math.floor(rng() * (high - low + 1));
}

/** Split an integer total into `count` positive integer parts that sum exactly to `total`. */
export function distribute(total: number, count: number, rng: () => number, spread = 0.5): number[] {
  if (count <= 0) return [];
  const weights = Array.from({ length: count }, () => 1 - spread / 2 + rng() * spread);
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const parts = weights.map((weight) => Math.floor((weight / weightSum) * total));
  let remainder = total - parts.reduce((a, b) => a + b, 0);
  for (let index = 0; remainder > 0; index = (index + 1) % count, remainder -= 1) parts[index] += 1;
  return parts;
}
