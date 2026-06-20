# Fight Primitive + UFO Invasion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable `Fight` primitive and implement the first fight — a seeded, deterministic wave of 30 colorful UFOs (some firing Galaga-style tractor beams) that the player dodges.

**Architecture:** A `Fight` is an object `{ update(player, dt) -> FightStatus, draw(ctx), reset() }` driven by the existing fixed-timestep loop. The first fight (`ufoInvasion`) owns a seeded PRNG, a fixed pool of UFO structs, an alien, per-UFO state machines, and AABB collision against the player. Determinism comes from fixed timestep + seeded RNG drawn only at spawn.

**Tech Stack:** TypeScript, Vitest, Canvas2D (all already in the project).

## Global Constraints

- Logical space 800×600; `ARENA = { x: 250, y: 150, w: 300, h: 300 }` (floor y = 450); `CURSOR_SIZE = 16`. Import these from `src/constants.ts`; do not redefine.
- Simulation is fixed-timestep at 120 Hz (`FIXED_DT = 1/120`). Fights advance by `dt` per `update` call.
- **Zero per-frame / per-step allocation** in `update`, `draw`, and every helper they call: no object/array literals, no closures created per call, no `new`. Pools and RNG state are allocated once at construction. (One-time allocation at module load or construction is fine.)
- Determinism: the fight's RNG is drawn ONLY at UFO spawn, in a fixed order, so the same seed reproduces the same run. Default seed lives in the fight config.
- Collision = AABB overlap of the player square against any active UFO **body** rect or any active **beam** rect → `"lost"`.
- UFO dimensions: `UFO_W = 40`, `UFO_H = 16`. Beam width `BEAM_W = 28`. Beam steps `BEAM_STEP_PX = 14` every `BEAM_STEP_INTERVAL = 0.05` s; full-extent hold `BEAM_HOLD = 0.5` s. Beam top = UFO bottom; beam bottom = arena floor.
- Render order each frame: black background → fight layer (alien, UFOs, beams) → arena outline → player cursor on top.
- TypeScript strict mode; full suite green; `npm run build` succeeds.

---

### Task 1: Seeded PRNG

**Files:**
- Create: `src/rng.ts`
- Test: `src/rng.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `interface Rng { next(): number; reseed(seed: number): void }`; `function createRng(seed: number): Rng`. `next()` returns a float in `[0, 1)`. The generator is `mulberry32` — a single stateful closure, allocation-free per `next()`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/rng.test.ts
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
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test`
Expected: FAIL — `createRng` not defined.

- [ ] **Step 3: Implement `src/rng.ts`**

```ts
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
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/rng.ts src/rng.test.ts
git commit -m "feat: seeded mulberry32 PRNG"
```

---

### Task 2: AABB overlap helper

**Files:**
- Create: `src/collision.ts`
- Test: `src/collision.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh): boolean` — all params `number`. Returns true iff the two axis-aligned rectangles overlap with positive area (edge-touching is NOT overlap).

- [ ] **Step 1: Write the failing tests**

```ts
// src/collision.test.ts
import { describe, it, expect } from "vitest";
import { rectsOverlap } from "./collision";

describe("rectsOverlap", () => {
  it("true when rectangles overlap", () => {
    expect(rectsOverlap(0, 0, 10, 10, 5, 5, 10, 10)).toBe(true);
  });
  it("false when separated on x", () => {
    expect(rectsOverlap(0, 0, 10, 10, 20, 0, 10, 10)).toBe(false);
  });
  it("false when separated on y", () => {
    expect(rectsOverlap(0, 0, 10, 10, 0, 20, 10, 10)).toBe(false);
  });
  it("false when only edges touch", () => {
    expect(rectsOverlap(0, 0, 10, 10, 10, 0, 10, 10)).toBe(false);
  });
  it("true when one contains the other", () => {
    expect(rectsOverlap(0, 0, 100, 100, 40, 40, 5, 5)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test`
Expected: FAIL — `rectsOverlap` not defined.

- [ ] **Step 3: Implement `src/collision.ts`**

```ts
export function rectsOverlap(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/collision.ts src/collision.test.ts
git commit -m "feat: AABB rectsOverlap helper"
```

