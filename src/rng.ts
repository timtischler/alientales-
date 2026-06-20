export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  reseed(seed: number): void;
}

// mulberry32: small, fast, deterministic 32-bit PRNG.
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function reseed(s: number): void {
    state = s >>> 0;
  }
  return { next, reseed };
}
