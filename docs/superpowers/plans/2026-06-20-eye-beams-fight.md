# Eye Beams Fight + Fight Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the second fight — orbiting eyeballs that fire player-aimed beams, plus slow-homing small eyes — and a fight selector so both fights are playable.

**Architecture:** A new `eyeBeams` fight implements the existing `Fight` interface and `FightDefinition` schema. Big eyes orbit the box center (radius oscillates so they sometimes pass through it), lock onto the player, telegraph, then fire an angled beam (collision via a new pure `distancePointToSegment`). Small eyes home slowly. A `FIGHTS` registry + a dropdown in `main.ts` let the player switch fights; the config panel rebuilds per fight.

**Tech Stack:** TypeScript, Vitest, Canvas2D (all already in the project).

## Global Constraints

- Reuse existing systems: `Fight`/`FightStatus`/`FightDefinition`/`FightParam` from `src/fights/types.ts`, `createRng` from `src/rng.ts`, `rectsOverlap` from `src/collision.ts`, `ARENA`/`CURSOR_SIZE` from `src/constants.ts`, `Cursor` from `src/movement.ts`.
- Zero per-frame / per-step allocation in `update`, `draw`, and helpers: no object/array literals, no closures created per call, no `new`. Pools and rng are built once at construction. `Math.sin`/`Math.cos`/`Math.hypot`/`Math.PI*2` are scalar math, not allocation.
- Fixed timestep at 120 Hz; fights advance by `dt` per `update`. All time-based state (orbit angle, telegraph/beam timers, spawn cadence) is driven by accumulated `dt`, never wall clock — keeps the run deterministic.
- Determinism: the fight's rng is drawn only at construction/`reset` (eye phases, fire gaps) and at small-eye spawn, in a fixed order. Aiming uses the live player position.
- Battle box center is `CX = ARENA.x + ARENA.w/2 = 400`, `CY = ARENA.y + ARENA.h/2 = 300`. Player center = `cursor.pos + CURSOR_SIZE/2`, player radius = `CURSOR_SIZE/2 = 8`.
- Beam aiming: at telegraph start, lock the unit direction from the eye to the player's current center. The telegraph phase does NOT damage; only the fire phase does.
- Win = `firedVolleys >= cfg.volleys` AND no eye is in telegraph or fire phase. A volley is counted when an eye transitions telegraph → fire. New volleys (and small-eye spawns) stop once `firedVolleys >= cfg.volleys`.
- The fight registry is `readonly FightDefinition<unknown>[]`; heterogeneous `FightDefinition<C>` values assign to it (method-shorthand params are bivariant in TS). The selected fight name persists to `localStorage` key `bullethell.selectedFight`.
- TypeScript strict mode; full suite green; `npm run build` succeeds.

---

### Task 1: `distancePointToSegment` (angled-beam geometry)

**Files:**
- Modify: `src/collision.ts`
- Test: `src/collision.test.ts` (add cases)

**Interfaces:**
- Consumes: nothing.
- Produces: `function distancePointToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number` — shortest distance from point `(px,py)` to the segment `(ax,ay)-(bx,by)`, clamping the projection to the segment ends; a degenerate (zero-length) segment returns the distance to that point.

- [ ] **Step 1: Write the failing tests**

```ts
// Append to src/collision.test.ts
import { distancePointToSegment } from "./collision";

describe("distancePointToSegment", () => {
  it("is zero for a point on the segment", () => {
    expect(distancePointToSegment(5, 0, 0, 0, 10, 0)).toBe(0);
  });
  it("returns the perpendicular distance to the interior", () => {
    expect(distancePointToSegment(5, 3, 0, 0, 10, 0)).toBeCloseTo(3);
  });
  it("clamps to endpoint A when the projection is before the start", () => {
    expect(distancePointToSegment(-3, 4, 0, 0, 10, 0)).toBeCloseTo(5);
  });
  it("clamps to endpoint B when the projection is past the end", () => {
    expect(distancePointToSegment(13, 4, 0, 0, 10, 0)).toBeCloseTo(5);
  });
  it("returns the distance to the point for a degenerate segment", () => {
    expect(distancePointToSegment(3, 4, 0, 0, 0, 0)).toBeCloseTo(5);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test`
Expected: FAIL — `distancePointToSegment` not defined.

