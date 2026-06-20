import { describe, it, expect } from "vitest";
import { readConfig, randomizeSeed, clampToParam } from "./configPanel";
import type { FightDefinition } from "./fights/types";

const DEF: FightDefinition<{ a: number; b: number; seed: number; keep: number }> = {
  name: "t",
  params: [
    { key: "a", label: "A", kind: "float", min: 0, max: 100 },
    { key: "b", label: "B", kind: "int", min: 0, max: 20 },
    { key: "seed", label: "Seed", kind: "seed", min: 0, max: 9 },
  ],
  defaults: { a: 5, b: 10, seed: 1, keep: 42 },
  create: () => ({ update: () => "running", draw: () => {}, reset: () => {} }),
};

describe("clampToParam", () => {
  it("clamps to min/max", () => {
    expect(clampToParam(DEF.params[0], 999)).toBe(100);
    expect(clampToParam(DEF.params[0], -5)).toBe(0);
  });
  it("rounds int and seed kinds", () => {
    expect(clampToParam(DEF.params[1], 12.9)).toBe(13);
    expect(clampToParam(DEF.params[2], 3.4)).toBe(3);
  });
});

describe("readConfig", () => {
  it("parses provided values", () => {
    const c = readConfig(DEF, { a: "7.5", b: "12", seed: "3" });
    expect(c).toEqual({ a: 7.5, b: 12, seed: 3, keep: 42 });
  });
  it("clamps out-of-range values", () => {
    const c = readConfig(DEF, { a: "999", b: "-4", seed: "100" });
    expect(c).toEqual({ a: 100, b: 0, seed: 9, keep: 42 });
  });
  it("falls back to the default on NaN/empty", () => {
    const c = readConfig(DEF, { a: "", b: "abc" });
    expect(c).toEqual({ a: 5, b: 10, seed: 1, keep: 42 });
  });
  it("preserves non-param fields from defaults", () => {
    const c = readConfig(DEF, { a: "1" });
    expect(c.keep).toBe(42);
  });
});

describe("randomizeSeed", () => {
  it("returns min when rand is 0 and max when rand approaches 1", () => {
    expect(randomizeSeed(DEF.params[2], () => 0)).toBe(0);
    expect(randomizeSeed(DEF.params[2], () => 0.999999)).toBe(9);
  });
  it("stays within range", () => {
    for (let i = 0; i < 100; i++) {
      const v = randomizeSeed(DEF.params[2], Math.random);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(9);
    }
  });
});
