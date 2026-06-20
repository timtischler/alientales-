import { describe, it, expect } from "vitest";
import { createRng } from "../rng";
import { UFO_COLORS } from "../sprites";
import { ARENA } from "../constants";
import { DEFAULT_UFO_FIGHT, rollUfo } from "./ufoInvasion";
import { createUfoFight } from "./ufoInvasion";
import { createRng as createRng2 } from "../rng";
import { rollUfo as rollUfo2 } from "./ufoInvasion";
import { makeCursor } from "../movement";
import { UFO_INVASION } from "./ufoInvasion";
import type { FightStatus } from "./types";
import type { Cursor } from "../movement";

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

function runUntilDone(fight: { update: (p: Cursor, dt: number) => FightStatus }, player: Cursor, maxSteps: number): FightStatus {
  let status: FightStatus = "running";
  for (let i = 0; i < maxSteps; i++) {
    status = fight.update(player, 1 / 120);
    if (status !== "running") return status;
  }
  return status;
}

const BASE = {
  seed: 7, count: 1, speedMin: 120, speedMax: 120,
  ufoYMin: 300, ufoYMax: 300, beamerChance: 0,
  spawnGapMin: 0, spawnGapMax: 0,
};

describe("createUfoFight body collision", () => {
  it("kills a player parked in the UFO's row", () => {
    const fight = createUfoFight({ ...BASE });
    const player = makeCursor(); // centered in arena (x ~ 392, y ~ 292)
    player.pos.y = 300;
    expect(runUntilDone(fight, player, 2000)).toBe("lost");
  });

  it("a player parked in a different row survives and the fight is won", () => {
    const fight = createUfoFight({ ...BASE });
    const player = makeCursor();
    player.pos.y = 160; // top of arena, away from the y=300 UFO row
    expect(runUntilDone(fight, player, 3000)).toBe("won");
  });
});

describe("createUfoFight beam collision", () => {
  const BEAM_CFG = {
    seed: 42, count: 1, speedMin: 150, speedMax: 150,
    ufoYMin: 100, ufoYMax: 100, beamerChance: 1,
    spawnGapMin: 0, spawnGapMax: 0,
  };

  it("kills a player standing under the beam column", () => {
    // Predict the beam's x using the same public roll the fight will make first.
    const predicted = rollUfo2(createRng2(BEAM_CFG.seed), BEAM_CFG);
    expect(predicted.beamer).toBe(true);
    const fight = createUfoFight({ ...BEAM_CFG });
    const player = makeCursor();
    player.pos.x = predicted.stopCenterX - 8; // CURSOR_SIZE/2, centered under beam
    player.pos.y = 300; // body is at y=100 (above arena), so only the beam can hit
    expect(runUntilDone(fight, player, 3000)).toBe("lost");
  });

  it("a player far from the beam column survives", () => {
    const predicted = rollUfo2(createRng2(BEAM_CFG.seed), BEAM_CFG);
    const fight = createUfoFight({ ...BEAM_CFG });
    const player = makeCursor();
    // Park at the arena edge farthest from the beam center.
    const center = predicted.stopCenterX;
    const arenaMid = 250 + 300 / 2;
    player.pos.x = center < arenaMid ? 250 + 300 - 16 - 1 : 250 + 1;
    player.pos.y = 300;
    expect(runUntilDone(fight, player, 4000)).toBe("won");
  });
});

describe("createUfoFight draw", () => {
  it("draws the alien and active UFOs without throwing", () => {
    const calls: number[] = [];
    const ctx = {
      set fillStyle(_v: string) {},
      get fillStyle() { return ""; },
      set globalAlpha(_v: number) {},
      get globalAlpha() { return 1; },
      fillRect() { calls.push(1); },
    } as unknown as CanvasRenderingContext2D;

    const fight = createUfoFight({ ...BASE, count: 1, ufoYMin: 300, ufoYMax: 300 });
    const player = makeCursor();
    player.pos.y = 100; // keep player clear so the UFO stays alive a while
    for (let i = 0; i < 30; i++) fight.update(player, 1 / 120);
    fight.draw(ctx);
    // Alien (many cells) + at least one UFO contributes plenty of fillRects.
    expect(calls.length).toBeGreaterThan(10);
  });
});

describe("UFO_INVASION definition", () => {
  it("exposes the tunable params in order with defaults", () => {
    expect(UFO_INVASION.name).toBe("UFO Invasion");
    expect(UFO_INVASION.defaults).toBe(DEFAULT_UFO_FIGHT);
    const keys = UFO_INVASION.params.map((p) => p.key);
    expect(keys).toEqual([
      "seed", "count", "speedMin", "speedMax", "beamerChance", "spawnGapMin", "spawnGapMax",
    ]);
  });

  it("every param key is a numeric field of the defaults", () => {
    for (const p of UFO_INVASION.params) {
      expect(typeof (DEFAULT_UFO_FIGHT as unknown as Record<string, unknown>)[p.key]).toBe("number");
    }
  });

  it("create() builds a working fight", () => {
    const fight = UFO_INVASION.create(UFO_INVASION.defaults);
    const player = makeCursor();
    expect(fight.update(player, 1 / 120)).toBe("running");
  });
});
