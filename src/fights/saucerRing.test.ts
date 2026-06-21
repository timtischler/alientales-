// src/fights/saucerRing.test.ts
import { describe, it, expect } from "vitest";
import { createSaucerRing, DEFAULT_SAUCER_RING, SAUCER_RING } from "./saucerRing";
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

// drawUfo draws one dome fillRect at fillStyle "#cfe8ff"; count those to count saucers.
function countSaucers(fight: { draw: (ctx: CanvasRenderingContext2D) => void }): number {
  let domes = 0;
  let fill = "";
  const ctx = {
    set fillStyle(v: string) { fill = v; },
    get fillStyle() { return fill; },
    strokeStyle: "", lineWidth: 0, globalAlpha: 1, lineCap: "",
    save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {},
    arc() {}, fill() {}, stroke() {}, translate() {}, rotate() {},
    fillRect() { if (fill === "#cfe8ff") domes++; },
  } as unknown as CanvasRenderingContext2D;
  fight.draw(ctx);
  return domes;
}

const SHOT_LOSS = {
  ...DEFAULT_SAUCER_RING,
  alienCount: 1, volleys: 5,
  tractorGapMin: 999, tractorGapMax: 999, // no tractor
  shotGapMin: 0, shotGapMax: 0, shotSpeed: 400,
};

describe("SaucerRing loss by little shot", () => {
  it("kills a stationary centered player with an inward shot", () => {
    const fight = createSaucerRing({ ...SHOT_LOSS });
    expect(runUntilDone(fight, makeCursor(), 300).status).toBe("lost");
  });
  it("is deterministic: same seed kills at the same step", () => {
    const a = createSaucerRing({ ...SHOT_LOSS });
    const b = createSaucerRing({ ...SHOT_LOSS });
    expect(runUntilDone(a, makeCursor(), 300)).toEqual(runUntilDone(b, makeCursor(), 300));
  });
});

describe("SaucerRing loss by tractor beam", () => {
  it("kills a stationary centered player with the inward beam", () => {
    const fight = createSaucerRing({
      ...DEFAULT_SAUCER_RING,
      alienCount: 1, volleys: 2,
      shotGapMin: 999, shotGapMax: 999, // no shots
      tractorGapMin: 0, tractorGapMax: 0,
      telegraphTime: 0.2, beamTime: 0.3,
    });
    expect(runUntilDone(fight, makeCursor(), 200).status).toBe("lost");
  });
});

describe("SaucerRing win", () => {
  it("wins quickly with zero volleys and no shots", () => {
    const fight = createSaucerRing({
      ...DEFAULT_SAUCER_RING,
      alienCount: 1, volleys: 0,
      shotGapMin: 999, shotGapMax: 999,
    });
    expect(runUntilDone(fight, makeCursor(), 50).status).toBe("won");
  });
});

describe("SaucerRing saucer count", () => {
  it("draws one saucer per alien", () => {
    const player = makeCursor();
    const one = createSaucerRing({ ...DEFAULT_SAUCER_RING, alienCount: 1, volleys: 0, shotGapMin: 999, shotGapMax: 999 });
    const three = createSaucerRing({ ...DEFAULT_SAUCER_RING, alienCount: 3, volleys: 0, shotGapMin: 999, shotGapMax: 999 });
    for (let i = 0; i < 5; i++) { one.update(player, 1 / 120); three.update(player, 1 / 120); }
    expect(countSaucers(one)).toBe(1);
    expect(countSaucers(three)).toBe(3);
  });
});

describe("SAUCER_RING definition", () => {
  it("exposes the tunable params, all numeric fields of the defaults", () => {
    expect(SAUCER_RING.name).toBe("Saucer Ring");
    expect(SAUCER_RING.defaults).toBe(DEFAULT_SAUCER_RING);
    expect(SAUCER_RING.params.map((p) => p.key)).toEqual([
      "seed", "volleys", "alienCount", "orbitSpeed", "shotGapMin", "shotGapMax",
      "shotSpeed", "tractorGapMin", "tractorGapMax", "telegraphTime", "beamTime", "beamWidth",
      "cowCount",
    ]);
    for (const p of SAUCER_RING.params) {
      expect(typeof (DEFAULT_SAUCER_RING as unknown as Record<string, unknown>)[p.key]).toBe("number");
    }
  });
});

function countCows(fight: { draw: (ctx: CanvasRenderingContext2D) => void }): number {
  let cows = 0;
  let fill = "";
  const ctx = {
    set fillStyle(v: string) { fill = v; },
    get fillStyle() { return fill; },
    strokeStyle: "", lineWidth: 0, globalAlpha: 1, lineCap: "",
    save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {},
    arc() {}, fill() {}, stroke() {}, translate() {}, rotate() {},
    fillRect() { if (fill === "#f7b6c2") cows++; },
  } as unknown as CanvasRenderingContext2D;
  fight.draw(ctx);
  return cows;
}

describe("SaucerRing cow count", () => {
  it("draws one cow per cowCount, and none when zero", () => {
    const player = makeCursor();
    const four = createSaucerRing({ ...DEFAULT_SAUCER_RING, cowCount: 4, volleys: 0, shotGapMin: 999, shotGapMax: 999 });
    const none = createSaucerRing({ ...DEFAULT_SAUCER_RING, cowCount: 0, volleys: 0, shotGapMin: 999, shotGapMax: 999 });
    for (let i = 0; i < 5; i++) { four.update(player, 1 / 120); none.update(player, 1 / 120); }
    expect(countCows(four)).toBe(4);
    expect(countCows(none)).toBe(0);
  });
});