- [ ] **Step 3: Implement in `src/collision.ts`**

Append:

```ts
export function distancePointToSegment(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/collision.ts src/collision.test.ts
git commit -m "feat: distancePointToSegment for angled-beam collision"
```

---

### Task 2: Eye / small-eye / beam-line drawing primitives

**Files:**
- Modify: `src/sprites.ts`
- Test: `src/sprites.test.ts` (add cases)

**Interfaces:**
- Consumes: nothing.
- Produces (all allocation-free):
  - `function drawEye(ctx, x, y, r, lookDx, lookDy): void` — a round eyeball at center `(x,y)` radius `r`, with the iris/pupil offset toward the unit look-direction `(lookDx,lookDy)`.
  - `function drawSmallEye(ctx, x, y, r): void` — a small eyeball at `(x,y)` radius `r`.
  - `function drawBeamLine(ctx, x1, y1, x2, y2, width, color, alpha): void` — a round-capped stroked line from `(x1,y1)` to `(x2,y2)`.

- [ ] **Step 1: Add failing smoke tests (permissive fake ctx)**

```ts
// Append to src/sprites.test.ts
import { drawEye, drawSmallEye, drawBeamLine } from "./sprites";

function eyeFakeCtx() {
  const counts = { arc: 0, fill: 0, stroke: 0 };
  return {
    fillStyle: "", strokeStyle: "", lineWidth: 0, globalAlpha: 1, lineCap: "",
    save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {},
    arc() { counts.arc++; }, fill() { counts.fill++; }, stroke() { counts.stroke++; },
    fillRect() {},
    counts,
  };
}

describe("drawEye", () => {
  it("draws several arcs and fills without throwing", () => {
    const ctx = eyeFakeCtx();
    drawEye(ctx as unknown as CanvasRenderingContext2D, 100, 100, 22, 1, 0);
    expect(ctx.counts.arc).toBeGreaterThanOrEqual(3);
    expect(ctx.counts.fill).toBeGreaterThanOrEqual(3);
  });
});

describe("drawSmallEye", () => {
  it("draws arcs without throwing", () => {
    const ctx = eyeFakeCtx();
    drawSmallEye(ctx as unknown as CanvasRenderingContext2D, 50, 60, 7);
    expect(ctx.counts.arc).toBeGreaterThanOrEqual(2);
  });
});

describe("drawBeamLine", () => {
  it("strokes a line and resets alpha", () => {
    const ctx = eyeFakeCtx();
    drawBeamLine(ctx as unknown as CanvasRenderingContext2D, 0, 0, 100, 100, 26, "#ff3b6b", 0.85);
    expect(ctx.counts.stroke).toBeGreaterThanOrEqual(1);
    expect(ctx.globalAlpha).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test`
Expected: FAIL — the three functions are not exported.

- [ ] **Step 3: Implement in `src/sprites.ts`**

Append:

```ts
export function drawEye(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, r: number,
  lookDx: number, lookDy: number,
): void {
  ctx.fillStyle = "#f4f4ff";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  const ix = x + lookDx * r * 0.4;
  const iy = y + lookDy * r * 0.4;
  ctx.fillStyle = "#7a3cff";
  ctx.beginPath();
  ctx.arc(ix, iy, r * 0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#0a0010";
  ctx.beginPath();
  ctx.arc(ix, iy, r * 0.24, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(ix - r * 0.12, iy - r * 0.12, r * 0.08, 0, Math.PI * 2);
  ctx.fill();
}

export function drawSmallEye(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, r: number,
): void {
  ctx.fillStyle = "#f4f4ff";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#c0182b";
  ctx.beginPath();
  ctx.arc(x, y, r * 0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#0a0010";
  ctx.beginPath();
  ctx.arc(x, y, r * 0.24, 0, Math.PI * 2);
  ctx.fill();
}

export function drawBeamLine(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number, x2: number, y2: number,
  width: number, color: string, alpha: number,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sprites.ts src/sprites.test.ts
git commit -m "feat: eye, small-eye, and beam-line drawing primitives"
```

---

### Task 3: Eye Beams core simulation (orbit, volley, beam/body collision, win)

**Files:**
- Create: `src/fights/eyeBeams.ts`
- Test: `src/fights/eyeBeams.test.ts`

