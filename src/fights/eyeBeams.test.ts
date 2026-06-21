// src/fights/eyeBeams.test.ts
import { describe, it, expect } from "vitest";
import { createEyeBeams, DEFAULT_EYE_BEAMS, EYE_BEAMS } from "./eyeBeams";
import { makeCursor } from "../movement";
import type { Cursor } from "../movement";
import type { FightStatus } from "./types";

function runUntilDone(
  fight: { update: (p: Cursor, dt: number) => FightStatus },
  player: Cursor,
  maxSteps: number,
): { status: FightStatus; step: number } {
  for (let i = 0; i < maxSteps; i++) {
    const s = fight.update(player, 1 / 120);
    if (s !== "running") return { status: s, step: i };
  }
  return { status: "running", step: maxSteps };
}

// Counts large-eye scleras (drawn at radius EYE_R = 22) via the public draw surface.
function countBigEyes(fight: { draw: (ctx: CanvasRenderingContext2D) => void }): number {
  let big = 0;
  const ctx = {
    fillStyle: "", strokeStyle: "", lineWidth: 0, globalAlpha: 1, lineCap: "",
    save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {},
    arc(_x: number, _y: number, r: number) { if (r === 22) big++; },
    fill() {}, stroke() {}, fillRect() {},
  } as unknown as CanvasRenderingContext2D;
  fight.draw(ctx);
  return big;
}

const LOSS_CFG = {
  ...DEFAULT_EYE_BEAMS,
  volleys: 2, pairCount: 1,
  telegraphTime: 0.2, beamTime: 0.3, beamWidth: 26,
  eyeFireGapMin: 0, eyeFireGapMax: 0,
  orbitRadius: 220, orbitRadiusAmp: 0,
  smallSpawnGapMin: 999, smallSpawnGapMax: 999,
};

describe("EyeBeams loss by aimed beam", () => {
  it("kills a stationary player with a locked beam", () => {
    const fight = createEyeBeams({ ...LOSS_CFG });
    expect(runUntilDone(fight, makeCursor(), 400).status).toBe("lost");
  });

  it("is deterministic: same seed kills at the same step", () => {
    const a = createEyeBeams({ ...LOSS_CFG });
    const b = createEyeBeams({ ...LOSS_CFG });
    expect(runUntilDone(a, makeCursor(), 400)).toEqual(runUntilDone(b, makeCursor(), 400));
  });
});

describe("EyeBeams win", () => {
  it("wins quickly with zero volleys", () => {
    const fight = createEyeBeams({ ...DEFAULT_EYE_BEAMS, volleys: 0 });
    expect(runUntilDone(fight, makeCursor(), 100).status).toBe("won");
  });
});

describe("EyeBeams small homing eyes", () => {
  it("a homing small eye kills a stationary player", () => {
    const fight = createEyeBeams({
      ...DEFAULT_EYE_BEAMS,
      volleys: 5,
      eyeFireGapMin: 999, eyeFireGapMax: 999,
      smallSpawnGapMin: 0, smallSpawnGapMax: 0,
      smallSpeed: 120, smallLifetime: 30,
    });
    expect(runUntilDone(fight, makeCursor(), 1000).status).toBe("lost");
  });

  it("never exceeds smallCount active small eyes", () => {
    const fight = createEyeBeams({
      ...DEFAULT_EYE_BEAMS,
      volleys: 50, smallCount: 3,
      eyeFireGapMin: 999, eyeFireGapMax: 999, // no beams
      orbitRadius: 400, orbitRadiusAmp: 0,    // eyes far outside the box
      smallSpawnGapMin: 0, smallSpawnGapMax: 0, // spawn aggressively
      smallSpeed: 0, smallLifetime: 999,       // eyes sit still, never expire
    });
    const player = makeCursor();
    for (let i = 0; i < 50; i++) fight.update(player, 1 / 120);

    // Small eyes draw their sclera at radius SMALL_R (7).
    let smallEyes = 0;
    const ctx = {
      fillStyle: "", strokeStyle: "", lineWidth: 0, globalAlpha: 1, lineCap: "",
      save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {},
      arc(_x: number, _y: number, r: number) { if (r === 7) smallEyes++; },
      fill() {}, stroke() {}, fillRect() {},
    } as unknown as CanvasRenderingContext2D;
    fight.draw(ctx);
    expect(smallEyes).toBeLessThanOrEqual(3);
    expect(smallEyes).toBe(3); // reaches the cap
  });
});

describe("EyeBeams pairs", () => {
  it("draws two large eyes per active pair", () => {
    const player = makeCursor();
    const one = createEyeBeams({ ...DEFAULT_EYE_BEAMS, volleys: 0, smallCount: 0, pairCount: 1 });
    const three = createEyeBeams({ ...DEFAULT_EYE_BEAMS, volleys: 0, smallCount: 0, pairCount: 3 });
    for (let i = 0; i < 10; i++) {
      one.update(player, 1 / 120);
      three.update(player, 1 / 120);
    }
    expect(countBigEyes(one)).toBe(2);
    expect(countBigEyes(three)).toBe(6);
  });
});

describe("EYE_BEAMS definition", () => {
  it("exposes the tunable params, all numeric fields of the defaults", () => {
    expect(EYE_BEAMS.name).toBe("Eye Beams");
    expect(EYE_BEAMS.defaults).toBe(DEFAULT_EYE_BEAMS);
    expect(EYE_BEAMS.params.map((p) => p.key)).toEqual([
      "seed", "volleys", "pairCount", "orbitSpeed", "telegraphTime", "beamTime",
      "beamWidth", "eyeFireGapMin", "eyeFireGapMax", "smallSpeed", "smallCount",
    ]);
    for (const p of EYE_BEAMS.params) {
      expect(typeof (DEFAULT_EYE_BEAMS as unknown as Record<string, unknown>)[p.key]).toBe("number");
    }
  });
});
