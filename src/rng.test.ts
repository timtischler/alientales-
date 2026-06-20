import { describe, it, expect } from "vitest";
import { createRng } from "./rng";

describe("createRng", () => {
  it("is deterministic: same seed yields the same sequence", () => {
    const a = createRng(12345);
    const b = createRng(12345);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("different seeds diverge", () => {
    const a = createRng(1);
    const b = createRng(2);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it("returns values in [0, 1)", () => {
    const r = createRng(99);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("reseed restores the sequence", () => {
    const r = createRng(7);
    const first = Array.from({ length: 10 }, () => r.next());
    r.reseed(7);
    const again = Array.from({ length: 10 }, () => r.next());
    expect(again).toEqual(first);
  });
});