**Interfaces:**
- Consumes: `createRng`/`Rng`; `rectsOverlap`, `distancePointToSegment`; `ARENA`, `CURSOR_SIZE`; `Cursor`; `Fight`, `FightStatus`, `FightDefinition`, `FightParam`; `makeCursor` (in tests).
- Produces:
  - `interface EyeBeamsConfig` with fields: `seed`, `volleys`, `eyeCount`, `orbitSpeed`, `orbitRadius`, `orbitRadiusAmp`, `telegraphTime`, `beamTime`, `beamWidth`, `eyeFireGapMin`, `eyeFireGapMax`, `smallSpawnGapMin`, `smallSpawnGapMax`, `smallSpeed`, `smallLifetime` (all `number`).
  - `const DEFAULT_EYE_BEAMS: EyeBeamsConfig`.
  - `function createEyeBeams(cfg: EyeBeamsConfig): Fight` — orbiting eyes that lock/telegraph/fire aimed beams; `draw` is a temporary no-op stub here (implemented in Task 5); small eyes are added in Task 4.
  - `const EYE_BEAMS: FightDefinition<EyeBeamsConfig>` (name `"Eye Beams"`; exposes seed, volleys, eyeCount, orbitSpeed, telegraphTime, beamTime, beamWidth, eyeFireGapMin, eyeFireGapMax, smallSpeed).

- [ ] **Step 1: Write the failing tests**

```ts
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
      expect(typeof (DEFAULT_EYE_BEAMS as Record<string, unknown>)[p.key]).toBe("number");
    }
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test`
Expected: FAIL — module/exports not defined.

- [ ] **Step 3: Implement `src/fights/eyeBeams.ts`**