---

### Task 3: Sprite + UFO + beam drawing primitives

**Files:**
- Create: `src/sprites.ts`
- Test: `src/sprites.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface Sprite { readonly w: number; readonly h: number; readonly palette: readonly string[]; readonly cells: readonly number[] }` — `cells` length `w*h`, each a palette index; index `0` is transparent (skipped).
  - `function drawSprite(ctx, sprite, x, y, pixel): void` — draws each non-zero cell as a `pixel`-sized `fillRect` at top-left `(x, y)`. Allocation-free.
  - `const ALIEN: Sprite` — an 11×8 "strange little alien".
  - `const UFO_COLORS: readonly string[]` — the UFO color palette (6 colors).
  - `function drawUfo(ctx, x, y, w, h, color): void` — procedural colored saucer at top-left `(x,y)`. Allocation-free.
  - `function drawBeam(ctx, centerX, top, w, len, color): void` — translucent column with a bright leading edge. Allocation-free.

- [ ] **Step 1: Write the failing tests (fake ctx records calls)**

```ts
// src/sprites.test.ts
import { describe, it, expect } from "vitest";
import { drawSprite, drawUfo, drawBeam, ALIEN, UFO_COLORS } from "./sprites";

function fakeCtx() {
  const calls: { x: number; y: number; w: number; h: number; fill: string }[] = [];
  let fill = "";
  let alpha = 1;
  return {
    set fillStyle(v: string) { fill = v; },
    get fillStyle() { return fill; },
    set globalAlpha(v: number) { alpha = v; },
    get globalAlpha() { return alpha; },
    fillRect(x: number, y: number, w: number, h: number) {
      calls.push({ x, y, w, h, fill });
    },
    calls,
  };
}

describe("drawSprite", () => {
  it("draws one rect per non-transparent cell at scaled coordinates", () => {
    const sprite = { w: 2, h: 2, palette: ["", "#f00"], cells: [0, 1, 1, 0] };
    const ctx = fakeCtx();
    drawSprite(ctx as unknown as CanvasRenderingContext2D, sprite, 5, 5, 10);
    expect(ctx.calls).toEqual([
      { x: 15, y: 5, w: 10, h: 10, fill: "#f00" },
      { x: 5, y: 15, w: 10, h: 10, fill: "#f00" },
    ]);
  });
});

describe("ALIEN", () => {
  it("has cells matching its dimensions and valid palette indices", () => {
    expect(ALIEN.cells.length).toBe(ALIEN.w * ALIEN.h);
    for (const c of ALIEN.cells) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThan(ALIEN.palette.length);
    }
  });
});

describe("drawUfo", () => {
  it("uses the given color and draws several rects", () => {
    const ctx = fakeCtx();
    drawUfo(ctx as unknown as CanvasRenderingContext2D, 100, 50, 40, 16, "#40c4ff");
    expect(ctx.calls.length).toBeGreaterThan(2);
    expect(ctx.calls.some((c) => c.fill === "#40c4ff")).toBe(true);
  });
});

describe("drawBeam", () => {
  it("draws a translucent column and resets alpha to 1", () => {
    const ctx = fakeCtx();
    drawBeam(ctx as unknown as CanvasRenderingContext2D, 200, 60, 28, 100, "#69f0ae");
    expect(ctx.calls.length).toBeGreaterThanOrEqual(2);
    expect(ctx.globalAlpha).toBe(1);
  });
});

describe("UFO_COLORS", () => {
  it("has six colors", () => {
    expect(UFO_COLORS.length).toBe(6);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test`
Expected: FAIL — module/exports not defined.

- [ ] **Step 3: Implement `src/sprites.ts`**

