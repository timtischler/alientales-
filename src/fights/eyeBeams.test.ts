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

const LOSS_CFG = {
  ...DEFAULT_EYE_BEAMS,
  volleys: 2, eyeCount: 1,
  telegraphTime: 0.2, beamTime: 0.3, beamWidth: 26,
  eyeFireGapMin: 0, eyeFireGapMax: 0,
  orbitRadius: 220, orbitRadiusAmp: 0,
  smallSpawnGapMin: 999, smallSpawnGapMax: 999,
};

describe("EyeBeams loss by aimed beam", () => {
  it("kills a stationary player with a locked beam", () => {
    const fight = createEyeBeams({ ...LOSS_CFG });
    const player = makeCursor();
    expect(runUntilDone(fight, player, 400).status).toBe("lost");
  });

  it("is deterministic: same seed kills at the same step", () => {
    const a = createEyeBeams({ ...LOSS_CFG });
    const b = createEyeBeams({ ...LOSS_CFG });
    const ra = runUntilDone(a, makeCursor(), 400);
    const rb = runUntilDone(b, makeCursor(), 400);
    expect(ra).toEqual(rb);
  });
});

describe("EyeBeams win", () => {
  it("wins quickly with zero volleys and eyes orbiting clear of the box", () => {
    const fight = createEyeBeams({
      ...DEFAULT_EYE_BEAMS,
      volleys: 0, eyeCount: 1,
      orbitRadius: 260, orbitRadiusAmp: 0,
    });
    expect(runUntilDone(fight, makeCursor(), 100).status).toBe("won");
  });
});

describe("EYE_BEAMS definition", () => {
  it("exposes the tunable params, all numeric fields of the defaults", () => {
    expect(EYE_BEAMS.name).toBe("Eye Beams");
    expect(EYE_BEAMS.defaults).toBe(DEFAULT_EYE_BEAMS);
    expect(EYE_BEAMS.params.map((p) => p.key)).toEqual([
      "seed", "volleys", "eyeCount", "orbitSpeed", "telegraphTime",
      "beamTime", "beamWidth", "eyeFireGapMin", "eyeFireGapMax", "smallSpeed",
    ]);
    for (const p of EYE_BEAMS.params) {
      expect(typeof (DEFAULT_EYE_BEAMS as unknown as Record<string, unknown>)[p.key]).toBe("number");
    }
  });
});