```ts
import { createRng } from "../rng";
import { rectsOverlap, distancePointToSegment } from "../collision";
import { ARENA, CURSOR_SIZE } from "../constants";
import type { Cursor } from "../movement";
import type { Fight, FightStatus, FightDefinition, FightParam } from "./types";

export interface EyeBeamsConfig {
  seed: number;
  volleys: number;
  eyeCount: number;
  orbitSpeed: number;
  orbitRadius: number;
  orbitRadiusAmp: number;
  telegraphTime: number;
  beamTime: number;
  beamWidth: number;
  eyeFireGapMin: number;
  eyeFireGapMax: number;
  smallSpawnGapMin: number;
  smallSpawnGapMax: number;
  smallSpeed: number;
  smallLifetime: number;
}

export const DEFAULT_EYE_BEAMS: EyeBeamsConfig = {
  seed: 2024,
  volleys: 20,
  eyeCount: 2,
  orbitSpeed: 0.7,
  orbitRadius: 200,
  orbitRadiusAmp: 110,
  telegraphTime: 0.7,
  beamTime: 0.35,
  beamWidth: 26,
  eyeFireGapMin: 1.6,
  eyeFireGapMax: 3.2,
  smallSpawnGapMin: 1.2,
  smallSpawnGapMax: 2.6,
  smallSpeed: 65,
  smallLifetime: 6,
};

const CX = ARENA.x + ARENA.w / 2;
const CY = ARENA.y + ARENA.h / 2;
const EYE_R = 22;
const BEAM_LEN = 1200;
const RADIUS_OSC_SPEED = 0.9;
const PLAYER_R = CURSOR_SIZE / 2;
const MAX_EYES = 6;

const PHASE_ORBIT = 0;
const PHASE_TELEGRAPH = 1;
const PHASE_FIRE = 2;

interface Eye {
  active: boolean;
  phaseAngle: number;
  radiusPhase: number;
  x: number;
  y: number;
  lookDx: number;
  lookDy: number;
  fireTimer: number;
  phase: number;
  stateTimer: number;
  aimDx: number;
  aimDy: number;
}

function makeEye(): Eye {
  return {
    active: false, phaseAngle: 0, radiusPhase: 0, x: 0, y: 0,
    lookDx: 0, lookDy: 1, fireTimer: 0, phase: PHASE_ORBIT,
    stateTimer: 0, aimDx: 0, aimDy: 1,
  };
}

export function createEyeBeams(cfg: EyeBeamsConfig): Fight {
  const rng = createRng(cfg.seed);
  const eyes: Eye[] = [];
  for (let i = 0; i < MAX_EYES; i++) eyes.push(makeEye());

  let firedVolleys = 0;

  function gap(min: number, max: number): number {
    return min + rng.next() * (max - min);
  }

  function reset(): void {
    rng.reseed(cfg.seed);
    firedVolleys = 0;
    const n = Math.min(cfg.eyeCount, MAX_EYES);
    for (let i = 0; i < MAX_EYES; i++) {
      const e = eyes[i];
      if (i < n) {
        e.active = true;
        e.phaseAngle = rng.next() * Math.PI * 2;
        e.radiusPhase = rng.next() * Math.PI * 2;
        e.fireTimer = gap(cfg.eyeFireGapMin, cfg.eyeFireGapMax);
        e.phase = PHASE_ORBIT;
        e.stateTimer = 0;
        e.lookDx = 0;
        e.lookDy = 1;
        e.aimDx = 0;
        e.aimDy = 1;
      } else {
        e.active = false;
      }
    }
  }

  reset();

  function update(player: Cursor, dt: number): FightStatus {
    const pcx = player.pos.x + CURSOR_SIZE / 2;
    const pcy = player.pos.y + CURSOR_SIZE / 2;

    let anyBusy = false;
    for (let i = 0; i < MAX_EYES; i++) {
      const e = eyes[i];
      if (!e.active) continue;

      e.phaseAngle += cfg.orbitSpeed * dt;
      e.radiusPhase += RADIUS_OSC_SPEED * dt;
      const r = cfg.orbitRadius + cfg.orbitRadiusAmp * Math.sin(e.radiusPhase);
      e.x = CX + Math.cos(e.phaseAngle) * r;
      e.y = CY + Math.sin(e.phaseAngle) * r;

      const ldx = pcx - e.x;
      const ldy = pcy - e.y;
      const llen = Math.hypot(ldx, ldy) || 1;
      e.lookDx = ldx / llen;
      e.lookDy = ldy / llen;

      if (e.phase === PHASE_ORBIT) {
        e.fireTimer -= dt;
        if (e.fireTimer <= 0 && firedVolleys < cfg.volleys) {
          e.phase = PHASE_TELEGRAPH;
          e.stateTimer = 0;
          e.aimDx = e.lookDx;
          e.aimDy = e.lookDy;
        }
      } else if (e.phase === PHASE_TELEGRAPH) {
        anyBusy = true;
        e.stateTimer += dt;
        if (e.stateTimer >= cfg.telegraphTime) {
          e.phase = PHASE_FIRE;
          e.stateTimer = 0;
          firedVolleys++;
        }
      } else {
        anyBusy = true;
        e.stateTimer += dt;
        if (e.stateTimer >= cfg.beamTime) {
          e.phase = PHASE_ORBIT;
          e.fireTimer = gap(cfg.eyeFireGapMin, cfg.eyeFireGapMax);
        }
      }

      if (rectsOverlap(player.pos.x, player.pos.y, CURSOR_SIZE, CURSOR_SIZE,
        e.x - EYE_R, e.y - EYE_R, EYE_R * 2, EYE_R * 2)) {
        return "lost";
      }
      if (e.phase === PHASE_FIRE) {
        const ex = e.x + e.aimDx * BEAM_LEN;
        const ey = e.y + e.aimDy * BEAM_LEN;
        if (distancePointToSegment(pcx, pcy, e.x, e.y, ex, ey) <= cfg.beamWidth / 2 + PLAYER_R) {
          return "lost";
        }
      }
    }

    if (firedVolleys >= cfg.volleys && !anyBusy) return "won";
    return "running";
  }

  function draw(_ctx: CanvasRenderingContext2D): void {
    // Implemented in Task 5.
  }

  return { update, draw, reset };
}

const EYE_BEAMS_PARAMS: readonly FightParam[] = [
  { key: "seed", label: "Seed", kind: "seed", min: 0, max: 999999, step: 1 },
  { key: "volleys", label: "Volleys", kind: "int", min: 0, max: 200, step: 1 },
  { key: "eyeCount", label: "Eyes", kind: "int", min: 1, max: 6, step: 1 },
  { key: "orbitSpeed", label: "Orbit speed", kind: "float", min: 0.1, max: 3, step: 0.1 },
  { key: "telegraphTime", label: "Telegraph (s)", kind: "float", min: 0.1, max: 2, step: 0.05 },
  { key: "beamTime", label: "Beam (s)", kind: "float", min: 0.1, max: 1.5, step: 0.05 },
  { key: "beamWidth", label: "Beam width", kind: "float", min: 6, max: 80, step: 2 },
  { key: "eyeFireGapMin", label: "Fire gap min (s)", kind: "float", min: 0, max: 8, step: 0.1 },
  { key: "eyeFireGapMax", label: "Fire gap max (s)", kind: "float", min: 0, max: 8, step: 0.1 },
  { key: "smallSpeed", label: "Small eye speed", kind: "float", min: 0, max: 200, step: 5 },
];

export const EYE_BEAMS: FightDefinition<EyeBeamsConfig> = {
  name: "Eye Beams",
  params: EYE_BEAMS_PARAMS,
  defaults: DEFAULT_EYE_BEAMS,
  create: (config) => createEyeBeams(config),
};
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test`
Expected: PASS — loss, determinism, win, and definition tests all green.

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/fights/eyeBeams.ts src/fights/eyeBeams.test.ts
git commit -m "feat: Eye Beams core simulation (orbit, aimed beams, win/loss)"
```

---

### Task 4: Small homing eyes

**Files:**
- Modify: `src/fights/eyeBeams.ts`
- Test: `src/fights/eyeBeams.test.ts` (add a case)

**Interfaces:**
- Consumes: everything from Task 3.
- Produces: no new exports. `createEyeBeams` gains a pooled set of small eyes that spawn on a seeded cadence (until `firedVolleys >= cfg.volleys`), home toward the player at `cfg.smallSpeed`, despawn after `cfg.smallLifetime`, and kill on overlap.

- [ ] **Step 1: Add a failing test for small-eye collision**

```ts
// Append to src/fights/eyeBeams.test.ts
describe("EyeBeams small homing eyes", () => {
  it("a homing small eye kills a stationary player", () => {
    const fight = createEyeBeams({
      ...DEFAULT_EYE_BEAMS,
      volleys: 5, eyeCount: 1,
      eyeFireGapMin: 999, eyeFireGapMax: 999, // no beams during the test
      orbitRadius: 260, orbitRadiusAmp: 0,    // eyes stay clear of the box
      smallSpawnGapMin: 0, smallSpawnGapMax: 0,
      smallSpeed: 120, smallLifetime: 30,
    });
    expect(runUntilDone(fight, makeCursor(), 1000).status).toBe("lost");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — no small eyes exist yet, so the stationary player is never hit (status stays "running").

- [ ] **Step 3: Add small eyes to `src/fights/eyeBeams.ts`**

Add these module constants near the other constants (after `const PHASE_FIRE = 2;`):

```ts
const SMALL_POOL = 16;
const SMALL_R = 7;
const SMALL_SPAWN_RADIUS = 280;
```

Add this interface and factory after the `Eye`/`makeEye` definitions:

```ts
interface SmallEye {
  active: boolean;
  x: number;
  y: number;
  life: number;
}

function makeSmall(): SmallEye {
  return { active: false, x: 0, y: 0, life: 0 };
}
```

Inside `createEyeBeams`, after the `eyes` pool is built, add the small-eye pool and spawn timer:

```ts
  const smalls: SmallEye[] = [];
  for (let i = 0; i < SMALL_POOL; i++) smalls.push(makeSmall());
  let smallSpawnTimer = 0;

  function freeSmall(): number {
    for (let i = 0; i < SMALL_POOL; i++) if (!smalls[i].active) return i;
    return -1;
  }
```

At the END of `reset()` (after the eye loop), reset the small-eye state — its rng draw must come after all eye draws to keep the order fixed:

```ts
    for (let i = 0; i < SMALL_POOL; i++) smalls[i].active = false;
    smallSpawnTimer = gap(cfg.smallSpawnGapMin, cfg.smallSpawnGapMax);
```

In `update`, insert the small-eye spawn + homing + collision block immediately BEFORE the final win check (`if (firedVolleys >= cfg.volleys && !anyBusy) return "won";`):

```ts
    smallSpawnTimer -= dt;
    while (smallSpawnTimer <= 0 && firedVolleys < cfg.volleys) {
      const slot = freeSmall();
      if (slot === -1) break;
      const a = rng.next() * Math.PI * 2;
      const s = smalls[slot];
      s.active = true;
      s.x = CX + Math.cos(a) * SMALL_SPAWN_RADIUS;
      s.y = CY + Math.sin(a) * SMALL_SPAWN_RADIUS;
      s.life = cfg.smallLifetime;
      smallSpawnTimer += gap(cfg.smallSpawnGapMin, cfg.smallSpawnGapMax);
    }
    for (let i = 0; i < SMALL_POOL; i++) {
      const s = smalls[i];
      if (!s.active) continue;
      const sdx = pcx - s.x;
      const sdy = pcy - s.y;
      const slen = Math.hypot(sdx, sdy) || 1;
      s.x += (sdx / slen) * cfg.smallSpeed * dt;
      s.y += (sdy / slen) * cfg.smallSpeed * dt;
      s.life -= dt;
      if (s.life <= 0) {
        s.active = false;
        continue;
      }
      if (rectsOverlap(player.pos.x, player.pos.y, CURSOR_SIZE, CURSOR_SIZE,
        s.x - SMALL_R, s.y - SMALL_R, SMALL_R * 2, SMALL_R * 2)) {
        return "lost";
      }
    }
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: PASS — the small-eye test plus all Task 3 tests (the win test still wins: with `volleys: 0`, no small eyes spawn).

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/fights/eyeBeams.ts src/fights/eyeBeams.test.ts
git commit -m "feat: slow homing small eyes for Eye Beams"
```

---

### Task 5: Eye Beams rendering (`draw`)

**Files:**
- Modify: `src/fights/eyeBeams.ts`
- Test: `src/fights/eyeBeams.test.ts` (add a draw smoke test)

**Interfaces:**
- Consumes: `drawEye`, `drawSmallEye`, `drawBeamLine` from `../sprites` (Task 2); the fight state from Tasks 3-4.
- Produces: replaces the `draw` stub — draws, for each active eye: a telegraph line (during telegraph), the beam (during fire), then the eye (pupil tracking `lookDx/lookDy`); then every active small eye. Allocation-free.

- [ ] **Step 1: Add a failing draw smoke test**

```ts
// Append to src/fights/eyeBeams.test.ts
describe("EyeBeams draw", () => {
  it("draws eyes (and any active beams) without throwing", () => {
    const calls = { arc: 0, stroke: 0 };
    const ctx = {
      fillStyle: "", strokeStyle: "", lineWidth: 0, globalAlpha: 1, lineCap: "",
      save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {},
      arc() { calls.arc++; }, fill() {}, stroke() { calls.stroke++; }, fillRect() {},
    } as unknown as CanvasRenderingContext2D;

    const fight = createEyeBeams({ ...DEFAULT_EYE_BEAMS, eyeCount: 2 });
    const player = makeCursor();
    for (let i = 0; i < 10; i++) fight.update(player, 1 / 120);
    fight.draw(ctx);
    expect(calls.arc).toBeGreaterThan(3); // at least a couple of eyes drawn
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — the stub draws nothing, so `calls.arc` is 0.

- [ ] **Step 3: Implement `draw` in `src/fights/eyeBeams.ts`**

Add to the top-of-file import from `../sprites` (there is no existing sprites import in this file yet, so add the line):

```ts
import { drawEye, drawSmallEye, drawBeamLine } from "../sprites";
```

Replace the `draw` stub with:

```ts
  function draw(ctx: CanvasRenderingContext2D): void {
    for (let i = 0; i < MAX_EYES; i++) {
      const e = eyes[i];
      if (!e.active) continue;
      const ex = e.x + e.aimDx * BEAM_LEN;
      const ey = e.y + e.aimDy * BEAM_LEN;
      if (e.phase === PHASE_TELEGRAPH) {
        drawBeamLine(ctx, e.x, e.y, ex, ey, 3, "#ff5cf0", 0.5);
      } else if (e.phase === PHASE_FIRE) {
        drawBeamLine(ctx, e.x, e.y, ex, ey, cfg.beamWidth, "#ff3b6b", 0.85);
      }
      drawEye(ctx, e.x, e.y, EYE_R, e.lookDx, e.lookDy);
    }
    for (let i = 0; i < SMALL_POOL; i++) {
      const s = smalls[i];
      if (!s.active) continue;
      drawSmallEye(ctx, s.x, s.y, SMALL_R);
    }
  }
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: PASS — the draw smoke test plus all prior tests.

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: no errors (no unused imports; `drawEye`/`drawSmallEye`/`drawBeamLine` all used).

```bash
git add src/fights/eyeBeams.ts src/fights/eyeBeams.test.ts
git commit -m "feat: render eyes, telegraphs, beams, and small eyes"
```

---

### Task 6: Fight registry

**Files:**
- Create: `src/fights/registry.ts`
- Test: `src/fights/registry.test.ts`

**Interfaces:**
- Consumes: `FightDefinition` from `./types`; `UFO_INVASION` from `./ufoInvasion`; `EYE_BEAMS` from `./eyeBeams`.
- Produces: `const FIGHTS: readonly FightDefinition<unknown>[]` — `[UFO_INVASION, EYE_BEAMS]`.

- [ ] **Step 1: Write the failing test**

```ts
// src/fights/registry.test.ts
import { describe, it, expect } from "vitest";
import { FIGHTS } from "./registry";

describe("FIGHTS registry", () => {
  it("lists both fights by name", () => {
    expect(FIGHTS.map((f) => f.name)).toEqual(["UFO Invasion", "Eye Beams"]);
  });
  it("each definition is usable (params + create)", () => {
    for (const f of FIGHTS) {
      expect(f.params.length).toBeGreaterThan(0);
      expect(typeof f.create).toBe("function");
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — `registry` module not defined.

- [ ] **Step 3: Implement `src/fights/registry.ts`**

```ts
import type { FightDefinition } from "./types";
import { UFO_INVASION } from "./ufoInvasion";
import { EYE_BEAMS } from "./eyeBeams";

export const FIGHTS: readonly FightDefinition<unknown>[] = [UFO_INVASION, EYE_BEAMS];
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors (the `FightDefinition<C>` values assign to `FightDefinition<unknown>` — method-shorthand params are bivariant); tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/fights/registry.ts src/fights/registry.test.ts
git commit -m "feat: fight registry listing both fights"
```

---

### Task 7: Fight selector wiring

**Files:**
- Modify: `index.html`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `FIGHTS` (Task 6); `createConfigPanel`, `loadFightConfig`/`saveFightConfig`, `resetCursor` (existing); `FightDefinition` type.
- Produces: the running game with a fight-selector dropdown. Selecting a fight rebuilds the config panel and the fight, recenters the player, clears victory, and persists the selection.

- [ ] **Step 1: Add the fight selector to `index.html`**

Replace the `#settings` block (lines 15-22) so it includes a fight dropdown next to the movement one:

```html
    <div id="settings" style="position: fixed; top: 8px; left: 8px; color: #aaa; font: 12px monospace;">
      <label>Movement:
        <select id="mode">
          <option value="digital">Digital (instant)</option>
          <option value="accelerated">Accelerated</option>
        </select>
      </label>
      <label style="margin-left: 8px;">Fight:
        <select id="fight-select"></select>
      </label>
    </div>
```

- [ ] **Step 2: Replace `src/main.ts`**

```ts
import { createInput } from "./input";
import { makeCursor, stepMovement, resetCursor } from "./movement";
import { createRenderer } from "./render";
import { loadMode, saveMode } from "./settings";
import { FIXED_DT, MAX_FRAME_DT } from "./constants";
import { FIGHTS } from "./fights/registry";
import { createConfigPanel } from "./configPanel";
import { loadFightConfig, saveFightConfig } from "./fightConfigStore";
import type { FightDefinition } from "./fights/types";
import type { MovementMode } from "./types";

const SELECTED_FIGHT_KEY = "bullethell.selectedFight";

const canvas = document.getElementById("game") as HTMLCanvasElement | null;
if (canvas === null) throw new Error("missing #game canvas");

const modeSelect = document.getElementById("mode") as HTMLSelectElement | null;
const fightSelect = document.getElementById("fight-select") as HTMLSelectElement | null;
const victory = document.getElementById("victory");
const configEl = document.getElementById("fight-config");

const renderer = createRenderer(canvas);
const input = createInput(window);
const cursor = makeCursor();

function findFight(name: string | null): FightDefinition<unknown> {
  for (const f of FIGHTS) if (f.name === name) return f;
  return FIGHTS[0];
}

let currentDef: FightDefinition<unknown> = findFight(localStorage.getItem(SELECTED_FIGHT_KEY));
let config: unknown = loadFightConfig(localStorage, currentDef);
let fight = currentDef.create(config);
let won = false;

function clearVictory(): void {
  won = false;
  if (victory !== null) victory.style.display = "none";
}

function buildPanel(): void {
  if (configEl === null) return;
  configEl.innerHTML = "";
  createConfigPanel(configEl, currentDef, config, (next) => {
    config = next;
    saveFightConfig(localStorage, currentDef, config);
    fight = currentDef.create(config);
    resetCursor(cursor);
    clearVictory();
  });
}

function activate(def: FightDefinition<unknown>): void {
  currentDef = def;
  localStorage.setItem(SELECTED_FIGHT_KEY, def.name);
  config = loadFightConfig(localStorage, def);
  fight = def.create(config);
  resetCursor(cursor);
  clearVictory();
  buildPanel();
}

if (fightSelect !== null) {
  for (const f of FIGHTS) {
    const opt = document.createElement("option");
    opt.value = f.name;
    opt.textContent = f.name;
    fightSelect.appendChild(opt);
  }
  fightSelect.value = currentDef.name;
  fightSelect.addEventListener("change", () => {
    activate(findFight(fightSelect.value));
  });
}

buildPanel();

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

Run: `npm run dev` (leave running), open `http://localhost:5173`, and confirm:
- A "Fight:" dropdown appears next to "Movement:" with "UFO Invasion" and "Eye Beams".
- Selecting "Eye Beams" swaps the fight: two eyeballs orbit the box (pupils tracking the cursor), occasionally swinging through the play area; each periodically locks onto you, shows a thin telegraph line, then fires a thick angled beam — dodge off the line. Small eyeballs drift slowly toward you.
- Dying recenters you and the wave restarts identically; surviving the volleys shows VICTORY.
- The Eye Beams config panel shows its own params (volleys, eyes, orbit speed, telegraph, beam, fire gaps, small eye speed, seed) and "Restart fight" applies them.
- Switching back to "UFO Invasion" restores that fight and its panel; the selection and each fight's config persist across reload.
- Motion stays smooth.

- [ ] **Step 5: Commit**

```bash
git add index.html src/main.ts
git commit -m "feat: fight selector to switch between UFO Invasion and Eye Beams"
```

---

## Self-Review Notes

- **Spec coverage:** angled-beam geometry `distancePointToSegment` (Task 1); eye/small-eye/beam drawing (Task 2); orbiting eyes with oscillating radius through the box, lock+telegraph+fire aimed beams, beam + eye-body collision, survive-N-volleys win (Task 3); slow homing small eyes (Task 4); rendering incl. pupil tracking + telegraph + beam (Task 5); `FIGHTS` registry (Task 6); selector + per-fight panel rebuild + persistence to `bullethell.selectedFight` (Task 7). All covered.
- **Type consistency:** `EyeBeamsConfig`, `DEFAULT_EYE_BEAMS`, `createEyeBeams`, `EYE_BEAMS`, `distancePointToSegment(px,py,ax,ay,bx,by)`, `drawEye(ctx,x,y,r,lookDx,lookDy)`, `drawSmallEye(ctx,x,y,r)`, `drawBeamLine(ctx,x1,y1,x2,y2,width,color,alpha)`, `FIGHTS: readonly FightDefinition<unknown>[]`, and the existing `createConfigPanel`/`loadFightConfig`/`saveFightConfig`/`resetCursor` are used identically across producing and consuming tasks.
- **No placeholders:** every code step is complete; the one intentional stub (`draw` in Task 3) is implemented and tested in Task 5. The small-eye rng draw is appended at the end of `reset()` so the eye-seeding order from Task 3 is preserved.
- **Allocation:** eye and small-eye pools + rng are built once in `createEyeBeams`; `update`/`draw` use only scalars and in-place mutation; `fight.draw` is passed to the renderer as a stable reference (unchanged loop).
- **Determinism note:** Task 4 appends one rng draw (small spawn timer) at the end of `reset()`; Task 3's tests assert win/loss/equality (not specific rng values), so they remain valid after Task 4.
