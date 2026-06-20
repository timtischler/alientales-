import { describe, it, expect } from "vitest";
import { createRng } from "../rng";
import { UFO_COLORS } from "../sprites";
import { ARENA } from "../constants";
import { DEFAULT_UFO_FIGHT, rollUfo } from "./ufoInvasion";

describe("DEFAULT_UFO_FIGHT", () => {
  it("spawns 30 UFOs", () => {
    expect(DEFAULT_UFO_FIGHT.count).toBe(30);
  });
});

describe("rollUfo", () => {
  it("is deterministic for a given seed", () => {
    const a = createRng(DEFAULT_UFO_FIGHT.seed);
    const b = createRng(DEFAULT_UFO_FIGHT.seed);
    for (let i = 0; i < 50; i++) {
      expect(rollUfo(a, DEFAULT_UFO_FIGHT)).toEqual(rollUfo(b, DEFAULT_UFO_FIGHT));
    }
  });

  it("respects configured ranges", () => {
    const r = createRng(1);
    for (let i = 0; i < 200; i++) {
      const p = rollUfo(r, DEFAULT_UFO_FIGHT);
      expect(p.speed).toBeGreaterThanOrEqual(DEFAULT_UFO_FIGHT.speedMin);
      expect(p.speed).toBeLessThanOrEqual(DEFAULT_UFO_FIGHT.speedMax);
      expect(p.y).toBeGreaterThanOrEqual(DEFAULT_UFO_FIGHT.ufoYMin);
      expect(p.y).toBeLessThanOrEqual(DEFAULT_UFO_FIGHT.ufoYMax);
      expect(UFO_COLORS).toContain(p.color);
      expect(p.stopCenterX).toBeGreaterThanOrEqual(ARENA.x + 20);
      expect(p.stopCenterX).toBeLessThanOrEqual(ARENA.x + ARENA.w - 20);
      expect(typeof p.beamer).toBe("boolean");
      expect(typeof p.fromLeft).toBe("boolean");
    }
  });

  it("draws exactly 6 rng values per call (constant draw count)", () => {
    // Two generators, one advanced by rollUfo, the other by 6 raw next() calls,
    // must stay in lockstep.
    const viaRoll = createRng(555);
    const viaRaw = createRng(555);
    rollUfo(viaRoll, DEFAULT_UFO_FIGHT);
    for (let i = 0; i < 6; i++) viaRaw.next();
    expect(viaRoll.next()).toBe(viaRaw.next());
  });
});
