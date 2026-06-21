// src/fights/tempest.test.ts
import { describe, it, expect } from "vitest";
import { createTempest, DEFAULT_TEMPEST, TEMPEST } from "./tempest";
import { makeCursor } from "../movement";
import type { Cursor } from "../movement";
import type { FightStatus } from "./types";
import { ARENA, CURSOR_SIZE } from "../constants";

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

// Monsters are the only filled shapes; the tunnel is stroke-only.
function countMonsters(fight: { draw: (ctx: CanvasRenderingContext2D) => void }): number {
  let n = 0;
  const ctx = {
    fillStyle: "", strokeStyle: "", lineWidth: 0, lineJoin: "",
    save() {}, restore() {}, translate() {}, rotate() {},
    beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, arc() {}, stroke() {},
    fill() { n++; },
  } as unknown as CanvasRenderingContext2D;
  fight.draw(ctx);
  return n;
}

describe("Tempest win by surviving the wave", () => {
  it("a player parked at the tunnel center is never hit by normal monsters", () => {
    const fight = createTempest({ ...DEFAULT_TEMPEST, monsterCount: 5, spawnInterval: 0.4, speed: 0.6 });
    const res = runUntilDone(fight, makeCursor(), 2000);
    expect(res.status).toBe("won");
  });
});

describe("Tempest loss", () => {
  it("a monster reaching the player out at the rim is a hit", () => {
    const fight = createTempest({
      ...DEFAULT_TEMPEST,
      monsterCount: 20, spawnInterval: 0.1, speed: 0.5, monsterSize: 40, lanes: 4,
    });
    // The center is the tunnel's deep/safe vanishing point; danger is at the rim.
    // Park the player out on lane 0's outward path (right-middle of the arena).
    const player = makeCursor();
    player.pos.x = ARENA.x + ARENA.w - CURSOR_SIZE;
    player.pos.y = ARENA.y + ARENA.h / 2 - CURSOR_SIZE / 2;
    expect(runUntilDone(fight, player, 2000).status).toBe("lost");
  });

  it("is deterministic: same seed gives the same outcome", () => {
    const cfg = { ...DEFAULT_TEMPEST, monsterCount: 12, monsterSize: 70, speed: 0.4 };
    const a = createTempest({ ...cfg });
    const b = createTempest({ ...cfg });
    expect(runUntilDone(a, makeCursor(), 5000)).toEqual(runUntilDone(b, makeCursor(), 5000));
  });
});

describe("Tempest spawning", () => {
  it("emerges a monster from deep in the tunnel right away", () => {
    const fight = createTempest({ ...DEFAULT_TEMPEST, monsterCount: 3, speed: 0.0001 });
    fight.update(makeCursor(), DT);
    expect(countMonsters(fight)).toBe(1);
  });

  it("spawns up to monsterCount over time, then stops", () => {
    // Near-zero speed keeps monsters deep (and harmless) so they accumulate.
    const fight = createTempest({ ...DEFAULT_TEMPEST, monsterCount: 4, spawnInterval: 0.3, speed: 0.0001 });
    const player = makeCursor();
    for (let i = 0; i < 360; i++) fight.update(player, DT); // ~3s
    expect(countMonsters(fight)).toBe(4);
  });

  it("never exceeds the monster cap", () => {
    const fight = createTempest({
      ...DEFAULT_TEMPEST, monsterCount: 999, spawnInterval: 0.02, speed: 0.0001,
    });
    const player = makeCursor();
    for (let i = 0; i < 1200; i++) fight.update(player, DT);
    expect(countMonsters(fight)).toBeLessThanOrEqual(64);
  });
});

describe("TEMPEST definition", () => {
  it("exposes the tunable params, all numeric fields of the defaults", () => {
    expect(TEMPEST.name).toBe("Tempest");
    expect(TEMPEST.defaults).toBe(DEFAULT_TEMPEST);
    expect(TEMPEST.params.map((p) => p.key)).toEqual([
      "seed", "monsterCount", "lanes", "spawnInterval", "speed", "monsterSize",
    ]);
    for (const p of TEMPEST.params) {
      expect(typeof (DEFAULT_TEMPEST as unknown as Record<string, unknown>)[p.key]).toBe("number");
    }
  });
});