```ts
export interface Sprite {
  readonly w: number;
  readonly h: number;
  readonly palette: readonly string[];
  readonly cells: readonly number[];
}

export function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: Sprite,
  x: number,
  y: number,
  pixel: number,
): void {
  for (let r = 0; r < sprite.h; r++) {
    for (let c = 0; c < sprite.w; c++) {
      const idx = sprite.cells[r * sprite.w + c];
      if (idx === 0) continue;
      ctx.fillStyle = sprite.palette[idx];
      ctx.fillRect(x + c * pixel, y + r * pixel, pixel, pixel);
    }
  }
}

// palette: 0 transparent | 1 body | 2 eyes | 3 antenna tips | 4 mouth
const ALIEN_ROWS: number[][] = [
  [0, 0, 0, 3, 0, 0, 0, 3, 0, 0, 0],
  [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
  [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
  [1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1],
  [1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1],
  [1, 1, 1, 1, 4, 4, 4, 1, 1, 1, 1],
  [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
  [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0],
];

export const ALIEN: Sprite = {
  w: 11,
  h: 8,
  palette: ["", "#7df9ff", "#ffffff", "#ff5cf0", "#ff3b3b"],
  cells: ALIEN_ROWS.flat(),
};

export const UFO_COLORS: readonly string[] = [
  "#ff5252", "#ffd740", "#69f0ae", "#40c4ff", "#e040fb", "#ff6e40",
];

export function drawUfo(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y + h * 0.45, w, h * 0.35);
  ctx.fillRect(x + w * 0.12, y + h * 0.3, w * 0.76, h * 0.3);
  ctx.fillStyle = "#cfe8ff";
  ctx.fillRect(x + w * 0.32, y + h * 0.05, w * 0.36, h * 0.4);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x + w * 0.18, y + h * 0.62, 3, 3);
  ctx.fillRect(x + w * 0.45, y + h * 0.62, 3, 3);
  ctx.fillRect(x + w * 0.72, y + h * 0.62, 3, 3);
}

export function drawBeam(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  top: number,
  w: number,
  len: number,
  color: string,
): void {
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = color;
  ctx.fillRect(centerX - w / 2, top, w, len);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(centerX - w / 2, top + len - 3, w, 3);
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sprites.ts src/sprites.test.ts
git commit -m "feat: sprite, UFO, and beam drawing primitives"
```

---

### Task 4: Fight types, UFO fight config, and seeded UFO roll

**Files:**
- Create: `src/fights/types.ts`
- Create: `src/fights/ufoInvasion.ts`
- Test: `src/fights/ufoInvasion.test.ts`

**Interfaces:**
- Consumes: `Rng`/`createRng` (Task 1); `UFO_COLORS` (Task 3); `ARENA` from `src/constants.ts`; `Cursor` from `src/movement.ts`.
- Produces:
  - `src/fights/types.ts`: `type FightStatus = "running" | "won" | "lost"`; `interface Fight { update(player: Cursor, dt: number): FightStatus; draw(ctx: CanvasRenderingContext2D): void; reset(): void }`.
  - `src/fights/ufoInvasion.ts`:
    - `interface UfoFightConfig { seed: number; count: number; speedMin: number; speedMax: number; ufoYMin: number; ufoYMax: number; beamerChance: number; spawnGapMin: number; spawnGapMax: number }`.
    - `const DEFAULT_UFO_FIGHT: UfoFightConfig`.
    - `interface UfoParams { fromLeft: boolean; speed: number; y: number; color: string; beamer: boolean; stopCenterX: number }`.
    - `function rollUfo(rng: Rng, cfg: UfoFightConfig): UfoParams` — draws exactly 6 rng values in fixed order: direction, speed, y, color, beamer, stopCenterX (drawn unconditionally so the draw count is constant). `stopCenterX` is in `[ARENA.x + 20, ARENA.x + ARENA.w - 20]`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/fights/ufoInvasion.test.ts
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
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test`
Expected: FAIL — module/exports not defined.

- [ ] **Step 3: Create `src/fights/types.ts`**

```ts
import type { Cursor } from "../movement";

export type FightStatus = "running" | "won" | "lost";

export interface Fight {
  update(player: Cursor, dt: number): FightStatus;
  draw(ctx: CanvasRenderingContext2D): void;
  reset(): void;
}
```

- [ ] **Step 4: Create `src/fights/ufoInvasion.ts` (config + rollUfo only)**

```ts
import type { Rng } from "../rng";
import { UFO_COLORS } from "../sprites";
import { ARENA } from "../constants";

