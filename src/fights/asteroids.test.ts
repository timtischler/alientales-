// src/fights/asteroids.test.ts
import { describe, it, expect } from "vitest";
import { createAsteroids, DEFAULT_ASTEROIDS, ASTEROIDS, SURVIVE_TIME } from "./asteroids";
import { makeCursor } from "../movement";
import type { Cursor } from "../movement";
import type { FightStatus } from "./types";

const DT = 1 / 120;

function runUntilDone(
  fight: { update: (p: Cursor, dt: number) => FightStatus },
  player: Cursor,
  maxSteps: number,
): { status: FightStatus; step: number } {
  for (let i = 0; i < maxSteps; i++) {
    const s = fight.update(player, DT);
    if (s !== "running") return { status: s, step: i };
  }
  return { status: "running", step: maxSteps };
}

// Each asteroid strokes its outline exactly once per draw.
function countAsteroids(fight: { draw: (ctx: CanvasRenderingContext2D) => void }): number {
  let n = 0;
  const ctx = {
    fillStyle: "", strokeStyle: "", lineWidth: 0, lineJoin: "", globalAlpha: 1,
    save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {},
    arc() {}, fill() {}, fillRect() {},
    stroke() { n++; },
  } as unknown as CanvasRenderingContext2D;
  fight.draw(ctx);
  return n;
}

describe("Asteroids win by survival", () => {
  it("wins after surviving with no asteroids on screen", () => {
    const fight = createAsteroids({ ...DEFAULT_ASTEROIDS, count: 0, spawnInterval: 0 });
    const res = runUntilDone(fight, makeCursor(), Math.ceil(SURVIVE_TIME / DT) + 50);
    expect(res.status).toBe("won");
    expect(res.step).toBeGreaterThanOrEqual(Math.ceil(SURVIVE_TIME / DT) - 1);
  });
});

describe("Asteroids loss", () => {
  it("a dense field of large rocks eventually hits a stationary player", () => {
    const fight = createAsteroids({
      ...DEFAULT_ASTEROIDS,
      count: 48, minSize: 55, maxSize: 60, avgSize: 58, speed: 120, spawnInterval: 0.2,
    });
    expect(runUntilDone(fight, makeCursor(), Math.ceil(SURVIVE_TIME / DT)).status).toBe("lost");
  });

  it("is deterministic: same seed gives the same outcome", () => {
    const cfg = {
      ...DEFAULT_ASTEROIDS,
      count: 30, minSize: 40, maxSize: 50, avgSize: 45, speed: 100, spawnInterval: 0.5,
    };
    const a = createAsteroids({ ...cfg });
    const b = createAsteroids({ ...cfg });
    expect(runUntilDone(a, makeCursor(), 5000)).toEqual(runUntilDone(b, makeCursor(), 5000));
  });
});

describe("Asteroids spawning", () => {
  it("starts with `count` asteroids on screen", () => {
    // speed 0 keeps rocks parked on the edges, away from the centered player.
    const fight = createAsteroids({ ...DEFAULT_ASTEROIDS, count: 5, speed: 0, spawnInterval: 0 });
    fight.update(makeCursor(), DT);
    expect(countAsteroids(fight)).toBe(5);
  });

  it("adds more asteroids over time on the spawn interval", () => {
    const fight = createAsteroids({ ...DEFAULT_ASTEROIDS, count: 2, speed: 0, spawnInterval: 0.5 });
    const player = makeCursor();
    for (let i = 0; i < 360; i++) fight.update(player, DT); // ~3s
    const n = countAsteroids(fight);
    expect(n).toBeGreaterThan(2);
    expect(n).toBeLessThanOrEqual(48);
  });

  it("never exceeds the asteroid cap even with aggressive spawning", () => {
    const fight = createAsteroids({
      ...DEFAULT_ASTEROIDS, count: 48, speed: 0, spawnInterval: 0.01,
    });
    const player = makeCursor();
    for (let i = 0; i < 600; i++) fight.update(player, DT);
    expect(countAsteroids(fight)).toBeLessThanOrEqual(48);
  });
});

describe("ASTEROIDS definition", () => {
  it("exposes the tunable params, all numeric fields of the defaults", () => {
    expect(ASTEROIDS.name).toBe("Asteroids");
    expect(ASTEROIDS.defaults).toBe(DEFAULT_ASTEROIDS);
    expect(ASTEROIDS.params.map((p) => p.key)).toEqual([
      "seed", "count", "minSize", "maxSize", "avgSize", "speed", "spawnInterval",
    ]);
    for (const p of ASTEROIDS.params) {
      expect(typeof (DEFAULT_ASTEROIDS as unknown as Record<string, unknown>)[p.key]).toBe("number");
    }
  });
});