export interface UfoFightConfig {
  seed: number;
  count: number;
  speedMin: number;
  speedMax: number;
  ufoYMin: number;
  ufoYMax: number;
  beamerChance: number;
  spawnGapMin: number;
  spawnGapMax: number;
}

export const DEFAULT_UFO_FIGHT: UfoFightConfig = {
  seed: 1337,
  count: 30,
  speedMin: 90,
  speedMax: 200,
  ufoYMin: 90,
  ufoYMax: 410,
  beamerChance: 0.5,
  spawnGapMin: 0.6,
  spawnGapMax: 1.6,
};

export interface UfoParams {
  fromLeft: boolean;
  speed: number;
  y: number;
  color: string;
  beamer: boolean;
  stopCenterX: number;
}

const STOP_MIN_X = ARENA.x + 20;
const STOP_MAX_X = ARENA.x + ARENA.w - 20;

// Draws exactly 6 rng values in a fixed order so the draw count is constant
// regardless of the rolled values — this keeps the spawn stream deterministic.
export function rollUfo(rng: Rng, cfg: UfoFightConfig): UfoParams {
  const fromLeft = rng.next() < 0.5;
  const speed = cfg.speedMin + rng.next() * (cfg.speedMax - cfg.speedMin);
  const y = cfg.ufoYMin + rng.next() * (cfg.ufoYMax - cfg.ufoYMin);
  const color = UFO_COLORS[Math.floor(rng.next() * UFO_COLORS.length)];
  const beamer = rng.next() < cfg.beamerChance;
  const stopCenterX = STOP_MIN_X + rng.next() * (STOP_MAX_X - STOP_MIN_X);
  return { fromLeft, speed, y, color, beamer, stopCenterX };
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/fights/types.ts src/fights/ufoInvasion.ts src/fights/ufoInvasion.test.ts
git commit -m "feat: Fight interface, UFO fight config, and seeded UFO roll"
```

---

### Task 5: UFO fight simulation (update, state machine, collision, win)

**Files:**
- Modify: `src/fights/ufoInvasion.ts`
- Test: `src/fights/ufoInvasion.test.ts` (add cases)

**Interfaces:**
- Consumes: everything from Task 4; `createRng` (Task 1); `rectsOverlap` (Task 2); `ARENA`, `CURSOR_SIZE` from `src/constants.ts`; `makeCursor`/`Cursor` from `src/movement.ts`; `Fight`/`FightStatus` from `./types`.
- Produces: `function createUfoFight(cfg: UfoFightConfig): Fight`. The returned object's `update(player, dt)` advances spawn cadence + every active UFO's state machine + collision and returns status; `reset()` re-seeds and clears all UFOs; `draw(ctx)` is a temporary no-op stub here (implemented in Task 6). All allocation-free after construction. Exposes module constants `UFO_W = 40`, `UFO_H = 16`, `BEAM_W = 28` via export (the test and Task 6 import them).

- [ ] **Step 1: Add failing tests for body and beam collision and win**

```ts
// Append to src/fights/ufoInvasion.test.ts
import { createUfoFight, UFO_W, UFO_H } from "./ufoInvasion";
import { createRng as createRng2 } from "../rng";
import { rollUfo as rollUfo2 } from "./ufoInvasion";
import { makeCursor } from "../movement";
import type { FightStatus } from "./types";
import type { Cursor } from "../movement";

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
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test`
Expected: FAIL — `createUfoFight`, `UFO_W`, `UFO_H` not exported.

- [ ] **Step 3: Append the simulation to `src/fights/ufoInvasion.ts`**

Add these imports to the existing import block at the top of the file:

```ts
import { createRng } from "../rng";
import { rectsOverlap } from "../collision";
import { CURSOR_SIZE, LOGICAL_WIDTH } from "../constants";
import type { Cursor } from "../movement";
import type { Fight, FightStatus } from "./types";
```

Then append:

```ts
export const UFO_W = 40;
export const UFO_H = 16;
export const BEAM_W = 28;
const BEAM_STEP_PX = 14;
const BEAM_STEP_INTERVAL = 0.05;
const BEAM_HOLD = 0.5;
const POOL = 12;

const PHASE_FLY = 0;
const PHASE_BEAM = 1;
const PHASE_RESUME = 2;

interface Ufo {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  color: string;
  beamer: boolean;
  beamed: boolean;
  stopX: number;
  phase: number;
  beamLen: number;
  beamStepTimer: number;
  beamHoldTimer: number;
}

function makeUfo(): Ufo {
  return {
    active: false, x: 0, y: 0, vx: 0, color: "#fff",
    beamer: false, beamed: false, stopX: 0, phase: PHASE_FLY,
    beamLen: 0, beamStepTimer: 0, beamHoldTimer: 0,
  };
}

export function createUfoFight(cfg: UfoFightConfig): Fight {
  const rng = createRng(cfg.seed);
  const ufos: Ufo[] = [];
  for (let i = 0; i < POOL; i++) ufos.push(makeUfo());

  let spawnTimer = 0;
  let spawnedCount = 0;
  // Alien bob phase, advanced each step and read by draw (Task 6).
  let alienBob = 0;

  function reset(): void {
    rng.reseed(cfg.seed);
    for (let i = 0; i < POOL; i++) ufos[i].active = false;
    spawnTimer = 0;
    spawnedCount = 0;
    alienBob = 0;
  }

  function freeSlot(): number {
    for (let i = 0; i < POOL; i++) if (!ufos[i].active) return i;
    return -1;
  }

  function spawnInto(u: Ufo): void {
    const p = rollUfo(rng, cfg);
    u.active = true;
    u.color = p.color;
    u.y = p.y;
    u.beamer = p.beamer;
    u.beamed = false;
    u.phase = PHASE_FLY;
    u.beamLen = 0;
    u.beamStepTimer = 0;
    u.beamHoldTimer = 0;
    u.stopX = p.stopCenterX - UFO_W / 2;
    if (p.fromLeft) {
      u.x = -UFO_W;
      u.vx = p.speed;
    } else {
      u.x = LOGICAL_WIDTH;
      u.vx = -p.speed;
    }
  }

  function stepUfo(u: Ufo, dt: number): void {
    if (u.phase === PHASE_FLY) {
      if (u.beamer && !u.beamed) {
        const nextX = u.x + u.vx * dt;
        const reached = u.vx > 0 ? nextX >= u.stopX : nextX <= u.stopX;
        if (reached) {
          u.x = u.stopX;
          u.phase = PHASE_BEAM;
          u.beamed = true;
          u.beamLen = 0;
          u.beamStepTimer = 0;
          u.beamHoldTimer = 0;
          return;
        }
      }
      u.x += u.vx * dt;
    } else if (u.phase === PHASE_BEAM) {
      const maxLen = ARENA.y + ARENA.h - (u.y + UFO_H);
      if (u.beamLen < maxLen) {
        u.beamStepTimer += dt;
        while (u.beamStepTimer >= BEAM_STEP_INTERVAL && u.beamLen < maxLen) {
          u.beamLen = Math.min(u.beamLen + BEAM_STEP_PX, maxLen);
          u.beamStepTimer -= BEAM_STEP_INTERVAL;
        }
      } else {
        u.beamHoldTimer += dt;
        if (u.beamHoldTimer >= BEAM_HOLD) {
          u.beamLen = 0;
          u.phase = PHASE_RESUME;
        }
      }
    } else {
      u.x += u.vx * dt;
    }
    if (u.x + UFO_W < 0 || u.x > LOGICAL_WIDTH) u.active = false;
  }

  function hitsPlayer(u: Ufo, px: number, py: number): boolean {
    if (rectsOverlap(px, py, CURSOR_SIZE, CURSOR_SIZE, u.x, u.y, UFO_W, UFO_H)) {
      return true;
    }
    if (u.phase === PHASE_BEAM && u.beamLen > 0) {
      const bx = u.x + UFO_W / 2 - BEAM_W / 2;
      const by = u.y + UFO_H;
      if (rectsOverlap(px, py, CURSOR_SIZE, CURSOR_SIZE, bx, by, BEAM_W, u.beamLen)) {
        return true;
      }
    }
    return false;
  }

  function update(player: Cursor, dt: number): FightStatus {
    alienBob += dt;

    spawnTimer -= dt;
    while (spawnTimer <= 0 && spawnedCount < cfg.count) {
      const slot = freeSlot();
      if (slot === -1) break;
      spawnInto(ufos[slot]);
      spawnedCount++;
      if (spawnedCount < cfg.count) {
        spawnTimer += cfg.spawnGapMin + rng.next() * (cfg.spawnGapMax - cfg.spawnGapMin);
      }
    }

    const px = player.pos.x;
    const py = player.pos.y;
    let anyActive = false;
    for (let i = 0; i < POOL; i++) {
      const u = ufos[i];
      if (!u.active) continue;
      stepUfo(u, dt);
      if (u.active) {
        anyActive = true;
        if (hitsPlayer(u, px, py)) return "lost";
      }
    }

    if (spawnedCount >= cfg.count && !anyActive) return "won";
    return "running";
  }

  function draw(_ctx: CanvasRenderingContext2D): void {
    // Implemented in Task 6.
    void alienBob;
  }

  return { update, draw, reset };
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test`
Expected: PASS — body and beam collision (kill + survive→won) all green.

- [ ] **Step 5: Commit**

```bash
git add src/fights/ufoInvasion.ts src/fights/ufoInvasion.test.ts
git commit -m "feat: UFO fight simulation with state machine and collision"
```

---

### Task 6: UFO fight rendering (`draw`)

**Files:**
- Modify: `src/fights/ufoInvasion.ts`
- Test: `src/fights/ufoInvasion.test.ts` (add a draw smoke test)

**Interfaces:**
- Consumes: `drawSprite`, `ALIEN`, `drawUfo`, `drawBeam` (Task 3); the fight state from Task 5.
- Produces: replaces the `draw` stub with a real implementation — draws the bobbing alien, then every active UFO's beam (if beaming) and body. Allocation-free.

- [ ] **Step 1: Add a failing draw smoke test**

```ts
// Append to src/fights/ufoInvasion.test.ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — the stub draws nothing, so `calls.length` is 0.

- [ ] **Step 3: Implement `draw` in `src/fights/ufoInvasion.ts`**

Add to the import block at the top:

```ts
import { ALIEN, drawSprite, drawUfo, drawBeam } from "../sprites";
import { LOGICAL_WIDTH as LW } from "../constants";
```

(Note: `LOGICAL_WIDTH` is already imported in Task 5; if so, reuse it and skip the aliased import — use `LOGICAL_WIDTH` directly below instead of `LW`.)

Replace the `draw` stub with:

```ts
  const ALIEN_PIXEL = 4;
  const ALIEN_X = Math.round((LOGICAL_WIDTH - ALIEN.w * ALIEN_PIXEL) / 2);
  const ALIEN_Y = 14;

  function draw(ctx: CanvasRenderingContext2D): void {
    const bob = Math.sin(alienBob * 3) * 3;
    drawSprite(ctx, ALIEN, ALIEN_X, ALIEN_Y + bob, ALIEN_PIXEL);
    for (let i = 0; i < POOL; i++) {
      const u = ufos[i];
      if (!u.active) continue;
      if (u.phase === PHASE_BEAM && u.beamLen > 0) {
        drawBeam(ctx, u.x + UFO_W / 2, u.y + UFO_H, BEAM_W, u.beamLen, u.color);
      }
      drawUfo(ctx, u.x, u.y, UFO_W, UFO_H, u.color);
    }
  }
```

Remove the now-unused `void alienBob;` line and the `_ctx` stub signature.

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: PASS — all fight tests including the draw smoke test.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (no unused imports; `LOGICAL_WIDTH` used).

- [ ] **Step 6: Commit**

```bash
git add src/fights/ufoInvasion.ts src/fights/ufoInvasion.test.ts
git commit -m "feat: render the alien, UFOs, and beams"
```

---

### Task 7: `resetCursor` + renderer fight layer

**Files:**
- Modify: `src/movement.ts`
- Test: `src/movement.test.ts` (add a case)
- Modify: `src/render.ts`

**Interfaces:**
- Consumes: `ARENA`, `CURSOR_SIZE` (already imported in movement); `Cursor`.
- Produces:
  - `function resetCursor(cursor: Cursor): void` in `src/movement.ts` — recenters the existing cursor in the arena and zeroes velocity, in place (no allocation).
  - `src/render.ts`: `draw(cursor: Cursor, drawFight?: (ctx: CanvasRenderingContext2D) => void): void` — the optional callback is invoked after the background fill and before the arena outline.

- [ ] **Step 1: Add a failing test for `resetCursor`**

```ts
// Append to src/movement.test.ts
import { resetCursor } from "./movement";

describe("resetCursor", () => {
  it("recenters the cursor and zeroes velocity", () => {
    const c = makeCursor();
    c.pos.x = 999;
    c.pos.y = 0;
    c.vel.x = 50;
    c.vel.y = -50;
    resetCursor(c);
    expect(c.pos.x).toBe(ARENA.x + (ARENA.w - CURSOR_SIZE) / 2);
    expect(c.pos.y).toBe(ARENA.y + (ARENA.h - CURSOR_SIZE) / 2);
    expect(c.vel).toEqual({ x: 0, y: 0 });
  });
});
```

(`makeCursor`, `ARENA`, `CURSOR_SIZE` are already imported at the top of `src/movement.test.ts` from earlier tasks. Add only the `resetCursor` import shown.)

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — `resetCursor` not exported.

- [ ] **Step 3: Add `resetCursor` to `src/movement.ts`**

Append at the end of `src/movement.ts`:

```ts
export function resetCursor(cursor: Cursor): void {
  cursor.pos.x = ARENA.x + (ARENA.w - CURSOR_SIZE) / 2;
  cursor.pos.y = ARENA.y + (ARENA.h - CURSOR_SIZE) / 2;
  cursor.vel.x = 0;
  cursor.vel.y = 0;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Update `src/render.ts` to accept a fight layer**

Replace the `Renderer` interface and the `draw` function so it matches:

```ts
export interface Renderer {
  draw(cursor: Cursor, drawFight?: (ctx: CanvasRenderingContext2D) => void): void;
  resize(): void;
}
```

```ts
  function draw(
    cursor: Cursor,
    drawFight?: (ctx: CanvasRenderingContext2D) => void,
  ): void {
    ctx!.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
    ctx!.fillStyle = "#000";
    ctx!.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    if (drawFight) drawFight(ctx!);

    ctx!.strokeStyle = "#fff";
    ctx!.lineWidth = 2;
    ctx!.strokeRect(ARENA.x + 0.5, ARENA.y + 0.5, ARENA.w - 1, ARENA.h - 1);

    ctx!.fillStyle = "#fff";
    ctx!.fillRect(cursor.pos.x, cursor.pos.y, CURSOR_SIZE, CURSOR_SIZE);
  }
```

- [ ] **Step 6: Type-check and run the suite**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/movement.ts src/movement.test.ts src/render.ts
git commit -m "feat: resetCursor and renderer fight layer"
```

---

### Task 8: Wire the fight into the game loop

**Files:**
- Modify: `src/main.ts`
- Modify: `index.html`

**Interfaces:**
- Consumes: `createUfoFight`, `DEFAULT_UFO_FIGHT` (Tasks 4-6); `resetCursor` (Task 7); the renderer's new `draw(cursor, drawFight?)` (Task 7).
- Produces: the running game — the fight updates each fixed step; `lost` recenters the player and resets the fight; `won` reveals the victory overlay.

- [ ] **Step 1: Add the victory overlay to `index.html`**

Insert immediately after the `<div id="settings">…</div>` block (before the `<script>`):

```html
    <div id="victory" style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); display: none; color: #7df9ff; font: bold 32px monospace; text-shadow: 0 0 8px #0ff; pointer-events: none;">
      VICTORY
    </div>
```

- [ ] **Step 2: Update `src/main.ts`**

```ts
import { createInput } from "./input";
import { makeCursor, stepMovement, resetCursor } from "./movement";
import { createRenderer } from "./render";
import { loadMode, saveMode } from "./settings";
import { FIXED_DT, MAX_FRAME_DT } from "./constants";
import { createUfoFight, DEFAULT_UFO_FIGHT } from "./fights/ufoInvasion";
import type { MovementMode } from "./types";

const canvas = document.getElementById("game") as HTMLCanvasElement | null;
if (canvas === null) throw new Error("missing #game canvas");

const modeSelect = document.getElementById("mode") as HTMLSelectElement | null;
const victory = document.getElementById("victory");

const renderer = createRenderer(canvas);
const input = createInput(window);
const cursor = makeCursor();
const fight = createUfoFight(DEFAULT_UFO_FIGHT);

let mode: MovementMode = loadMode(localStorage);
if (modeSelect !== null) {
  modeSelect.value = mode;
  modeSelect.addEventListener("change", () => {
    mode = modeSelect.value === "accelerated" ? "accelerated" : "digital";
    saveMode(localStorage, mode);
  });
}

window.addEventListener("resize", () => renderer.resize());

let last = performance.now();
let accumulator = 0;
let won = false;

function frame(now: number): void {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > MAX_FRAME_DT) dt = MAX_FRAME_DT;

  accumulator += dt;
  while (accumulator >= FIXED_DT) {
    stepMovement(cursor, input.state, FIXED_DT, mode);
    if (!won) {
      const status = fight.update(cursor, FIXED_DT);
      if (status === "lost") {
        resetCursor(cursor);
        fight.reset();
      } else if (status === "won") {
        won = true;
        if (victory !== null) victory.style.display = "block";
      }
    }
    accumulator -= FIXED_DT;
  }

  renderer.draw(cursor, fight.draw);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
```

- [ ] **Step 3: Type-check, run the suite, and build**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: no type errors; all tests pass; build succeeds.

- [ ] **Step 4: Manual verification in the Windows browser**

Run: `npm run dev` (leave it running), open `http://localhost:5173`, and confirm:
- A strange little alien bobs at the top center; colorful UFOs fly across the screen in both directions at varying speeds.
- Some UFOs sweep through the arena band — moving into their row kills you; staying in a clear row is safe.
- Some UFOs stop and lower a tractor-beam column step-by-step to the floor; standing in the column kills you; stepping sideways out of it is safe.
- Dying recenters the cursor and the wave restarts identically.
- Surviving all 30 reveals "VICTORY".
- Motion stays smooth with no stutter.

- [ ] **Step 5: Commit**

```bash
git add src/main.ts index.html
git commit -m "feat: wire UFO Invasion fight into the game loop"
```

---

## Self-Review Notes

- **Spec coverage:** Fight primitive (Task 4 `types.ts`); seeded determinism (Tasks 1, 4 — RNG drawn only in `rollUfo`/spawn, 6 fixed draws); pool + overlapping stream (Task 5, `POOL=12`); UFO seeded params incl. y-band into arena (Task 4); beamer staircase to floor + hold + resume (Task 5); body **and** beam collision (Task 5); loss→recenter+reset, win→overlay (Tasks 5, 8); alien + colored UFOs + beam visuals (Tasks 3, 6); render order bg→fight→arena→cursor (Task 7); resetCursor (Task 7). All covered.
- **Type consistency:** `Fight`/`FightStatus`, `update(player: Cursor, dt)`, `draw(ctx)`, `reset()`, `createUfoFight(cfg)`, `rollUfo(rng, cfg)`, `UfoParams`, `UfoFightConfig`, `UFO_W/UFO_H/BEAM_W`, `rectsOverlap`, `createRng`, `drawSprite/drawUfo/drawBeam/ALIEN/UFO_COLORS`, `resetCursor`, renderer `draw(cursor, drawFight?)` are used identically across producing and consuming tasks.
- **No placeholders:** every code step is complete; the one intentional stub (`draw` in Task 5) is explicitly implemented and tested in Task 6.
- **Allocation:** pools/rng built once at construction; `update`/`draw`/helpers use only scalars and in-place mutation; `fight.draw` is a stable reference passed to the renderer (no per-frame closure).
